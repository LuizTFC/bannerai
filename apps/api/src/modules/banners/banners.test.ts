import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { storage } from "../../services/storage/index.js";
import { FakeProvider } from "../../test/fake-provider.js";
import { authedUser, pngBuffer, waitFor, withAuth, type AuthContext } from "../../test/helpers.js";
import { providerRegistry } from "../ai-providers/registry.js";
import { generationQueue } from "../generations/generation.queue.js";
import { runGeneration } from "../generations/generation.pipeline.js";
import { ProviderError } from "../../utils/errors.js";

const app = createApp();
let fake: FakeProvider;

beforeEach(() => {
  fake = new FakeProvider();
  providerRegistry.register(fake);
  generationQueue.setRunner((id) => runGeneration(id, { registry: providerRegistry, promptOptimizationEnabled: true }));
});

const validBody = { prompt: 'Banner for our youth conference called "SEM FILTRO" on October 24', aspectRatio: "16:9", settings: { designStyle: "cinematic" } };

async function createAndWait(auth: AuthContext, body: Record<string, unknown> = validBody) {
  const res = await withAuth(request(app).post("/api/banners"), auth).send(body);
  expect(res.status).toBe(202);
  const bannerId = res.body.banner.id as string;
  const generationId = res.body.generation.id as string;
  const generation = await waitFor(async () => {
    const g = await prisma.bannerGeneration.findUnique({ where: { id: generationId } });
    return g && (g.status === "succeeded" || g.status === "failed") ? g : null;
  });
  return { bannerId, generationId, generation };
}

