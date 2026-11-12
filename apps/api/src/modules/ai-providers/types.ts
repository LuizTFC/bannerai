import type { AiProvider, AspectRatio, GenerationUsage, ProviderModelInfo } from "@bannerai/shared";

export type ReferenceRole = "brand-logo" | "brand-template" | "brand-reference" | "reference" | "element";

export interface ImageInput {
  buffer: Buffer;
  mimeType: string;
}

export interface ReferenceImageInput extends ImageInput {
  role: ReferenceRole;
  /** Optional short description shown to the model (e.g. original file name). */
  label?: string;
}

export interface GenerateImageInput {
  /** Final, fully composed prompt for the image model. */
  prompt: string;
  aspectRatio: AspectRatio;
  model: string;
  references: ReferenceImageInput[];
  signal?: AbortSignal;
}

export interface EditImageInput {
  /** Instruction + context describing what must change and what must be preserved. */
  prompt: string;
  aspectRatio: AspectRatio;
  model: string;
  sourceImage: ImageInput;
  references: ReferenceImageInput[];
  signal?: AbortSignal;
}

export interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  model: string;
  usage?: GenerationUsage;
  providerMetadata?: Record<string, unknown>;
}

export interface GenerateTextInput {
  system: string;
  prompt: string;
  images?: ImageInput[];
  /** Ask the model for a JSON object response. */
  json?: boolean;
  model?: string;
  signal?: AbortSignal;
}

export interface GenerateTextOutput {
  text: string;
  model: string;
  usage?: GenerationUsage;
}

/**
 * Provider abstraction. Every provider lives exclusively in the backend and receives
 * credentials from environment variables. Business logic (pipeline, prompt building,
 * persistence) never depends on a concrete provider.
 */
export interface ImageGenerationProvider {
  readonly id: AiProvider;
  readonly label: string;
  readonly description: string;
  isConfigured(): boolean;
  defaultImageModel(): string;
  listImageModels(): ProviderModelInfo[];
  supportsImageModel(model: string): boolean;
  generateImage(input: GenerateImageInput): Promise<GeneratedImage>;
  editImage(input: EditImageInput): Promise<GeneratedImage>;
  /** Optional text capability used for prompt optimization and reference analysis. */
  generateText?(input: GenerateTextInput): Promise<GenerateTextOutput>;
}
