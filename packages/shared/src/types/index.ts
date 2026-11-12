import type {
  AiProvider,
  AspectRatio,
  BannerStatus,
  BrandKitAssetType,
  CreditTransactionType,
  Currency,
  GenerationKind,
  GenerationStatus,
  ReferenceKind,
} from "../enums/index.js";
import type { GenerationSettings, UserSettings } from "../schemas/index.js";

/** Standard error envelope returned by the API. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  settings: UserSettings;
  creditBalance: number;
  createdAt: string;
}

/** Public pricing info (also used by the landing page). */
export interface PricingInfo {
  costs: { generation: number; edit: number };
  trialCredits: number;
  packs: Array<{ id: string; credits: number; prices: Record<Currency, number>; highlight?: boolean }>;
  /** Whether purchases are possible (Stripe configured). */
  purchasesEnabled: boolean;
  defaultCurrency: Currency;
}

export interface CreditTransactionDto {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  description: string | null;
  generationId: string | null;
  packId: string | null;
  currency: string | null;
  amountPaid: number | null;
  createdAt: string;
}

export interface CreditsOverview {
  balance: number;
  costs: { generation: number; edit: number };
  transactions: CreditTransactionDto[];
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export interface CheckoutStatusResponse {
  status: "paid" | "pending" | "expired" | "unknown";
  credited: boolean;
  balance: number;
}

export interface MeResponse {
  user: UserDto;
  csrfToken: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  database: "up" | "down";
  version: string | null;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ProviderModelInfo {
  id: string;
  label: string;
  description: string;
  /** Approximate cost per image in USD when known. */
  approxCostUsd?: number;
}

export interface ProviderInfo {
  id: AiProvider;
  label: string;
  description: string;
  configured: boolean;
  defaultModel: string;
  models: ProviderModelInfo[];
}

export interface ProvidersResponse {
  defaultProvider: AiProvider;
  providers: ProviderInfo[];
}

export interface ReferenceImageDto {
  id: string;
  kind: ReferenceKind;
  label: string | null;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface BannerVersionDto {
  id: string;
  bannerId: string;
  generationId: string;
  versionNumber: number;
  parentVersionId: string | null;
  /** Authenticated URL that streams the PNG. */
  url: string;
  downloadUrl: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  /** Human-readable label, e.g. the edit instruction that produced it. */
  label: string;
  createdAt: string;
}

export interface GenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  [key: string]: unknown;
}

export interface GenerationDto {
  id: string;
  bannerId: string;
  kind: GenerationKind;
  status: GenerationStatus;
  prompt: string;
  instruction: string | null;
  optimizedPrompt: string | null;
  aspectRatio: AspectRatio;
  settings: GenerationSettings;
  provider: AiProvider;
  model: string;
  sourceVersionId: string | null;
  resultVersionId: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  creditsHeld: number;
  creditsCharged: number;
  usage: GenerationUsage | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BannerSummaryDto {
  id: string;
  title: string;
  prompt: string;
  aspectRatio: AspectRatio;
  status: BannerStatus;
  provider: AiProvider;
  model: string;
  currentVersion: BannerVersionDto | null;
  versionCount: number;
  thumbnailUrl: string | null;
  brandKitId: string | null;
  approvedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BannerDto extends BannerSummaryDto {
  settings: GenerationSettings;
  versions: BannerVersionDto[];
  generations: GenerationDto[];
  referenceImages: ReferenceImageDto[];
  /** Content elements (guest photos, logos, products) attached to this banner. */
  elementImages: ReferenceImageDto[];
  /** The generation currently in flight, if any. */
  activeGeneration: GenerationDto | null;
}

export interface BannerListResponse {
  items: BannerSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface BrandKitAssetDto {
  id: string;
  type: BrandKitAssetType;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** What the AI learned from a Brand Kit's reference banners. Injected into every generation. */
export interface BrandStyleGuide {
  summary: string;
  layout: string;
  typography: string;
  colors: string;
  devices: string;
  imagery: string;
  logoUsage: string;
  mood: string;
  /** Scale relationships: title height vs canvas, info-card size, margins, spacing. */
  proportions: string;
  /** Text levels from top to bottom (kicker, title, subtitle, details, footer) and how each is styled. */
  textHierarchy: string;
  doNot: string[];
}

export interface BrandKitDto {
  id: string;
  name: string;
  isDefault: boolean;
  organizationName: string | null;
  organizationType: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColors: string[];
  preferredFonts: string[];
  instructions: string | null;
  logo: BrandKitAssetDto | null;
  references: BrandKitAssetDto[];
  styleGuide: BrandStyleGuide | null;
  styleGuideUpdatedAt: string | null;
  learnedPreferences: string[];
  /** True when references changed since the last analysis. */
  styleGuideStale: boolean;
  updatedAt: string;
}

export interface BrandKitListResponse {
  brandKits: BrandKitDto[];
}

export interface CreateBannerResponse {
  banner: BannerDto;
  generation: GenerationDto;
}

export interface ApproveVersionResponse {
  banner: BannerDto;
  /** Preferences extracted from this banner's edit history (empty if nothing was learned). */
  learned: string[];
  /** Whether the approved image was added to the Brand Kit references. */
  addedToBrandKit: boolean;
}

export interface EditBannerResponse {
  banner: BannerDto;
  generation: GenerationDto;
}

export interface UploadReferencesResponse {
  references: ReferenceImageDto[];
}
