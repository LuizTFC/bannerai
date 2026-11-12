import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Human as HumanInstance } from "@vladmandic/human";
import sharp from "sharp";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export type Point = [number, number];

export interface DetectedFace {
  /** Bounding box in image pixels. */
  box: { x: number; y: number; width: number; height: number };
  /** Detection confidence 0–1. */
  score: number;
  /** The 468 MediaPipe FaceMesh landmarks, in image pixels. */
  mesh: Point[];
  /** Face oval (36 landmarks, ordered around the face). */
  silhouette: Point[];
  /** Identity embedding, used to match a photo to the face the model painted. */
  embedding: number[];
  /** Head pose in radians. */
  angle: { roll: number; yaw: number; pitch: number };
}

export interface FaceDetector {
  detect(image: Buffer, options?: { maxFaces?: number }): Promise<DetectedFace[]>;
  /** Similarity between two embeddings, 0–1 (1 = same person). */
  similarity(a: number[], b: number[]): number;
}

/** Detector that never finds a face: disables face locking (tests, constrained hosts). */
export class NoopFaceDetector implements FaceDetector {
  async detect(): Promise<DetectedFace[]> {
    return [];
  }
  similarity(): number {
    return 0;
  }
}

/**
 * Face detection, mesh landmarks and identity embeddings with `@vladmandic/human` running on the
 * TensorFlow.js WASM backend (no native build). Models ship inside the package and load lazily on
 * first use (~1 s), then each image takes ~100–300 ms on CPU.
 */
export class HumanFaceDetector implements FaceDetector {
  private loading: Promise<HumanInstance> | null = null;
  private human: HumanInstance | null = null;

  private load(): Promise<HumanInstance> {
    this.loading ??= (async () => {
      const require = createRequire(import.meta.url);
      // The package's export map only exposes the tfjs-node build; the WASM build lives next to it.
      const humanDir = dirname(dirname(require.resolve("@vladmandic/human")));
      const wasmDir = dirname(require.resolve("@tensorflow/tfjs-backend-wasm"));
      const { Human } = require(join(humanDir, "dist", "human.node-wasm.js")) as { Human: new (config: object) => HumanInstance };
      const human = new Human({
        backend: "wasm",
        wasmPath: `${wasmDir}/`,
        wasmPlatformFetch: false,
        modelBasePath: `${pathToFileURL(join(humanDir, "models")).href}/`,
        debug: false,
        cacheSensitivity: 0,
        filter: { enabled: false },
        face: {
          enabled: true,
          detector: { rotation: true, maxDetected: 12, minConfidence: 0.3 },
          mesh: { enabled: true },
          iris: { enabled: false },
          description: { enabled: true },
          emotion: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
      });
      const started = Date.now();
      await withFileFetch(() => human.load());
      await human.warmup();
      logger.info({ ms: Date.now() - started, backend: human.tf.getBackend() }, "Face detector ready");
      this.human = human;
      return human;
    })();
    return this.loading;
  }

  /** Detections run one at a time: the Human instance keeps per-run state and the WASM backend is single-threaded. */
  detect(image: Buffer, options?: { maxFaces?: number }): Promise<DetectedFace[]> {
    const run = this.queue.then(() => this.detectNow(image, options));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private queue: Promise<void> = Promise.resolve();

  private async detectNow(image: Buffer, options?: { maxFaces?: number }): Promise<DetectedFace[]> {
    const human = await this.load();
    const { data, info } = await sharp(image).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tensor = human.tf.tensor3d(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), [info.height, info.width, 3], "int32");
    try {
      const result = await human.detect(tensor);
      const faces: DetectedFace[] = [];
      for (const face of result.face) {
        const silhouette = face.annotations?.silhouette;
        if (!face.mesh || face.mesh.length < 468 || !silhouette?.length || !face.embedding?.length) continue;
        faces.push({
          box: { x: face.box[0], y: face.box[1], width: face.box[2], height: face.box[3] },
          score: face.score,
          mesh: face.mesh.map((p) => [p[0], p[1]] as Point),
          silhouette: silhouette.map((p) => [p[0], p[1]] as Point),
          embedding: face.embedding,
          angle: face.rotation?.angle ?? { roll: 0, yaw: 0, pitch: 0 },
        });
      }
      faces.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
      return faces.slice(0, options?.maxFaces ?? faces.length);
    } finally {
      tensor.dispose();
    }
  }

  similarity(a: number[], b: number[]): number {
    if (this.human) return this.human.match.similarity(a, b);
    // Cosine similarity, only reachable before the first detection.
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i]! * b[i]!;
      na += a[i]! * a[i]!;
      nb += b[i]! * b[i]!;
    }
    return na && nb ? Math.max(0, dot / Math.sqrt(na * nb)) : 0;
  }
}

/**
 * Human loads its models through `fetch`, which Node does not implement for `file:` URLs. The
 * wrapper is installed only while the models load and passes every other URL through untouched.
 */
async function withFileFetch<T>(fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("file:")) return realFetch(input, init);
    const body = await readFile(fileURLToPath(url));
    return new Response(body, { status: 200, headers: { "content-type": url.endsWith(".json") ? "application/json" : "application/octet-stream" } });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

export function createFaceDetector(provider: "human" | "none" = env.FACE_LOCK_PROVIDER): FaceDetector {
  return provider === "human" ? new HumanFaceDetector() : new NoopFaceDetector();
}

export const faceDetector: FaceDetector = createFaceDetector();
