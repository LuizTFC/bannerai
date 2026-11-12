import { Router } from "express";
import { prisma } from "../../database/prisma.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { isUuid } from "../../utils/ids.js";
import { toGenerationDto } from "../banners/banners.mapper.js";

export const generationsRouter = Router();

generationsRouter.use(requireAuth);

/** Polled by the frontend while a job is running. */
generationsRouter.get("/:id", async (req, res) => {
  if (!isUuid(req.params.id)) throw new BadRequestError("Invalid id");
  const generation = await prisma.bannerGeneration.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { resultVersion: { select: { id: true } } },
  });
  if (!generation) throw new NotFoundError("Generation not found");
  res.json({ generation: toGenerationDto(generation, generation.resultVersion?.id ?? null) });
});
