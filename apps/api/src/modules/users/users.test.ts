import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { authedUser, withAuth } from "../../test/helpers.js";
import { UsersService } from "./users.service.js";

const app = createApp();

describe("users", () => {
  it("creates a user on first Google login and reuses it afterwards", async () => {
    const service = new UsersService();
    const profile = { googleId: "g-1", email: "Pastor@Church.org", name: "Pastor", avatarUrl: "https://img", emailVerified: true };
    const first = await service.upsertFromGoogle(profile);
    expect(first.email).toBe("pastor@church.org");
    const second = await service.upsertFromGoogle({ ...profile, name: "Pastor Updated" });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Pastor Updated");
    expect(await prisma.user.count()).toBe(1);
  });

  it("enforces the allowed email domain list", async () => {
    const service = new UsersService(["church.org"]);
    await expect(service.upsertFromGoogle({ googleId: "g-2", email: "someone@gmail.com", name: "X", avatarUrl: null, emailVerified: true })).rejects.toMatchObject({ status: 403 });
    await expect(service.upsertFromGoogle({ googleId: "g-3", email: "someone@church.org", name: "X", avatarUrl: null, emailVerified: true })).resolves.toBeTruthy();
  });

  it("persists user settings", async () => {
    const auth = await authedUser();
    const res = await withAuth(request(app).patch("/api/users/me/settings"), auth).send({ defaultProvider: "openai", defaultAspectRatio: "9:16", preferredLanguage: "pt-BR" });
    expect(res.status).toBe(200);
    expect(res.body.user.settings).toEqual({ defaultProvider: "openai", defaultAspectRatio: "9:16", preferredLanguage: "pt-BR" });
    const bad = await withAuth(request(app).patch("/api/users/me/settings"), auth).send({ defaultProvider: "midjourney" });
    expect(bad.status).toBe(422);
  });
});
