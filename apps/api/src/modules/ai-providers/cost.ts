import type { GenerationUsage } from "@bannerai/shared";

/**
 * Approximate list prices (USD) used only to annotate generations with an estimated cost.
 * Source: official pricing pages as of Nov 2026. Update when providers change pricing.
 */
export const GEMINI_IMAGE_COST_PER_IMAGE_USD: Record<string, Partial<Record<"1K" | "2K" | "4K", number>>> = {
  "gemini-nano-banana-2.1": { "1K": 0.0336, "2K": 0.0504, "4K": 0.113 },
  "gemini-3.1-flash-lite-image": { "1K": 0.0336 },
  "gemini-3.1-flash-image": { "1K": 0.067, "2K": 0.101, "4K": 0.151 },
  "gemini-3-pro-image": { "1K": 0.134, "2K": 0.134, "4K": 0.24 },
  "gemini-2.5-flash-image": { "1K": 0.039 },
};

/** OpenAI gpt-image-2 / 2.5 family: $8 / 1M image input tokens, $30 / 1M image output tokens, $5 / 1M text input tokens. */
export const OPENAI_IMAGE_TOKEN_PRICES_USD = { imageInputPerM: 8, imageOutputPerM: 30, textInputPerM: 5 };

export function estimateGeminiImageCost(model: string, size: "1K" | "2K" | "4K" = "1K"): number | undefined {
  const table = GEMINI_IMAGE_COST_PER_IMAGE_USD[model];
  return table?.[size] ?? table?.["1K"];
}

export function estimateOpenAiImageCost(usage: { inputImageTokens?: number; inputTextTokens?: number; outputTokens?: number }): number | undefined {
  if (usage.outputTokens === undefined && usage.inputImageTokens === undefined) return undefined;
  const p = OPENAI_IMAGE_TOKEN_PRICES_USD;
  const cost =
    ((usage.inputImageTokens ?? 0) * p.imageInputPerM + (usage.inputTextTokens ?? 0) * p.textInputPerM + (usage.outputTokens ?? 0) * p.imageOutputPerM) /
    1_000_000;
  return Math.round(cost * 10_000) / 10_000;
}

export function mergeUsage(...parts: Array<GenerationUsage | undefined>): GenerationUsage | undefined {
  const defined = parts.filter((p): p is GenerationUsage => Boolean(p));
  if (defined.length === 0) return undefined;
  const out: GenerationUsage = {};
  for (const p of defined) {
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "number") out[k] = ((out[k] as number | undefined) ?? 0) + v;
      else if (out[k] === undefined) out[k] = v;
    }
  }
  return out;
}
