import request from "supertest";
import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { FakeProvider } from "../../test/fake-provider.js";
import { authenticate, authedUser, createUser, waitFor, withAuth } from "../../test/helpers.js";
import { providerRegistry } from "../ai-providers/registry.js";
import { generationQueue } from "../generations/generation.queue.js";
import { runGeneration } from "../generations/generation.pipeline.js";
import { creditsService } from "./credits.service.js";
import { ProviderError } from "../../utils/errors.js";

const app = createApp();
let fake: FakeProvider;

beforeEach(() => {
  fake = new FakeProvider();
  providerRegistry.register(fake);
  generationQueue.setRunner((id) => runGeneration(id, { registry: providerRegistry, promptOptimizationEnabled: false }));
});

const body = { prompt: "Banner for our youth retreat called RAÍZES in July", aspectRatio: "1:1" };

async function settled(generationId: string) {
  return waitFor(async () => {
    const g = await prisma.bannerGeneration.findUnique({ where: { id: generationId } });
    return g && g.status !== "pending" && g.status !== "running" ? g : null;
  });
}

describe("credits", () => {
  it("grants the free trial exactly once on first /me", async () => {
    const user = await createUser({ creditBalance: 0 });
    await prisma.user.update({ where: { id: user.id }, data: { trialGrantedAt: null } });
    const auth = await authenticate(user);
    const first = await request(app).get("/api/auth/me").set("Cookie", auth.cookie);
    expect(first.body.user.creditBalance).toBe(10);
    const second = await request(app).get("/api/auth/me").set("Cookie", auth.cookie);
    expect(second.body.user.creditBalance).toBe(10);
    const ledger = await withAuth(request(app).get("/api/billing/credits"), auth);
    expect(ledger.body.transactions.map((t: { type: string; amount: number }) => [t.type, t.amount])).toEqual([["trial", 10]]);
  });

  it("holds credits when queuing, charges on success and returns them on failure", async () => {
    const auth = await authenticate(await createUser({ creditBalance: 5 }));
    const res = await withAuth(request(app).post("/api/banners"), auth).send(body);
    expect(res.status).toBe(202);
    expect(res.body.generation.creditsHeld).toBe(3);
    expect(await creditsService.getBalance(auth.user.id)).toBe(2);
    const done = await settled(res.body.generation.id);
    expect(done.status).toBe("succeeded");
    expect(done.creditsCharged).toBe(3);
    expect(await creditsService.getBalance(auth.user.id)).toBe(2);

    // An edit costs 2 → balance 0; a failing one gives the credits back
    fake.failNext = new ProviderError("gemini", "boom");
    const edit = await withAuth(request(app).post(`/api/banners/${res.body.banner.id}/edits`), auth).send({ instruction: "Make the title bigger" });
    expect(edit.status).toBe(202);
    expect(await creditsService.getBalance(auth.user.id)).toBe(0);
    const failed = await settled(edit.body.generation.id);
    expect(failed.status).toBe("failed");
    expect(await creditsService.getBalance(auth.user.id)).toBe(2);
    const ledger = (await withAuth(request(app).get("/api/billing/credits"), auth)).body;
    expect(ledger.transactions.map((t: { type: string; amount: number }) => [t.type, t.amount])).toEqual([
      ["release", 2],
      ["hold", -2],
      ["hold", -3],
    ]);
  });

  it("refuses to queue work without enough credits (402) and never touches the balance", async () => {
    const auth = await authenticate(await createUser({ creditBalance: 2 }));
    const res = await withAuth(request(app).post("/api/banners"), auth).send(body);
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe("insufficient_credits");
    expect(res.body.error.details).toEqual({ required: 3, balance: 2 });
    expect(await prisma.banner.count({ where: { userId: auth.user.id } })).toBe(0);
    expect(await creditsService.getBalance(auth.user.id)).toBe(2);
  });

  it("cannot overspend under concurrent requests", async () => {
    const auth = await authenticate(await createUser({ creditBalance: 4 }));
    const results = await Promise.all(Array.from({ length: 4 }, () => withAuth(request(app).post("/api/banners"), auth).send(body)));
    const accepted = results.filter((r) => r.status === 202).length;
    const refused = results.filter((r) => r.status === 402).length;
    expect(accepted).toBe(1);
    expect(refused).toBe(3);
    expect(await creditsService.getBalance(auth.user.id)).toBe(1);
  });

  it("exposes public pricing", async () => {
    const res = await request(app).get("/api/billing/pricing");
    expect(res.status).toBe(200);
    expect(res.body.costs).toEqual({ generation: 3, edit: 2 });
    expect(res.body.trialCredits).toBe(10);
    expect(res.body.packs.length).toBeGreaterThanOrEqual(3);
    expect(res.body.purchasesEnabled).toBe(true);
  });
});

