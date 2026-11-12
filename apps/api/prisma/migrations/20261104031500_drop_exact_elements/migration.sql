-- Exact faces are now restored on the painted people (face lock); the bare artwork and cut-out files are no longer kept.
ALTER TABLE "banner_versions" DROP COLUMN "artwork_storage_key";
ALTER TABLE "reference_images" DROP COLUMN "cutout_storage_key";
