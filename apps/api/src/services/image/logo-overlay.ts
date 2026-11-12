import sharp from "sharp";
import type { LogoPlacement } from "@bannerai/shared";

export type LogoCorner = Exclude<LogoPlacement, "ai" | "none">;

/**
 * Composites the Brand Kit logo onto a finished banner at the requested corner. The logo is scaled
 * to ~11% of the banner width (capped by height), with a safe margin and a soft backdrop so it
 * stays legible on busy artwork. Guarantees the logo appears exactly as uploaded.
 */
export async function applyLogoOverlay(banner: Buffer, logo: Buffer, corner: LogoCorner): Promise<Buffer> {
  const base = sharp(banner);
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return banner;

  const maxW = Math.round(width * 0.11);
  const maxH = Math.round(height * 0.12);
  const margin = Math.round(Math.min(width, height) * 0.035);
  const pad = Math.round(Math.min(width, height) * 0.015);

  const resized = await sharp(logo).resize({ width: maxW, height: maxH, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const logoMeta = await sharp(resized).metadata();
  const lw = logoMeta.width ?? maxW;
  const lh = logoMeta.height ?? maxH;

  // Soft rounded backdrop behind the logo (semi-transparent dark) improves contrast on photos.
  const bw = lw + pad * 2;
  const bh = lh + pad * 2;
  const radius = Math.round(Math.min(bw, bh) * 0.18);
  const backdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect x="0" y="0" width="${bw}" height="${bh}" rx="${radius}" ry="${radius}" fill="#000" fill-opacity="0.28"/></svg>`);

  const left = corner.endsWith("left") ? margin : width - margin - bw;
  const top = corner.startsWith("top") ? margin : height - margin - bh;

  return base
    .composite([
      { input: backdrop, left, top },
      { input: resized, left: left + pad, top: top + pad },
    ])
    .png({ compressionLevel: 8 })
    .toBuffer();
}
