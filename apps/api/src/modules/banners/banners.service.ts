import type {
  AiProvider,
  BannerListResponse,
  CreateBannerPayload,
  EditBannerPayload,
} from "@bannerai/shared";
import { prisma } from "../../database/prisma.js";
import type { BannerGeneration } from "../../generated/prisma/client.js";
import { storage, storageKeys } from "../../services/storage/index.js";
import { aspectRatioToDb } from "../../utils/aspect-ratio.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors.js";
import { providerRegistry } from "../ai-providers/index.js";
import { guessTitle } from "../ai-providers/prompt-builder.js";
import { MAX_BRAND_KIT_REFERENCES } from "@bannerai/shared";
import { logger } from "../../config/logger.js";
import { brandKitService } from "../brand-kit/brand-kit.service.js";
import { learnFromApproval } from "../brand-kit/learning.service.js";
import { creditsService } from "../credits/credits.service.js";
import { generationQueue } from "../generations/generation.queue.js";
import { uploadsService } from "../uploads/uploads.service.js";
import { parseUserSettings } from "../users/users.service.js";
import { toBannerDto, toBannerSummaryDto, type BannerWithRelations } from "./banners.mapper.js";
import { bannersRepository } from "./banners.repository.js";

const ACTIVE = ["pending", "running"] as const;

export class BannersService {
  async list(userId: string, page: number, pageSize: number): Promise<BannerListResponse> {
    const { items, total } = await bannersRepository.list(userId, page, pageSize);
    return { items: items.map(toBannerSummaryDto), page, pageSize, total };
  }

  async getOwned(userId: string, bannerId: string): Promise<BannerWithRelations> {
    const banner = await bannersRepository.findOwned(userId, bannerId);
    if (!banner) throw new NotFoundError("Banner not found");
    return banner;
  }

  async get(userId: string, bannerId: string) {
    return toBannerDto(await this.getOwned(userId, bannerId));
  }

  private userDefaults(settings: unknown): { defaultProvider?: AiProvider; defaultModel?: string } {
    const s = parseUserSettings(settings);
    return { defaultProvider: s.defaultProvider, defaultModel: s.defaultModel };
  }

  async create(user: { id: string; settings: unknown }, input: CreateBannerPayload) {
    const { provider, model } = providerRegistry.resolve({ provider: input.provider, model: input.model }, this.userDefaults(user.settings));
    const references = await uploadsService.findOwnedReferences(user.id, input.referenceImageIds, "reference");
    const elements = await uploadsService.findOwnedReferences(user.id, input.elementImageIds, "element");
    // Brand Kit: explicit id (must belong to the user) → user's default kit → none.
    const kit =
      input.settings.useBrandKit === false ? null : input.brandKitId ? await brandKitService.findOwned(user.id, input.brandKitId) : await brandKitService.findDefault(user.id);
    const brandKitId = kit?.id ?? null;
    if (input.settings.templateAssetId) {
      const template = kit?.assets.find((a) => a.id === input.settings.templateAssetId && a.type === "reference");
      if (!template) throw new BadRequestError("The template must be a reference banner of the selected Brand Kit");
    }

    const result = await prisma.$transaction(async (tx) => {
      await creditsService.ensureBalance(tx, user.id, creditsService.costFor("initial"));
      const banner = await tx.banner.create({
        data: {
          userId: user.id,
          title: guessTitle(input.prompt),
          prompt: input.prompt,
          aspectRatio: aspectRatioToDb(input.aspectRatio),
          settings: input.settings,
          status: "generating",
          provider: provider.id,
          model,
          brandKitId,
        },
      });
      const generation = await tx.bannerGeneration.create({
        data: {
          bannerId: banner.id,
          userId: user.id,
          kind: "initial",
          status: "pending",
          prompt: input.prompt,
          aspectRatio: aspectRatioToDb(input.aspectRatio),
          settings: input.settings,
          provider: provider.id,
          model,
        },
      });
      const attached = [...references, ...elements];
      if (attached.length) {
        await tx.referenceImage.updateMany({
          where: { id: { in: attached.map((r) => r.id) }, userId: user.id },
          data: { bannerId: banner.id, generationId: generation.id },
        });
      }
      await creditsService.hold(tx, user.id, generation.id, creditsService.costFor("initial"), "Banner generation");
      return { banner, generation };
    });

    await generationQueue.enqueue(result.generation.id);
    const banner = await this.getOwned(user.id, result.banner.id);
    const dto = toBannerDto(banner);
    return { banner: dto, generation: dto.generations.find((g) => g.id === result.generation.id)! };
  }

