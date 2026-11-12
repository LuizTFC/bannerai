import sharp, { type Metadata } from "sharp";
import type { AspectRatio } from "@bannerai/shared";
import { TARGET_DIMENSIONS } from "../../utils/aspect-ratio.js";
import { UnsupportedMediaTypeError } from "../../utils/errors.js";

export interface DecodedImage {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  sizeBytes: number;
}

const FORMAT_TO_MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

/**
 * Validates an uploaded image by actually decoding it with sharp (the client-provided MIME type
 * is never trusted), strips metadata, and limits dimensions to keep provider payloads small.
 */
export async function validateAndNormalizeUpload(input: Buffer, options: { maxDimension?: number } = {}): Promise<DecodedImage> {
  const maxDimension = options.maxDimension ?? 2048;
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new UnsupportedMediaTypeError("The file is not a valid image");
  }
  const format = meta.format as keyof typeof FORMAT_TO_MIME | undefined;
  if (!format || !(format in FORMAT_TO_MIME)) {
    throw new UnsupportedMediaTypeError("Only PNG, JPEG and WebP images are supported");
  }
  if (!meta.width || !meta.height) throw new UnsupportedMediaTypeError("Could not read image dimensions");

  const pipeline = sharp(input).rotate().resize({
    width: maxDimension,
    height: maxDimension,
    fit: "inside",
    withoutEnlargement: true,
  });
  const output =
    format === "png"
      ? pipeline.png({ compressionLevel: 9 })
      : format === "webp"
        ? pipeline.webp({ quality: 90 })
        : pipeline.jpeg({ quality: 90, mozjpeg: true });
  const { data, info } = await output.toBuffer({ resolveWithObject: true });
  return { buffer: data, mimeType: FORMAT_TO_MIME[format], width: info.width, height: info.height, sizeBytes: data.byteLength };
}

/** Converts any provider output to a PNG at the canonical size for the aspect ratio (cover + center crop). */
export async function normalizeGeneratedImage(input: Buffer, aspectRatio: AspectRatio): Promise<DecodedImage> {
  const target = TARGET_DIMENSIONS[aspectRatio];
  const { data, info } = await sharp(input)
    .resize({ width: target.width, height: target.height, fit: "cover", position: "centre", withoutEnlargement: false })
    .png({ compressionLevel: 8 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, mimeType: "image/png", width: info.width, height: info.height, sizeBytes: data.byteLength };
}

export async function readDimensions(input: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(input).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Small JPEG thumbnail used for list views / previews. */
export async function makeThumbnail(input: Buffer, maxDimension = 640): Promise<Buffer> {
  return sharp(input).resize({ width: maxDimension, height: maxDimension, fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
}

export function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