describe("Stripe webhook", () => {
  const stripe = new Stripe("sk_test_dummy_key_for_signature_tests");

  function signedEvent(payload: object): { body: string; signature: string } {
    const body = JSON.stringify(payload);
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test_dummy_secret" });
    return { body, signature };
  }

  function checkoutCompleted(userId: string, sessionId: string, eventId: string) {
    return {
      id: eventId,
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: sessionId, object: "checkout.session", payment_status: "paid", amount_total: 2500, currency: "brl", client_reference_id: userId, metadata: { userId, packId: "popular", credits: "60", currency: "brl" } } },
    };
  }

  it("credits a paid checkout exactly once, even when delivered twice", async () => {
    const auth = await authedUser();
    const before = await creditsService.getBalance(auth.user.id);
    const { body, signature } = signedEvent(checkoutCompleted(auth.user.id, "cs_test_abc", "evt_1"));
    const first = await request(app).post("/api/billing/webhook").set("stripe-signature", signature).set("Content-Type", "application/json").send(body);
    expect(first.status).toBe(200);
    expect(await creditsService.getBalance(auth.user.id)).toBe(before + 60);

    const again = await request(app).post("/api/billing/webhook").set("stripe-signature", signature).set("Content-Type", "application/json").send(body);
    expect(again.status).toBe(200);
    expect(await creditsService.getBalance(auth.user.id)).toBe(before + 60);

    const sameSessionNewEvent = signedEvent(checkoutCompleted(auth.user.id, "cs_test_abc", "evt_2"));
    await request(app).post("/api/billing/webhook").set("stripe-signature", sameSessionNewEvent.signature).set("Content-Type", "application/json").send(sameSessionNewEvent.body);
    expect(await creditsService.getBalance(auth.user.id)).toBe(before + 60);

    const purchase = await prisma.creditTransaction.findFirst({ where: { userId: auth.user.id, type: "purchase" } });
    expect(purchase).toMatchObject({ amount: 60, packId: "popular", currency: "brl", amountPaid: 2500, stripeSessionId: "cs_test_abc" });
  });

  it("rejects unsigned or tampered payloads", async () => {
    const auth = await authedUser();
    const { body } = signedEvent(checkoutCompleted(auth.user.id, "cs_test_x", "evt_x"));
    expect((await request(app).post("/api/billing/webhook").set("Content-Type", "application/json").send(body)).status).toBe(400);
    const wrong = new Stripe("sk_test_other").webhooks.generateTestHeaderString({ payload: body, secret: "whsec_wrong" });
    expect((await request(app).post("/api/billing/webhook").set("stripe-signature", wrong).set("Content-Type", "application/json").send(body)).status).toBe(400);
    expect((await request(app).post("/api/billing/webhook").set("stripe-signature", "t=1,v1=abc").set("Content-Type", "application/json").send(body)).status).toBe(400);
  });

  it("ignores unpaid sessions", async () => {
    const auth = await authedUser();
    const before = await creditsService.getBalance(auth.user.id);
    const ev = checkoutCompleted(auth.user.id, "cs_test_unpaid", "evt_u");
    ev.data.object.payment_status = "unpaid";
    const { body, signature } = signedEvent(ev);
    expect((await request(app).post("/api/billing/webhook").set("stripe-signature", signature).set("Content-Type", "application/json").send(body)).status).toBe(200);
    expect(await creditsService.getBalance(auth.user.id)).toBe(before);
  });
});
