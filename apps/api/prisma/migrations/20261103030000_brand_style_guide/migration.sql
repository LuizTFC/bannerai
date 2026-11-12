-- Persisted visual-system analysis of a Brand Kit's reference banners
ALTER TABLE "brand_kits"
  ADD COLUMN "style_guide" JSONB,
  ADD COLUMN "style_guide_source_hash" TEXT,
  ADD COLUMN "style_guide_updated_at" TIMESTAMP(3);
