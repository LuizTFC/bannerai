import type { AspectRatio } from "@bannerai/shared";
import type { AspectRatio as PrismaAspectRatio } from "../generated/prisma/enums.js";

const toPrisma: Record<AspectRatio, PrismaAspectRatio> = {
  "16:9": "RATIO_16_9",
  "9:16": "RATIO_9_16",
  "1:1": "RATIO_1_1",
  "4:3": "RATIO_4_3",
};

const fromPrisma: Record<PrismaAspectRatio, AspectRatio> = {
  RATIO_16_9: "16:9",
  RATIO_9_16: "9:16",
  RATIO_1_1: "1:1",
  RATIO_4_3: "4:3",
};

export const aspectRatioToDb = (value: AspectRatio): PrismaAspectRatio => toPrisma[value];
export const aspectRatioFromDb = (value: PrismaAspectRatio): AspectRatio => fromPrisma[value];

/** Target output dimensions (px) for each aspect ratio. The final PNG is normalized to these. */
export const TARGET_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1600, height: 1200 },
};

export const aspectRatioNumber = (value: AspectRatio): number => {
  const d = TARGET_DIMENSIONS[value];
  return d.width / d.height;
};
