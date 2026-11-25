import { z } from "zod";
import {
  AI_PROVIDERS,
  ASPECT_RATIOS,
  DESIGN_STYLES,
  ELEMENT_RENDERING_MODES,
  LOGO_PLACEMENTS,
  TEXT_POSITIONS,
  TEXT_RENDERING_MODES,
} from "../enums/index.js";
import { MAX_ELEMENT_IMAGES, MAX_ELEMENT_LABEL_LENGTH, MAX_INSTRUCTION_LENGTH, MAX_PROMPT_LENGTH, MAX_REFERENCE_IMAGES } from "../constants/index.js";
import { CURRENCIES, REFERENCE_KINDS } from "../enums/index.js";

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex color like #1E40AF");

export const optionalHexColor = hexColor.optional().or(z.literal("").transform(() => undefined));

export const aspectRatioSchema = z.enum(ASPECT_RATIOS);
export const designStyleSchema = z.enum(DESIGN_STYLES);
export const textPositionSchema = z.enum(TEXT_POSITIONS);
export const textRenderingModeSchema = z.enum(TEXT_RENDERING_MODES);
export const logoPlacementSchema = z.enum(LOGO_PLACEMENTS);
export const elementRenderingModeSchema = z.enum(ELEMENT_RENDERING_MODES);
export const aiProviderSchema = z.enum(AI_PROVIDERS);

/** Optional visual preferences attached to a generation ("Advanced Settings"). */
export const generationSettingsSchema = z.object({
  primaryColor: optionalHexColor,
  secondaryColor: optionalHexColor,
  accentColor: optionalHexColor,
  fontFamily: z.string().trim().max(64).optional().or(z.literal("").transform(() => undefined)),
  designStyle: designStyleSchema.optional(),
  textPosition: textPositionSchema.optional(),
  textRenderingMode: textRenderingModeSchema.optional(),
  logoPlacement: logoPlacementSchema.optional(),
  /** How attached element photos (people, logos, products) are placed: by the AI or composited exactly by the studio. */
  elementRendering: elementRenderingModeSchema.optional(),
  additionalInstructions: z
    .string()
    .trim()
    .max(MAX_INSTRUCTION_LENGTH)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** Whether the user's Brand Kit should be applied to this generation (default true). */
  useBrandKit: z.boolean().optional(),
  /** A Brand Kit reference asset whose layout/structure must be reproduced for this banner. */
  templateAssetId: z.string().uuid().optional(),
});
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

const modelName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9._:-]+$/, "Invalid model name");

export const createBannerSchema = z.object({
  prompt: z.string().trim().min(10, "Describe the banner in at least 10 characters").max(MAX_PROMPT_LENGTH),
  aspectRatio: aspectRatioSchema,
  settings: generationSettingsSchema.default({}),
  referenceImageIds: z.array(z.string().uuid()).max(MAX_REFERENCE_IMAGES).default([]),
  /** Uploaded elements (kind = element) that must appear inside the banner. */
  elementImageIds: z.array(z.string().uuid()).max(MAX_ELEMENT_IMAGES).default([]),
  /** Brand Kit to apply; defaults to the user's default kit. Set `settings.useBrandKit=false` for none. */
  brandKitId: z.string().uuid().optional(),
  provider: aiProviderSchema.optional(),
  model: modelName.optional(),
});
export type CreateBannerInput = z.input<typeof createBannerSchema>;
export type CreateBannerPayload = z.output<typeof createBannerSchema>;

export const editBannerSchema = z.object({
  instruction: z.string().trim().min(3, "Tell the AI what to change").max(MAX_INSTRUCTION_LENGTH),
  /** Version to continue editing from; defaults to the banner's current version. */
  sourceVersionId: z.string().uuid().optional(),
  provider: aiProviderSchema.optional(),
  model: modelName.optional(),
});
export type EditBannerInput = z.input<typeof editBannerSchema>;
export type EditBannerPayload = z.output<typeof editBannerSchema>;

export const referenceKindSchema = z.enum(REFERENCE_KINDS);

export const uploadReferencesQuerySchema = z.object({
  kind: referenceKindSchema.default("reference"),
});

export const updateReferenceImageSchema = z.object({
  label: z.string().trim().max(MAX_ELEMENT_LABEL_LENGTH).optional().or(z.literal("").transform(() => undefined)),
});
export type UpdateReferenceImageInput = z.infer<typeof updateReferenceImageSchema>;

export const retryGenerationSchema = z.object({
  generationId: z.string().uuid(),
});

export const updateBannerSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const restoreVersionSchema = z.object({
  versionId: z.string().uuid(),
});

export const approveVersionSchema = z.object({
  versionId: z.string().uuid(),
  /** Also add the approved PNG to the Brand Kit references (default true). */
  addToBrandKit: z.boolean().optional(),
});
export type ApproveVersionInput = z.infer<typeof approveVersionSchema>;

export const createBrandKitSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateBrandKitInput = z.infer<typeof createBrandKitSchema>;

export const updateBrandKitSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  organizationName: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  /** Free text such as "conference", "school", "restaurant", "NGO"... used to steer the AI. */
  organizationType: z.string().trim().max(80).optional().or(z.literal("").transform(() => undefined)),
  primaryColor: optionalHexColor,
  secondaryColor: optionalHexColor,
  accentColors: z.array(hexColor).max(6).optional(),
  preferredFonts: z.array(z.string().trim().min(1).max(64)).max(4).optional(),
  instructions: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  /** Rules learned from approved banners; send the full list to edit/remove items. */
  learnedPreferences: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
});
export type UpdateBrandKitInput = z.input<typeof updateBrandKitSchema>;
export type UpdateBrandKitPayload = z.output<typeof updateBrandKitSchema>;

export const userSettingsSchema = z.object({
  defaultProvider: aiProviderSchema.optional(),
  defaultModel: modelName.optional().or(z.literal("").transform(() => undefined)),
  defaultAspectRatio: aspectRatioSchema.optional(),
  /** Preferred language for AI output when the prompt language is ambiguous. */
  preferredLanguage: z.enum(["auto", "pt-BR", "en", "es"]).optional(),
  /** Interface language chosen by the user. */
  uiLanguage: z.enum(["en", "pt-BR", "es"]).optional(),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const currencySchema = z.enum(CURRENCIES);

export const createCheckoutSchema = z.object({
  packId: z.string().trim().min(1).max(40),
  currency: currencySchema.optional(),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
