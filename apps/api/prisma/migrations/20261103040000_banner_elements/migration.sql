-- Per-banner uploads can now be style references or content elements with a caption
CREATE TYPE "ReferenceKind" AS ENUM ('reference', 'element');
ALTER TABLE "reference_images"
  ADD COLUMN "kind" "ReferenceKind" NOT NULL DEFAULT 'reference',
  ADD COLUMN "label" TEXT;
