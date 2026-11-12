import { env } from "../../config/env.js";
import { generationQueue } from "./generation.queue.js";
import { runGeneration } from "./generation.pipeline.js";

export { generationQueue, runGeneration };

/** Wires the queue to the pipeline and starts consuming jobs. */
export async function startGenerationWorker(): Promise<void> {
  generationQueue.setRunner((id, attempt) => runGeneration(id, undefined, attempt));
  await generationQueue.startWorker();
}

/** Only wires the runner (API instances that do not consume jobs). */
export function wireGenerationQueue(): void {
  generationQueue.setRunner((id, attempt) => runGeneration(id, undefined, attempt));
}

export const shouldRunWorker = (): boolean => env.RUN_WORKER;
