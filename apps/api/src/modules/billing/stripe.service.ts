import Stripe from "stripe";
import type { CheckoutSessionResponse, CheckoutStatusResponse, Currency } from "@bannerai/shared";
import { CREDIT_PACKS } from "@bannerai/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import { AppError, BadRequestError, ServiceUnavailableError } from "../../utils/errors.js";
import { creditsService } from "../credits/credits.service.js";

const PACK_LABEL: Record<string, string> = { starter: "Starter pack", popular: "Popular pack", pro: "Pro pack" };

/**
 * Stripe Checkout (one-time payments, credits only — no subscriptions). Prices are created inline
 * per currency so no dashboard setup is needed. Fulfilment happens in the webhook, with a
 * fallback status check for environments where webhooks are not configured yet.
 */
export class StripeService {
  private readonly stripe: Stripe | null;

  constructor() {
    this.stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, { typescript: true }) : null;
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  private client(): Stripe {
    if (!this.stripe) throw new ServiceUnavailableError("Payments are not configured on the server. Set STRIPE_SECRET_KEY.");
    return this.stripe;
  }

  async createCheckout(user: { id: string; email: string; name: string; stripeCustomerId: string | null }, packId: string, currency: Currency): Promise<CheckoutSessionResponse> {
    const stripe = this.client();
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) throw new BadRequestError("Unknown credit pack");
    const unitAmount = pack.prices[currency];

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: user.id } });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: { name: `${PACK_LABEL[pack.id] ?? pack.id} — ${pack.credits} credits`, description: "Bannerai credits for AI banner generation and edits" },
          },
        },
      ],
      metadata: { userId: user.id, packId: pack.id, credits: String(pack.credits), currency },
      success_url: `${env.FRONTEND_URL}/credits?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/credits?status=cancelled`,
      allow_promotion_codes: true,
    });
    if (!session.url) throw new AppError(502, "stripe_error", "Stripe did not return a checkout URL");
    return { url: session.url, sessionId: session.id };
  }

  /** Verifies the webhook signature and returns the event. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    const stripe = this.client();
    if (!env.STRIPE_WEBHOOK_SECRET) throw new ServiceUnavailableError("STRIPE_WEBHOOK_SECRET is not configured");
    if (!signature) throw new BadRequestError("Missing Stripe signature");
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      throw new BadRequestError(`Invalid Stripe signature: ${(err as Error).message}`);
    }
  }

  /** Fulfils a paid checkout session. Idempotent. Returns true when credits were added now. */
  async fulfil(session: Pick<Stripe.Checkout.Session, "id" | "payment_status" | "metadata" | "amount_total" | "currency" | "client_reference_id">, eventId?: string): Promise<boolean> {
    if (session.payment_status !== "paid") return false;
    const userId = session.metadata?.userId ?? session.client_reference_id;
    const packId = session.metadata?.packId;
    const credits = Number(session.metadata?.credits);
    if (!userId || !packId || !Number.isFinite(credits) || credits <= 0) {
      logger.error({ sessionId: session.id }, "Checkout session is missing credit metadata");
      return false;
    }
    return creditsService.recordPurchase({
      userId,
      credits,
      packId,
      currency: (session.currency ?? "").toLowerCase(),
      amountPaid: session.amount_total ?? 0,
      stripeSessionId: session.id,
      stripeEventId: eventId,
    });
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await this.fulfil(event.data.object, event.id);
        return;
      }
      default:
        logger.debug({ type: event.type }, "Ignoring Stripe event");
    }
  }

  /** Fallback for local/dev without webhooks: the success page asks the API to check the session. */
  async checkoutStatus(userId: string, sessionId: string): Promise<CheckoutStatusResponse> {
    const stripe = this.client();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const owner = session.metadata?.userId ?? session.client_reference_id;
    if (owner !== userId) throw new AppError(404, "not_found", "Checkout session not found");
    let credited = false;
    if (session.payment_status === "paid") credited = await this.fulfil(session);
    const status: CheckoutStatusResponse["status"] = session.payment_status === "paid" ? "paid" : session.status === "expired" ? "expired" : session.status === "open" ? "pending" : "unknown";
    return { status, credited, balance: await creditsService.getBalance(userId) };
  }
}

export const stripeService = new StripeService();
