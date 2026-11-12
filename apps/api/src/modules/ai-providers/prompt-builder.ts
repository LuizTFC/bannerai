import type { AspectRatio, BrandStyleGuide, GenerationSettings, LogoPlacement } from "@bannerai/shared";
import { DESIGN_STYLE_OPTIONS, FONT_OPTIONS } from "@bannerai/shared";

export interface BrandKitContext {
  name?: string | null;
  organizationName?: string | null;
  organizationType?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColors?: string[];
  preferredFonts?: string[];
  instructions?: string | null;
  hasLogo: boolean;
  referenceCount: number;
  /** Visual system extracted from the brand reference banners. */
  styleGuide?: BrandStyleGuide | null;
  /** Rules learned from banners the team approved after editing. */
  learnedPreferences?: string[];
  /** Whether a TEMPLATE reference image is attached for this banner. */
  hasTemplate?: boolean;
}

export interface ElementContext {
  label: string;
}

export function renderStyleGuide(guide: BrandStyleGuide): string {
  const rows: Array<[string, string]> = [
    ["Summary", guide.summary],
    ["Layout structure", guide.layout],
    ["Typography system", guide.typography],
    ["Color usage", guide.colors],
    ["Recurring graphic devices", guide.devices],
    ["Imagery treatment", guide.imagery],
    ["Logo usage", guide.logoUsage],
    ["Mood", guide.mood],
    ["Proportions (match these scale relationships)", guide.proportions],
    ["Text hierarchy (reproduce these levels)", guide.textHierarchy],
  ];
  const lines = rows.filter(([, v]) => v).map(([k, v]) => `  • ${k}: ${v}`);
  if (guide.doNot.length) lines.push(`  • Never: ${guide.doNot.join("; ")}`);
  return lines.join("\n");
}

export interface PromptContext {
  userPrompt: string;
  aspectRatio: AspectRatio;
  settings: GenerationSettings;
  brandKit?: BrandKitContext | null;
  /** Number of per-request reference images attached. */
  referenceCount: number;
  /** Content elements (guest photos, logos, products) that must appear in the banner. */
  elements?: ElementContext[];
  /** Exact faces: the studio restores each person's real face afterwards, aligned on the painted face. */
  faceLock?: boolean;
  /** Language hint ("pt-BR" | "en" | "es" | "auto"). */
  language?: string;
}

export function renderFaceLock(forEdit = false): string {
  return forEdit
    ? `FACE FIDELITY (critical): after your edit the studio restores each guest's real face from their photo, aligned on the painted face. Keep every face exactly where it is, at the same size, head pose and expression, unless the request explicitly moves, resizes or re-poses that person; when you do change a person, paint the head in exactly the pose, angle and framing of their photo, fully visible and unobstructed.`
    : `FACE FIDELITY (critical): after generation the studio replaces each guest's face with the pixels of their photo, aligned on the eyes, nose and mouth. So paint every person with EXACTLY the head pose, tilt, angle and framing of their photo (a frontal headshot stays frontal, a three-quarter view stays three-quarter), the same expression, hairstyle, skin tone, glasses and facial hair; the face fully visible, evenly lit and unobstructed (no hands, microphones, hair or objects in front of it), large (head at least 12% of the canvas height); and arrange the people left to right in the order the elements are listed.`;
}

export interface TextElements {
  title: string;
  subtitle?: string;
  details?: string[];
}

export type BannerLanguage = "pt-BR" | "en" | "es";

export const LANGUAGE_NAMES: Record<BannerLanguage, string> = {
  "pt-BR": "Brazilian Portuguese (pt-BR)",
  en: "English",
  es: "Spanish (es)",
};

export const isBannerLanguage = (value: unknown): value is BannerLanguage => value === "pt-BR" || value === "en" || value === "es";

const ASPECT_DESCRIPTION: Record<AspectRatio, string> = {
  "16:9": "wide landscape 16:9 (horizontal banner / screen slide)",
  "9:16": "tall portrait 9:16 (stories / vertical mobile banner)",
  "1:1": "square 1:1 (social media feed post)",
  "4:3": "classic landscape 4:3 (projector / flyer)",
};

const describeFont = (value: string): string => FONT_OPTIONS.find((f) => f.value === value || f.label === value)?.description ?? value;

