import { Router } from "express";
import {
  MAX_BRAND_KIT_REFERENCES,
  createBrandKitSchema,
  updateBrandKitSchema,
  type BrandKitListResponse,
  type CreateBrandKitInput,
  type UpdateBrandKitPayload,
} from "@bannerai/shared";
import { z } from "zod";
import { uploadRateLimiter } from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { getValidated, validate } from "../../middleware/validate.js";
import { BadRequestError } from "../../utils/errors.js";
import { isUuid } from "../../utils/ids.js";
import { createUploader } from "../uploads/upload.middleware.js";
import { logger } from "../../config/logger.js";
import { providerRegistry } from "../ai-providers/registry.js";
import { brandKitService, toBrandKitDto, type BrandKitWithAssets } from "./brand-kit.service.js";
import { analyzeBrandKit } from "./style-guide.service.js";

/** Re-analyzes the visual system in the background after references change. */
function scheduleAnalysis(kit: BrandKitWithAssets): void {
  setTimeout(() => {
    analyzeBrandKit(kit, providerRegistry.textProviders()).catch((err) => logger.warn({ err, brandKitId: kit.id }, "Background brand analysis failed"));
  }, 0);
}

export const brandKitsRouter = Router();
const uploader = createUploader(MAX_BRAND_KIT_REFERENCES);

const requireId = (value: unknown): string => {
  if (!isUuid(value)) throw new BadRequestError("Invalid id");
  return value;
};

brandKitsRouter.use(requireAuth);

brandKitsRouter.get("/", async (req, res) => {
  const kits = await brandKitService.list(req.user!.id);
  const body: BrandKitListResponse = { brandKits: kits.map(toBrandKitDto) };
  res.json(body);
});

brandKitsRouter.post("/", validate(createBrandKitSchema), async (req, res) => {
  const { name } = getValidated<CreateBrandKitInput>(req);
  const kit = await brandKitService.create(req.user!.id, name);
  res.status(201).json({ brandKit: toBrandKitDto(kit) });
});

brandKitsRouter.get("/:id", async (req, res) => {
  const kit = await brandKitService.findOwned(req.user!.id, requireId(req.params.id));
  res.json({ brandKit: toBrandKitDto(kit) });
});

brandKitsRouter.patch("/:id", validate(updateBrandKitSchema), async (req, res) => {
  const patch = getValidated<UpdateBrandKitPayload>(req);
  const kit = await brandKitService.update(req.user!.id, requireId(req.params.id), patch);
  res.json({ brandKit: toBrandKitDto(kit) });
});

brandKitsRouter.delete("/:id", async (req, res) => {
  await brandKitService.delete(req.user!.id, requireId(req.params.id));
  res.status(204).end();
});

brandKitsRouter.post("/:id/default", async (req, res) => {
  const kit = await brandKitService.setDefault(req.user!.id, requireId(req.params.id));
  res.json({ brandKit: toBrandKitDto(kit) });
});

const clearSchema = z.object({ field: z.enum(["organizationName", "organizationType", "primaryColor", "secondaryColor", "instructions"]) });
brandKitsRouter.post("/:id/clear", validate(clearSchema), async (req, res) => {
  const { field } = getValidated<z.infer<typeof clearSchema>>(req);
  const kit = await brandKitService.clearField(req.user!.id, requireId(req.params.id), field);
  res.json({ brandKit: toBrandKitDto(kit) });
});

brandKitsRouter.post("/:id/logo", uploadRateLimiter, uploader.single("file"), async (req, res) => {
  if (!req.file) throw new BadRequestError("Attach the logo image in the `file` field");
  const kit = await brandKitService.setLogo(req.user!.id, requireId(req.params.id), req.file);
  res.status(201).json({ brandKit: toBrandKitDto(kit) });
});

brandKitsRouter.post("/:id/references", uploadRateLimiter, uploader.array("files", MAX_BRAND_KIT_REFERENCES), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new BadRequestError("Attach at least one image in the `files` field");
  const kit = await brandKitService.addReferences(req.user!.id, requireId(req.params.id), files);
  scheduleAnalysis(kit);
  res.status(201).json({ brandKit: toBrandKitDto(kit) });
});

/** Runs the visual-system analysis now and returns the refreshed kit. */
brandKitsRouter.post("/:id/analyze", async (req, res) => {
  const kit = await brandKitService.findOwned(req.user!.id, requireId(req.params.id));
  await analyzeBrandKit(kit, providerRegistry.textProviders());
  res.json({ brandKit: toBrandKitDto(await brandKitService.findOwned(req.user!.id, kit.id)) });
});

brandKitsRouter.delete("/:id/assets/:assetId", async (req, res) => {
  const kit = await brandKitService.removeAsset(req.user!.id, requireId(req.params.id), requireId(req.params.assetId));
  if (kit.assets.some((a) => a.type === "reference")) scheduleAnalysis(kit);
  res.json({ brandKit: toBrandKitDto(kit) });
});
