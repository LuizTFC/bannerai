import request from "supertest";
import { describe, expect, it } from "vitest";
import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from "@bannerai/shared";
import { createApp } from "../../app.js";
import { prisma } from "../../database/prisma.js";
import { authedUser, withAuth } from "../../test/helpers.js";

const app = createApp();

describe("authentication", () => {
  it("rejects unauthenticated access to every private endpoint", async () => {
    for (const path of ["/api/auth/me", "/api/banners", "/api/brand-kits", "/api/providers", "/api/generations/00000000-0000-4000-8000-000000000000", "/api/files/users/x/banners/a.png"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe("unauthorized");
    }
    expect((await request(app).post("/api/banners").send({})).status).toBe(401);
    expect((await request(app).post("/api/uploads/references")).status).toBe(401);
  });

  it("returns the current user and a CSRF token for a valid session", async () => {
    const auth = await authedUser();
    const res = await request(app).get("/api/auth/me").set("Cookie", auth.cookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: auth.user.id, email: auth.user.email });
    expect(res.body.csrfToken).toBe(auth.csrfToken);
    expect(res.body.user).not.toHaveProperty("googleId");
  });

  it("rejects tampered session cookies", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", `${SESSION_COOKIE_NAME}=s%3Anot-a-real-sid.badsignature`);
    expect(res.status).toBe(401);
  });

  it("logs out and invalidates the session", async () => {
    const auth = await authedUser();
    const res = await withAuth(request(app).post("/api/auth/logout"), auth);
    expect(res.status).toBe(204);
    expect(await prisma.session.count()).toBe(0);
    expect((await request(app).get("/api/auth/me").set("Cookie", auth.cookie)).status).toBe(401);
  });

  it("reports that Google OAuth is not configured in this environment", async () => {
    const status = await request(app).get("/api/auth/status");
    expect(status.body).toEqual({ googleConfigured: false });
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(503);
    const cb = await request(app).get("/api/auth/google/callback");
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain("/login?error=not_configured");
  });
});

describe("CSRF protection", () => {
  it("blocks state-changing requests without the session-bound token", async () => {
    const auth = await authedUser();
    const res = await request(app).post("/api/brand-kits").set("Cookie", auth.cookie).set("Origin", "http://localhost:3000").send({ name: "X" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/CSRF/);
  });

  it("blocks requests with a wrong token", async () => {
    const auth = await authedUser();
    const res = await request(app).post("/api/brand-kits").set("Cookie", auth.cookie).set("Origin", "http://localhost:3000").set(CSRF_HEADER_NAME, "0".repeat(64)).send({ name: "X" });
    expect(res.status).toBe(403);
  });

  it("blocks cross-site origins even with a valid token", async () => {
    const auth = await authedUser();
    const res = await request(app).post("/api/brand-kits").set("Cookie", auth.cookie).set(CSRF_HEADER_NAME, auth.csrfToken).set("Origin", "https://evil.example").send({ name: "X" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Cross-site/);
  });

  it("allows requests with the correct token and origin", async () => {
    const auth = await authedUser();
    const res = await withAuth(request(app).post("/api/brand-kits"), auth).send({ name: "Igreja Teste" });
    expect(res.status).toBe(201);
    expect(res.body.brandKit.name).toBe("Igreja Teste");
  });

  it("does not require the token for safe methods", async () => {
    const auth = await authedUser();
    const res = await request(app).get("/api/brand-kits").set("Cookie", auth.cookie);
    expect(res.status).toBe(200);
  });
});