  async edit(user: { id: string; settings: unknown }, bannerId: string, input: EditBannerPayload) {
    const banner = await this.getOwned(user.id, bannerId);
    if (banner.generations.some((g) => (ACTIVE as readonly string[]).includes(g.status))) {
      throw new ConflictError("This banner already has a generation in progress. Wait for it to finish.");
    }
    const source = input.sourceVersionId ? banner.versions.find((v) => v.id === input.sourceVersionId) : banner.currentVersion;
    if (!source) throw new BadRequestError("There is no generated version to edit yet");

    const { provider, model } = providerRegistry.resolve(
      { provider: input.provider ?? banner.provider, model: input.model },
      this.userDefaults(user.settings),
    );

    const generation = await prisma.$transaction(async (tx) => {
      await creditsService.ensureBalance(tx, user.id, creditsService.costFor("edit"));
      const g = await tx.bannerGeneration.create({
        data: {
          bannerId: banner.id,
          userId: user.id,
          kind: "edit",
          status: "pending",
          prompt: banner.prompt,
          instruction: input.instruction,
          aspectRatio: banner.aspectRatio,
          settings: banner.settings ?? {},
          provider: provider.id,
          model,
          sourceVersionId: source.id,
        },
      });
      await tx.banner.update({ where: { id: banner.id }, data: { status: "generating", provider: provider.id, model } });
      await creditsService.hold(tx, user.id, g.id, creditsService.costFor("edit"), "Banner edit");
      return g;
    });

    await generationQueue.enqueue(generation.id);
    const dto = toBannerDto(await this.getOwned(user.id, banner.id));
    return { banner: dto, generation: dto.generations.find((g) => g.id === generation.id)! };
  }

  async retry(user: { id: string; settings: unknown }, bannerId: string, generationId: string) {
    const banner = await this.getOwned(user.id, bannerId);
    const failed = banner.generations.find((g) => g.id === generationId);
    if (!failed) throw new NotFoundError("Generation not found");
    if (failed.status !== "failed") throw new ConflictError("Only failed generations can be retried");
    if (banner.generations.some((g) => (ACTIVE as readonly string[]).includes(g.status))) {
      throw new ConflictError("This banner already has a generation in progress. Wait for it to finish.");
    }
    const { provider, model } = providerRegistry.resolve({ provider: failed.provider, model: failed.model }, this.userDefaults(user.settings));

    const generation: BannerGeneration = await prisma.$transaction(async (tx) => {
      await creditsService.ensureBalance(tx, user.id, creditsService.costFor(failed.kind));
      const g = await tx.bannerGeneration.create({
        data: {
          bannerId: banner.id,
          userId: user.id,
          kind: failed.kind,
          status: "pending",
          prompt: failed.prompt,
          instruction: failed.instruction,
          aspectRatio: failed.aspectRatio,
          settings: failed.settings ?? {},
          provider: provider.id,
          model,
          sourceVersionId: failed.sourceVersionId,
          attempt: failed.attempt + 1,
        },
      });
      if (failed.kind === "initial") {
        await tx.referenceImage.updateMany({ where: { bannerId: banner.id, userId: user.id }, data: { generationId: g.id } });
      }
      await tx.banner.update({ where: { id: banner.id }, data: { status: "generating" } });
      await creditsService.hold(tx, user.id, g.id, creditsService.costFor(failed.kind), failed.kind === "initial" ? "Banner generation (retry)" : "Banner edit (retry)");
      return g;
    });

    await generationQueue.enqueue(generation.id);
    const dto = toBannerDto(await this.getOwned(user.id, banner.id));
    return { banner: dto, generation: dto.generations.find((g) => g.id === generation.id)! };
  }

