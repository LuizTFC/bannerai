-- CreateEnum
CREATE TYPE "AspectRatio" AS ENUM ('16:9', '9:16', '1:1', '4:3');

-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('gemini', 'openai');

-- CreateEnum
CREATE TYPE "BannerStatus" AS ENUM ('draft', 'generating', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('initial', 'edit');

-- CreateEnum
CREATE TYPE "BrandKitAssetType" AS ENUM ('logo', 'reference');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "google_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "aspect_ratio" "AspectRatio" NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "BannerStatus" NOT NULL DEFAULT 'draft',
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "current_version_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_generations" (
    "id" UUID NOT NULL,
    "banner_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "GenerationKind" NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'pending',
    "prompt" TEXT NOT NULL,
    "instruction" TEXT,
    "optimized_prompt" TEXT,
    "aspect_ratio" "AspectRatio" NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "provider" "AiProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "source_version_id" UUID,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "usage" JSONB,
    "provider_metadata" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banner_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_versions" (
    "id" UUID NOT NULL,
    "banner_id" UUID NOT NULL,
    "generation_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "parent_version_id" UUID,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'image/png',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banner_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_images" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "banner_id" UUID,
    "generation_id" UUID,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "church_name" TEXT,
    "primary_color" TEXT,
    "secondary_color" TEXT,
    "accent_colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferred_fonts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kit_assets" (
    "id" UUID NOT NULL,
    "brand_kit_id" UUID NOT NULL,
    "type" "BrandKitAssetType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_kit_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "IDX_session_expire" ON "session"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "banners_current_version_id_key" ON "banners"("current_version_id");

-- CreateIndex
CREATE INDEX "banners_user_id_created_at_idx" ON "banners"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "banner_generations_banner_id_created_at_idx" ON "banner_generations"("banner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "banner_generations_user_id_status_idx" ON "banner_generations"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "banner_versions_generation_id_key" ON "banner_versions"("generation_id");

-- CreateIndex
CREATE INDEX "banner_versions_banner_id_created_at_idx" ON "banner_versions"("banner_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "banner_versions_banner_id_version_number_key" ON "banner_versions"("banner_id", "version_number");

-- CreateIndex
CREATE INDEX "reference_images_user_id_created_at_idx" ON "reference_images"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reference_images_banner_id_idx" ON "reference_images"("banner_id");

-- CreateIndex
CREATE UNIQUE INDEX "brand_kits_user_id_key" ON "brand_kits"("user_id");

-- CreateIndex
CREATE INDEX "brand_kit_assets_brand_kit_id_type_idx" ON "brand_kit_assets"("brand_kit_id", "type");

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "banner_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_generations" ADD CONSTRAINT "banner_generations_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_generations" ADD CONSTRAINT "banner_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_generations" ADD CONSTRAINT "banner_generations_source_version_id_fkey" FOREIGN KEY ("source_version_id") REFERENCES "banner_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_versions" ADD CONSTRAINT "banner_versions_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_versions" ADD CONSTRAINT "banner_versions_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "banner_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_versions" ADD CONSTRAINT "banner_versions_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "banner_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "banner_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kit_assets" ADD CONSTRAINT "brand_kit_assets_brand_kit_id_fkey" FOREIGN KEY ("brand_kit_id") REFERENCES "brand_kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