/** Heuristic language detection good enough to steer the model between Portuguese, Spanish and English. */
export function detectLanguage(text: string): BannerLanguage {
  const ptSignals = /\b(para|com|nossa|nosso|igreja|culto|jovens|noite|conferência|conferencia|retiro|oração|oracao|adoração|adoracao|evento|dia|horas|crie|banner|sobre|uma|um|de|do|da|dos|das|que|não|nao|será|sera|você|voce|em|ao|à|também|tambem)\b/gi;
  const esSignals = /\b(para|con|nuestra|nuestro|iglesia|culto|jóvenes|jovenes|noche|conferencia|retiro|oración|oracion|adoración|adoracion|evento|día|dia|horas|crea|banner|sobre|una|un|de|del|los|las|el|la|que|no|será|sera|usted|en|al|también|tambien|y)\b/gi;
  const enSignals = /\b(the|and|for|with|our|church|worship|night|youth|conference|retreat|prayer|event|create|banner|about|a|an|of|that|will|you|in|at|to|is)\b/gi;
  const pt = (text.match(ptSignals) ?? []).length;
  const esCount = (text.match(esSignals) ?? []).length;
  const en = (text.match(enSignals) ?? []).length;
  const hasPtChars = /[ãõçê]/i.test(text) || /\b(não|nao|você|voce|ção)\b/i.test(text);
  const hasEsChars = /[ñ¿¡]/i.test(text) || /\b(el|los|las|del|y|con|jóvenes|iglesia|noche)\b/i.test(text);
  if (hasPtChars && pt >= en * 0.5) return "pt-BR";
  if (hasEsChars && !hasPtChars && esCount >= en * 0.5) return "es";
  if (pt > en && pt >= esCount) return "pt-BR";
  if (esCount > en && esCount > pt) return "es";
  return "en";
}

export const resolveLanguage = (hint: string | undefined, text: string): BannerLanguage => (isBannerLanguage(hint) ? hint : detectLanguage(text));

const LOGO_CORNER: Record<Exclude<LogoPlacement, "ai" | "none">, string> = {
  "top-left": "top-left corner",
  "top-right": "top-right corner",
  "bottom-left": "bottom-left corner",
  "bottom-right": "bottom-right corner",
};

/**
 * Hard constraints that must survive prompt optimization. They are appended verbatim AFTER the
 * creative prompt (models weigh the end of the prompt heavily), for both deterministic and
 * optimized flows. Explicit per-banner settings win over Brand Kit defaults.
 */
