import { Router } from "express";
import { userSettingsSchema, type UserSettings } from "@bannerai/shared";
import { requireAuth } from "../../middleware/require-auth.js";
import { getValidated, validate } from "../../middleware/validate.js";
import { toUserDto, usersService } from "./users.service.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.patch("/me/settings", validate(userSettingsSchema), async (req, res) => {
  const patch = getValidated<UserSettings>(req);
  const user = await usersService.updateSettings(req.user!.id, patch);
  res.json({ user: toUserDto(user) });
});
