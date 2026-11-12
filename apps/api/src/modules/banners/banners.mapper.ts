import type { BannerDto, BannerSummaryDto, BannerVersionDto, GenerationDto, GenerationSettings } from "@bannerai/shared";
import { generationSettingsSchema } from "@bannerai/shared";
import type { Banner, BannerGeneration, BannerVersion, ReferenceImage } from "../../generated/prisma/client.js";
import { aspectRatioFromDb } from "../../utils/aspect-ratio.js";
import { fileUrl, toReferenceDto } from "../uploads/uploads.service.js";

export type BannerWithRelations = Banner & {
  versions: BannerVersion[];
  generations: BannerGeneration[];
  referenceImages: ReferenceImage[];
  currentVersion: BannerVersion | null;
};

export type BannerSummaryRow = Banner & { currentVersion: BannerVersion | null; _count: { versions: number } };

export function parseSettings(raw: unknown): GenerationSettings {
  const parsed = generationSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

const safeTitle = (title: string): string => title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "banner";

export function toVersionDto(v: BannerVersion, bannerTitle: string): BannerVersionDto {
  const name = `${safeTitle(bannerTitle)}-v${v.versionNumber}.png`;
  return {
    id: v.id,
    bannerId: v.bannerId,
    generationId: v.generationId,
    versionNumber: v.versionNumber,
    parentVersionId: v.parentVersionId,
    url: fileUrl(v.storageKey),
    downloadUrl: `${fileUrl(v.storageKey)}?download=${encodeURIComponent(name)}`,
    width: v.width,
    height: v.height,
    mimeType: v.mimeType,
    sizeBytes: v.sizeBytes,
    label: v.label,
    createdAt: v.createdAt.toISOString(),
  };
}

export function toGenerationDto(g: BannerGeneration, resultVersionId: string | null): GenerationDto {
  return {
    id: g.id,
    bannerId: g.bannerId,
    kind: g.kind,
    status: g.status,
    prompt: g.prompt,
    instruction: g.instruction,
    optimizedPrompt: g.optimizedPrompt,
    aspectRatio: aspectRatioFromDb(g.aspectRatio),
    settings: parseSettings(g.settings),
    provider: g.provider,
    model: g.model,
    sourceVersionId: g.sourceVersionId,
    resultVersionId,
    errorMessage: g.errorMessage,
    durationMs: g.durationMs,
    creditsHeld: g.creditsHeld,
    creditsCharged: g.creditsCharged,
    usage: (g.usage as GenerationDto["usage"]) ?? null,
    startedAt: g.startedAt?.toISOString() ?? null,
    completedAt: g.completedAt?.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
  };
}

export function toBannerSummaryDto(b: BannerSummaryRow): BannerSummaryDto {
  const current = b.currentVersion ? toVersionDto(b.currentVersion, b.title) : null;
  return {
    id: b.id,
    title: b.title,
    prompt: b.prompt,
    aspectRatio: aspectRatioFromDb(b.aspectRatio),
    status: b.status,
    provider: b.provider,
    model: b.model,
    currentVersion: current,
    versionCount: b._count.versions,
    thumbnailUrl: current?.url ?? null,
    brandKitId: b.brandKitId,
    approvedVersionId: b.approvedVersionId,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export function toBannerDto(b: BannerWithRelations): BannerDto {
  const versionByGeneration = new Map(b.versions.map((v) => [v.generationId, v.id]));
  const generations = b.generations.map((g) => toGenerationDto(g, versionByGeneration.get(g.id) ?? null));
  const active = generations.find((g) => g.status === "pending" || g.status === "running") ?? null;
  const summary = toBannerSummaryDto({ ...b, _count: { versions: b.versions.length } });
  return {
    ...summary,
    settings: parseSettings(b.settings),
    versions: b.versions.map((v) => toVersionDto(v, b.title)),
    generations,
    referenceImages: b.referenceImages.filter((r) => r.kind === "reference").map(toReferenceDto),
    elementImages: b.referenceImages.filter((r) => r.kind === "element").map(toReferenceDto),
    activeGeneration: active,
  };
}
