import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { FakeProvider } from "../../test/fake-provider.js";
import { authedUser, pngBuffer, waitFor, withAuth, type AuthContext } from "../../test/helpers.js";
import { providerRegistry } from "../ai-providers/registry.js";
import { generationQueue } from "../generations/generation.queue.js";
import { runGeneration } from "../generations/generation.pipeline.js";
import { mergePreferences } from "./learning.service.js";

const app = createApp();
let fake: FakeProvider;

beforeEach(() => {
  fake = new FakeProvider();
  providerRegistry.register(fake);
  generationQueue.setRunner((id) => runGeneration(id, { registry: providerRegistry, promptOptimizationEnabled: false }));
});

async function settled(generationId: string) {
  return waitFor(async () => {
    const g = await prisma.bannerGeneration.findUnique({ where: { id: generationId } });
    return g && g.status !== "pending" && g.status !== "running" ? g : null;
  });
}

async function bannerWithEdits(auth: AuthContext, kitId?: string) {
  const res = await withAuth(request(app).post("/api/banners"), auth).send({ prompt: "Banner for our youth retreat called RAÍZES in July with guests", aspectRatio: "9:16", ...(kitId ? { brandKitId: kitId } : {}) });
  await settled(res.body.generation.id);
  const id = res.body.banner.id as string;
  for (const instruction of ["Put the guests together as the hero", "Use outlined translucent cards"]) {
    const edit = await withAuth(request(app).post(`/api/banners/${id}/edits`), auth).send({ instruction });
    await settled(edit.body.generation.id);
  }
  return (await withAuth(request(app).get(`/api/banners/${id}`), auth)).body.banner as { id: string; versions: Array<{ id: string }> };
}

describe("approval feedback loop", () => {
  it("merges learned rules without duplicates and respects the cap", () => {
    const merged = mergePreferences(["Keep the logo centered at the top."], ["keep the logo centered at the top", "Use outlined translucent info cards."]);
    expect(merged).toEqual(["Keep the logo centered at the top.", "Use outlined translucent info cards."]);
    const many = mergePreferences([], Array.from({ length: 20 }, (_, i) => `Rule ${i}`));
    expect(many).toHaveLength(15);
    expect(many[0]).toBe("Rule 5");
  });

  it("approving a banner learns preferences from the edit history, stores them on the kit and reuses them", async () => {
    const auth = await authedUser();
    const kit = (await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "Main" })).body.brandKit;
    const banner = await bannerWithEdits(auth, kit.id);
    const final = banner.versions.at(-1)!;

    fake.textResponse = JSON.stringify({ rules: ["Show the guests together as one group cut-out over a dark gradient.", "Use outlined translucent info cards instead of solid ones."] });
    const approve = await withAuth(request(app).post(`/api/banners/${banner.id}/approve`), auth).send({ versionId: final.id });
    expect(approve.status).toBe(200);
    expect(approve.body.learned).toHaveLength(2);
    expect(approve.body.addedToBrandKit).toBe(true);
    expect(approve.body.banner.approvedVersionId).toBe(final.id);
    // The learning call saw the brief, the ordered edits and both images
    const call = fake.textCalls.at(-1)!;
    expect(call.prompt).toContain("1. Put the guests together as the hero");
    expect(call.prompt).toContain("2. Use outlined translucent cards");
    expect(call.images).toHaveLength(2);

    const kitAfter = (await withAuth(request(app).get(`/api/brand-kits/${kit.id}`), auth)).body.brandKit;
    expect(kitAfter.learnedPreferences).toHaveLength(2);
    expect(kitAfter.references).toHaveLength(1); // the approved PNG became a brand reference

    // Next generation receives the learned preferences
    const next = await withAuth(request(app).post("/api/banners"), auth).send({ prompt: "Banner for the worship night in August", aspectRatio: "1:1", brandKitId: kit.id });
    await settled(next.body.generation.id);
    const prompt = fake.generateCalls.at(-1)!.prompt;
    expect(prompt).toContain("LEARNED PREFERENCES");
    expect(prompt).toContain("outlined translucent info cards");

    // Preferences can be edited/removed through the kit
    const trimmed = await withAuth(request(app).patch(`/api/brand-kits/${kit.id}`), auth).send({ learnedPreferences: [kitAfter.learnedPreferences[0]] });
    expect(trimmed.body.brandKit.learnedPreferences).toHaveLength(1);
  });

  it("approving without a brand kit or without edits learns nothing and never fails", async () => {
    const auth = await authedUser();
    const res = await withAuth(request(app).post("/api/banners"), auth).send({ prompt: "Banner for our school science fair in May", aspectRatio: "16:9", settings: { useBrandKit: false } });
    await settled(res.body.generation.id);
    const banner = (await withAuth(request(app).get(`/api/banners/${res.body.banner.id}`), auth)).body.banner;
    const approve = await withAuth(request(app).post(`/api/banners/${banner.id}/approve`), auth).send({ versionId: banner.versions[0].id });
    expect(approve.status).toBe(200);
    expect(approve.body.learned).toEqual([]);
    expect(approve.body.addedToBrandKit).toBe(false);
    const other = await authedUser();
    expect((await withAuth(request(app).post(`/api/banners/${banner.id}/approve`), other).send({ versionId: banner.versions[0].id })).status).toBe(404);
  });
});
