-- Multiple Brand Kits per user + generic organization naming + banner ↔ brand kit link

-- brand_kits: drop the one-per-user constraint, rename church_name, add name/default/type
DROP INDEX IF EXISTS "brand_kits_user_id_key";
ALTER TABLE "brand_kits" RENAME COLUMN "church_name" TO "organization_name";
ALTER TABLE "brand_kits"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Brand Kit',
  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "organization_type" TEXT;
-- Existing kits (one per user) become the default kit
UPDATE "brand_kits" SET "is_default" = true;
ALTER TABLE "brand_kits" ALTER COLUMN "name" DROP DEFAULT;
CREATE INDEX "brand_kits_user_id_is_default_idx" ON "brand_kits"("user_id", "is_default");

-- banners: optional link to the brand kit that was applied
ALTER TABLE "banners" ADD COLUMN "brand_kit_id" UUID;
ALTER TABLE "banners" ADD CONSTRAINT "banners_brand_kit_id_fkey" FOREIGN KEY ("brand_kit_id") REFERENCES "brand_kits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "banners_brand_kit_id_idx" ON "banners"("brand_kit_id");
