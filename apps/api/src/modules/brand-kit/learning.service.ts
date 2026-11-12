import { MAX_LEARNED_PREFERENCES } from "@bannerai/shared";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import type { ImageGenerationProvider, ImageInput } from "../ai-providers/types.js";

const SYSTEM = `You are a senior art director reviewing how a team refined an AI-generated banner until they approved it.
You receive the original brief, the ordered list of change requests the team made, the first AI version and the final approved version, plus the rules already learned.

Extract the team's lasting DESIGN PREFERENCES — the things the first version should have done right from the start. Generalize beyond this event: write rules that apply to the organization's future banners.

Return ONLY a JSON object: { "rules": ["...", "..."] }
Rules:
- 0 to 6 rules, each one sentence (max 160 characters), imperative, specific and actionable (e.g. "Show the guest photos together as one group cut-out over a dark brand-colored gradient, not a scene").
- Only include preferences that are evident from the change requests or from the difference between first and final version; never invent.
- Skip anything event-specific (names, dates, places) and anything already covered by the existing rules.
- Prefer rules about layout, typography, info cards, logo usage, imagery treatment and what NOT to repeat.`;

function parseRules(text: string): string[] {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const tryParse = (t: string): unknown => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(trimmed) as { rules?: unknown } | null;
  if (!parsed) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = tryParse(trimmed.slice(start, end + 1)) as { rules?: unknown } | null;
  }
  const rules = parsed && Array.isArray(parsed.rules) ? parsed.rules : [];
  return rules.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.trim().slice(0, 240)).slice(0, 6);
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Merges new rules into the existing list (case-insensitive dedupe, newest kept, capped). */
export function mergePreferences(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map(normalize));
  const added = incoming.filter((r) => {
    const n = normalize(r);
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  return [...existing, ...added].slice(-MAX_LEARNED_PREFERENCES);
}

export interface LearnInput {
  brandKitId: string;
  brief: string;
  editInstructions: string[];
  firstVersion: ImageInput | null;
  finalVersion: ImageInput | null;
  providers: ImageGenerationProvider[];
}

/**
 * Turns an approved banner's edit history into reusable preferences stored on the Brand Kit.
 * Returns the rules that were newly learned (empty when nothing new).
 */
export async function learnFromApproval(input: LearnInput): Promise<string[]> {
  if (input.editInstructions.length === 0) return [];
  const kit = await prisma.brandKit.findUnique({ where: { id: input.brandKitId } });
  if (!kit) return [];
  const candidates = input.providers.filter((p) => Boolean(p.generateText));
  if (candidates.length === 0) return [];

  const images: ImageInput[] = [input.firstVersion, input.finalVersion].filter((i): i is ImageInput => Boolean(i));
  const prompt =
    `ORIGINAL BRIEF:\n"""\n${input.brief}\n"""\n\n` +
    `CHANGE REQUESTS, IN ORDER:\n${input.editInstructions.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\n` +
    (kit.learnedPreferences.length ? `RULES ALREADY LEARNED (do not repeat):\n- ${kit.learnedPreferences.join("\n- ")}\n\n` : "") +
    (images.length === 2 ? "Attached: image 1 = first AI version, image 2 = final approved version.\n\n" : images.length === 1 ? "Attached: the final approved version.\n\n" : "") +
    "Extract the rules as JSON now.";

  let text: string | null = null;
  for (const provider of candidates) {
    try {
      text = (await provider.generateText!({ system: SYSTEM, prompt, images, json: true })).text;
      break;
    } catch (err) {
      logger.warn({ err, provider: provider.id, brandKitId: kit.id }, "Preference learning failed with this provider; trying the next one");
    }
  }
  if (text === null) return [];

  const rules = parseRules(text);
  const merged = mergePreferences(kit.learnedPreferences, rules);
  const learned = merged.filter((r) => !kit.learnedPreferences.includes(r));
  if (learned.length) await prisma.brandKit.update({ where: { id: kit.id }, data: { learnedPreferences: merged } });
  logger.info({ brandKitId: kit.id, learned: learned.length }, "Learned preferences from an approved banner");
  return learned;
}
