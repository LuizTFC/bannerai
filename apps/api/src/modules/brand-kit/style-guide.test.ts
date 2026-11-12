import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { FakeProvider } from "../../test/fake-provider.js";
import { authedUser, pngBuffer, waitFor, withAuth } from "../../test/helpers.js";
import { providerRegistry } from "../ai-providers/registry.js";
import { generationQueue } from "../generations/generation.queue.js";
import { runGeneration } from "../generations/generation.pipeline.js";
import { brandKitService } from "./brand-kit.service.js";
import { analyzeBrandKit, ensureStyleGuide, isStyleGuideStale, referencesHash } from "./style-guide.service.js";

const app = createApp();
let fake: FakeProvider;

const GUIDE_JSON = JSON.stringify({
  summary: "Bold condensed titles over photos with teal info cards.",
  layout: "Title top, three info cards bottom-left, footer line.",
  typography: "Heavy condensed uppercase sans for titles; rounded sans for details.",
  colors: "Teal #0E8F8C backgrounds, white titles, amber #FFC857 accents.",
  devices: "Rounded info cards with calendar/clock/pin icons; footer band.",
  imagery: "Warm photos with soft bokeh behind the title.",
  logoUsage: "Small logo top-left in white.",
  mood: "Welcoming and energetic.",
  doNot: ["No neon colors", "No thin fonts"],
});

beforeEach(() => {
  fake = new FakeProvider();
  fake.textResponse = GUIDE_JSON;
  providerRegistry.register(fake);
  generationQueue.setRunner((id) => runGeneration(id, { registry: providerRegistry, promptOptimizationEnabled: false }));
});

describe("brand visual system (style guide)", () => {
  it("is extracted from the reference banners and persisted with a source hash", async () => {
    const auth = await authedUser();
    const kit = await brandKitService.create(auth.user.id, "Main");
    expect(referencesHash(kit)).toBeNull();
    expect(await analyzeBrandKit(kit, fake)).toBeNull();

    const withRefs = await brandKitService.addReferences(auth.user.id, kit.id, [
      { buffer: await pngBuffer(), originalname: "a.png" },
      { buffer: await pngBuffer(), originalname: "b.png" },
    ]);
    expect(isStyleGuideStale(withRefs)).toBe(true);
    const guide = await analyzeBrandKit(withRefs, fake);
    expect(guide?.layout).toContain("Title top");
    expect(guide?.doNot).toEqual(["No neon colors", "No thin fonts"]);
    expect(fake.textCalls).toHaveLength(1);
    expect(fake.textCalls[0]?.images).toHaveLength(2);

    const stored = await brandKitService.findOwned(auth.user.id, kit.id);
    expect(isStyleGuideStale(stored)).toBe(false);
    expect(stored.styleGuideSourceHash).toBe(referencesHash(stored));

    // Unchanged references → no new analysis
    await ensureStyleGuide(stored, fake);
    expect(fake.textCalls).toHaveLength(1);

    // Adding a reference makes it stale again
    const changed = await brandKitService.addReferences(auth.user.id, kit.id, [{ buffer: await pngBuffer(), originalname: "c.png" }]);
    expect(isStyleGuideStale(changed)).toBe(true);
  });

  it("survives analysis failures and missing providers", async () => {
    const auth = await authedUser();
    const kit = await brandKitService.create(auth.user.id, "Main");
    const withRefs = await brandKitService.addReferences(auth.user.id, kit.id, [{ buffer: await pngBuffer(), originalname: "a.png" }]);
    expect(await ensureStyleGuide(withRefs, null)).toBeNull();
    fake.textResponse = "not json";
    expect(await ensureStyleGuide(withRefs, fake)).toBeNull();
  });

  it("is exposed by the API and can be refreshed on demand", async () => {
    const auth = await authedUser();
    const created = await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "Main" });
    const id = created.body.brandKit.id as string;
    await withAuth(request(app).post(`/api/brand-kits/${id}/references`), auth).attach("files", await pngBuffer(), "a.png");
    // background analysis is scheduled; wait for it
    const analyzed = await waitFor(async () => {
      const k = await prisma.brandKit.findUnique({ where: { id } });
      return k?.styleGuide ? k : null;
    });
    expect(analyzed.styleGuideUpdatedAt).toBeTruthy();
    const res = await withAuth(request(app).get(`/api/brand-kits/${id}`), auth);
    expect(res.body.brandKit.styleGuide.summary).toContain("teal");
    expect(res.body.brandKit.styleGuideStale).toBe(false);

    fake.textResponse = JSON.stringify({ ...JSON.parse(GUIDE_JSON), summary: "Refreshed summary." });
    const refreshed = await withAuth(request(app).post(`/api/brand-kits/${id}/analyze`), auth);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.brandKit.styleGuide.summary).toBe("Refreshed summary.");
  });

  it("feeds the visual system, the brand references and the template into the generation prompt", async () => {
    const auth = await authedUser();
    const created = await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "Main" });
    const id = created.body.brandKit.id as string;
    const refs = await withAuth(request(app).post(`/api/brand-kits/${id}/references`), auth)
      .attach("files", await pngBuffer(), "a.png")
      .attach("files", await pngBuffer(), "b.png");
    const templateId = refs.body.brandKit.references[1].id as string;

    const res = await withAuth(request(app).post("/api/banners"), auth).send({
      prompt: "Banner for our youth retreat called RAÍZES in September",
      aspectRatio: "16:9",
      settings: { templateAssetId: templateId },
    });
    expect(res.status).toBe(202);
    await waitFor(async () => {
      const g = await prisma.bannerGeneration.findUnique({ where: { id: res.body.generation.id } });
      return g && g.status === "succeeded" ? g : null;
    });
    const call = fake.generateCalls[0]!;
    expect(call.references.map((r) => r.role)).toEqual(["brand-template", "brand-reference"]);
    expect(call.prompt).toContain("TEMPLATE (highest priority)");
    expect(call.prompt).toContain("BRAND DESIGN SYSTEM (mandatory)");
    expect(call.prompt).toContain("BRAND VISUAL SYSTEM");
    expect(call.prompt).toContain("Title top, three info cards");
    expect(call.prompt).toContain("Never: No neon colors; No thin fonts");

    // A template that is not a reference of the selected kit is rejected
    const bad = await withAuth(request(app).post("/api/banners"), auth).send({ prompt: "Another banner for the retreat in September", aspectRatio: "1:1", settings: { templateAssetId: "00000000-0000-4000-8000-000000000000" } });
    expect(bad.status).toBe(400);
  });
});
