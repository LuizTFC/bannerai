import type {
  ApproveVersionResponse,
  BannerDto,
  CheckoutSessionResponse,
  CheckoutStatusResponse,
  CreditsOverview,
  Currency,
  PricingInfo,
  BannerListResponse,
  BrandKitDto,
  BrandKitListResponse,
  CreateBannerInput,
  CreateBannerResponse,
  EditBannerInput,
  EditBannerResponse,
  GenerationDto,
  HealthResponse,
  MeResponse,
  ProvidersResponse,
  ReferenceImageDto,
  ReferenceKind,
  UpdateBrandKitInput,
  UploadReferencesResponse,
  UserDto,
  UserSettings,
} from "@bannerai/shared";
import { API_URL } from "@/lib/env";
import { apiRequest } from "./client";

export const api = {
  health: () => apiRequest<HealthResponse>("/health"),

  auth: {
    me: () => apiRequest<MeResponse>("/auth/me", { silent401: true }),
    status: () => apiRequest<{ googleConfigured: boolean }>("/auth/status"),
    logout: () => apiRequest<void>("/auth/logout", { method: "POST" }),
    googleLoginUrl: () => `${API_URL}/auth/google`,
  },

  billing: {
    pricing: () => apiRequest<PricingInfo>("/billing/pricing"),
    credits: () => apiRequest<CreditsOverview>("/billing/credits?pageSize=50"),
    checkout: (packId: string, currency?: Currency) => apiRequest<CheckoutSessionResponse>("/billing/checkout", { method: "POST", body: { packId, currency } }),
    checkoutStatus: (sessionId: string) => apiRequest<CheckoutStatusResponse>(`/billing/checkout/${encodeURIComponent(sessionId)}`),
  },

  users: {
    updateSettings: (settings: UserSettings) => apiRequest<{ user: UserDto }>("/users/me/settings", { method: "PATCH", body: settings }),
  },

  providers: {
    list: () => apiRequest<ProvidersResponse>("/providers"),
  },

  uploads: {
    references: (files: File[], kind: ReferenceKind = "reference") => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      return apiRequest<UploadReferencesResponse>(`/uploads/references?kind=${kind}`, { method: "POST", formData: fd });
    },
    updateReference: (id: string, label: string) => apiRequest<{ reference: ReferenceImageDto }>(`/uploads/references/${id}`, { method: "PATCH", body: { label } }),
    deleteReference: (id: string) => apiRequest<void>(`/uploads/references/${id}`, { method: "DELETE" }),
  },

  banners: {
    list: (page = 1, pageSize = 24) => apiRequest<BannerListResponse>(`/banners?page=${page}&pageSize=${pageSize}`),
    get: (id: string) => apiRequest<{ banner: BannerDto }>(`/banners/${id}`),
    create: (input: CreateBannerInput) => apiRequest<CreateBannerResponse>("/banners", { method: "POST", body: input }),
    edit: (id: string, input: EditBannerInput) => apiRequest<EditBannerResponse>(`/banners/${id}/edits`, { method: "POST", body: input }),
    retry: (id: string, generationId: string) =>
      apiRequest<EditBannerResponse>(`/banners/${id}/generations/${generationId}/retry`, { method: "POST" }),
    restore: (id: string, versionId: string) => apiRequest<{ banner: BannerDto }>(`/banners/${id}/restore`, { method: "POST", body: { versionId } }),
    approve: (id: string, versionId: string) => apiRequest<ApproveVersionResponse>(`/banners/${id}/approve`, { method: "POST", body: { versionId } }),
    rename: (id: string, title: string) => apiRequest<{ banner: BannerDto }>(`/banners/${id}`, { method: "PATCH", body: { title } }),
    delete: (id: string) => apiRequest<void>(`/banners/${id}`, { method: "DELETE" }),
  },

  generations: {
    get: (id: string) => apiRequest<{ generation: GenerationDto }>(`/generations/${id}`),
  },

  brandKits: {
    list: () => apiRequest<BrandKitListResponse>("/brand-kits"),
    get: (id: string) => apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}`),
    create: (name: string) => apiRequest<{ brandKit: BrandKitDto }>("/brand-kits", { method: "POST", body: { name } }),
    update: (id: string, input: UpdateBrandKitInput) => apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}`, { method: "PATCH", body: input }),
    delete: (id: string) => apiRequest<void>(`/brand-kits/${id}`, { method: "DELETE" }),
    setDefault: (id: string) => apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}/default`, { method: "POST" }),
    clear: (id: string, field: "organizationName" | "organizationType" | "primaryColor" | "secondaryColor" | "instructions") =>
      apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}/clear`, { method: "POST", body: { field } }),
    uploadLogo: (id: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}/logo`, { method: "POST", formData: fd });
    },
    uploadReferences: (id: string, files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      return apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}/references`, { method: "POST", formData: fd });
    },
    removeAsset: (id: string, assetId: string) => apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}/assets/${assetId}`, { method: "DELETE" }),
    analyze: (id: string) => apiRequest<{ brandKit: BrandKitDto }>(`/brand-kits/${id}/analyze`, { method: "POST" }),
  },
};
