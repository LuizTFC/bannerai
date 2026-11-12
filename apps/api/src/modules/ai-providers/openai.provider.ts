import OpenAI, { toFile } from "openai";
import type { AspectRatio, ProviderModelInfo } from "@bannerai/shared";
import { logger } from "../../config/logger.js";
import { ProviderError } from "../../utils/errors.js";
import { estimateOpenAiImageCost } from "./cost.js";
import type {
  EditImageInput,
  GenerateImageInput,
  GenerateTextInput,
  GenerateTextOutput,
  GeneratedImage,
  ImageGenerationProvider,
  ReferenceImageInput,
} from "./types.js";

export const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst";
export const OPENAI_DEFAULT_TEXT_MODEL = "gpt-5-mini";

// Only the top-tier model is offered: quality first. Other models still work via OPENAI_IMAGE_MODEL.
const OPENAI_IMAGE_MODELS: ProviderModelInfo[] = [
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", description: "OpenAI's most precise image model for detailed creative work (slower)", approxCostUsd: 0.15 },
];

/**
 * gpt-image-2 / 2.5 accept custom WIDTHxHEIGHT sizes (multiples of 16, ratio between 1:3 and 3:1,
 * at least 655,360 pixels). Older models only accept the three standard sizes.
 */
// Close to the final canvas (1920×1080 etc.) so the PNG is never upscaled; dimensions must be multiples of 16.
const CUSTOM_SIZES: Record<AspectRatio, string> = { "16:9": "1920x1088", "9:16": "1088x1920", "1:1": "1280x1280", "4:3": "1600x1200" };
const STANDARD_SIZES: Record<AspectRatio, string> = { "16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024", "4:3": "1536x1024" };

const supportsCustomSizes = (model: string): boolean => /^gpt-image-2/.test(model);

const roleLabel: Record<ReferenceImageInput["role"], string> = {
  "brand-logo": "LOGO — the official logo (reproduce exactly, do not redraw or restyle)",
  "brand-template": "TEMPLATE — reproduce this banner's layout structure, typographic system and graphic devices for the new content",
  "brand-reference": "BRAND REFERENCE — the organization's established design system; match it closely",
  reference: "REFERENCE — inspiration for layout, typography and mood (do not copy literally, never reuse its text)",
  element: "ELEMENT — content that must appear inside the banner exactly as shown (keep faces, logos and products faithful)",
};

interface OpenAiProviderOptions {
  apiKey?: string;
  imageModel?: string;
  textModel?: string;
  quality?: "low" | "medium" | "high" | "xhigh" | "auto";
}

export class OpenAiProvider implements ImageGenerationProvider {
  readonly id = "openai" as const;
  readonly label = "OpenAI";
  readonly description = "GPT Image models via the OpenAI Images API";
  private readonly client: OpenAI | null;
  private readonly imageModel: string;
  private readonly textModel: string;
  private readonly quality: "low" | "medium" | "high" | "xhigh" | "auto";