describe("banner generation", () => {
  it("validates the request body", async () => {
    const auth = await authedUser();
    const res = await withAuth(request(app).post("/api/banners"), auth).send({ prompt: "short", aspectRatio: "3:2" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("validation_error");
    const issues = res.body.error.details as Array<{ path: string[] }>;
    expect(issues.map((i) => i.path.join("."))).toEqual(expect.arrayContaining(["prompt", "aspectRatio"]));
    const badColor = await withAuth(request(app).post("/api/banners"), auth).send({ ...validBody, settings: { primaryColor: "red" } });
    expect(badColor.status).toBe(422);
    const badRef = await withAuth(request(app).post("/api/banners"), auth).send({ ...validBody, referenceImageIds: ["not-a-uuid"] });
    expect(badRef.status).toBe(422);
  });

  it("creates a banner, runs the pipeline and persists a PNG version", async () => {
    const auth = await authedUser();
    const { bannerId, generation } = await createAndWait(auth);
    expect(generation.status).toBe("succeeded");
    expect(generation.optimizedPrompt).toContain("optimized prompt text");
    expect(generation.optimizedPrompt).toContain("NON-NEGOTIABLE CONSTRAINTS");
    expect(generation.durationMs).toBeGreaterThanOrEqual(0);
    expect(generation.usage).toMatchObject({ outputTokens: 10 });

    const res = await withAuth(request(app).get(`/api/banners/${bannerId}`), auth);
    expect(res.status).toBe(200);
    const banner = res.body.banner;
    expect(banner.status).toBe("ready");
    expect(banner.title).toBe("SEM FILTRO"); // named by the (fake) text model
    expect(banner.versions).toHaveLength(1);
    expect(banner.currentVersion.versionNumber).toBe(1);
    expect(banner.currentVersion).toMatchObject({ width: 1920, height: 1080, mimeType: "image/png" });
    expect(banner.activeGeneration).toBeNull();

    const version = await prisma.bannerVersion.findFirstOrThrow({ where: { bannerId } });
    expect(await storage.exists(version.storageKey)).toBe(true);
    const file = await storage.get(version.storageKey);
    expect(file.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(fake.generateCalls).toHaveLength(1);
    expect(fake.generateCalls[0]?.prompt).toContain("optimized prompt text");
    expect(fake.generateCalls[0]?.aspectRatio).toBe("16:9");
  });

  it("passes uploaded reference images and the default brand kit (logo + references) to the provider", async () => {
    const auth = await authedUser();
    const upload = await withAuth(request(app).post("/api/uploads/references"), auth).attach("files", await pngBuffer(), "ref.png");
    expect(upload.status).toBe(201);
    const refId = upload.body.references[0].id as string;
    const kit = (await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "Main" })).body.brandKit;
    await withAuth(request(app).patch(`/api/brand-kits/${kit.id}`), auth).send({ organizationName: "Igreja Viva", primaryColor: "#112233", instructions: "Keep it warm" });
    await withAuth(request(app).post(`/api/brand-kits/${kit.id}/logo`), auth).attach("file", await pngBuffer(32, 32), "logo.png");
    await withAuth(request(app).post(`/api/brand-kits/${kit.id}/references`), auth).attach("files", await pngBuffer(), "brand.png");

    const { bannerId, generation } = await createAndWait(auth, { ...validBody, referenceImageIds: [refId] });
    expect(generation.status).toBe("succeeded");
    const roles = fake.generateCalls[0]?.references.map((r) => r.role).sort();
    expect(roles).toEqual(["brand-logo", "brand-reference", "reference"]);
    // Brand constraints survive prompt optimization (appended after the optimized creative prompt)
    const prompt = fake.generateCalls[0]?.prompt ?? "";
    expect(prompt).toContain("optimized prompt text");
    expect(prompt).toContain("NON-NEGOTIABLE CONSTRAINTS");
    expect(prompt).toContain("#112233");
    expect(prompt).toContain("Keep it warm");
    expect(prompt).toContain("LOGO (mandatory)");
    const banner = (await withAuth(request(app).get(`/api/banners/${bannerId}`), auth)).body.banner;
    expect(banner.referenceImages).toHaveLength(1);
    expect(banner.referenceImages[0].id).toBe(refId);
    expect(banner.brandKitId).toBe(kit.id);
  });

  it("uses an explicitly chosen brand kit, composites the logo when a corner is chosen, and skips kits when disabled", async () => {
    const auth = await authedUser();
    const a = (await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "A" })).body.brandKit;
    const b = (await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "B" })).body.brandKit;
    await withAuth(request(app).post(`/api/brand-kits/${b.id}/logo`), auth).attach("file", await pngBuffer(32, 32, { r: 255, g: 0, b: 0 }), "logo.png");

    const chosen = await createAndWait(auth, { ...validBody, brandKitId: b.id, settings: { logoPlacement: "bottom-right" } });
    expect(chosen.generation.status).toBe("succeeded");
    expect(fake.generateCalls[0]?.references.map((r) => r.role)).toEqual([]); // studio places the logo itself
    expect(fake.generateCalls[0]?.prompt).toContain("bottom-right corner");
    const chosenBanner = (await withAuth(request(app).get(`/api/banners/${chosen.bannerId}`), auth)).body.banner;
    expect(chosenBanner.brandKitId).toBe(b.id);
    expect(a.isDefault).toBe(true);

    const none = await createAndWait(auth, { ...validBody, settings: { useBrandKit: false } });
    const noneBanner = (await withAuth(request(app).get(`/api/banners/${none.bannerId}`), auth)).body.banner;
    expect(noneBanner.brandKitId).toBeNull();

    const other = await authedUser();
    const stolen = await withAuth(request(app).post("/api/banners"), other).send({ ...validBody, brandKitId: b.id });
    expect(stolen.status).toBe(404);
  });

  it("applies the hybrid text overlay when requested", async () => {
    const auth = await authedUser();
    const { generation } = await createAndWait(auth, { ...validBody, aspectRatio: "1:1", settings: { textRenderingMode: "overlay", textPosition: "center" } });
    expect(generation.status).toBe("succeeded");
    expect(fake.generateCalls[0]?.prompt).toContain("ARTWORK ONLY");
    const version = await prisma.bannerVersion.findFirstOrThrow({ where: { generationId: generation.id } });
    expect(version.width).toBe(1080);
    expect(version.height).toBe(1080);
  });

  it("records provider failures and allows retrying", async () => {
    const auth = await authedUser();
    fake.failNext = new ProviderError("gemini", "Gemini rate limit reached. Please try again in a moment.");
    const { bannerId, generationId, generation } = await createAndWait(auth);
    expect(generation.status).toBe("failed");
    expect(generation.errorMessage).toMatch(/rate limit/);
    let banner = (await withAuth(request(app).get(`/api/banners/${bannerId}`), auth)).body.banner;
    expect(banner.status).toBe("failed");
    expect(banner.versions).toHaveLength(0);

    const retry = await withAuth(request(app).post(`/api/banners/${bannerId}/generations/${generationId}/retry`), auth);
    expect(retry.status).toBe(202);
    expect(retry.body.generation.kind).toBe("initial");
    const done = await waitFor(async () => {
      const g = await prisma.bannerGeneration.findUnique({ where: { id: retry.body.generation.id } });
      return g && g.status !== "pending" && g.status !== "running" ? g : null;
    });
    expect(done.status).toBe("succeeded");
    expect(done.attempt).toBe(2);
    banner = (await withAuth(request(app).get(`/api/banners/${bannerId}`), auth)).body.banner;
    expect(banner.status).toBe("ready");
    expect(banner.versions).toHaveLength(1);
    // Only failed generations can be retried
    const again = await withAuth(request(app).post(`/api/banners/${bannerId}/generations/${retry.body.generation.id}/retry`), auth);
    expect(again.status).toBe(409);
  });
});

