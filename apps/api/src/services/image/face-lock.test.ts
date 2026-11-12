import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { DetectedFace, FaceDetector, Point } from "./face-detector.js";
import { applyFaceLock, applySimilarity, convexHull, fitSimilarity, invertSimilarity, matchFaces, shrinkPolygon, similarityScale } from "./face-lock.js";

/** A synthetic face: 468 mesh points on a circle, the silhouette on the same circle. */
function syntheticFace(cx: number, cy: number, radius: number, embedding: number[], angle = { roll: 0, yaw: 0, pitch: 0 }): DetectedFace {
  const mesh: Point[] = Array.from({ length: 468 }, (_, i) => {
    const t = (i / 468) * Math.PI * 2;
    const r = i % 3 === 0 ? radius : radius * 0.6;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
  });
  const silhouette: Point[] = Array.from({ length: 36 }, (_, i) => {
    const t = (i / 36) * Math.PI * 2;
    return [cx + Math.cos(t) * radius, cy + Math.sin(t) * radius];
  });
  return { box: { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 }, score: 1, mesh, silhouette, embedding, angle };
}

/** Detector stub: answers from a map keyed by image width (photos and banner have different sizes). */
class StubDetector implements FaceDetector {
  calls = 0;
  constructor(private readonly byWidth: Record<number, DetectedFace[]>) {}
  async detect(image: Buffer): Promise<DetectedFace[]> {
    this.calls++;
    const { width } = await sharp(image).metadata();
    return this.byWidth[width ?? 0] ?? [];
  }
  similarity(a: number[], b: number[]): number {
    return a[0] === b[0] ? 0.9 : 0.1;
  }
}

describe("similarity transform", () => {
  it("recovers scale, rotation and translation from point pairs and inverts exactly", () => {
    const truth = { a: 2 * Math.cos(0.3), b: 2 * Math.sin(0.3), tx: 40, ty: -15 };
    const src: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 3],
    ];
    const dst = src.map((p) => applySimilarity(truth, p));
    const fit = fitSimilarity(src, dst);
    expect(fit.a).toBeCloseTo(truth.a, 6);
    expect(fit.b).toBeCloseTo(truth.b, 6);
    expect(fit.tx).toBeCloseTo(truth.tx, 6);
    expect(fit.ty).toBeCloseTo(truth.ty, 6);
    expect(similarityScale(fit)).toBeCloseTo(2, 6);
    const back = applySimilarity(invertSimilarity(fit), dst[2]!);
    expect(back[0]).toBeCloseTo(10, 6);
    expect(back[1]).toBeCloseTo(10, 6);
  });

  it("builds a convex hull and shrinks polygons toward their centroid", () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [5, 5],
      [10, 10],
      [0, 10],
      [3, 3],
    ]);
    expect(hull).toHaveLength(4);
    const small = shrinkPolygon(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      0.5,
    );
    expect(small[0]).toEqual([2.5, 2.5]);
    expect(small[2]).toEqual([7.5, 7.5]);
  });
});

describe("matchFaces", () => {
  const detector = new StubDetector({});
  const painted = [syntheticFace(100, 100, 30, [1]), syntheticFace(300, 100, 30, [2]), syntheticFace(500, 100, 30, [3])];

  it("matches by identity first, then by left-to-right order for the rest", () => {
    const photos = [syntheticFace(50, 50, 20, [2]), syntheticFace(50, 50, 20, [9]), syntheticFace(50, 50, 20, [8])];
    // Photo 0 is person 2 (by embedding); photos 1 and 2 are unknown → leftmost free faces in order.
    expect(matchFaces(detector, photos, painted)).toEqual([1, 0, 2]);
  });

  it("leaves people without a face unmatched and never reuses a painted face", () => {
    const photos = [null, syntheticFace(50, 50, 20, [3]), syntheticFace(50, 50, 20, [3])];
    expect(matchFaces(detector, photos, [painted[2]!])).toEqual([null, 0, null]);
  });
});

describe("applyFaceLock", () => {
  const photoSize = 120;
  const bannerW = 400;
  const bannerH = 300;

  async function photoWithPattern(): Promise<Buffer> {
    // Red photo with a white square right of the face center: a texture that must survive the transfer.
    const square = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#fff" } }).png().toBuffer();
    return sharp({ create: { width: photoSize, height: photoSize, channels: 3, background: { r: 200, g: 40, b: 40 } } })
      .composite([{ input: square, left: 66, top: 52 }])
      .png()
      .toBuffer();
  }

  it("pastes the photo's face onto the matching painted face and leaves the rest untouched", async () => {
    const photo = await photoWithPattern();
    const banner = await sharp({ create: { width: bannerW, height: bannerH, channels: 3, background: { r: 30, g: 60, b: 200 } } }).png().toBuffer();
    const detector = new StubDetector({
      [photoSize]: [syntheticFace(60, 60, 40, [7])],
      [bannerW]: [syntheticFace(200, 150, 80, [7])],
    });
    const result = await applyFaceLock(banner, [{ label: "Guest", photo }], detector);
    expect(result.locked).toEqual(["Guest"]);
    expect(result.skipped).toEqual([]);
    expect(detector.calls).toBe(2);

    const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [data[(y * info.width + x) * 3]!, data[(y * info.width + x) * 3 + 1]!, data[(y * info.width + x) * 3 + 2]!];
    // Outside the face: original blue.
    expect(px(10, 10)).toEqual([30, 60, 200]);
    expect(px(390, 290)).toEqual([30, 60, 200]);
    // Inside the face: the photo's white square landed at twice its photo offset (scale 2) and is brighter than its surroundings.
    const [sr, sg, sb] = px(200 + 2 * (74 - 60), 150);
    const [fr, fg, fb] = px(200 - 40, 150);
    expect(sr + sg + sb).toBeGreaterThan(fr + fg + fb + 60);
    // The face region no longer carries the painted blue.
    expect(fb).toBeLessThan(fr + fg);
  });

  it("skips people whose head pose differs too much and people without a face", async () => {
    const photo = await photoWithPattern();
    const banner = await sharp({ create: { width: bannerW, height: bannerH, channels: 3, background: "#204080" } }).png().toBuffer();
    const detector = new StubDetector({
      [photoSize]: [syntheticFace(60, 60, 40, [7], { roll: 0, yaw: 0.9, pitch: 0 })],
      [bannerW]: [syntheticFace(200, 150, 80, [7])],
    });
    const result = await applyFaceLock(banner, [{ label: "Turned", photo }, { label: "Logo", photo: await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).png().toBuffer() }], detector);
    expect(result.locked).toEqual([]);
    expect(result.skipped.map((s) => s.label)).toEqual(["Logo", "Turned"]);
    expect(result.buffer).toBe(banner);
  });

  it("does nothing when the model painted no face", async () => {
    const banner = await sharp({ create: { width: bannerW, height: bannerH, channels: 3, background: "#204080" } }).png().toBuffer();
    const detector = new StubDetector({ [photoSize]: [syntheticFace(60, 60, 40, [7])] });
    const result = await applyFaceLock(banner, [{ label: "Guest", photo: await photoWithPattern() }], detector);
    expect(result.locked).toEqual([]);
    expect(result.skipped).toEqual([{ label: "Guest", reason: "no face painted" }]);
  });
});