  constructor(options: OpenAiProviderOptions) {
    this.client = options.apiKey ? new OpenAI({ apiKey: options.apiKey, maxRetries: 1, timeout: 240_000 }) : null;
    this.imageModel = options.imageModel ?? OPENAI_DEFAULT_IMAGE_MODEL;
    this.textModel = options.textModel ?? OPENAI_DEFAULT_TEXT_MODEL;
    this.quality = options.quality ?? "high";
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  defaultImageModel(): string {
    return this.imageModel;
  }

  listImageModels(): ProviderModelInfo[] {
    return OPENAI_IMAGE_MODELS.some((m) => m.id === this.imageModel)
      ? OPENAI_IMAGE_MODELS
      : [{ id: this.imageModel, label: this.imageModel, description: "Configured via OPENAI_IMAGE_MODEL" }, ...OPENAI_IMAGE_MODELS];
  }

  supportsImageModel(model: string): boolean {
    return /^(gpt-image|chatgpt-image)/.test(model);
  }

  private requireClient(): OpenAI {
    if (!this.client) throw new ProviderError("openai", "OpenAI is not configured. Set OPENAI_API_KEY.", { retryable: false });
    return this.client;
  }

  private sizeFor(model: string, aspectRatio: AspectRatio): string {
    return supportsCustomSizes(model) ? CUSTOM_SIZES[aspectRatio] : STANDARD_SIZES[aspectRatio];
  }

  private referencesPreamble(references: ReferenceImageInput[], hasSource: boolean): string {
    if (references.length === 0 && !hasSource) return "";
    const lines: string[] = ["Attached images, in order:"];
    let i = 1;
    if (hasSource) lines.push(`${i++}. The CURRENT banner that must be edited.`);
    for (const ref of references) lines.push(`${i++}. ${roleLabel[ref.role]}${ref.label ? ` (${ref.label})` : ""}.`);
    return lines.join("\n") + "\n\n";
  }

  private async toFiles(images: Array<{ buffer: Buffer; mimeType: string }>) {
    return Promise.all(images.map((img, i) => toFile(img.buffer, `image-${i}.${img.mimeType === "image/jpeg" ? "jpg" : img.mimeType === "image/webp" ? "webp" : "png"}`, { type: img.mimeType })));
  }

  private toResult(model: string, result: OpenAI.Images.ImagesResponse): GeneratedImage {
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError("openai", "OpenAI returned no image data.", { retryable: true });
    const u = result.usage;
    const inputImageTokens = u?.input_tokens_details?.image_tokens;
    const inputTextTokens = u?.input_tokens_details?.text_tokens;
    const estimated = estimateOpenAiImageCost({ inputImageTokens, inputTextTokens, outputTokens: u?.output_tokens });
    return {
      buffer: Buffer.from(b64, "base64"),
      mimeType: result.output_format ? `image/${result.output_format}` : "image/png",
      model,
      usage: {
        ...(u?.input_tokens !== undefined ? { inputTokens: u.input_tokens } : {}),
        ...(u?.output_tokens !== undefined ? { outputTokens: u.output_tokens } : {}),
        ...(u?.total_tokens !== undefined ? { totalTokens: u.total_tokens } : {}),
        ...(estimated !== undefined ? { estimatedCostUsd: estimated } : {}),
        ...(result.quality ? { quality: result.quality } : {}),
        ...(result.size ? { size: result.size } : {}),
      },
      providerMetadata: { created: result.created, size: result.size, quality: result.quality },
    };
  }

  async generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
    const client = this.requireClient();
    const model = input.model || this.imageModel;
    const size = this.sizeFor(model, input.aspectRatio);
    try {
      if (input.references.length > 0) {
        // The Images API only accepts input images through the edit endpoint; with gpt-image
        // models this is the documented way to generate from reference images.
        const files = await this.toFiles(input.references);
        const result = await client.images.edit(
          {
            model,
            image: files,
            prompt: this.referencesPreamble(input.references, false) + input.prompt,
            size: size as "1024x1024",
            quality: this.quality,
            output_format: "png",
            n: 1,
          },
          input.signal ? { signal: input.signal } : undefined,
        );
        return this.toResult(model, result);
      }
      const result = await client.images.generate(
        { model, prompt: input.prompt, size: size as "1024x1024", quality: this.quality, output_format: "png", n: 1 },
        input.signal ? { signal: input.signal } : undefined,
      );
      return this.toResult(model, result);
    } catch (err) {
      throw this.translateError(err);
    }
  }

  async editImage(input: EditImageInput): Promise<GeneratedImage> {
    const client = this.requireClient();
    const model = input.model || this.imageModel;
    const size = this.sizeFor(model, input.aspectRatio);
    try {
      const files = await this.toFiles([input.sourceImage, ...input.references]);
      const result = await client.images.edit(
        {
          model,
          image: files,
          prompt: this.referencesPreamble(input.references, true) + input.prompt,
          size: size as "1024x1024",
          quality: this.quality,
          output_format: "png",
          n: 1,
        },
        input.signal ? { signal: input.signal } : undefined,
      );
      return this.toResult(model, result);
    } catch (err) {
      throw this.translateError(err);
    }
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const client = this.requireClient();
    const model = input.model ?? this.textModel;
    try {
      const content: OpenAI.Responses.ResponseInputContent[] = [];
      for (const img of input.images ?? []) {
        content.push({ type: "input_image", image_url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`, detail: "low" });
      }
      content.push({ type: "input_text", text: input.prompt });
      const response = await client.responses.create(
        {
          model,
          instructions: input.system,
          input: [{ role: "user", content }],
          ...(input.json ? { text: { format: { type: "json_object" } } } : {}),
        },
        input.signal ? { signal: input.signal } : undefined,
      );
      return {
        text: response.output_text,
        model,
        usage: {
          ...(response.usage?.input_tokens !== undefined ? { inputTokens: response.usage.input_tokens } : {}),
          ...(response.usage?.output_tokens !== undefined ? { outputTokens: response.usage.output_tokens } : {}),
          ...(response.usage?.total_tokens !== undefined ? { totalTokens: response.usage.total_tokens } : {}),
        },
      };
    } catch (err) {
      throw this.translateError(err);
    }
  }

  private translateError(err: unknown): ProviderError {
    if (err instanceof ProviderError) return err;
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? 0;
      const retryable = status === 429 || status >= 500;
      const message =
        status === 401
          ? "OpenAI rejected the API key. Check OPENAI_API_KEY."
          : status === 429
            ? "OpenAI rate limit reached. Please try again in a moment."
            : status === 400
              ? `OpenAI rejected the request: ${err.message.slice(0, 300)}`
              : `OpenAI error (${status || "network"}): ${err.message.slice(0, 300)}`;
      logger.warn({ status, err: err.message }, "OpenAI API error");
      return new ProviderError("openai", message, { retryable, cause: err, details: { status } });
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "OpenAI unexpected error");
    return new ProviderError("openai", `OpenAI request failed: ${message.slice(0, 300)}`, { retryable: true, cause: err });
  }
}
