import express, { Router, type RequestHandler } from "express";
import { createCheckoutSchema, paginationQuerySchema, type CreateCheckoutInput, type Currency, type PaginationQuery } from "@bannerai/shared";
import { authRateLimiter } from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { getValidated, validate } from "../../middleware/validate.js";
import { BadRequestError } from "../../utils/errors.js";
import { creditsService } from "../credits/credits.service.js";
import { parseUserSettings } from "../users/users.service.js";
import { stripeService } from "./stripe.service.js";

export const billingRouter = Router();

const currencyFor = (user: { settings: unknown } | undefined, requested?: Currency): Currency => {
  if (requested) return requested;
  const lang = user ? parseUserSettings(user.settings).uiLanguage : undefined;
  return lang === "pt-BR" ? "brl" : "usd";
};

/** Public pricing (landing page + credits page). */
billingRouter.get("/pricing", (req, res) => {
  res.json(creditsService.pricing(currencyFor(req.user)));
});

billingRouter.get("/credits", requireAuth, validate(paginationQuerySchema, "query"), async (req, res) => {
  const { pageSize } = getValidated<PaginationQuery>(req, "query");
  res.json(await creditsService.overview(req.user!.id, pageSize));
});

billingRouter.post("/checkout", requireAuth, authRateLimiter, validate(createCheckoutSchema), async (req, res) => {
  const { packId, currency } = getValidated<CreateCheckoutInput>(req);
  res.status(201).json(await stripeService.createCheckout(req.user!, packId, currencyFor(req.user, currency)));
});

billingRouter.get("/checkout/:sessionId", requireAuth, async (req, res) => {
  const id = req.params.sessionId;
  if (typeof id !== "string" || !/^cs_[a-zA-Z0-9_]+$/.test(id)) throw new BadRequestError("Invalid session id");
  res.json(await stripeService.checkoutStatus(req.user!.id, id));
});

/**
 * Stripe webhook. Mounted by the app with a raw body parser and outside the CSRF/session chain:
 * authenticity comes from the Stripe signature, not from cookies.
 */
export const stripeWebhookHandlers: RequestHandler[] = [
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    const event = stripeService.parseWebhook(req.body as Buffer, req.get("stripe-signature"));
    await stripeService.handleEvent(event);
    res.json({ received: true });
  },
];
