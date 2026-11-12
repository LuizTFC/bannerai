-- Feedback loop: approved versions and preferences learned from edit histories
ALTER TABLE "brand_kits" ADD COLUMN "learned_preferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "banners"
  ADD COLUMN "approved_version_id" UUID,
  ADD COLUMN "approved_at" TIMESTAMP(3);
