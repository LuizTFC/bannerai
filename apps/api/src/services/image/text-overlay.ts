import sharp from "sharp";
import type { TextPosition } from "@bannerai/shared";

export interface OverlayText {
  title: string;
  subtitle?: string;
  details?: string[]; // date, time, place, etc.
}

export interface OverlayOptions {
  width: number;
  height: number;
  position: TextPosition;
  fontFamily?: string;
  textColor?: string;
  accentColor?: string;
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Greedy word wrap using an average glyph width heuristic (good enough for display type). */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/**
 * Builds an SVG layer with the critical text (title / subtitle / details) and a soft
 * gradient scrim so the text stays legible on any artwork. The SVG is rasterized by sharp.
 */
export function buildOverlaySvg(text: OverlayText, opts: OverlayOptions): string {
  const { width, height } = opts;
  const font = opts.fontFamily ?? "Helvetica Neue, Helvetica, Arial, sans-serif";
  const color = opts.textColor ?? "#FFFFFF";
  const accent = opts.accentColor ?? color;
  const margin = Math.round(Math.min(width, height) * 0.08);
  const anchor = opts.position === "left" ? "start" : opts.position === "right" ? "end" : "middle";
  const x = opts.position === "left" ? margin : opts.position === "right" ? width - margin : width / 2;

  const usableWidth = width - margin * 2;
  const titleSize = Math.round(Math.min(width, height) * (opts.position === "center" || opts.position === "auto" ? 0.11 : 0.1));
  const titleLines = wrap(text.title.toUpperCase(), Math.max(8, Math.floor(usableWidth / (titleSize * 0.62))));
  const subtitleSize = Math.round(titleSize * 0.36);
  const subtitleLines = text.subtitle ? wrap(text.subtitle, Math.max(12, Math.floor(usableWidth / (subtitleSize * 0.55)))) : [];
  const detailSize = Math.round(titleSize * 0.3);
  const detailLines = (text.details ?? []).filter(Boolean).slice(0, 3);

  const lineGap = 1.05;
  const blockHeight =
    titleLines.length * titleSize * lineGap +
    (subtitleLines.length ? subtitleSize * 0.8 + subtitleLines.length * subtitleSize * 1.3 : 0) +
    (detailLines.length ? detailSize * 1.2 + detailLines.length * detailSize * 1.5 : 0);

  // Vertical placement: centered block for center/auto, lower third otherwise feels more "poster".
  let y = Math.round(height / 2 - blockHeight / 2 + titleSize * 0.8);
  if (opts.position === "left" || opts.position === "right") y = Math.round(height - margin - blockHeight + titleSize * 0.8);

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.05"/>
      <stop offset="0.45" stop-color="#000" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.7"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="${Math.max(2, Math.round(titleSize * 0.04))}" stdDeviation="${Math.max(2, Math.round(titleSize * 0.08))}" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>`);
  parts.push(`<rect width="${width}" height="${height}" fill="url(#scrim)"/>`);
  parts.push(`<g font-family="${escapeXml(font)}" text-anchor="${anchor}" filter="url(#shadow)">`);

  for (const line of titleLines) {
    parts.push(`<text x="${x}" y="${y}" font-size="${titleSize}" font-weight="800" letter-spacing="${Math.round(titleSize * 0.02)}" fill="${color}">${escapeXml(line)}</text>`);
    y += Math.round(titleSize * lineGap);
  }
  if (subtitleLines.length) {
    y += Math.round(subtitleSize * 0.8);
    for (const line of subtitleLines) {
      parts.push(`<text x="${x}" y="${y}" font-size="${subtitleSize}" font-weight="500" fill="${color}" fill-opacity="0.95">${escapeXml(line)}</text>`);
      y += Math.round(subtitleSize * 1.3);
    }
  }
  if (detailLines.length) {
    y += Math.round(detailSize * 1.2);
    for (const line of detailLines) {
      parts.push(`<text x="${x}" y="${y}" font-size="${detailSize}" font-weight="700" letter-spacing="${Math.round(detailSize * 0.08)}" fill="${accent}">${escapeXml(line.toUpperCase())}</text>`);
      y += Math.round(detailSize * 1.5);
    }
  }
  parts.push("</g></svg>");
  return parts.join("\n");
}

/** Composites the overlay on top of a PNG artwork and returns the final PNG. */
export async function applyTextOverlay(artwork: Buffer, text: OverlayText, opts: OverlayOptions): Promise<Buffer> {
  const svg = Buffer.from(buildOverlaySvg(text, opts));
  return sharp(artwork)
    .composite([{ input: svg, top: 0, left: 0 }])
    .png({ compressionLevel: 8 })
    .toBuffer();
}