  async restoreVersion(userId: string, bannerId: string, versionId: string) {
    const banner = await this.getOwned(userId, bannerId);
    const version = banner.versions.find((v) => v.id === versionId);
    if (!version) throw new NotFoundError("Version not found");
    await prisma.banner.update({ where: { id: banner.id }, data: { currentVersionId: version.id, status: "ready" } });
    return toBannerDto(await this.getOwned(userId, bannerId));
  }

  /**
   * Marks a version as the approved final. Feeds the learning loop: preferences are extracted from
   * the edit history into the Brand Kit, and the approved PNG becomes a Brand Kit reference.
   */
  async approve(userId: string, bannerId: string, versionId: string, addToBrandKit = true) {
    const banner = await this.getOwned(userId, bannerId);
    const version = banner.versions.find((v) => v.id === versionId);
    if (!version) throw new NotFoundError("Version not found");
    await prisma.banner.update({ where: { id: banner.id }, data: { approvedVersionId: version.id, approvedAt: new Date(), currentVersionId: version.id, status: "ready" } });

    let learned: string[] = [];
    let addedToBrandKit = false;
    if (banner.brandKitId) {
      const kit = await brandKitService.findOwned(userId, banner.brandKitId).catch(() => null);
      if (kit) {
        // Instructions that led to the approved version, oldest first.
        const byId = new Map(banner.versions.map((v) => [v.id, v]));
        const genById = new Map(banner.generations.map((g) => [g.id, g]));
        const chain: string[] = [];
        let cursor: string | null = version.id;
        let guard = 0;
        while (cursor && guard++ < 100) {
          const v = byId.get(cursor);
          if (!v) break;
          const g = genById.get(v.generationId);
          if (g?.kind === "edit" && g.instruction) chain.push(g.instruction);
          cursor = v.parentVersionId;
        }
        const first = banner.versions[0];
        try {
          learned = await learnFromApproval({
            brandKitId: kit.id,
            brief: banner.prompt,
            editInstructions: chain.reverse(),
            firstVersion: first && first.id !== version.id ? { buffer: await storage.get(first.storageKey), mimeType: first.mimeType } : null,
            finalVersion: { buffer: await storage.get(version.storageKey), mimeType: version.mimeType },
            providers: providerRegistry.textProviders(banner.provider),
          });
        } catch (err) {
          logger.warn({ err, bannerId }, "Could not learn preferences from the approved banner");
        }
        const referenceCount = kit.assets.filter((a) => a.type === "reference").length;
        if (addToBrandKit && referenceCount < MAX_BRAND_KIT_REFERENCES) {
          try {
            await brandKitService.addReferences(userId, kit.id, [{ buffer: await storage.get(version.storageKey), originalname: `${banner.title}-v${version.versionNumber}.png` }]);
            addedToBrandKit = true;
          } catch (err) {
            logger.warn({ err, bannerId }, "Could not add the approved banner to the Brand Kit references");
          }
        }
      }
    }
    return { banner: toBannerDto(await this.getOwned(userId, bannerId)), learned, addedToBrandKit };
  }

  async updateTitle(userId: string, bannerId: string, title: string) {
    await this.getOwned(userId, bannerId);
    await prisma.banner.update({ where: { id: bannerId }, data: { title } });
    return toBannerDto(await this.getOwned(userId, bannerId));
  }

  async delete(userId: string, bannerId: string): Promise<void> {
    const banner = await this.getOwned(userId, bannerId);
    if (banner.generations.some((g) => (ACTIVE as readonly string[]).includes(g.status))) {
      throw new ConflictError("Wait for the current generation to finish before deleting this banner.");
    }
    await prisma.banner.delete({ where: { id: banner.id } });
    await storage.deletePrefix(storageKeys.bannerPrefix(userId, banner.id));
    await Promise.all(banner.referenceImages.map((r) => storage.delete(r.storageKey)));
  }
}

export const bannersService = new BannersService();
