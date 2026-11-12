import { ApiError, GoogleGenAI } from "@google/genai";
import type { AspectRatio, ProviderModelInfo } from "@bannerai/shared";
import { logger } from "../../config/logger.js";
import { ProviderError } from "../../utils/errors.js";
import { estimateGeminiImageCost } from "./cost.js";
import type {
  EditImageInput,
  GenerateImageInput,
  GenerateTextInput,
  GenerateTextOutput,
  GeneratedImage,
  ImageGenerationProvider,
  ReferenceImageInput,
} from "./types.js";

export const GEMINI_DEFAULT_IMAGE_MODEL = "gemini-3-pro-image";
export const GEMINI_DEFAULT_TEXT_MODEL = "gemini-3.1-flash-lite";

// Only the top-tier model is offered: quality first. Other models still work via GEMINI_IMAGE_MODEL.
const GEMINI_IMAGE_MODELS: ProviderModelInfo[] = [
  { id: "gemini-3-pro-image", label: "Nano Banana Pro", description: "Google's premium image model: best typography, references and composition", approxCostUsd: 0.134 },
];

/** Gemini accepts these ratios directly; our four options are all supported natively. */
const GEMINI_ASPECT: Record<AspectRatio, string> = { "16:9": "16:9", "9:16": "9:16", "1:1": "1:1", "4:3": "4:3" };

interface GeminiProviderOptions {
  apiKey?: string;
  imageModel?: string;
  textModel?: string;
  imageSize?: "1K" | "2K" | "4K";
}

const roleLabel: Record<ReferenceImageInput["role"], string> = {
  "brand-logo": "LOGO — the official logo (reproduce it exactly, do not redraw or restyle it)",
  "brand-template": "TEMPLATE — reproduce this banner's layout structure, typographic system and graphic devices for the new content",
  "brand-reference": "BRAND REFERENCE — the organization's established design system; match it closely",
  reference: "REFERENCE — inspiration for layout, typography and mood for this banner (do not copy literally, never reuse its text)",
  element: "ELEMENT — content that must appear inside the banner exactly as shown (keep faces, logos and products faithful)",
};

export class GeminiProvider implements ImageGenerationProvider {
  readonly id = "gemini" as const;
  readonly label = "Google Gemini";
  readonly description = "Nano Banana image models via the Gemini API";
  private readonly client: GoogleGenAI | null;
  private readonly imageModel: string;
  private readonly textModel: string;
  private readonly imageSize: "1K" | "2K" | "4K";

  constructor(options: GeminiProviderOptions) {
    this.client = options.apiKey
      ? new GoogleGenAI({
          apiKey: options.apiKey,
          // Keep latency bounded: one retry for transient errors, 2 minutes per call.
          httpOptions: { timeout: 120_000, retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 3 } },
        })
      : null;
    this.imageModel = options.imageModel ?? GEMINI_DEFAULT_IMAGE_MODEL;
    this.textModel = options.textModel ?? GEMINI_DEFAULT_TEXT_MODEL;
    // 2K by default: 1K outputs get upscaled to the 1920px canvas and lose crispness.
    this.imageSize = options.imageSize ?? "2K";
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  defaultImageModel(): string {
    return this.imageModel;
  }

  listImageModels(): ProviderModelInfo[] {
    const known = GEMINI_IMAGE_MODELS.some((m) => m.id === this.imageModel)
      ? GEMINI_IMAGE_MODELS
      : [{ id: this.imageModel, label: this.imageModel, description: "Configured via GEMINI_IMAGE_MODEL" }, ...GEMINI_IMAGE_MODELS];
    return known;
  }

  supportsImageModel(model: string): boolean {
    return model.startsWith("gemini-") && (model.includes("image") || model.includes("banana"));
  }

  private requireClient(): GoogleGenAI {
    if (!this.client) throw new ProviderError("gemini", "Gemini is not configured. Set GEMINI_API_KEY.", { retryable: false });
    return this.client;
  }

  private buildInput(prompt: string, references: ReferenceImageInput[], sourceImage?: { buffer: Buffer; mimeType: string }) {
    const input: Array<{ type: "text"; text: string } | { type: "image"; mime_type: string; data: string }> = [];
    if (sourceImage) {
      input.push({ type: "text", text: "CURRENT BANNER (the image to edit):" });
      input.push({ type: "image", mime_type: sourceImage.mimeType, data: sourceImage.buffer.toString("base64") });
    }
    references.forEach((ref, index) => {
      input.push({ type: "text", text: `REFERENCE ${index + 1} – ${roleLabel[ref.role]}${ref.label ? ` (${ref.label})` : ""}:` });
      input.push({ type: "image", mime_type: ref.mimeType, data: ref.buffer.toString("base64") });
    });
    input.push({ type: "text", text: prompt });
    return input;
  }