export function buildConstraintsBlock(ctx: PromptContext): string {
  const s = ctx.settings;
  const lang = resolveLanguage(ctx.language, ctx.userPrompt);
  const langName = LANGUAGE_NAMES[lang];
  const lines: string[] = [];

  const bk = ctx.brandKit;
  const useBrandKit = s.useBrandKit !== false && bk;
  const logoPlacement: LogoPlacement = s.logoPlacement ?? "ai";

  // Colors: explicit settings first, then brand kit for whatever is missing.
  const colors: string[] = [];
  if (s.primaryColor) colors.push(`primary ${s.primaryColor}`);
  else if (useBrandKit && bk.primaryColor) colors.push(`primary ${bk.primaryColor}`);
  if (s.secondaryColor) colors.push(`secondary ${s.secondaryColor}`);
  else if (useBrandKit && bk.secondaryColor) colors.push(`secondary ${bk.secondaryColor}`);
  if (s.accentColor) colors.push(`accent ${s.accentColor}`);
  else if (useBrandKit && bk.accentColors?.length) colors.push(`accents ${bk.accentColors.join(", ")}`);
  if (colors.length) lines.push(`COLOR PALETTE (mandatory, use these exact colors as the dominant palette): ${colors.join(", ")}.`);

  // Typography
  if (s.fontFamily) lines.push(`TYPOGRAPHY (mandatory): headline in a ${describeFont(s.fontFamily)}; pair it with a complementary secondary font.`);
  else if (useBrandKit && bk.preferredFonts?.length) lines.push(`TYPOGRAPHY (brand fonts): ${bk.preferredFonts.map(describeFont).join("; ")}.`);

  if (useBrandKit) {
    if (bk.organizationName) {
      lines.push(
        `ORGANIZATION (context only): ${bk.organizationName}${bk.organizationType ? ` (${bk.organizationType})` : ""}. ${
          bk.hasLogo && logoPlacement !== "none" ? "Do NOT write the organization name as text — the logo represents it." : "Write the organization name only if the brief asks for it."
        }`,
      );
    } else if (bk.organizationType) lines.push(`ORGANIZATION TYPE: ${bk.organizationType}.`);
    if (bk.instructions) lines.push(`BRAND GUIDELINES (mandatory): ${bk.instructions}`);
    if (bk.hasLogo) {
      if (logoPlacement === "ai") {
        lines.push(
          `LOGO (mandatory): the attached image labeled "LOGO" is the official logo. Place it exactly as provided — same shapes, letters and colors, not redrawn, not restyled — in a tasteful, legible position (a corner or the footer band), at a modest size (about 8–14% of the banner width). It must be clearly visible.`,
        );
      } else if (logoPlacement !== "none") {
        lines.push(`LOGO: do NOT draw any logo; leave a clean, uncluttered area in the ${LOGO_CORNER[logoPlacement]} where the official logo will be placed afterwards.`);
      } else {
        lines.push("LOGO: do not include any logo.");
      }
    }
    if (bk.hasTemplate) {
      lines.push(
        `TEMPLATE (highest priority): the attached image labeled "TEMPLATE" is a published banner of this organization. Reproduce its layout structure, grid, typographic system, information blocks and graphic devices almost one-to-one for the new content; change only the texts, the imagery and the event-specific colors where the brief requires. The result must read as the same template filled with this event.`,
      );
    }
    if (bk.referenceCount > 0) {
      lines.push(
        `BRAND DESIGN SYSTEM (mandatory): the attached images labeled "BRAND REFERENCE" are banners this organization already publishes — they ARE the standard. The new banner must look like it belongs to the same family: same layout logic, same typography system and hierarchy, same color treatment, same recurring devices (info cards, icons, badges, footer lines, textures), same photo/illustration treatment and the same mood. Create a new composition for this event inside that system; do not drift to a generic style.`,
      );
    }
    if (bk.styleGuide) {
      lines.push(`BRAND VISUAL SYSTEM (extracted from the organization's published banners; follow precisely):\n${renderStyleGuide(bk.styleGuide)}`);
    }
    if (bk.learnedPreferences?.length) {
      lines.push(`LEARNED PREFERENCES (from banners this team approved after revisions; apply unless the brief says otherwise):\n${bk.learnedPreferences.map((r) => `  • ${r}`).join("\n")}`);
    }
  }

  if (ctx.referenceCount > 0) {
    lines.push(
      `REQUEST REFERENCES: the attached images labeled "REFERENCE" were chosen for this banner. Use them as the main inspiration for composition, typography and mood; do not copy them literally and never reuse their text.`,
    );
  }
  if (ctx.elements?.length) {
    lines.push(
      `ELEMENTS (mandatory content): the attached images labeled "ELEMENT" must appear inside the banner as real content, each one clearly recognizable: ${ctx.elements
        .map((e, i) => `ELEMENT ${i + 1} = "${e.label}"`)
        .join("; ")}. Keep every person's face and body proportions exactly as in the source (no warping, stretching, squashing or restyling into another person), keep logos and products exactly as provided (no redrawing), and caption people with their name when the brief or the element label gives one, all captions in one consistent style.`,
    );
    lines.push(
      `ELEMENTS AS THE HERO: when the elements are people (guests, speakers, artists, a band), they ARE the main imagery: compose them together as one unified group of clean cut-outs on a brand-colored dark stage backdrop with a soft gradient and subtle lighting, sized large and prominent, with their names right below them. Do not invent a separate scene (landscapes, crowds, objects) to replace them, and do not also list those people in a text card — each fact appears exactly once.`,
    );
    if (ctx.faceLock) lines.push(renderFaceLock());
  }
  lines.push(`NO DUPLICATION: every piece of information (place, date, guests, organizer) appears exactly once — never both in a subtitle and in a card, nor both as a photo caption and in a list.`);

  if (s.textPosition && s.textPosition !== "auto") {
    lines.push(s.textPosition === "center" ? "TEXT LAYOUT: center the typography block horizontally and vertically." : `TEXT LAYOUT: align the typography block to the ${s.textPosition} side, leaving breathing room on the opposite side.`);
  }
  if (s.additionalInstructions) lines.push(`ADDITIONAL INSTRUCTIONS (mandatory): ${s.additionalInstructions}`);

  if (useBrandKit || ctx.referenceCount > 0) {
    lines.push(
      `REFERENCE CONTENT RULE: never copy content from any reference image — not their text, dates, names, prices, photos, people or logos. ${
        useBrandKit && bk.hasLogo && logoPlacement === "ai" ? 'The ONLY logo allowed on this banner is the attached image labeled "LOGO".' : "Do not add any logo other than what these constraints allow."
      } Reuse their design system, not their content.`,
    );
  }
  lines.push(
    `TEXT RULES: all text in ${langName}, with the event name, dates, times, places and speakers exactly as in the brief. Fix only obvious missing accents or typos in common words (e.g. "razao" → "razão", "coracao" → "coração"); never alter proper names, brand names or the event name. Never invent names, dates, places or claims; a short tagline or call-to-action is allowed only when composed from words and ideas already in the brief. No lorem ipsum, no gibberish, no duplicated words.`,
  );
  lines.push(
    `SCALE & HIERARCHY: ${
      useBrandKit && (bk.referenceCount > 0 || bk.styleGuide)
        ? "match the scale relationships of the BRAND REFERENCE banners — title size relative to the canvas, size of the info cards, margins and spacing — do not enlarge the title beyond what the references do. "
        : ""
    }The title is the dominant element but must keep generous breathing space${
      useBrandKit && bk.styleGuide?.proportions
        ? " (use the proportions in the BRAND VISUAL SYSTEM above as the measure)"
        : `: it never exceeds ${ctx.aspectRatio === "16:9" || ctx.aspectRatio === "4:3" ? "30% of the canvas height or 60% of the width" : "22% of the canvas height or 80% of the width"}`
    }; leave clear space of at least 6% of the canvas height between the title block and the details. Supporting details are clearly secondary (each roughly a third of the title's cap height) and grouped; at most three type sizes besides the title; at least 4% safe margins on every side; strong contrast between every text and its background; one clear focal image or visual idea; no clutter, no decorative text; every letter crisp, correctly kerned and legible at thumbnail size.`,
  );
  lines.push(`FORMAT: ${ASPECT_DESCRIPTION[ctx.aspectRatio]}, filled edge to edge, critical content inside safe margins.`);
  lines.push("OUTPUT: a finished, flat, ready-to-publish banner graphic. No mockups, no frames, no device screens, no watermarks, no borders.");

  return `NON-NEGOTIABLE CONSTRAINTS:\n- ${lines.join("\n- ")}`;
}

