import { Router } from "express";
import {
  approveVersionSchema,
  createBannerSchema,
  editBannerSchema,
  paginationQuerySchema,
  restoreVersionSchema,
  updateBannerSchema,
  type ApproveVersionInput,
  type CreateBannerPayload,
  type EditBannerPayload,
  type PaginationQuery,
  type UpdateBannerInput,
} from "@bannerai/shared";
import { generationRateLimiter } from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { getValidated, validate } from "../../middleware/validate.js";
import { BadRequestError } from "../../utils/errors.js";
import { isUuid } from "../../utils/ids.js";
import { bannersService } from "./banners.service.js";

export const bannersRouter = Router();

bannersRouter.use(requireAuth);

const requireId = (value: unknown): string => {
  if (!isUuid(value)) throw new BadRequestError("Invalid id");
  return value;
};

bannersRouter.get("/", validate(paginationQuerySchema, "query"), async (req, res) => {
  const { page, pageSize } = getValidated<PaginationQuery>(req, "query");
  res.json(await bannersService.list(req.user!.id, page, pageSize));
});

bannersRouter.post("/", generationRateLimiter, validate(createBannerSchema), async (req, res) => {
  const input = getValidated<CreateBannerPayload>(req);
  const result = await bannersService.create(req.user!, input);
  res.status(202).json(result);
});

bannersRouter.get("/:id", async (req, res) => {
  res.json({ banner: await bannersService.get(req.user!.id, requireId(req.params.id)) });
});

bannersRouter.patch("/:id", validate(updateBannerSchema), async (req, res) => {
  const input = getValidated<UpdateBannerInput>(req);
  if (!input.title) throw new BadRequestError("Nothing to update");
  res.json({ banner: await bannersService.updateTitle(req.user!.id, requireId(req.params.id), input.title) });
});

bannersRouter.delete("/:id", async (req, res) => {
  await bannersService.delete(req.user!.id, requireId(req.params.id));
  res.status(204).end();
});

bannersRouter.post("/:id/edits", generationRateLimiter, validate(editBannerSchema), async (req, res) => {
  const input = getValidated<EditBannerPayload>(req);
  res.status(202).json(await bannersService.edit(req.user!, requireId(req.params.id), input));
});

bannersRouter.post("/:id/generations/:generationId/retry", generationRateLimiter, async (req, res) => {
  res.status(202).json(await bannersService.retry(req.user!, requireId(req.params.id), requireId(req.params.generationId)));
});

bannersRouter.post("/:id/approve", validate(approveVersionSchema), async (req, res) => {
  const { versionId, addToBrandKit } = getValidated<ApproveVersionInput>(req);
  res.json(await bannersService.approve(req.user!.id, requireId(req.params.id), versionId, addToBrandKit ?? true));
});

bannersRouter.post("/:id/restore", validate(restoreVersionSchema), async (req, res) => {
  const { versionId } = getValidated<{ versionId: string }>(req);
  res.json({ banner: await bannersService.restoreVersion(req.user!.id, requireId(req.params.id), versionId) });
});