  private async runImageInteraction(model: string, input: ReturnType<GeminiProvider["buildInput"]>, aspectRatio: AspectRatio, signal?: AbortSignal): Promise<GeneratedImage> {
    const client = this.requireClient();
    const started = Date.now();
    try {
      const interaction = await client.interactions.create(
        {
          model,
          input,
          response_format: {
            type: "image",
            // The Interactions API only accepts image/jpeg here; the pipeline re-encodes to PNG afterwards.
            mime_type: "image/jpeg",
            aspect_ratio: GEMINI_ASPECT[aspectRatio],
            image_size: this.imageSize,
          },
        },
        {
          // The SDK's automatic retries re-send a consumed request body ("TypeError: unusable") and hide
          // the real error (e.g. quota exhausted) behind minutes of backoff. Fail fast and let the user retry.
          retries: { strategy: "none" },
          timeout_ms: 180_000,
          ...(signal ? { fetch_options: { signal } } : {}),
        },
      );

      let image = interaction.output_image;
      if (!image?.data) {
        // Fallback: look through the steps for an image block.
        for (const step of interaction.steps ?? []) {
          if (step.type === "model_output") {
            for (const block of step.content ?? []) {
              if (block.type === "image" && block.data) {
                image = block;
                break;
              }
            }
          }
          if (image?.data) break;
        }
      }
      if (!image?.data) {
        const text = interaction.output_text?.trim();
        throw new ProviderError("gemini", text ? `The model returned no image: ${text.slice(0, 300)}` : "The model returned no image. Try rephrasing the prompt.", {
          retryable: true,
          details: { status: interaction.status },
        });
      }
      const usage = interaction.usage;
      const inputTokens = usage?.total_input_tokens;
      const outputTokens = usage?.total_output_tokens;
      return {
        buffer: Buffer.from(image.data, "base64"),
        mimeType: image.mime_type ?? "image/png",
        model,
        usage: {
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
          ...(inputTokens !== undefined || outputTokens !== undefined ? { totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0) } : {}),
          ...(estimateGeminiImageCost(model, this.imageSize) !== undefined ? { estimatedCostUsd: estimateGeminiImageCost(model, this.imageSize) } : {}),
          imageSize: this.imageSize,
        },
        providerMetadata: { interactionId: interaction.id, status: interaction.status, latencyMs: Date.now() - started },
      };
    } catch (err) {
      throw this.translateError(err);
    }
  }

  async generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
    const model = input.model || this.imageModel;
    return this.runImageInteraction(model, this.buildInput(input.prompt, input.references), input.aspectRatio, input.signal);
  }

  async editImage(input: EditImageInput): Promise<GeneratedImage> {
    const model = input.model || this.imageModel;
    return this.runImageInteraction(model, this.buildInput(input.prompt, input.references, input.sourceImage), input.aspectRatio, input.signal);
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const client = this.requireClient();
    const model = input.model ?? this.textModel;
    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      for (const img of input.images ?? []) parts.push({ inlineData: { mimeType: img.mimeType, data: img.buffer.toString("base64") } });
      parts.push({ text: input.prompt });
      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: input.system,
          ...(input.json ? { responseMimeType: "application/json" } : {}),
          temperature: 0.6,
          ...(input.signal ? { abortSignal: input.signal } : {}),
        },
      });
      const text = response.text ?? "";
      const meta = response.usageMetadata;
      return {
        text,
        model,
        usage: {
          ...(meta?.promptTokenCount !== undefined ? { inputTokens: meta.promptTokenCount } : {}),
          ...(meta?.candidatesTokenCount !== undefined ? { outputTokens: meta.candidatesTokenCount } : {}),
          ...(meta?.totalTokenCount !== undefined ? { totalTokens: meta.totalTokenCount } : {}),
        },
      };
    } catch (err) {
      throw this.translateError(err);
    }
  }

  private translateError(err: unknown): ProviderError {
    if (err instanceof ProviderError) return err;
    if (err instanceof ApiError) {
      const status = err.status;
      const retryable = status === 429 || status >= 500;
      const message =
        status === 401 || status === 403
          ? "Gemini rejected the API key. Check GEMINI_API_KEY."
          : status === 429
            ? `Gemini quota or rate limit exceeded: ${err.message.replace(/^429\s*/, "").slice(0, 300)}`
            : status === 400
              ? `Gemini rejected the request: ${err.message.slice(0, 300)}`
              : `Gemini error (${status}): ${err.message.slice(0, 300)}`;
      logger.warn({ status, err: err.message }, "Gemini API error");
      return new ProviderError("gemini", message, { retryable, cause: err, details: { status } });
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "Gemini unexpected error");
    return new ProviderError("gemini", `Gemini request failed: ${message.slice(0, 300)}`, { retryable: true, cause: err });
  }
}
