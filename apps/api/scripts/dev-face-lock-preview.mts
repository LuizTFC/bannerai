// Runs the face lock on a banner file with the given photos, for visual checks.
// Usage: npx tsx scripts/dev-face-lock-preview.mts <banner.png> <out.png> <photo1>::<label> [<photo2>::<label> ...]
import { readFileSync, writeFileSync } from "node:fs";
import { createFaceDetector } from "../src/services/image/face-detector.js";
import { applyFaceLock } from "../src/services/image/face-lock.js";

const [bannerPath, outPath, ...specs] = process.argv.slice(2);
if (!bannerPath || !outPath || specs.length === 0) {
  console.error("Usage: dev-face-lock-preview.mts <banner.png> <out.png> <photo>::<label> ...");
  process.exit(1);
}
const persons = specs.map((spec) => {
  const [file, label] = spec.split("::");
  return { label: label ?? file!, photo: readFileSync(file!) };
});
const detector = createFaceDetector("human");
const started = Date.now();
const result = await applyFaceLock(readFileSync(bannerPath), persons, detector);
writeFileSync(outPath, result.buffer);
console.log(JSON.stringify({ ms: Date.now() - started, locked: result.locked, skipped: result.skipped }));
process.exit(0);