/**
 * Deterministic creative prompt. It is the fallback when no text model is available, and the
 * input the optimizer refines. Constraints are added separately by `buildConstraintsBlock`.
 */
export function buildBasePrompt(ctx: PromptContext): string {
  const s = ctx.settings;
  const sections: string[] = [];
  const bk = s.useBrandKit !== false ? ctx.brandKit : null;
  const who = bk?.organizationName ? ` for ${bk.organizationName}${bk.organizationType ? ` (${bk.organizationType})` : ""}` : bk?.organizationType ? ` for a ${bk.organizationType}` : "";

  sections.push(`Design a professional, ready-to-publish promotional banner${who} based on the brief below. Output the finished flat graphic itself.`);
  sections.push(`FORMAT: ${ASPECT_DESCRIPTION[ctx.aspectRatio]}.`);
  sections.push(`BRIEF FROM THE USER:\n"""\n${ctx.userPrompt.trim()}\n"""`);

  const style = s.designStyle ? DESIGN_STYLE_OPTIONS.find((d) => d.value === s.designStyle) : undefined;
  if (style) sections.push(`DESIGN STYLE: ${style.label} — ${style.description}.`);

  sections.push(
    `QUALITY BAR: premium, contemporary graphic design; intentional composition with a clear focal point; polished lighting and depth; balanced negative space; no clutter; no stock-photo feel; no clip art; no generic clichés.`,
  );
  return sections.join("\n\n");
}

/** Full deterministic prompt (creative part + constraints). */
export function buildFullPrompt(ctx: PromptContext): string {
  return `${buildBasePrompt(ctx)}\n\n${buildConstraintsBlock(ctx)}`;
}

