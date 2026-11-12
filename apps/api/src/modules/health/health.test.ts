import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";

describe("GET /api/health", () => {
  it("reports backend and database status", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "up" });
    expect(typeof res.body.uptimeSeconds).toBe("number");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
