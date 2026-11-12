import { createHash } from "node:crypto";
import type { BrandStyleGuide } from "@bannerai/shared";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import { storage } from "../../services/storage/index.js";
import type { ImageGenerationProvider, ImageInput } from "../ai-providers/types.js";
import type { BrandKitWithAssets } from "./brand-kit.service.js";

export const MAX_ANALYZED_REFERENCES = 6;
/** Bump when the extracted guide gains fields, so existing kits are re-analyzed. */
const STYLE_GUIDE_VERSION = "v2";

const SYSTEM = `You are a senior brand designer documenting a design system from examples.
You will receive several banners that an organization has already published. They define the visual standard every new banner must follow.
Study them carefully and extract the recurring system — not a description of one banner, but the rules that make them a family.

Return ONLY a JSON object with this exact shape (strings in English, concrete and specific, 1–3 sentences each):
{
  "summary": "one paragraph: what makes these banners recognizably from the same organization",
  "layout": "grid/structure: where the title sits, where details sit, margins, alignment, how space is divided, hierarchy order from top to bottom",
  "typography": "typeface styles (e.g. heavy condensed uppercase sans for titles, script accent, light sans for body), sizes relative to the canvas, case, tracking, how title/subtitle/details are differentiated",
  "colors": "palette with approximate hex codes and how each is used (backgrounds, titles, accents, info blocks)",
  "devices": "recurring graphic devices: info cards/pills with icons (calendar, clock, pin), badges, bands, footer lines, stickers, textures, dividers, overlays",
  "imagery": "photo or illustration treatment: subject types, lighting, color grading, blur/bokeh, cut-outs, how imagery relates to text",
  "logoUsage": "where and how the logo appears (position, size, color version, surrounding space)",
  "mood": "overall tone and energy",
  "proportions": "scale relationships measured against the canvas: title block height as % of canvas height and width as % of canvas width, subtitle size relative to the title, info-card height, margins and the breathing space between blocks (be numeric, e.g. 'title ≈ 18% of height, ≈ 75% of width')",
  "textHierarchy": "the text levels from top to bottom with how each is styled, e.g. '1) small uppercase kicker line above the title (ministry/organizer), 2) title in 2 lines, 3) subtitle sentence, 4) 2–4 detail items, each in its own rounded card with an icon, 5) footer line'",
  "doNot": ["things that would break the system, max 5"]
}
Be concrete and quantitative. Describe the recurring pattern across banners, not one banner.`;

export function referencesHash(kit: BrandKitWithAssets): string | null {
  const refs = kit.assets.filter((a) => a.type === "reference").slice(0, MAX_ANALYZED_REFERENCES);
  if (refs.length === 0) return null;
  return createHash("sha1").update(`${STYLE_GUIDE_VERSION}:${refs.map((r) => r.id).sort().join("|")}`).digest("hex");
}

export function parseStyleGuide(raw: unknown): BrandStyleGuide | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const guide: BrandStyleGuide = {
    summary: str("summary"),
    layout: str("layout"),
    typography: str("typography"),
    colors: str("colors"),
    devices: str("devices"),
    imagery: str("imagery"),
    logoUsage: str("logoUsage"),
    mood: str("mood"),
    proportions: str("proportions"),
    textHierarchy: str("textHierarchy"),
    doNot: Array.isArray(o.doNot) ? o.doNot.filter((d): d is string => typeof d === "string" && d.trim().length > 0).slice(0, 5) : [],
  };
  return guide.summary || guide.layout || guide.typography ? guide : null;
}

export const isStyleGuideStale = (kit: BrandKitWithAssets): boolean => {
  const hash = referencesHash(kit);
  if (!hash) return false;
  return kit.styleGuideSourceHash !== hash || !kit.styleGuide;
};

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

type TextProviders = ImageGenerationProvider | ImageGenerationProvider[] | null;
const toList = (p: TextProviders): ImageGenerationProvider[] => (Array.isArray(p) ? p : p ? [p] : []).filter((x) => Boolean(x.generateText));

/**
 * Runs the analysis with the first text-capable provider that succeeds (e.g. Gemini, then OpenAI)
 * and persists the result on the kit.
 */
export async function analyzeBrandKit(kit: BrandKitWithAssets, providers: TextProviders): Promise<BrandStyleGuide | null> {
  const hash = referencesHash(kit);
  if (!hash) {
    if (kit.styleGuide) await prisma.brandKit.update({ where: { id: kit.id }, data: { styleGuide: undefined, styleGuideSourceHash: null, styleGuideUpdatedAt: null } });
    return null;
  }
  const candidates = toList(providers);
  if (candidates.length === 0) {
    logger.warn({ brandKitId: kit.id }, "No text provider available to analyze brand references");
    return parseStyleGuide(kit.styleGuide);
  }
  const refs = kit.assets.filter((a) => a.type === "reference").slice(0, MAX_ANALYZED_REFERENCES);
  const images: ImageInput[] = [];
  for (const asset of refs) {
    try {
      images.push({ buffer: await storage.get(asset.storageKey), mimeType: asset.mimeType });
    } catch (err) {
      logger.warn({ err, key: asset.storageKey }, "Brand reference missing in storage; skipped from analysis");
    }
  }
  if (images.length === 0) return parseStyleGuide(kit.styleGuide);

  const context = [
    kit.organizationName ? `Organization: ${kit.organizationName}${kit.organizationType ? ` (${kit.organizationType})` : ""}.` : kit.organizationType ? `Organization type: ${kit.organizationType}.` : "",
    kit.primaryColor || kit.secondaryColor || kit.accentColors.length ? `Declared brand colors: ${[kit.primaryColor, kit.secondaryColor, ...kit.accentColors].filter(Boolean).join(", ")}.` : "",
    kit.instructions ? `Written guidelines: ${kit.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `${context ? `${context}\n\n` : ""}Attached: ${images.length} published banner(s) of this organization. Extract the design system as JSON now.`;
  let text: string | null = null;
  let lastError: unknown;
  for (const provider of candidates) {
    try {
      text = (await provider.generateText!({ system: SYSTEM, prompt, images, json: true })).text;
      break;
    } catch (err) {
      lastError = err;
      logger.warn({ err, provider: provider.id, brandKitId: kit.id }, "Brand analysis failed with this provider; trying the next one");
    }
  }
  if (text === null) throw lastError instanceof Error ? lastError : new Error("Brand analysis failed");
  const guide = parseStyleGuide(parseJson(text));
  if (!guide) {
    logger.warn({ brandKitId: kit.id }, "Brand analysis returned an unusable response");
    return parseStyleGuide(kit.styleGuide);
  }
  await prisma.brandKit.update({
    where: { id: kit.id },
    data: { styleGuide: JSON.parse(JSON.stringify(guide)), styleGuideSourceHash: hash, styleGuideUpdatedAt: new Date() },
  });
  logger.info({ brandKitId: kit.id, references: images.length }, "Brand visual system analyzed");
  return guide;
}

/** Returns the current guide, re-analyzing first when the references changed. */
export async function ensureStyleGuide(kit: BrandKitWithAssets, providers: TextProviders): Promise<BrandStyleGuide | null> {
  if (!isStyleGuideStale(kit)) return parseStyleGuide(kit.styleGuide);
  try {
    return await analyzeBrandKit(kit, providers);
  } catch (err) {
    logger.warn({ err, brandKitId: kit.id }, "Brand analysis failed; continuing with the previous guide");
    return parseStyleGuide(kit.styleGuide);
  }
}
