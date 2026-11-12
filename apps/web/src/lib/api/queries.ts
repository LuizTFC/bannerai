"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BannerDto, BrandKitDto, CreateBannerInput, EditBannerInput, UpdateBrandKitInput, UserSettings } from "@bannerai/shared";
import { api } from "./endpoints";

export const queryKeys = {
  me: ["me"] as const,
  providers: ["providers"] as const,
  banners: (page: number) => ["banners", page] as const,
  banner: (id: string) => ["banner", id] as const,
  brandKits: ["brand-kits"] as const,
  credits: ["credits"] as const,
};

const isActive = (banner: BannerDto | undefined) => Boolean(banner?.activeGeneration);

export function usePricing() {
  return useQuery({ queryKey: ["pricing"], queryFn: api.billing.pricing, staleTime: 10 * 60 * 1000 });
}

export function useCredits() {
  return useQuery({ queryKey: queryKeys.credits, queryFn: api.billing.credits, staleTime: 10 * 1000 });
}

export function useProviders() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: api.providers.list, staleTime: 5 * 60 * 1000 });
}

export function useBanners(page = 1) {
  return useQuery({ queryKey: queryKeys.banners(page), queryFn: () => api.banners.list(page), placeholderData: (prev) => prev });
}

/** Polls every 2s while a generation is in progress. */
export function useBanner(id: string | null) {
  return useQuery({
    queryKey: queryKeys.banner(id ?? ""),
    queryFn: async () => (await api.banners.get(id!)).banner,
    enabled: Boolean(id),
    refetchInterval: (query) => (isActive(query.state.data) ? 2000 : false),
    refetchOnWindowFocus: (query) => !isActive(query.state.data),
  });
}

export function useCreateBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBannerInput) => api.banners.create(input),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.banner(data.banner.id), data.banner);
      void qc.invalidateQueries({ queryKey: ["banners"] });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      void qc.invalidateQueries({ queryKey: queryKeys.credits });
    },
  });
}

export function useEditBanner(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EditBannerInput) => api.banners.edit(id, input),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.banner(id), data.banner);
      void qc.invalidateQueries({ queryKey: ["banners"] });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
      void qc.invalidateQueries({ queryKey: queryKeys.credits });
    },
  });
}

export function useRetryGeneration(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (generationId: string) => api.banners.retry(id, generationId),
    onSuccess: (data) => qc.setQueryData(queryKeys.banner(id), data.banner),
  });
}

export function useRestoreVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => api.banners.restore(id, versionId),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.banner(id), data.banner);
      void qc.invalidateQueries({ queryKey: ["banners"] });
    },
  });
}

export function useApproveVersion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => api.banners.approve(id, versionId),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.banner(id), data.banner);
      void qc.invalidateQueries({ queryKey: ["banners"] });
      void qc.invalidateQueries({ queryKey: queryKeys.brandKits });
    },
  });
}

export function useRenameBanner(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.banners.rename(id, title),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.banner(id), data.banner);
      void qc.invalidateQueries({ queryKey: ["banners"] });
    },
  });
}

export function useDeleteBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.banners.delete(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.banner(id) });
      void qc.invalidateQueries({ queryKey: ["banners"] });
    },
  });
}

export function useBrandKits() {
  return useQuery({ queryKey: queryKeys.brandKits, queryFn: async () => (await api.brandKits.list()).brandKits, refetchOnWindowFocus: false });
}

function upsertKit(qc: ReturnType<typeof useQueryClient>, kit: BrandKitDto) {
  qc.setQueryData<BrandKitDto[]>(queryKeys.brandKits, (prev) => {
    const list = prev ?? [];
    const next = list.some((k) => k.id === kit.id) ? list.map((k) => (k.id === kit.id ? kit : k)) : [...list, kit];
    // keep the default first, then creation order
    return kit.isDefault ? next.map((k) => (k.id === kit.id ? k : { ...k, isDefault: false })) : next;
  });
}

export function useBrandKitMutations() {
  const qc = useQueryClient();
  const onKit = (data: { brandKit: BrandKitDto }) => upsertKit(qc, data.brandKit);
  const create = useMutation({ mutationFn: (name: string) => api.brandKits.create(name), onSuccess: onKit });
  const update = useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateBrandKitInput }) => api.brandKits.update(id, input), onSuccess: onKit });
  const remove = useMutation({
    mutationFn: (id: string) => api.brandKits.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.brandKits }),
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => api.brandKits.setDefault(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.brandKits }),
  });
  const clearField = useMutation({
    mutationFn: ({ id, field }: { id: string; field: "organizationName" | "organizationType" | "primaryColor" | "secondaryColor" | "instructions" }) => api.brandKits.clear(id, field),
    onSuccess: onKit,
  });
  const uploadLogo = useMutation({ mutationFn: ({ id, file }: { id: string; file: File }) => api.brandKits.uploadLogo(id, file), onSuccess: onKit });
  const uploadReferences = useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) => api.brandKits.uploadReferences(id, files),
    onSuccess: (data) => {
      onKit(data);
      // The visual-system analysis runs in the background; pick it up once it lands.
      setTimeout(() => void qc.invalidateQueries({ queryKey: queryKeys.brandKits }), 20_000);
    },
  });
  const removeAsset = useMutation({ mutationFn: ({ id, assetId }: { id: string; assetId: string }) => api.brandKits.removeAsset(id, assetId), onSuccess: onKit });
  const analyze = useMutation({ mutationFn: (id: string) => api.brandKits.analyze(id), onSuccess: onKit });
  return { create, update, remove, setDefault, clearField, uploadLogo, uploadReferences, removeAsset, analyze };
}

export function useUpdateUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: UserSettings) => api.users.updateSettings(settings),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
