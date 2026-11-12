import sharp from "sharp";
import { logger } from "../../config/logger.js";
import type { DetectedFace, FaceDetector, Point } from "./face-detector.js";

/**
 * Face lock: the image model paints each guest from their photo (so the person stays editable by
 * prompt: clothes, pose, size, position), and afterwards the studio puts the real face back.
 *
 * For every person: find the painted face that matches the photo (identity embeddings, falling
 * back to left-to-right order), fit a similarity transform from the photo's face mesh onto the
 * painted one, warp the photo, blend it inside the face oval (intersection of both silhouettes,
 * feathered) after matching the painted lighting with a blur-ratio color transfer.
 */

export interface FaceLockPerson {
  label: string;
  photo: Buffer;
}

export interface FaceLockResult {
  buffer: Buffer;
  locked: string[];
  skipped: Array<{ label: string; reason: string }>;
}

/** Mesh indices used for alignment: eyes, brows, nose, mouth and chin (stable across expressions). */
const ALIGN_INDICES = [33, 133, 362, 263, 159, 145, 386, 374, 70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 6, 168, 197, 195, 5, 4, 1, 98, 327, 61, 291, 0, 17, 152];
const EYE_OUTER_RIGHT = 33;
const EYE_OUTER_LEFT = 263;
const MATCH_THRESHOLD = 0.4;
const MAX_YAW_DIFF = 0.5; // ≈ 29°
const MAX_PITCH_DIFF = 0.45;
/** Shrink of the face ovals: keeps the blend inside the face, away from hair and background. */
const TARGET_OVAL_SHRINK = 0.92;
const SOURCE_OVAL_SHRINK = 0.94;

/** 2D similarity: [x'; y'] = [[a, -b], [b, a]]·[x; y] + [tx; ty]. */
export interface Similarity {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

/** Least-squares similarity transform mapping `src[i]` onto `dst[i]`. */
export function fitSimilarity(src: Point[], dst: Point[]): Similarity {
  const n = Math.min(src.length, dst.length);
  if (n < 2) throw new Error("fitSimilarity needs at least two points");
  let mx = 0;
  let my = 0;
  let mu = 0;
  let mv = 0;
  for (let i = 0; i < n; i++) {
    mx += src[i]![0];
    my += src[i]![1];
    mu += dst[i]![0];
    mv += dst[i]![1];
  }
  mx /= n;
  my /= n;
  mu /= n;
  mv /= n;
  let na = 0;
  let nb = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i]![0] - mx;
    const y = src[i]![1] - my;
    const u = dst[i]![0] - mu;
    const v = dst[i]![1] - mv;
    na += x * u + y * v;
    nb += x * v - y * u;
    den += x * x + y * y;
  }
  if (den === 0) throw new Error("fitSimilarity: degenerate source points");
  const a = na / den;
  const b = nb / den;
  return { a, b, tx: mu - (a * mx - b * my), ty: mv - (b * mx + a * my) };
}

export const applySimilarity = (m: Similarity, [x, y]: Point): Point => [m.a * x - m.b * y + m.tx, m.b * x + m.a * y + m.ty];
export const similarityScale = (m: Similarity): number => Math.hypot(m.a, m.b);

