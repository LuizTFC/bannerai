import { describe, expect, it } from "vitest";
import { FakeProvider, fakeRegistry } from "../../test/fake-provider.js";
import { buildEditPrompt, buildFullPrompt, detectLanguage, guessTitle } from "./prompt-builder.js";
import { optimizePrompt } from "./prompt-optimizer.js";
import { ProviderRegistry } from "./registry.js";

describe("ProviderRegistry", () => {
  it("resolves the default provider and model", () => {
    const fake = new FakeProvider();
    const registry = fakeRegistry(fake);
    const resolved = registry.resolve({});
    expect(resolved.provider).toBe(fake);
    expect(resolved.model).toBe("fake-image-model");
  });

  it("honours user defaults and explicit requests", () => {
    const registry = fakeRegistry();
    expect(registry.resolve({}, { defaultProvider: "gemini", defaultModel: "gemini-custom-image" }).model).toBe("gemini-custom-image");
    expect(registry.resolve({ model: "fake-other" }).model).toBe("fake-other");
  });

  it("rejects unknown providers, incompatible models and unconfigured providers", () => {
    const registry = fakeRegistry();
    expect(() => registry.resolve({ provider: "openai" })).toThrow(/Unknown AI provider/);
    expect(() => registry.resolve({ model: "dall-e-9" })).toThrow(/not an image model/);
    const unconfigured = new ProviderRegistry([new FakeProvider(false)], "gemini");
    expect(() => unconfigured.resolve({})).toThrow(/not configured/);
    expect(unconfigured.describe().providers[0]?.configured).toBe(false);
  });

  it("finds a text-capable provider for prompt optimization", () => {
    expect(fakeRegistry().textProvider("gemini")?.id).toBe("gemini");
    expect(new ProviderRegistry([new FakeProvider(false)], "gemini").textProvider()).toBeNull();
  });
});

describe("prompt builder", () => {
  it("detects Portuguese and English", () => {
    expect(detectLanguage("Crie um banner para a conferência de jovens da nossa igreja")).toBe("pt-BR");
    expect(detectLanguage("Create a banner for our youth conference about identity")).toBe("en");
    expect(detectLanguage("Crea un banner para la conferencia de jóvenes de nuestra iglesia el 24 de octubre")).toBe("es");
  });

  it("guesses a title from quotes, 'called', or uppercase words", () => {
    expect(guessTitle('Banner for our conference called "Sem Filtro" about identity')).toBe("Sem Filtro");
    expect(guessTitle("Create a banner for the youth conference called NIGHT OF WORSHIP in March")).toBe("NIGHT OF WORSHIP");
    expect(guessTitle("worship night for our church")).toBe("worship night for our church");
  });

  it("composes explicit settings, brand kit and references with the right precedence", () => {
    const prompt = buildFullPrompt({
      userPrompt: "Banner da conferência SEM FILTRO, 24 de outubro",
      aspectRatio: "9:16",
      settings: { primaryColor: "#111111", designStyle: "cinematic", textPosition: "left", fontFamily: "bebas-neue", additionalInstructions: "add a subtle cross" },
      brandKit: { organizationName: "Igreja Viva", organizationType: "church", primaryColor: "#FF0000", secondaryColor: "#00FF00", accentColors: ["#0000FF"], preferredFonts: ["inter"], instructions: "never use neon", hasLogo: true, referenceCount: 2 },
      referenceCount: 1,
    });
    expect(prompt).toContain("portrait 9:16");
    expect(prompt).toContain("primary #111111");
    expect(prompt).not.toContain("primary #FF0000"); // explicit user color wins
    expect(prompt).toContain("secondary #00FF00"); // brand kit fills the gap
    expect(prompt).toContain("Cinematic");
    expect(prompt).toContain("left side");
    expect(prompt).toContain("Bebas Neue");
    expect(prompt).not.toContain("Inter)"); // explicit font wins over brand fonts
    expect(prompt).toContain("Igreja Viva (church)");
    expect(prompt).toContain("LOGO (mandatory)");
    expect(prompt).toContain("never use neon");
    expect(prompt).toContain("BRAND DESIGN SYSTEM (mandatory)");
    expect(prompt).toContain("REQUEST REFERENCES");
    expect(prompt).toContain("add a subtle cross");
    expect(prompt).toContain("Brazilian Portuguese");
    expect(prompt).toContain("NON-NEGOTIABLE CONSTRAINTS");
  });

  it("skips the brand kit when disabled and asks for space when the studio places the logo", () => {
    const off = buildFullPrompt({ userPrompt: "Worship night banner", aspectRatio: "16:9", settings: { useBrandKit: false }, brandKit: { organizationName: "Hidden Org", hasLogo: true, referenceCount: 0 }, referenceCount: 0 });
    expect(off).not.toContain("Hidden Org");
    const corner = buildFullPrompt({ userPrompt: "Worship night banner", aspectRatio: "16:9", settings: { logoPlacement: "top-left" }, brandKit: { hasLogo: true, referenceCount: 0 }, referenceCount: 0 });
    expect(corner).toContain("top-left corner");
    expect(corner).toContain("do NOT draw any logo");
  });

  it("builds edit prompts that preserve the lineage of previous edits", () => {
    const prompt = buildEditPrompt({ originalBrief: "Youth conference banner", previousInstructions: ["Make the title bigger", "Use a warmer palette"], instruction: "Move the date to the bottom", aspectRatio: "1:1" });
    expect(prompt).toContain("EDITS ALREADY APPLIED");
    expect(prompt).toContain("Make the title bigger");
    expect(prompt).toContain("Move the date to the bottom");
    expect(prompt).toContain("square 1:1");
  });
});

describe("prompt optimizer", () => {
  const ctx = { userPrompt: 'Banner for "SEM FILTRO" youth conference', aspectRatio: "16:9" as const, settings: {}, referenceCount: 0 };

  it("uses the text model output when available", async () => {
    const fake = new FakeProvider();
    const result = await optimizePrompt(ctx, { textProvider: fake, enabled: true });
    expect(result.optimized).toBe(true);
    expect(result.prompt).toBe("optimized prompt text");
    expect(result.constraints).toContain("NON-NEGOTIABLE CONSTRAINTS");
    expect(result.eventName).toBe("SEM FILTRO");
    expect(result.text.details).toEqual(["24 e 25 de outubro"]);
    expect(result.language).toBe("pt-BR");
    expect(fake.textCalls[0]?.json).toBe(true);
  });

  it("falls back to the deterministic prompt when disabled, unavailable or broken", async () => {
    const disabled = await optimizePrompt(ctx, { textProvider: new FakeProvider(), enabled: false });
    expect(disabled.optimized).toBe(false);
    expect(disabled.text.title).toBe("SEM FILTRO");

    const none = await optimizePrompt(ctx, { textProvider: null, enabled: true });
    expect(none.optimized).toBe(false);

    const broken = new FakeProvider();
    broken.textResponse = "not json at all";
    const fallback = await optimizePrompt(ctx, { textProvider: broken, enabled: true });
    expect(fallback.optimized).toBe(false);
    expect(fallback.prompt).toContain("BRIEF FROM THE USER");
    expect(fallback.constraints).toContain("TEXT RULES");
  });

  it("tolerates fenced JSON", async () => {
    const fenced = new FakeProvider();
    fenced.textResponse = '```json\n{"eventName":"Holy Ground","title":"Holy Ground","details":[],"language":"en","prompt":"p"}\n```';
    const result = await optimizePrompt(ctx, { textProvider: fenced, enabled: true });
    expect(result.optimized).toBe(true);
    expect(result.eventName).toBe("Holy Ground");
  });
});
