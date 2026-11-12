import type { ProviderModelInfo } from "@bannerai/shared";
import sharp from "sharp";
import type {
  EditImageInput,
  GenerateImageInput,
  GenerateTextInput,
  GenerateTextOutput,
  GeneratedImage,
  ImageGenerationProvider,
} from "../modules/ai-providers/types.js";
import { ProviderRegistry } from "../modules/ai-providers/registry.js";

/** Deterministic in-memory provider used ONLY in tests to exercise the pipeline without network calls. */
export class FakeProvider implements ImageGenerationProvider {
  readonly id = "gemini" as const;
  readonly label = "Fake";
  readonly description = "Test provider";
  readonly generateCalls: GenerateImageInput[] = [];
  readonly editCalls: EditImageInput[] = [];
  readonly textCalls: GenerateTextInput[] = [];
  failNext: Error | null = null;
  textResponse: string | null = null;

  constructor(private readonly configured = true) {}

  isConfigured(): boolean {
    return this.configured;
  }
  defaultImageModel(): string {
    return "fake-image-model";
  }
  listImageModels(): ProviderModelInfo[] {
    return [{ id: "fake-image-model", label: "Fake", description: "Test" }];
  }
  supportsImageModel(model: string): boolean {
    return model.startsWith("fake") || model.startsWith("gemini-");
  }

  private async image(color: { r: number; g: number; b: number }): Promise<GeneratedImage> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    const buffer = await sharp({ create: { width: 320, height: 180, channels: 3, background: color } }).png().toBuffer();
    return { buffer, mimeType: "image/png", model: "fake-image-model", usage: { outputTokens: 10, estimatedCostUsd: 0.01 } };
  }

  async generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
    this.generateCalls.push(input);
    return this.image({ r: 40, g: 80, b: 200 });
  }

  async editImage(input: EditImageInput): Promise<GeneratedImage> {
    this.editCalls.push(input);
    return this.image({ r: 200, g: 60, b: 90 });
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    this.textCalls.push(input);
    return { text: this.textResponse ?? JSON.stringify({ eventName: "SEM FILTRO", title: "SEM FILTRO", subtitle: "Conferência de Jovens", details: ["24 e 25 de outubro"], language: "pt-BR", prompt: "optimized prompt text" }), model: "fake-text" };
  }
}

export function fakeRegistry(provider = new FakeProvider()): ProviderRegistry {
  return new ProviderRegistry([provider], "gemini");
}
