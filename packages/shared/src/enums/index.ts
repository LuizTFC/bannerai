export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const DESIGN_STYLES = [
  "modern",
  "minimalist",
  "bold",
  "cinematic",
  "editorial",
  "artistic",
  "contemporary",
  "experimental",
] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];

export const TEXT_POSITIONS = ["auto", "center", "left", "right"] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

export const TEXT_RENDERING_MODES = ["ai", "overlay"] as const;
/**
 * `ai`      – the image model renders all typography itself (default).
 * `overlay` – hybrid mode: the model paints the artwork with negative space and the
 *             backend overlays the critical text (title, subtitle, details) as crisp
 *             vector text before exporting the PNG. Guarantees exact spelling.
 */
export type TextRenderingMode = (typeof TEXT_RENDERING_MODES)[number];

export const ELEMENT_RENDERING_MODES = ["ai", "exact"] as const;
/**
 * `ai`    – the image model receives the element photos and paints them into the banner; faces are
 *           left as painted (they may drift from the photo).
 * `exact` – same, but afterwards the studio puts each person's real face back (face lock): the photo
 *           is aligned on the painted face's landmarks and blended in. People stay editable by prompt.
 */
export type ElementRenderingMode = (typeof ELEMENT_RENDERING_MODES)[number];

export const LOGO_PLACEMENTS = ["ai", "top-left", "top-right", "bottom-left", "bottom-right", "none"] as const;
/**
 * `ai`            – the image model places the Brand Kit logo (default).
 * corner values   – the studio composites the logo itself after generation, guaranteeing it appears.
 * `none`          – no logo on this banner.
 */
export type LogoPlacement = (typeof LOGO_PLACEMENTS)[number];

export const AI_PROVIDERS = ["gemini", "openai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const GENERATION_STATUSES = ["pending", "running", "succeeded", "failed"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const GENERATION_KINDS = ["initial", "edit"] as const;
export type GenerationKind = (typeof GENERATION_KINDS)[number];

export const BANNER_STATUSES = ["draft", "generating", "ready", "failed"] as const;
export type BannerStatus = (typeof BANNER_STATUSES)[number];

export const BRAND_KIT_ASSET_TYPES = ["logo", "reference"] as const;
export type BrandKitAssetType = (typeof BRAND_KIT_ASSET_TYPES)[number];

export const REFERENCE_KINDS = ["reference", "element"] as const;
/** `reference` = style inspiration · `element` = content that must appear in the banner */
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const CREDIT_TRANSACTION_TYPES = ["trial", "purchase", "hold", "release", "refund", "adjustment"] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];

export const CURRENCIES = ["brl", "usd"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];
