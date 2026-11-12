import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { storage } from "../../services/storage/index.js";
import { authedUser, jpegBuffer, pngBuffer, withAuth, type AuthContext } from "../../test/helpers.js";

const app = createApp();

async function createKit(auth: AuthContext, name = "Main") {
  const res = await withAuth(request(app).post("/api/brand-kits"), auth).send({ name });
  expect(res.status).toBe(201);
  return res.body.brandKit as { id: string; isDefault: boolean; name: string };
}

describe("brand kits", () => {
  it("starts empty, creates kits and makes the first one the default", async () => {
    const auth = await authedUser();
    const empty = await withAuth(request(app).get("/api/brand-kits"), auth);
    expect(empty.status).toBe(200);
    expect(empty.body.brandKits).toEqual([]);

    const first = await createKit(auth, "Youth ministry");
    const second = await createKit(auth, "Main brand");
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);

    const list = await withAuth(request(app).get("/api/brand-kits"), auth);
    expect(list.body.brandKits.map((k: { name: string }) => k.name)).toEqual(["Youth ministry", "Main brand"]);

    const promoted = await withAuth(request(app).post(`/api/brand-kits/${second.id}/default`), auth);
    expect(promoted.body.brandKit.isDefault).toBe(true);
    expect(await prisma.brandKit.count({ where: { userId: auth.user.id, isDefault: true } })).toBe(1);
    const invalid = await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "" });
    expect(invalid.status).toBe(422);
  });

  it("persists identity settings and clears fields", async () => {
    const auth = await authedUser();
    const kit = await createKit(auth);
    const update = await withAuth(request(app).patch(`/api/brand-kits/${kit.id}`), auth).send({
      name: "Igreja Viva",
      organizationName: "Igreja Viva",
      organizationType: "church",
      primaryColor: "#1E40AF",
      secondaryColor: "#F59E0B",
      accentColors: ["#FFFFFF", "#000000"],
      preferredFonts: ["montserrat", "playfair-display"],
      instructions: "Always keep it warm.",
    });
    expect(update.status).toBe(200);
    const again = await withAuth(request(app).get(`/api/brand-kits/${kit.id}`), auth);
    expect(again.body.brandKit).toMatchObject({
      name: "Igreja Viva",
      organizationName: "Igreja Viva",
      organizationType: "church",
      primaryColor: "#1E40AF",
      secondaryColor: "#F59E0B",
      accentColors: ["#FFFFFF", "#000000"],
      preferredFonts: ["montserrat", "playfair-display"],
      instructions: "Always keep it warm.",
    });

    const cleared = await withAuth(request(app).post(`/api/brand-kits/${kit.id}/clear`), auth).send({ field: "primaryColor" });
    expect(cleared.body.brandKit.primaryColor).toBeNull();
    const invalid = await withAuth(request(app).patch(`/api/brand-kits/${kit.id}`), auth).send({ primaryColor: "blue" });
    expect(invalid.status).toBe(422);
  });

  it("stores the logo and reference banners as assets and removes them", async () => {
    const auth = await authedUser();
    const kit = await createKit(auth);
    const logo = await withAuth(request(app).post(`/api/brand-kits/${kit.id}/logo`), auth).attach("file", await pngBuffer(40, 40), "logo.png");
    expect(logo.status).toBe(201);
    expect(logo.body.brandKit.logo).toMatchObject({ type: "logo", mimeType: "image/png", width: 40, height: 40 });
    const firstLogoKey = (await prisma.brandKitAsset.findFirstOrThrow({ where: { type: "logo" } })).storageKey;

    // Replacing the logo deletes the previous file
    const replaced = await withAuth(request(app).post(`/api/brand-kits/${kit.id}/logo`), auth).attach("file", await jpegBuffer(50, 20), "logo.jpg");
    expect(replaced.body.brandKit.logo.mimeType).toBe("image/jpeg");
    expect(await prisma.brandKitAsset.count({ where: { type: "logo" } })).toBe(1);
    expect(await storage.exists(firstLogoKey)).toBe(false);

    const refs = await withAuth(request(app).post(`/api/brand-kits/${kit.id}/references`), auth).attach("files", await pngBuffer(), "a.png").attach("files", await jpegBuffer(), "b.jpg");
    expect(refs.status).toBe(201);
    expect(refs.body.brandKit.references).toHaveLength(2);

    const removed = await withAuth(request(app).delete(`/api/brand-kits/${kit.id}/assets/${refs.body.brandKit.references[0].id}`), auth);
    expect(removed.status).toBe(200);
    expect(removed.body.brandKit.references).toHaveLength(1);
  });

  it("deletes a kit with its files and promotes another default", async () => {
    const auth = await authedUser();
    const first = await createKit(auth, "First");
    const second = await createKit(auth, "Second");
    await withAuth(request(app).post(`/api/brand-kits/${first.id}/logo`), auth).attach("file", await pngBuffer(), "logo.png");
    const key = (await prisma.brandKitAsset.findFirstOrThrow({ where: { brandKitId: first.id } })).storageKey;
    const del = await withAuth(request(app).delete(`/api/brand-kits/${first.id}`), auth);
    expect(del.status).toBe(204);
    expect(await storage.exists(key)).toBe(false);
    const list = await withAuth(request(app).get("/api/brand-kits"), auth);
    expect(list.body.brandKits).toHaveLength(1);
    expect(list.body.brandKits[0].id).toBe(second.id);
    expect(list.body.brandKits[0].isDefault).toBe(true);
  });

  it("isolates kits between users", async () => {
    const alice = await authedUser();
    const bob = await authedUser();
    const kit = await createKit(alice);
    for (const attempt of [
      request(app).get(`/api/brand-kits/${kit.id}`),
      request(app).patch(`/api/brand-kits/${kit.id}`).send({ name: "Hacked" }),
      request(app).post(`/api/brand-kits/${kit.id}/default`),
      request(app).delete(`/api/brand-kits/${kit.id}`),
    ]) {
      expect((await withAuth(attempt, bob)).status).toBe(404);
    }
    expect((await withAuth(request(app).get("/api/brand-kits"), bob)).body.brandKits).toEqual([]);
  });

  it("rejects files that are not real images", async () => {
    const auth = await authedUser();
    const kit = await createKit(auth);
    const fakePng = await withAuth(request(app).post(`/api/brand-kits/${kit.id}/logo`), auth).attach("file", Buffer.from("definitely not an image"), { filename: "x.png", contentType: "image/png" });
    expect(fakePng.status).toBe(415);
    const textFile = await withAuth(request(app).post(`/api/brand-kits/${kit.id}/logo`), auth).attach("file", Buffer.from("hello"), { filename: "x.txt", contentType: "text/plain" });
    expect(textFile.status).toBe(415);
  });
});
