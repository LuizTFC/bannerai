import { prisma } from "../../database/prisma.js";
import type { BannerSummaryRow, BannerWithRelations } from "./banners.mapper.js";

const fullInclude = {
  versions: { orderBy: { versionNumber: "asc" as const } },
  generations: { orderBy: { createdAt: "asc" as const } },
  referenceImages: { orderBy: { createdAt: "asc" as const } },
  currentVersion: true,
};

export class BannersRepository {
  async findOwned(userId: string, bannerId: string): Promise<BannerWithRelations | null> {
    return prisma.banner.findFirst({ where: { id: bannerId, userId }, include: fullInclude });
  }

  async list(userId: string, page: number, pageSize: number): Promise<{ items: BannerSummaryRow[]; total: number }> {
    const [items, total] = await prisma.$transaction([
      prisma.banner.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { currentVersion: true, _count: { select: { versions: true } } },
      }),
      prisma.banner.count({ where: { userId } }),
    ]);
    return { items, total };
  }
}

export const bannersRepository = new BannersRepository();
