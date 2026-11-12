// Dev check: runs one real "exact faces" generation on a user's account through the HTTP API.
// Usage: [ASPECT=16:9] [EDIT="instruction"] npx tsx scripts/dev-exact-run.mts <userId> <photo1>::<label> <photo2>::<label> ...
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import cookieSignature from "cookie-signature";
import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from "@bannerai/shared";
import { env } from "../src/config/env.js";
import { prisma } from "../src/database/prisma.js";

const [userId, ...specs] = process.argv.slice(2);
const base = `http://localhost:${env.PORT}`;
const sid = randomUUID();
const csrfToken = randomUUID().replace(/-/g, "");
const expire = new Date(Date.now() + 30 * 60 * 1000);
await prisma.session.create({ data: { sid, expire, sess: { cookie: { originalMaxAge: 1.8e6, expires: expire.toISOString(), httpOnly: true, path: "/", sameSite: "lax" }, passport: { user: userId }, csrfToken } } });
const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(`s:${cookieSignature.sign(sid, env.SESSION_SECRET)}`)}`;
const headers = { Cookie: cookie, [CSRF_HEADER_NAME]: csrfToken, Origin: env.FRONTEND_URL };
const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body as Record<string, any>;
};
try {
  const form = new FormData();
  for (const spec of specs) {
    const [file] = spec.split("::");
    form.append("files", new Blob([new Uint8Array(readFileSync(file!))], { type: file!.endsWith(".png") ? "image/png" : "image/jpeg" }), basename(file!));
  }
  const up = await api("/api/uploads/references?kind=element", { method: "POST", body: form });
  const ids: string[] = [];
  for (const [i, spec] of specs.entries()) {
    const id = up.references[i].id as string;
    await api(`/api/uploads/references/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: spec.split("::")[1] }) });
    ids.push(id);
  }
  const created = await api("/api/banners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: 'Banner para a conferência de homens "HOMENS DE VALOR" nos dias 15 e 16 de novembro às 19h30, na ONE Church, com os preletores Pastor Eduardo e Pastor Michel',
      aspectRatio: process.env.ASPECT ?? "9:16",
      elementImageIds: ids,
      settings: { elementRendering: "exact" },
    }),
  });
  const bannerId = created.banner.id as string;
  console.log("banner", bannerId, "generation", created.generation.id);
  const waitForGeneration = async (generationId: string): Promise<boolean> => {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const g = await prisma.bannerGeneration.findUnique({ where: { id: generationId } });
      if (g && (g.status === "succeeded" || g.status === "failed")) {
        console.log("status", g.status, g.errorMessage ?? "", "ms", g.durationMs);
        const v = await prisma.bannerVersion.findUnique({ where: { generationId } });
        console.log("version", v?.storageKey);
        return g.status === "succeeded";
      }
    }
    return false;
  };
  const ok = await waitForGeneration(created.generation.id as string);
  // Optional follow-up edit (EDIT="instruction"), to check that the people stay editable and the faces locked.
  if (ok && process.env.EDIT) {
    const edit = await api(`/api/banners/${bannerId}/edits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: process.env.EDIT }) });
    console.log("edit generation", edit.generation.id);
    await waitForGeneration(edit.generation.id as string);
  }
} finally {
  await prisma.session.delete({ where: { sid } }).catch(() => undefined);
  await prisma.$disconnect();
}
