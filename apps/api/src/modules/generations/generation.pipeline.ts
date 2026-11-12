import type { AspectRatio, GenerationSettings } from "@bannerai/shared";
import { FONT_OPTIONS } from "@bannerai/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import type { BannerGeneration, Prisma } from "../../generated/prisma/client.js";
import { applyTextOverlay, normalizeGeneratedImage } from "../../services/image/index.js";
import { applyLogoOverlay } from "../../services/image/logo-overlay.js";
import { faceDetector, type FaceDetector } from "../../services/image/face-detector.js";
import { applyFaceLock, type FaceLockPerson } from "../../services/image/face-lock.js";
import { storage, storageKeys } from "../../services/storage/index.js";
import { aspectRatioFromDb, TARGET_DIMENSIONS } from "../../utils/aspect-ratio.js";
import { AppError } from "../../utils/errors.js";
import {
  buildArtworkOnlyPrompt,
  buildEditPrompt,
  mergeUsage,
  optimizePrompt,
  providerRegistry,
  type ImageGenerationProvider,
  type ReferenceImageInput,
} from "../ai-providers/index.js";
import type { BrandKitContext } from "../ai-providers/prompt-builder.js";
import { parseSettings } from "../banners/banners.mapper.js";
import { brandKitService } from "../brand-kit/brand-kit.service.js";
import { ensureStyleGuide } from "../brand-kit/style-guide.service.js";
import { parseUserSettings } from "../users/users.service.js";
import { creditsService } from "../credits/credits.service.js";

const MAX_REFERENCES_SENT = 12;
const MAX_BRAND_REFERENCES_SENT = 6;
const MAX_ELEMENTS_SENT = 6;

export interface PipelineDeps {
  registry: typeof providerRegistry;
  promptOptimizationEnabled: boolean;
  /** Face detector behind "exact faces" (defaults to the configured one). */
  faceDetector?: FaceDetector;
}

const defaultDeps: PipelineDeps = { registry: providerRegistry, promptOptimizationEnabled: env.ENABLE_PROMPT_OPTIMIZATION ?? true };

async function loadReference(key: string, mimeType: string, role: ReferenceImageInput["role"], label?: string): Promise<ReferenceImageInput | null> {
  try {
    return { buffer: await storage.get(key), mimeType, role, label };
  } catch (err) {
    logger.warn({ err, key }, "Reference image missing in storage; skipping");
    return null;
  }
}

const toJson = (value: unknown): Prisma.InputJsonValue | undefined => (value ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue) : undefined);

/**
 * Executes a single generation job end to end:
 *   validate → load brand kit + references → optimize prompt → call provider → process PNG →
 *   persist file + version → update generation/banner status.
 */