describe("conversational editing and versions", () => {
  it("creates a new version for every edit, keeps lineage and supports restore", async () => {
    const auth = await authedUser();
    const { bannerId } = await createAndWait(auth);

    const edit = await withAuth(request(app).post(`/api/banners/${bannerId}/edits`), auth).send({ instruction: "Make the title bigger" });
    expect(edit.status).toBe(202);
    expect(edit.body.banner.activeGeneration.kind).toBe("edit");
    const editGen = await waitFor(async () => {
      const g = await prisma.bannerGeneration.findUnique({ where: { id: edit.body.generation.id } });
      return g && g.status === "succeeded" ? g : null;
    });
    expect(editGen.instruction).toBe("Make the title bigger");
    expect(fake.editCalls).toHaveLength(1);
    expect(fake.editCalls[0]?.prompt).toContain("Make the title bigger");
    expect(fake.editCalls[0]?.sourceImage.buffer.byteLength).toBeGreaterThan(0);

    let banner = (await withAuth(request(app).get(`/api/banners/${bannerId}`), auth)).body.banner;
    expect(banner.versions).toHaveLength(2);
    const [v1, v2] = banner.versions;
    expect(v2.versionNumber).toBe(2);
    expect(v2.parentVersionId).toBe(v1.id);
    expect(v2.label).toBe("Make the title bigger");
    expect(banner.currentVersion.id).toBe(v2.id);

    // Second edit continues the lineage and includes the previous instruction as context
    const edit2 = await withAuth(request(app).post(`/api/banners/${bannerId}/edits`), auth).send({ instruction: "Use a warmer palette" });
    expect(edit2.status).toBe(202);
    await waitFor(async () => {
      const g = await prisma.bannerGeneration.findUnique({ where: { id: edit2.body.generation.id } });
      return g && g.status === "succeeded" ? g : null;
    });
    expect(fake.editCalls[1]?.prompt).toContain("EDITS ALREADY APPLIED");
    expect(fake.editCalls[1]?.prompt).toContain("Make the title bigger");

    // Restore v1 → it becomes current but nothing is deleted
    const restore = await withAuth(request(app).post(`/api/banners/${bannerId}/restore`), auth).send({ versionId: v1.id });
    expect(restore.status).toBe(200);
    expect(restore.body.banner.currentVersion.id).toBe(v1.id);
    expect(restore.body.banner.versions).toHaveLength(3);

    // Editing from an explicit older version branches from it
    const edit3 = await withAuth(request(app).post(`/api/banners/${bannerId}/edits`), auth).send({ instruction: "Add depth", sourceVersionId: v1.id });
    expect(edit3.status).toBe(202);
    await waitFor(async () => {
      const g = await prisma.bannerGeneration.findUnique({ where: { id: edit3.body.generation.id } });
      return g && g.status === "succeeded" ? g : null;
    });
    banner = (await withAuth(request(app).get(`/api/banners/${bannerId}`), auth)).body.banner;
    expect(banner.versions).toHaveLength(4);
    expect(banner.versions[3].parentVersionId).toBe(v1.id);
    expect(fake.editCalls[2]?.prompt).not.toContain("EDITS ALREADY APPLIED");
  });

  it("rejects concurrent edits while a generation is running", async () => {
    const auth = await authedUser();
    const { bannerId } = await createAndWait(auth);
    // Block the runner so the first edit stays active
    generationQueue.setRunner(() => new Promise(() => {}));
    const first = await withAuth(request(app).post(`/api/banners/${bannerId}/edits`), auth).send({ instruction: "Edit one" });
    expect(first.status).toBe(202);
    const second = await withAuth(request(app).post(`/api/banners/${bannerId}/edits`), auth).send({ instruction: "Edit two" });
    expect(second.status).toBe(409);
    const del = await withAuth(request(app).delete(`/api/banners/${bannerId}`), auth);
    expect(del.status).toBe(409);
  });

  it("rejects edits on banners without a version", async () => {
    const auth = await authedUser();
    fake.failNext = new Error("boom");
    const { bannerId } = await createAndWait(auth);
    const res = await withAuth(request(app).post(`/api/banners/${bannerId}/edits`), auth).send({ instruction: "Make it pop" });
    expect(res.status).toBe(400);
  });
});

