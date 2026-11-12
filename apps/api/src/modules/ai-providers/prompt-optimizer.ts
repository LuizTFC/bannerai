import type { GenerationUsage } from "@bannerai/shared";
import { logger } from "../../config/logger.js";
import { buildBasePrompt, buildConstraintsBlock, guessTitle, resolveLanguage, type BannerLanguage, type PromptContext, type TextElements } from "./prompt-builder.js";
import type { ImageGenerationProvider, ReferenceImageInput } from "./types.js";

export interface OptimizedPrompt {
  /** Creative prompt (without the constraints block). */
  prompt: string;
  /** Hard constraints to append after the creative prompt. */
  constraints: string;
  eventName: string;
  text: TextElements;
  language: BannerLanguage;
  optimized: boolean;
  usage?: GenerationUsage;
}

const SYSTEM = `You are a senior art director and an expert prompt engineer for image generation models (Gemini Nano Banana, GPT Image).
Given a creative brief, brand constraints and optional reference images, write ONE precise image-generation prompt for a finished promotional banner.

Return ONLY a JSON object with this exact shape:
{
  "eventName": "short event/campaign name (max 60 chars) exactly as it should appear on the banner",
  "title": "main headline text exactly as it should appear",
  "subtitle": "optional supporting line or empty string",
  "details": ["date / time / place / speaker lines exactly as given in the brief, max 3; empty array if none"],
  "language": "pt-BR", "en" or "es",
  "referenceStyle": "2-4 sentences describing concretely the visual language of the attached reference images (palette, typography style, layout devices, imagery treatment, mood) or empty string if none",
  "prompt": "the image generation prompt"
}

Rules for "prompt":
- Write it in English (image models follow English best) but keep every piece of on-banner text verbatim in the brief's language, in quotes, with the exact spelling.
- Structure it as: subject & imagery → composition and focal point → lighting/atmosphere → color palette (hex codes when given) → typography style and hierarchy → exact text placement → format.
- Imagery: propose ONE strong, specific visual concept that expresses the theme (a symbolic object, a scene, a texture, a photographic moment) with subject, framing, lighting and color grading. Avoid generic stock scenes (random crowds with raised hands, handshakes, laptops) unless the brand references rely on exactly that. The image must leave room for the text where the layout needs it.
- Copy hierarchy: decide explicitly what is the title, the optional tagline/subtitle, the details list (date, time, place, speakers) and an optional short footer line; give each a size as a percentage of the canvas height and a position, matching the proportions of the BRAND REFERENCE banners when they exist (the title is usually far smaller than people expect: typically 15–22% of the canvas height on portrait/square). Do not repeat the same information twice.
- Write in plain prose sentences (no arrows, no bullet symbols), under 300 words.
- Never copy text, logos, dates or photos from reference images — reuse their design system only. The only logo allowed is the one labeled LOGO.
- ELEMENT images are content: plan where each one goes, at what size, and how it is integrated with the layout. Mention each element by its caption. When the elements are people (guests, speakers, a band), make them the hero imagery: one unified group of cut-outs over a dark brand-colored gradient backdrop with their names below — do NOT invent a scene (landscape, crowd, campfire) instead of them, and do not list them again in a text card.
- When the constraints define FACE FIDELITY, describe each guest with exactly the head pose, expression and framing of their photo, face large and unobstructed, arranged left to right in the order listed: the studio restores their real faces afterwards.
- Never state the same fact twice (e.g. the place in the subtitle AND in a card). Do not write the organization's name as text when its logo is present.
- BRAND REFERENCE images are the organization's established design system: the new banner must look like it belongs to the same family. Describe their system explicitly (layout structure, info blocks, icons, badges, typography pairing, photo treatment, footer devices) and demand the same system applied to this event. A TEMPLATE image must have its structure reproduced almost one-to-one, changing only the content and the imagery. REFERENCE images are strong inspiration.
- Preserve every explicit user instruction and the brand constraints. Explicit user instructions win over brand defaults.
- Never invent fonts, dates, names, places or extra text. If no font is specified, describe a type style (e.g. "condensed bold sans-serif") instead of naming a font.
- Demand a finished flat banner graphic (no mockups, frames, devices, watermarks) and crisp, legible text.
- Keep it under 400 words. No markdown.`;

function parseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

const asString = (v: unknown, max = 500): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

const roleLabel: Record<ReferenceImageInput["role"], string> = { "brand-logo": "LOGO", "brand-template": "TEMPLATE (reproduce its structure)", "brand-reference": "BRAND REFERENCE (established design system)", reference: "REFERENCE", element: "ELEMENT (must appear in the banner)" };

/**
 * Composes the creative prompt deterministically and, when a configured text model is available,
 * asks it to refine the prompt, analyze the reference images and extract the exact banner text.
 * The constraints block is always appended by the caller, so brand rules survive optimization.
 */
export async function optimizePrompt(
  ctx: PromptContext,
  options: { textProvider: ImageGenerationProvider | null; enabled: boolean; referenceImages?: ReferenceImageInput[]; signal?: AbortSignal },
): Promise<OptimizedPrompt> {
  const basePrompt = buildBasePrompt(ctx);
  const constraints = buildConstraintsBlock(ctx);
  const language = resolveLanguage(ctx.language, ctx.userPrompt);
  const fallback: OptimizedPrompt = {
    prompt: basePrompt,
    constraints,
    eventName: guessTitle(ctx.userPrompt),
    text: { title: guessTitle(ctx.userPrompt) },
    language,
    optimized: false,
  };

  const provider = options.textProvider;
  if (!options.enabled || !provider?.generateText) return fallback;

  const images = (options.referenceImages ?? []).filter((r) => r.role !== "brand-logo").slice(0, 6);
  const imageList = images.length ? `Attached images, in order: ${images.map((r, i) => `${i + 1}. ${roleLabel[r.role]}${r.label ? ` (${r.label})` : ""}`).join("; ")}.` : "";

  try {
    const result = await provider.generateText({
      system: SYSTEM,
      prompt:
        `CREATIVE BRIEF:\n\n${basePrompt}\n\n${constraints}\n\n` +
        (imageList ? `${imageList}\nAnalyze them carefully and reflect their visual language in the prompt.\n\n` : "") +
        `Produce the JSON now.`,
      images,
      json: true,
      signal: options.signal,
    });
    const parsed = parseJson(result.text);
    const prompt = asString(parsed?.prompt, 4000);
    if (!parsed || !prompt) {
      logger.warn({ provider: provider.id }, "Prompt optimizer returned an unusable response; using base prompt");
      return { ...fallback, usage: result.usage };
    }
    const title = asString(parsed.title, 120) ?? asString(parsed.eventName, 120) ?? fallback.text.title;
    const details = Array.isArray(parsed.details) ? parsed.details.map((d) => asString(d, 120)).filter((d): d is string => Boolean(d)).slice(0, 3) : [];
    const referenceStyle = asString(parsed.referenceStyle, 800);
    return {
      prompt: referenceStyle ? `${prompt}\n\nVISUAL LANGUAGE OF THE REFERENCES (match it): ${referenceStyle}` : prompt,
      constraints,
      eventName: asString(parsed.eventName, 60) ?? title.slice(0, 60),
      text: { title, subtitle: asString(parsed.subtitle, 200), details },
      language: resolveLanguage(asString(parsed.language, 10), ctx.userPrompt),
      optimized: true,
      usage: result.usage,
    };
  } catch (err) {
    logger.warn({ err, provider: provider.id }, "Prompt optimization failed; using base prompt");
    return fallback;
  }
}
