import type { AspectRatio, DesignStyle, TextPosition, AiProvider } from "../enums/index.js";

export interface AspectRatioOption {
  value: AspectRatio;
  label: string;
  description: string;
  /** Relative proportions used to draw the preview card. */
  width: number;
  height: number;
}

export const ASPECT_RATIO_OPTIONS: readonly AspectRatioOption[] = [
  { value: "16:9", label: "Landscape", description: "Screens, YouTube, slides", width: 16, height: 9 },
  { value: "9:16", label: "Portrait", description: "Stories, Reels, WhatsApp status", width: 9, height: 16 },
  { value: "1:1", label: "Square", description: "Instagram feed, profile posts", width: 1, height: 1 },
  { value: "4:3", label: "Classic", description: "Projectors, printed flyers", width: 4, height: 3 },
];

export interface DesignStyleOption {
  value: DesignStyle;
  label: string;
  description: string;
}

export const DESIGN_STYLE_OPTIONS: readonly DesignStyleOption[] = [
  { value: "modern", label: "Modern", description: "Clean shapes, confident type, fresh gradients" },
  { value: "minimalist", label: "Minimalist", description: "Lots of whitespace, restrained palette" },
  { value: "bold", label: "Bold", description: "Loud typography and high-contrast color" },
  { value: "cinematic", label: "Cinematic", description: "Dramatic lighting, depth and atmosphere" },
  { value: "editorial", label: "Editorial", description: "Magazine-like layouts and refined grids" },
  { value: "artistic", label: "Artistic", description: "Painterly textures and expressive marks" },
  { value: "contemporary", label: "Contemporary", description: "Current design trends, soft 3D, glass" },
  { value: "experimental", label: "Experimental", description: "Unexpected composition and type play" },
];

export interface TextPositionOption {
  value: TextPosition;
  label: string;
  description: string;
}

export const TEXT_POSITION_OPTIONS: readonly TextPositionOption[] = [
  { value: "auto", label: "Automatic", description: "Let the AI decide the best placement" },
  { value: "center", label: "Centered", description: "Text anchored in the middle" },
  { value: "left", label: "Left", description: "Text aligned to the left side" },
  { value: "right", label: "Right", description: "Text aligned to the right side" },
];

export interface FontOption {
  value: string;
  label: string;
  category: "sans" | "serif" | "display" | "script" | "mono";
  /** CSS font stack used to preview the font in the UI. */
  cssStack: string;
  /** How the font should be described to the image model. */
  description: string;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  { value: "inter", label: "Inter", category: "sans", cssStack: "Inter, ui-sans-serif, system-ui, sans-serif", description: "neutral geometric sans-serif (Inter)" },
  { value: "montserrat", label: "Montserrat", category: "sans", cssStack: "Montserrat, 'Trebuchet MS', sans-serif", description: "wide geometric sans-serif with strong uppercase (Montserrat)" },
  { value: "bebas-neue", label: "Bebas Neue", category: "display", cssStack: "'Bebas Neue', Impact, 'Arial Narrow', sans-serif", description: "tall condensed all-caps display font (Bebas Neue)" },
  { value: "oswald", label: "Oswald", category: "display", cssStack: "Oswald, 'Arial Narrow', sans-serif", description: "condensed bold sans-serif headline font (Oswald)" },
  { value: "playfair-display", label: "Playfair Display", category: "serif", cssStack: "'Playfair Display', Georgia, serif", description: "elegant high-contrast serif (Playfair Display)" },
  { value: "cormorant", label: "Cormorant", category: "serif", cssStack: "Cormorant, 'Cormorant Garamond', Garamond, serif", description: "refined classic serif (Cormorant)" },
  { value: "anton", label: "Anton", category: "display", cssStack: "Anton, Impact, sans-serif", description: "heavy impactful condensed display font (Anton)" },
  { value: "poppins", label: "Poppins", category: "sans", cssStack: "Poppins, 'Segoe UI', sans-serif", description: "friendly rounded geometric sans-serif (Poppins)" },
  { value: "space-grotesk", label: "Space Grotesk", category: "sans", cssStack: "'Space Grotesk', 'Helvetica Neue', sans-serif", description: "techy modern grotesk (Space Grotesk)" },
  { value: "dancing-script", label: "Dancing Script", category: "script", cssStack: "'Dancing Script', 'Brush Script MT', cursive", description: "flowing handwritten script (Dancing Script)" },
];

export interface ProviderOption {
  value: AiProvider;
  label: string;
  description: string;
}

export const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  { value: "gemini", label: "Google Gemini", description: "Fast and cost-effective (Nano Banana)" },
  { value: "openai", label: "OpenAI", description: "Higher fidelity generation and editing (GPT Image)" },
];

export const MAX_REFERENCE_IMAGES = 6;
export const MAX_ELEMENT_IMAGES = 6;
export const MAX_ELEMENT_LABEL_LENGTH = 80;
export const MAX_BRAND_KIT_REFERENCES = 8;
export const MAX_BRAND_KITS = 10;
export const MAX_LEARNED_PREFERENCES = 15;
export const MAX_UPLOAD_SIZE_MB_DEFAULT = 10;
export const MAX_PROMPT_LENGTH = 4000;
export const MAX_INSTRUCTION_LENGTH = 2000;
export const APP_NAME = "Bannerai";
export const SESSION_COOKIE_NAME = "bannerai.sid";
export const CSRF_HEADER_NAME = "x-csrf-token";

/* ── Credits & pricing ─────────────────────────────────────────────────────────
 * 1 credit ≈ R$ 0.50. A generation costs 3 credits (R$ 1.50), an edit 2 credits (R$ 1.00):
 * a banner with ~5 revisions stays under R$ 10. The backend may override the costs via env.
 */
export const DEFAULT_CREDIT_COST_GENERATION = 3;
export const DEFAULT_CREDIT_COST_EDIT = 2;
export const DEFAULT_TRIAL_CREDITS = 10;

export interface CreditPack {
  id: string;
  credits: number;
  /** Price per currency in the smallest unit (cents / centavos). */
  prices: Record<"brl" | "usd", number>;
  highlight?: boolean;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "starter", credits: 20, prices: { brl: 1000, usd: 249 } },
  { id: "popular", credits: 60, prices: { brl: 2500, usd: 599 }, highlight: true },
  { id: "pro", credits: 150, prices: { brl: 5500, usd: 1299 } },
];