export async function runGeneration(generationId: string, deps: PipelineDeps = defaultDeps, attempt = 0): Promise<void> {
  const generation = await prisma.bannerGeneration.findUnique({
    where: { id: generationId },
    include: {
      banner: { include: { versions: { orderBy: { versionNumber: "asc" } }, referenceImages: { orderBy: { createdAt: "asc" } }, generations: { orderBy: { createdAt: "asc" } } } },
      user: true,
      sourceVersion: true,
    },
  });
  if (!generation) {
    logger.warn({ generationId }, "Generation not found; skipping");
    return;
  }
  if (generation.status === "running" && attempt > 0) {
    // A worker died mid-job and the queue re-delivered it: fail it cleanly and give the credits back.
    logger.warn({ generationId }, "Generation was interrupted by a worker crash; marking as failed");
    await prisma.bannerGeneration.update({ where: { id: generationId }, data: { status: "failed", errorMessage: "The generation was interrupted. Your credits were returned — please retry.", completedAt: new Date() } });
    await prisma.banner.update({ where: { id: generation.bannerId }, data: { status: generation.banner.versions.length > 0 ? "ready" : "failed" } });
    await creditsService.release(generationId, "Interrupted generation — credits returned");
    return;
  }
  if (generation.status !== "pending") {
    logger.warn({ generationId, status: generation.status }, "Generation is not pending; skipping");
    return;
  }

  const startedAt = new Date();
  await prisma.bannerGeneration.update({ where: { id: generationId }, data: { status: "running", startedAt } });
  const log = logger.child({ generationId, bannerId: generation.bannerId, kind: generation.kind, provider: generation.provider, model: generation.model });
  log.info("Generation started");

  try {
    const provider = deps.registry.get(generation.provider);
    const aspectRatio: AspectRatio = aspectRatioFromDb(generation.aspectRatio);
    const settings: GenerationSettings = parseSettings(generation.settings);
    const userSettings = parseUserSettings(generation.user.settings);
    const logoPlacement = settings.logoPlacement ?? "ai";
    const exactFaces = settings.elementRendering === "exact";
    const dims = TARGET_DIMENSIONS[aspectRatio];

    // Brand Kit (the one linked to the banner) and per-request references.
    const kit = settings.useBrandKit === false || !generation.banner.brandKitId ? null : await brandKitService.findOwned(generation.userId, generation.banner.brandKitId);
    const references: ReferenceImageInput[] = [];
    let logoBuffer: Buffer | null = null;
    let styleGuide = null as Awaited<ReturnType<typeof ensureStyleGuide>>;
    let hasTemplate = false;
    if (kit) {
      const logo = kit.assets.find((a) => a.type === "logo");
      if (logo && logoPlacement !== "none") {
        const r = await loadReference(logo.storageKey, logo.mimeType, "brand-logo", "official logo");
        if (r) {
          logoBuffer = r.buffer;
          // When the studio composites the logo itself, the model must not see (and redraw) it.
          if (logoPlacement === "ai") references.push(r);
        }
      }
      // The chosen template (if any) goes first, then the remaining brand references: they are the standard.
      const brandRefs = kit.assets.filter((a) => a.type === "reference");
      const template = settings.templateAssetId ? brandRefs.find((a) => a.id === settings.templateAssetId) : undefined;
      if (template) {
        const r = await loadReference(template.storageKey, template.mimeType, "brand-template", template.originalName);
        if (r) {
          references.push(r);
          hasTemplate = true;
        }
      }
      for (const asset of brandRefs.filter((a) => a.id !== template?.id).slice(0, MAX_BRAND_REFERENCES_SENT - (hasTemplate ? 1 : 0))) {
        const r = await loadReference(asset.storageKey, asset.mimeType, "brand-reference", asset.originalName);
        if (r) references.push(r);
      }
      // Persisted analysis of the brand references (computed once per set of references).
      styleGuide = await ensureStyleGuide(kit, deps.registry.textProviders(generation.provider));
    }
    const attachedUploads = generation.banner.referenceImages.filter((r) => r.generationId === generation.id || generation.kind === "edit" || !r.generationId);
    // Content elements come right after the brand material: they are mandatory content. With exact
    // faces the model still paints the people (so they stay editable); the studio restores the faces after.
    const elements: { label: string }[] = [];
    const facePhotos: FaceLockPerson[] = [];
    for (const el of attachedUploads.filter((r) => r.kind === "element").slice(0, MAX_ELEMENTS_SENT)) {
      const label = el.label?.trim() || el.originalName;
      const r = await loadReference(el.storageKey, el.mimeType, "element", label);
      if (!r) continue;
      references.push(r);
      elements.push({ label });
      if (exactFaces) facePhotos.push({ label, photo: r.buffer });
    }
    const faceLock = facePhotos.length > 0;
    for (const ref of attachedUploads.filter((r) => r.kind === "reference")) {
      if (references.length >= MAX_REFERENCES_SENT) break;
      const r = await loadReference(ref.storageKey, ref.mimeType, "reference", ref.originalName);
      if (r) references.push(r);
    }

    const brandKitContext: BrandKitContext | null = kit
      ? {
          name: kit.name,
          organizationName: kit.organizationName,
          organizationType: kit.organizationType,
          primaryColor: kit.primaryColor,
          secondaryColor: kit.secondaryColor,
          accentColors: kit.accentColors,
          preferredFonts: kit.preferredFonts,
          instructions: kit.instructions,
          hasLogo: Boolean(logoBuffer),
          referenceCount: references.filter((r) => r.role === "brand-reference").length,
          styleGuide,
          hasTemplate,
          learnedPreferences: kit.learnedPreferences,
        }
      : null;

    let image: Awaited<ReturnType<ImageGenerationProvider["generateImage"]>>;
    let finalPrompt: string;
    let usageFromText: Record<string, unknown> | undefined;
    let overlayText: { title: string; subtitle?: string; details?: string[] } | null = null;
    let eventName: string | null = null;

    if (generation.kind === "initial") {
      const requestReferenceCount = references.filter((r) => r.role === "reference").length;
      const optimized = await optimizePrompt(
        { userPrompt: generation.prompt, aspectRatio, settings, brandKit: brandKitContext, referenceCount: requestReferenceCount, elements, faceLock, language: userSettings.preferredLanguage },
        { textProvider: deps.registry.textProvider(generation.provider), enabled: deps.promptOptimizationEnabled, referenceImages: references },
      );
      usageFromText = optimized.usage;
      eventName = optimized.eventName;
      if (settings.textRenderingMode === "overlay") {
        overlayText = optimized.text;
        finalPrompt = buildArtworkOnlyPrompt(optimized.prompt, optimized.constraints, optimized.text, settings.textPosition);
      } else {
        finalPrompt = `${optimized.prompt}\n\n${optimized.constraints}`;
      }
      log.info({ optimized: optimized.optimized, references: references.length, template: hasTemplate, styleGuide: Boolean(styleGuide), logoPlacement, brandKit: kit?.name ?? null }, "Prompt ready; calling image provider");
      image = await provider.generateImage({ prompt: finalPrompt, aspectRatio, model: generation.model, references });
    } else {
      const source = generation.sourceVersion;
      if (!source) throw new AppError(400, "missing_source", "The source version for this edit no longer exists");
      const sourceBuffer = await storage.get(source.storageKey);
      const lineage = collectLineageInstructions(generation.banner.generations, generation.banner.versions, source.id);
      const initial = generation.banner.generations.find((g) => g.kind === "initial" && g.optimizedPrompt);
      finalPrompt = buildEditPrompt({
        originalBrief: generation.banner.prompt,
        optimizedPrompt: initial?.optimizedPrompt,
        previousInstructions: lineage,
        instruction: generation.instruction ?? "",
        aspectRatio,
        language: userSettings.preferredLanguage,
        brandKit: brandKitContext,
        elements,
        faceLock,
      });
      // For edits the logo and the content elements travel along (so they can be re-placed or resized); style refs would confuse the edit.
      const editRefs = references.filter((r) => r.role === "brand-logo" || r.role === "element");
      log.info({ lineage: lineage.length }, "Edit prompt ready; calling image provider");
      image = await provider.editImage({ prompt: finalPrompt, aspectRatio, model: generation.model, sourceImage: { buffer: sourceBuffer, mimeType: source.mimeType }, references: editRefs });
    }

    // Post-process: normalize to PNG at canonical dimensions; exact faces; optional text overlay; logo overlay.
    let png = await normalizeGeneratedImage(image.buffer, aspectRatio);
    if (faceLock) {
      // Put the real faces back on the painted people. A failure here must not lose the generation.
      try {
        const started = Date.now();
        const result = await applyFaceLock(png.buffer, facePhotos, deps.faceDetector ?? faceDetector);
        log.info({ locked: result.locked, skipped: result.skipped, ms: Date.now() - started }, "Face lock applied");
        png = { ...png, buffer: result.buffer, sizeBytes: result.buffer.byteLength };
      } catch (err) {
        log.warn({ err }, "Face lock failed; keeping the painted faces");
      }
    }
    const font = settings.fontFamily ? FONT_OPTIONS.find((f) => f.value === settings.fontFamily)?.cssStack : undefined;
    const accentColor = settings.accentColor ?? kit?.accentColors?.[0] ?? undefined;
    if (overlayText) {
      const composed = await applyTextOverlay(png.buffer, overlayText, { width: dims.width, height: dims.height, position: settings.textPosition ?? "auto", fontFamily: font, accentColor });
      png = { ...png, buffer: composed, sizeBytes: composed.byteLength };
    }
    const nextVersionNumber = (generation.banner.versions.at(-1)?.versionNumber ?? 0) + 1;
    // The logo is composited on initial generations only: edits start from an image that already has it.
    if (logoBuffer && logoPlacement !== "ai" && logoPlacement !== "none" && generation.kind === "initial") {
      const composed = await applyLogoOverlay(png.buffer, logoBuffer, logoPlacement);
      png = { ...png, buffer: composed, sizeBytes: composed.byteLength };
    }

    // Persist file + version atomically with the status update.
    const key = storageKeys.bannerVersion(generation.userId, generation.bannerId, nextVersionNumber);
    await storage.put(key, png.buffer, "image/png");

    const completedAt = new Date();
    const usage = mergeUsage(image.usage, usageFromText as never);
    const label = generation.kind === "initial" ? (generation.attempt > 1 ? `Generated (attempt ${generation.attempt})` : "Generated") : (generation.instruction ?? "Edited");

    await prisma.$transaction(async (tx) => {
      const version = await tx.bannerVersion.create({
        data: {
          bannerId: generation.bannerId,
          generationId: generation.id,
          versionNumber: nextVersionNumber,
          parentVersionId: generation.sourceVersionId,
          storageKey: key,
          mimeType: "image/png",
          width: png.width,
          height: png.height,
          sizeBytes: png.sizeBytes,
          label: label.slice(0, 200),
        },
      });
      await tx.bannerGeneration.update({
        where: { id: generation.id },
        data: {
          status: "succeeded",
          optimizedPrompt: finalPrompt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          usage: toJson(usage),
          providerMetadata: toJson(image.providerMetadata),
          model: image.model,
        },
      });
      await tx.banner.update({
        where: { id: generation.bannerId },
        data: {
          status: "ready",
          currentVersionId: version.id,
          ...(generation.kind === "initial" && eventName && generation.banner.versions.length === 0 ? { title: eventName.slice(0, 120) } : {}),
        },
      });
    });
    await creditsService.settle(generation.id);
    log.info({ versionNumber: nextVersionNumber, durationMs: completedAt.getTime() - startedAt.getTime(), credits: generation.creditsHeld }, "Generation succeeded");
  } catch (err) {
    const message = err instanceof AppError && err.expose ? err.message : "Image generation failed unexpectedly. Please try again.";
    log.error({ err }, "Generation failed");
    const completedAt = new Date();
    const hasVersions = generation.banner.versions.length > 0;
    await prisma.$transaction([
      prisma.bannerGeneration.update({
        where: { id: generation.id },
        data: { status: "failed", errorMessage: message.slice(0, 1000), completedAt, durationMs: completedAt.getTime() - startedAt.getTime() },
      }),
      prisma.banner.update({ where: { id: generation.bannerId }, data: { status: hasVersions ? "ready" : "failed" } }),
    ]);
    const returned = await creditsService.release(generation.id);
    if (returned > 0) log.info({ returned }, "Credits returned after failure");
  }
}

/** Instructions of the successful edits that lead to `sourceVersionId`, oldest first. */
function collectLineageInstructions(
  generations: BannerGeneration[],
  versions: Array<{ id: string; generationId: string; parentVersionId: string | null }>,
  sourceVersionId: string,
): string[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const genById = new Map(generations.map((g) => [g.id, g]));
  const chain: string[] = [];
  let cursor: string | null = sourceVersionId;
  let guard = 0;
  while (cursor && guard++ < 100) {
    const version = byId.get(cursor);
    if (!version) break;
    const gen = genById.get(version.generationId);
    if (gen?.kind === "edit" && gen.instruction) chain.push(gen.instruction);
    cursor = version.parentVersionId;
  }
  return chain.reverse();
}