export function invertSimilarity(m: Similarity): Similarity {
  const d = m.a * m.a + m.b * m.b;
  const a = m.a / d;
  const b = -m.b / d;
  return { a, b, tx: -(a * m.tx - b * m.ty), ty: -(b * m.tx + a * m.ty) };
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function shrinkPolygon(points: Point[], factor: number): Point[] {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function rasterPolygon(points: Point[], width: number, height: number): Promise<Buffer> {
  const pts = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/><polygon points="${pts}" fill="#fff"/></svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== width * height) throw new Error(`rasterPolygon: unexpected ${info.channels}-channel output`);
  return data;
}

async function blurRaw(data: Buffer, width: number, height: number, channels: 1 | 3, sigma: number): Promise<Buffer> {
  let pipeline = sharp(data, { raw: { width, height, channels } }).blur(Math.max(0.3, sigma));
  // Blurring promotes greyscale input to sRGB; bring it back to one channel.
  if (channels === 1) pipeline = pipeline.toColourspace("b-w");
  const out = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (out.info.channels !== channels) throw new Error(`blurRaw: expected ${channels} channels, got ${out.info.channels}`);
  return out.data;
}

/**
 * Backward-maps every crop pixel into the photo (bilinear); uncovered pixels keep the painted image.
 * `inverse` maps banner pixels to the original photo; `photo` may be a pre-enlarged copy (`sampleScale`).
 */
function warpPhoto(photo: Raw, sampleScale: number, inverse: Similarity, crop: Crop, painted: Buffer): { warped: Buffer; coverage: Uint8Array } {
  const warped = Buffer.from(painted);
  const coverage = new Uint8Array(crop.width * crop.height);
  const { data, width: pw, height: ph } = photo;
  for (let j = 0; j < crop.height; j++) {
    for (let i = 0; i < crop.width; i++) {
      const [sx, sy] = applySimilarity(inverse, [crop.x + i + 0.5, crop.y + j + 0.5]);
      const x = sx * sampleScale - 0.5;
      const y = sy * sampleScale - 0.5;
      if (x < 0 || y < 0 || x >= pw - 1 || y >= ph - 1) continue;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const o00 = (y0 * pw + x0) * 3;
      const o10 = o00 + 3;
      const o01 = o00 + pw * 3;
      const o11 = o01 + 3;
      const out = (j * crop.width + i) * 3;
      for (let c = 0; c < 3; c++) {
        const top = data[o00 + c]! * (1 - fx) + data[o10 + c]! * fx;
        const bottom = data[o01 + c]! * (1 - fx) + data[o11 + c]! * fx;
        warped[out + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
      coverage[j * crop.width + i] = 1;
    }
  }
  return { warped, coverage };
}

function extractCrop(image: Raw, crop: Crop): Buffer {
  const out = Buffer.alloc(crop.width * crop.height * 3);
  for (let j = 0; j < crop.height; j++) {
    const srcStart = ((crop.y + j) * image.width + crop.x) * 3;
    image.data.copy(out, j * crop.width * 3, srcStart, srcStart + crop.width * 3);
  }
  return out;
}

function pasteCrop(image: Raw, crop: Crop, data: Buffer): void {
  for (let j = 0; j < crop.height; j++) {
    data.copy(image.data, ((crop.y + j) * image.width + crop.x) * 3, j * crop.width * 3, (j + 1) * crop.width * 3);
  }
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Pastes the photo's face over the painted face, in place on the banner's raw RGB buffer. */
export async function swapFace(banner: Raw, painted: DetectedFace, photo: Raw, source: DetectedFace): Promise<void> {
  // Fit on the inner features AND the face oval: the oval decides where the blend boundary lands,
  // so the photo's face must cover the painted face even when the model drew a fuller head.
  const transform = fitSimilarity(
    [...ALIGN_INDICES.map((i) => source.mesh[i]!), ...source.silhouette],
    [...ALIGN_INDICES.map((i) => painted.mesh[i]!), ...painted.silhouette],
  );
  const inverse = invertSimilarity(transform);
  const scale = similarityScale(transform);

  // Work on a crop around the painted face.
  const xs = painted.silhouette.map((p) => p[0]);
  const ys = painted.silhouette.map((p) => p[1]);
  const faceW = Math.max(...xs) - Math.min(...xs);
  const faceH = Math.max(...ys) - Math.min(...ys);
  const feather = Math.max(1.5, faceH * 0.025);
  const pad = Math.ceil(Math.max(faceW, faceH) * 0.2 + feather * 4);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const x1 = Math.min(banner.width, Math.ceil(Math.max(...xs) + pad));
  const y1 = Math.min(banner.height, Math.ceil(Math.max(...ys) + pad));
  const crop: Crop = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  if (crop.width < 8 || crop.height < 8) return;
  const toCrop = ([x, y]: Point): Point => [x - crop.x, y - crop.y];

  const paintedCrop = extractCrop(banner, crop);
  // Enlarge with Lanczos first (much cleaner than bilinear) when the photo is smaller than the painted face.
  let sampled = photo;
  let sampleScale = 1;
  if (scale > 1.05) {
    const { data, info } = await sharp(photo.data, { raw: { width: photo.width, height: photo.height, channels: 3 } })
      .resize({ width: Math.round(photo.width * scale), height: Math.round(photo.height * scale), kernel: "lanczos3", fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    sampled = { data, width: info.width, height: info.height };
    sampleScale = info.width / photo.width;
  }
  let { warped, coverage } = warpPhoto(sampled, sampleScale, inverse, crop, paintedCrop);
  if (scale > 1.3) {
    // Recover some crispness lost in the enlargement.
    warped = await sharp(warped, { raw: { width: crop.width, height: crop.height, channels: 3 } })
      .sharpen({ sigma: Math.min(1.2, 0.4 + scale * 0.2) })
      .raw()
      .toBuffer();
  }

  // Blend region: inside both faces (painted and warped photo), feathered. The convex hull of the
  // mesh, rather than the face oval, keeps the nose inside the region on three-quarter views.
  const targetOval = await rasterPolygon(shrinkPolygon(convexHull(painted.mesh), TARGET_OVAL_SHRINK).map(toCrop), crop.width, crop.height);
  const sourceOval = await rasterPolygon(shrinkPolygon(convexHull(source.mesh), SOURCE_OVAL_SHRINK).map((p) => toCrop(applySimilarity(transform, p))), crop.width, crop.height);
  const hard = Buffer.alloc(crop.width * crop.height);
  for (let i = 0; i < hard.length; i++) hard[i] = coverage[i] ? Math.min(targetOval[i]!, sourceOval[i]!) : 0;
  const mask = await blurRaw(hard, crop.width, crop.height, 1, feather);

  // Lighting/tone transfer: scale the photo by the ratio of local averages (painted / photo), taken
  // over face pixels only so hair, background and the photo's backdrop do not skew the tone.
  const eyeDistance = Math.hypot(painted.mesh[EYE_OUTER_LEFT]![0] - painted.mesh[EYE_OUTER_RIGHT]![0], painted.mesh[EYE_OUTER_LEFT]![1] - painted.mesh[EYE_OUTER_RIGHT]![1]);
  const colorSigma = Math.max(2, eyeDistance * 0.5);
  const maskOnly = (buf: Buffer): Buffer => {
    const out = Buffer.alloc(buf.length);
    for (let p = 0; p < hard.length; p++) {
      if (!hard[p]) continue;
      out[p * 3] = buf[p * 3]!;
      out[p * 3 + 1] = buf[p * 3 + 1]!;
      out[p * 3 + 2] = buf[p * 3 + 2]!;
    }
    return out;
  };
  const paintedBlur = await blurRaw(maskOnly(paintedCrop), crop.width, crop.height, 3, colorSigma);
  const warpedBlur = await blurRaw(maskOnly(warped), crop.width, crop.height, 3, colorSigma);

  const out = Buffer.from(paintedCrop);
  for (let p = 0; p < crop.width * crop.height; p++) {
    const m = mask[p]! / 255;
    if (m <= 0) continue;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      const ratio = Math.min(2.5, Math.max(0.4, (paintedBlur[i]! + 4) / (warpedBlur[i]! + 4)));
      const corrected = clamp255(warped[i]! * ratio);
      out[i] = clamp255(paintedCrop[i]! * (1 - m) + corrected * m);
    }
  }
  pasteCrop(banner, crop, out);
}

const centerX = (f: DetectedFace): number => f.box.x + f.box.width / 2;

/**
 * Matches each person's photo to one painted face: best identity similarity first (greedy, above
 * the threshold), then left-to-right order for whatever is left, which is how the prompt asked the
 * model to arrange them.
 */
export function matchFaces(detector: FaceDetector, photos: Array<DetectedFace | null>, painted: DetectedFace[]): Array<number | null> {
  const assignment: Array<number | null> = photos.map(() => null);
  const freePainted = new Set(painted.map((_, i) => i));
  const pairs: Array<{ p: number; t: number; sim: number }> = [];
  photos.forEach((photo, p) => {
    if (!photo) return;
    painted.forEach((face, t) => pairs.push({ p, t, sim: detector.similarity(photo.embedding, face.embedding) }));
  });
  pairs.sort((a, b) => b.sim - a.sim);
  for (const { p, t, sim } of pairs) {
    if (sim < MATCH_THRESHOLD) break;
    if (assignment[p] !== null || !freePainted.has(t)) continue;
    assignment[p] = t;
    freePainted.delete(t);
  }
  const leftovers = photos.map((photo, p) => (photo && assignment[p] === null ? p : -1)).filter((p) => p >= 0);
  const remaining = [...freePainted].sort((a, b) => centerX(painted[a]!) - centerX(painted[b]!));
  leftovers.forEach((p, i) => {
    if (i < remaining.length) assignment[p] = remaining[i]!;
  });
  return assignment;
}

export async function applyFaceLock(banner: Buffer, persons: FaceLockPerson[], detector: FaceDetector): Promise<FaceLockResult> {
  const skipped: FaceLockResult["skipped"] = [];
  const locked: string[] = [];
  if (persons.length === 0) return { buffer: banner, locked, skipped };

  const painted = await detector.detect(banner, { maxFaces: 12 });
  if (painted.length === 0) {
    return { buffer: banner, locked, skipped: persons.map((p) => ({ label: p.label, reason: "no face painted" })) };
  }
  const photos: Array<{ raw: Raw; face: DetectedFace } | null> = [];
  for (const person of persons) {
    const faces = await detector.detect(person.photo, { maxFaces: 1 });
    if (!faces[0]) {
      skipped.push({ label: person.label, reason: "no face in photo" });
      photos.push(null);
      continue;
    }
    const { data, info } = await sharp(person.photo).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    photos.push({ raw: { data, width: info.width, height: info.height }, face: faces[0] });
  }

  const assignment = matchFaces(
    detector,
    photos.map((p) => p?.face ?? null),
    painted,
  );
  const { data, info } = await sharp(banner).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw: Raw = { data, width: info.width, height: info.height };
  for (const [p, person] of persons.entries()) {
    const photo = photos[p];
    const t = assignment[p];
    if (!photo) continue;
    if (t === null || t === undefined) {
      skipped.push({ label: person.label, reason: "no matching painted face" });
      continue;
    }
    const target = painted[t]!;
    const dYaw = Math.abs(target.angle.yaw - photo.face.angle.yaw);
    const dPitch = Math.abs(target.angle.pitch - photo.face.angle.pitch);
    if (dYaw > MAX_YAW_DIFF || dPitch > MAX_PITCH_DIFF) {
      skipped.push({ label: person.label, reason: `head pose differs (yaw ${dYaw.toFixed(2)}, pitch ${dPitch.toFixed(2)})` });
      continue;
    }
    await swapFace(raw, target, photo.raw, photo.face);
    locked.push(person.label);
  }
  if (skipped.length) logger.info({ skipped }, "Face lock skipped some people");
  const buffer = locked.length ? await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 3 } }).png().toBuffer() : banner;
  return { buffer, locked, skipped };
}