describe("ownership and management", () => {
  it("lists only the caller's banners and hides others' banners entirely", async () => {
    const alice = await authedUser();
    const bob = await authedUser();
    const { bannerId } = await createAndWait(alice);
    await createAndWait(bob, { ...validBody, prompt: "Bob's worship night banner for Friday" });

    const aliceList = await withAuth(request(app).get("/api/banners"), alice);
    expect(aliceList.body.total).toBe(1);
    expect(aliceList.body.items[0].id).toBe(bannerId);

    for (const attempt of [
      request(app).get(`/api/banners/${bannerId}`),
      request(app).post(`/api/banners/${bannerId}/edits`).send({ instruction: "Steal this banner" }),
      request(app).post(`/api/banners/${bannerId}/restore`).send({ versionId: "00000000-0000-4000-8000-000000000000" }),
      request(app).patch(`/api/banners/${bannerId}`).send({ title: "Hacked" }),
      request(app).delete(`/api/banners/${bannerId}`),
    ]) {
      const res = await withAuth(attempt, bob);
      expect(res.status).toBe(404);
    }
    const stillThere = await withAuth(request(app).get(`/api/banners/${bannerId}`), alice);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.banner.title).not.toBe("Hacked");
  });

  it("protects generated files and generation records per user", async () => {
    const alice = await authedUser();
    const bob = await authedUser();
    const { bannerId, generationId } = await createAndWait(alice);
    const banner = (await withAuth(request(app).get(`/api/banners/${bannerId}`), alice)).body.banner;
    const filePath = new URL(banner.currentVersion.url).pathname;

    const ownFile = await request(app).get(filePath).set("Cookie", alice.cookie);
    expect(ownFile.status).toBe(200);
    expect(ownFile.headers["content-type"]).toBe("image/png");

    const download = await request(app).get(new URL(banner.currentVersion.downloadUrl).pathname + "?download=x.png").set("Cookie", alice.cookie);
    expect(download.headers["content-disposition"]).toContain('attachment; filename="x.png"');

    const otherFile = await request(app).get(filePath).set("Cookie", bob.cookie);
    expect(otherFile.status).toBe(403);
    expect((await request(app).get(filePath)).status).toBe(401);

    const traversal = await request(app).get("/api/files/users/" + alice.user.id + "/../../etc/passwd").set("Cookie", alice.cookie);
    expect([400, 404]).toContain(traversal.status);

    expect((await withAuth(request(app).get(`/api/generations/${generationId}`), alice)).status).toBe(200);
    expect((await withAuth(request(app).get(`/api/generations/${generationId}`), bob)).status).toBe(404);
  });

  it("renames and deletes banners, removing files from storage", async () => {
    const auth = await authedUser();
    const { bannerId } = await createAndWait(auth);
    const renamed = await withAuth(request(app).patch(`/api/banners/${bannerId}`), auth).send({ title: "Noite de Adoração" });
    expect(renamed.body.banner.title).toBe("Noite de Adoração");
    const version = await prisma.bannerVersion.findFirstOrThrow({ where: { bannerId } });
    const del = await withAuth(request(app).delete(`/api/banners/${bannerId}`), auth);
    expect(del.status).toBe(204);
    expect(await prisma.banner.findUnique({ where: { id: bannerId } })).toBeNull();
    expect(await prisma.bannerVersion.count({ where: { bannerId } })).toBe(0);
    expect(await storage.exists(version.storageKey)).toBe(false);
  });
});