/** Prompt used by the hybrid overlay mode: the model paints only the artwork and leaves room for text. */
export function buildArtworkOnlyPrompt(creativePrompt: string, constraints: string, text: TextElements, position: GenerationSettings["textPosition"]): string {
  const where = position === "left" ? "the left half" : position === "right" ? "the right half" : "the central area";
  return (
    creativePrompt +
    `\n\n${constraints}` +
    `\n\nIMPORTANT – ARTWORK ONLY: Do NOT render any text, letters, numbers or typography in the image. ` +
    `Create only the background artwork and visual elements, keeping the brand palette, references and mood above. Leave clean, uncluttered negative space in ${where} of the canvas, ` +
    `with enough contrast for a headline reading "${text.title}" to be overlaid later.`
  );
}

export interface EditPromptContext {
  originalBrief: string;
  optimizedPrompt?: string | null;
  previousInstructions: string[];
  instruction: string;
  aspectRatio: AspectRatio;
  language?: string;
  brandKit?: BrandKitContext | null;
  elements?: ElementContext[];
  /** Exact faces: the studio restores the real faces after the edit. */
  faceLock?: boolean;
}

/** Builds the instruction given to the image editing model, preserving the context of prior edits. */
export function buildEditPrompt(ctx: EditPromptContext): string {
  const lang = resolveLanguage(ctx.language, ctx.originalBrief + " " + ctx.instruction);
  const langName = LANGUAGE_NAMES[lang];
  const history = ctx.previousInstructions.length
    ? `EDITS ALREADY APPLIED (keep them unless the new request changes them):\n- ${ctx.previousInstructions.join("\n- ")}\n\n`
    : "";
  const brand = ctx.brandKit?.hasLogo ? `The attached image labeled "LOGO" is the official logo; if the logo is present or requested, reproduce it exactly as provided.\n` : "";
  const elements = ctx.elements?.length
    ? `The attached images labeled "ELEMENT" are the banner's content elements (${ctx.elements.map((e, i) => `ELEMENT ${i + 1} = "${e.label}"`).join("; ")}); keep them faithful if you move or resize them.\n`
    : "";
  return (
    `You are editing an existing promotional banner (the first attached image). Apply ONLY the requested change and preserve everything else: ` +
    `composition, colors, typography, text content and spelling, logo placement and the ${ASPECT_DESCRIPTION[ctx.aspectRatio]} format.\n\n` +
    `ORIGINAL BRIEF (for context):\n"""\n${ctx.originalBrief.trim()}\n"""\n\n` +
    history +
    `NEW REQUEST:\n"""\n${ctx.instruction.trim()}\n"""\n\n` +
    brand +
    elements +
    (ctx.faceLock && ctx.elements?.length ? `${renderFaceLock(true)}\n` : "") +
    `RULES: keep all text in ${langName} with the exact same spelling unless the request explicitly changes the wording; ` +
    `keep the output a finished flat banner graphic (no mockups, frames or watermarks); keep text crisp and legible; do not add new text or dates that were not requested.`
  );
}

/** Fallback title extraction when no text model is available. */
export function guessTitle(prompt: string): string {
  const quoted = prompt.match(/["“”']([^"“”']{2,60})["“”']/);
  if (quoted?.[1]) return quoted[1].trim();
  const named = prompt.match(/(?:called|named|chamad[ao]|intitulad[ao]|llamad[ao])\s+([A-ZÀ-Ú][^.,;\n]{1,50})/i);
  if (named?.[1]) {
    // Keep the leading run of capitalized / uppercase words ("NIGHT OF WORSHIP in March" → "NIGHT OF WORSHIP").
    const words = named[1].trim().split(/\s+/);
    const kept: string[] = [];
    for (const w of words) {
      if (kept.length > 0 && /^[a-zà-ú]/.test(w)) break;
      kept.push(w);
      if (kept.length >= 6) break;
    }
    return kept.join(" ");
  }
  const caps = prompt.match(/\b([A-ZÀ-Ú][A-ZÀ-Ú0-9]+(?:\s+[A-ZÀ-Ú0-9]{2,}){0,4})\b/);
  if (caps?.[1] && caps[1].length >= 3) return caps[1].trim();
  const words = prompt.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  return words.length > 60 ? words.slice(0, 57) + "…" : words;
}
