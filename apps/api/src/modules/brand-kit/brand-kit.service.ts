import type { BrandKitAssetDto, BrandKitDto, UpdateBrandKitPayload } from "@bannerai/shared";
import { MAX_BRAND_KITS, MAX_BRAND_KIT_REFERENCES } from "@bannerai/shared";
import { prisma } from "../../database/prisma.js";
import type { BrandKit, BrandKitAsset } from "../../generated/prisma/client.js";
import { validateAndNormalizeUpload } from "../../services/image/index.js";
import { sanitizeOriginalName, storage, storageKeys } from "../../services/storage/index.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { fileUrl } from "../uploads/uploads.service.js";
import { isStyleGuideStale, parseStyleGuide } from "./style-guide.service.js";

export type BrandKitWithAssets = BrandKit & { assets: BrandKitAsset[] };

const withAssets = { assets: { orderBy: { createdAt: "asc" as const } } };

export function toBrandKitAssetDto(asset: BrandKitAsset): BrandKitAssetDto {
  return {
    id: asset.id,
    type: asset.type,
    url: fileUrl(asset.storageKey),
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function toBrandKitDto(kit: BrandKitWithAssets): BrandKitDto {
  const logo = kit.assets.find((a) => a.type === "logo") ?? null;
  return {
    id: kit.id,
    name: kit.name,
    isDefault: kit.isDefault,
    organizationName: kit.organizationName,
    organizationType: kit.organizationType,
    primaryColor: kit.primaryColor,
    secondaryColor: kit.secondaryColor,
    accentColors: kit.accentColors,
    preferredFonts: kit.preferredFonts,
    instructions: kit.instructions,
    logo: logo ? toBrandKitAssetDto(logo) : null,
    references: kit.assets.filter((a) => a.type === "reference").map(toBrandKitAssetDto),
    styleGuide: parseStyleGuide(kit.styleGuide),
    styleGuideUpdatedAt: kit.styleGuideUpdatedAt?.toISOString() ?? null,
    styleGuideStale: isStyleGuideStale(kit),
    learnedPreferences: kit.learnedPreferences,
    updatedAt: kit.updatedAt.toISOString(),
  };
}

/** Users can keep several Brand Kits (events, brands, clients); exactly one is the default. */
export class BrandKitService {
  async list(userId: string): Promise<BrandKitWithAssets[]> {
    return prisma.brandKit.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], include: withAssets });
  }

  async findOwned(userId: string, id: string): Promise<BrandKitWithAssets> {
    const kit = await prisma.brandKit.findFirst({ where: { id, userId }, include: withAssets });
    if (!kit) throw new NotFoundError("Brand Kit not found");
    return kit;
  }

  async findDefault(userId: string): Promise<BrandKitWithAssets | null> {
    return (await prisma.brandKit.findFirst({ where: { userId, isDefault: true }, include: withAssets })) ?? prisma.brandKit.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, include: withAssets });
  }

  async create(userId: string, name: string): Promise<BrandKitWithAssets> {
    const count = await prisma.brandKit.count({ where: { userId } });
    if (count >= MAX_BRAND_KITS) throw new BadRequestError(`You can keep at most ${MAX_BRAND_KITS} Brand Kits`);
    return prisma.brandKit.create({ data: { userId, name, isDefault: count === 0 }, include: withAssets });
  }

  async update(userId: string, id: string, patch: UpdateBrandKitPayload): Promise<BrandKitWithAssets> {
    const kit = await this.findOwned(userId, id);
    return prisma.brandKit.update({
      where: { id: kit.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.organizationName !== undefined ? { organizationName: patch.organizationName ?? null } : {}),
        ...(patch.organizationType !== undefined ? { organizationType: patch.organizationType ?? null } : {}),
        ...(patch.primaryColor !== undefined ? { primaryColor: patch.primaryColor ?? null } : {}),
        ...(patch.secondaryColor !== undefined ? { secondaryColor: patch.secondaryColor ?? null } : {}),
        ...(patch.accentColors !== undefined ? { accentColors: patch.accentColors } : {}),
        ...(patch.preferredFonts !== undefined ? { preferredFonts: patch.preferredFonts } : {}),
        ...(patch.instructions !== undefined ? { instructions: patch.instructions ?? null } : {}),
        ...(patch.learnedPreferences !== undefined ? { learnedPreferences: patch.learnedPreferences } : {}),
      },
      include: withAssets,
    });
  }

  /** Clears a nullable text/color field explicitly. */
  async clearField(userId: string, id: string, field: "organizationName" | "organizationType" | "primaryColor" | "secondaryColor" | "instructions"): Promise<BrandKitWithAssets> {
    const kit = await this.findOwned(userId, id);
    return prisma.brandKit.update({ where: { id: kit.id }, data: { [field]: null }, include: withAssets });
  }

  async setDefault(userId: string, id: string): Promise<BrandKitWithAssets> {
    const kit = await this.findOwned(userId, id);
    await prisma.$transaction([
      prisma.brandKit.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
      prisma.brandKit.update({ where: { id: kit.id }, data: { isDefault: true } }),
    ]);
    return this.findOwned(userId, id);
  }

  async delete(userId: string, id: string): Promise<void> {
    const kit = await this.findOwned(userId, id);
    await prisma.brandKit.delete({ where: { id: kit.id } });
    await Promise.all(kit.assets.map((a) => storage.delete(a.storageKey)));
    if (kit.isDefault) {
      const next = await prisma.brandKit.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
      if (next) await prisma.brandKit.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  async setLogo(userId: string, id: string, file: { buffer: Buffer; originalname: string }): Promise<BrandKitWithAssets> {
    const kit = await this.findOwned(userId, id);
    const image = await validateAndNormalizeUpload(file.buffer, { maxDimension: 1600 });
    const key = storageKeys.brandKit(userId, image.mimeType);
    await storage.put(key, image.buffer, image.mimeType);
    const previous = kit.assets.filter((a) => a.type === "logo");
    await prisma.$transaction([
      prisma.brandKitAsset.deleteMany({ where: { brandKitId: kit.id, type: "logo" } }),
      prisma.brandKitAsset.create({
        data: {
          brandKitId: kit.id,
          type: "logo",
          storageKey: key,
          originalName: sanitizeOriginalName(file.originalname),
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          width: image.width,
          height: image.height,
        },
      }),
    ]);
    await Promise.all(previous.map((a) => storage.delete(a.storageKey)));
    return this.findOwned(userId, id);
  }

  async addReferences(userId: string, id: string, files: Array<{ buffer: Buffer; originalname: string }>): Promise<BrandKitWithAssets> {
    const kit = await this.findOwned(userId, id);
    const current = kit.assets.filter((a) => a.type === "reference").length;
    if (current + files.length > MAX_BRAND_KIT_REFERENCES) {
      throw new BadRequestError(`A Brand Kit can hold at most ${MAX_BRAND_KIT_REFERENCES} reference banners`);
    }
    for (const file of files) {
      const image = await validateAndNormalizeUpload(file.buffer);
      const key = storageKeys.brandKit(userId, image.mimeType);
      await storage.put(key, image.buffer, image.mimeType);
      await prisma.brandKitAsset.create({
        data: {
          brandKitId: kit.id,
          type: "reference",
          storageKey: key,
          originalName: sanitizeOriginalName(file.originalname),
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
          width: image.width,
          height: image.height,
        },
      });
    }
    return this.findOwned(userId, id);
  }

  async removeAsset(userId: string, id: string, assetId: string): Promise<BrandKitWithAssets> {
    const kit = await this.findOwned(userId, id);
    const asset = kit.assets.find((a) => a.id === assetId);
    if (!asset) throw new NotFoundError("Asset not found");
    await prisma.brandKitAsset.delete({ where: { id: asset.id } });
    await storage.delete(asset.storageKey);
    return this.findOwned(userId, id);
  }
}

export const brandKitService = new BrandKitService();
