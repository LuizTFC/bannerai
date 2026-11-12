import type { AiProvider, ProviderInfo, ProvidersResponse } from "@bannerai/shared";
import { AI_PROVIDERS, PROVIDER_OPTIONS } from "@bannerai/shared";
import { env } from "../../config/env.js";
import { BadRequestError, ServiceUnavailableError } from "../../utils/errors.js";
import { GeminiProvider } from "./gemini.provider.js";
import { OpenAiProvider } from "./openai.provider.js";
import type { ImageGenerationProvider } from "./types.js";

export class ProviderRegistry {
  private readonly providers = new Map<AiProvider, ImageGenerationProvider>();

  constructor(providers: ImageGenerationProvider[], private readonly defaultProviderId: AiProvider) {
    for (const p of providers) this.providers.set(p.id, p);
  }

  /** Replaces (or adds) a provider at runtime. Used by tests to inject a stub provider. */
  register(provider: ImageGenerationProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: AiProvider): ImageGenerationProvider {
    const p = this.providers.get(id);
    if (!p) throw new BadRequestError(`Unknown AI provider: ${id}`);
    return p;
  }

  has(id: string): id is AiProvider {
    return (AI_PROVIDERS as readonly string[]).includes(id) && this.providers.has(id as AiProvider);
  }

  all(): ImageGenerationProvider[] {
    return [...this.providers.values()];
  }

  defaultProvider(): AiProvider {
    return this.defaultProviderId;
  }

  /** Resolves the provider/model pair for a request, validating configuration and compatibility. */
  resolve(requested: { provider?: AiProvider; model?: string }, userDefaults?: { defaultProvider?: AiProvider; defaultModel?: string }) {
    const providerId = requested.provider ?? userDefaults?.defaultProvider ?? this.defaultProviderId;
    const provider = this.get(providerId);
    if (!provider.isConfigured()) {
      throw new ServiceUnavailableError(`${provider.label} is not configured on the server. Add the API key to the backend environment.`, { provider: providerId });
    }
    const candidate = requested.model ?? (userDefaults?.defaultProvider === providerId ? userDefaults?.defaultModel : undefined);
    const model = candidate && provider.supportsImageModel(candidate) ? candidate : provider.defaultImageModel();
    if (candidate && !provider.supportsImageModel(candidate) && requested.model) {
      throw new BadRequestError(`Model "${candidate}" is not an image model for ${provider.label}.`);
    }
    return { provider, model };
  }

  /** Provider that can run text tasks (prompt optimization). Prefers the given provider, then any configured one. */
  textProvider(preferred?: AiProvider): ImageGenerationProvider | null {
    return this.textProviders(preferred)[0] ?? null;
  }

  /** All configured text-capable providers, preferred first — callers fall back down the list on failure. */
  textProviders(preferred?: AiProvider): ImageGenerationProvider[] {
    const order = [preferred, this.defaultProviderId, ...AI_PROVIDERS].filter((v): v is AiProvider => Boolean(v));
    const out: ImageGenerationProvider[] = [];
    for (const id of order) {
      const p = this.providers.get(id);
      if (p && p.isConfigured() && p.generateText && !out.includes(p)) out.push(p);
    }
    return out;
  }

  describe(): ProvidersResponse {
    const providers: ProviderInfo[] = this.all().map((p) => ({
      id: p.id,
      label: p.label,
      description: PROVIDER_OPTIONS.find((o) => o.value === p.id)?.description ?? p.description,
      configured: p.isConfigured(),
      defaultModel: p.defaultImageModel(),
      models: p.listImageModels(),
    }));
    return { defaultProvider: this.defaultProviderId, providers };
  }
}

export function createProviderRegistry(): ProviderRegistry {
  const defaultProvider = env.DEFAULT_AI_PROVIDER;
  const legacyDefaultModel = env.DEFAULT_IMAGE_MODEL;
  const gemini = new GeminiProvider({
    apiKey: env.GEMINI_API_KEY,
    imageModel: env.GEMINI_IMAGE_MODEL ?? (defaultProvider === "gemini" ? legacyDefaultModel : undefined),
    textModel: env.GEMINI_TEXT_MODEL,
    imageSize: env.GEMINI_IMAGE_SIZE,
  });
  const openai = new OpenAiProvider({
    apiKey: env.OPENAI_API_KEY,
    imageModel: env.OPENAI_IMAGE_MODEL ?? (defaultProvider === "openai" ? legacyDefaultModel : undefined),
    textModel: env.OPENAI_TEXT_MODEL,
    quality: env.OPENAI_IMAGE_QUALITY,
  });
  return new ProviderRegistry([gemini, openai], defaultProvider);
}

export const providerRegistry = createProviderRegistry();
