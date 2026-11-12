"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_ELEMENT_IMAGES,
  createBannerSchema,
  type AspectRatio,
  type CreateBannerInput,
  type GenerationSettings,
  type ReferenceImageDto,
} from "@bannerai/shared";
import { Check, Loader2, Sparkles, WandSparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { useBrandKits, useCreateBanner, usePricing, useProviders } from "@/lib/api/queries";
import { handleInsufficientCredits } from "@/lib/credits-errors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AdvancedSettings } from "./advanced-settings";
import { AspectRatioSelector } from "./aspect-ratio-selector";
import { ReferenceUploader } from "./reference-uploader";

interface FormValues {
  prompt: string;
  aspectRatio: AspectRatio;
  settings: GenerationSettings;
  referenceImageIds: string[];
  brandKitId?: string;
}

const NO_KIT = "__none__";

/** Element photos at or below this size get a resolution warning (they are enlarged on the banner). */
const LOW_RES_PX = 600;

export function CreateBannerForm({ onPreviewChange }: { onPreviewChange?: (state: { aspectRatio: AspectRatio; prompt: string; references: ReferenceImageDto[] }) => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const { d, f } = useT();
  const providers = useProviders();
  const pricing = usePricing();
  const brandKits = useBrandKits();
  const createBanner = useCreateBanner();
  const [references, setReferences] = useState<ReferenceImageDto[]>([]);
  const [elements, setElements] = useState<ReferenceImageDto[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(createBannerSchema) as never,
    defaultValues: {
      prompt: "",
      aspectRatio: user?.settings.defaultAspectRatio ?? "16:9",
      settings: { elementRendering: "exact" },
      referenceImageIds: [],
      brandKitId: undefined,
    },
    mode: "onSubmit",
  });

  const prompt = form.watch("prompt");
  const aspectRatio = form.watch("aspectRatio");
  const settings = form.watch("settings");
  const brandKitId = form.watch("brandKitId");
  const kits = brandKits.data ?? [];
  const defaultKit = kits.find((k) => k.isDefault) ?? kits[0];
  const selectedKit = settings.useBrandKit === false ? undefined : (kits.find((k) => k.id === brandKitId) ?? defaultKit);

  // Keep the live preview on the canvas in sync with the form.
  useEffect(() => {
    onPreviewChange?.({ aspectRatio, prompt, references });
  }, [onPreviewChange, aspectRatio, prompt, references]);

  const hasBrandKit = kits.length > 0;
  const anyProviderConfigured = providers.data?.providers.some((p) => p.configured) ?? true;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: CreateBannerInput = {
      prompt: values.prompt,
      aspectRatio: values.aspectRatio,
      settings: values.settings,
      referenceImageIds: references.map((r) => r.id),
      elementImageIds: elements.map((r) => r.id),
      brandKitId: values.settings.useBrandKit === false ? undefined : (selectedKit?.id ?? undefined),
    };
    try {
      const result = await createBanner.mutateAsync(payload);
      toast.success(d.create.startedToast, { description: d.create.startedToastDesc });
      router.push(`/banners/${result.banner.id}`);
    } catch (err) {
      if (handleInsufficientCredits(err, d, f, (href) => router.push(href))) return;
      toast.error(err instanceof ApiError ? err.message : d.create.couldNotStart);
    }
  });

  const busy = createBanner.isPending || createBanner.isSuccess;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt" className="text-sm font-medium">
            {d.create.describe}
          </Label>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => form.setValue("prompt", d.create.examples[Math.floor(Math.random() * d.create.examples.length)]!, { shouldDirty: true })}
          >
            <WandSparkles className="size-3.5" /> {d.create.tryExample}
          </button>
        </div>
        <Textarea
          id="prompt"
          {...form.register("prompt")}
          placeholder={d.create.placeholder}
          rows={7}
          disabled={busy}
          className="min-h-[160px] resize-y rounded-2xl bg-card px-4 py-3 text-[15px] leading-relaxed shadow-xs"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{form.formState.errors.prompt?.message ?? d.create.hint}</span>
          <span>{prompt.length}/4000</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{d.create.aspectRatio}</Label>
        <Controller control={form.control} name="aspectRatio" render={({ field }) => <AspectRatioSelector value={field.value} onChange={field.onChange} disabled={busy} />} />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label className="text-sm font-medium">{d.create.elements}</Label>
          <span className="text-xs text-muted-foreground">{d.common.optional}</span>
        </div>
        <p className="text-xs text-muted-foreground">{d.create.elementsHint}</p>
        <ReferenceUploader references={elements} onChange={setElements} disabled={busy} kind="element" max={MAX_ELEMENT_IMAGES} dropLabel={d.create.elementsDrop} />
        {elements.length > 0 && (
          <div className="space-y-2 rounded-xl bg-muted/50 p-3">
            <label className="flex items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">{d.create.exactTitle}</span>
                <span className="block text-xs text-muted-foreground">{d.create.exactDesc}</span>
              </span>
              <Switch
                checked={settings.elementRendering !== "ai"}
                onCheckedChange={(c) => form.setValue("settings", { ...settings, elementRendering: c ? "exact" : "ai" })}
                disabled={busy}
              />
            </label>
            {elements.some((e) => (e.width ?? Infinity) <= LOW_RES_PX && (e.height ?? Infinity) <= LOW_RES_PX) && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{f(d.create.lowRes, { min: LOW_RES_PX })}</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label className="text-sm font-medium">{d.create.references}</Label>
          <span className="text-xs text-muted-foreground">{d.common.optional}</span>
        </div>
        <p className="text-xs text-muted-foreground">{d.create.referencesHint}</p>
        <ReferenceUploader references={references} onChange={setReferences} disabled={busy} />
      </div>

      {kits.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{d.create.brandKit}</Label>
          <Select
            value={settings.useBrandKit === false ? NO_KIT : (selectedKit?.id ?? NO_KIT)}
            onValueChange={(v) => {
              if (v === NO_KIT) {
                form.setValue("settings", { ...settings, useBrandKit: false, templateAssetId: undefined }, { shouldDirty: true });
              } else {
                form.setValue("brandKitId", v, { shouldDirty: true });
                form.setValue("settings", { ...settings, useBrandKit: undefined, templateAssetId: undefined }, { shouldDirty: true });
              }
            }}
          >
            <SelectTrigger className="w-full" aria-label={d.create.brandKit}>
              <SelectValue>
                {settings.useBrandKit === false || !selectedKit ? (
                  <span className="text-muted-foreground">{d.create.brandKitNone}</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="size-3 rounded-full border" style={{ background: selectedKit.primaryColor ?? "var(--muted-foreground)" }} />
                    {selectedKit.name}
                    {selectedKit.isDefault && <span className="text-xs text-muted-foreground">· {d.common.default}</span>}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {kits.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-3 rounded-full border" style={{ background: k.primaryColor ?? "var(--muted-foreground)" }} />
                    {k.name}
                    {k.isDefault && <span className="text-xs text-muted-foreground">· {d.common.default}</span>}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value={NO_KIT}>
                <span className="text-muted-foreground">{d.create.brandKitNone}</span>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{d.create.brandKitHint}</p>
          {selectedKit && selectedKit.references.length > 0 && settings.useBrandKit !== false && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs text-muted-foreground">{d.create.template}</Label>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                <button
                  type="button"
                  onClick={() => form.setValue("settings", { ...settings, templateAssetId: undefined }, { shouldDirty: true })}
                  aria-pressed={!settings.templateAssetId}
                  className={cn("flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border px-2 text-center text-[11px] leading-tight transition-colors", !settings.templateAssetId ? "border-primary bg-primary/[0.06] text-primary" : "text-muted-foreground hover:border-foreground/30")}
                >
                  {d.create.templateNone}
                </button>
                {selectedKit.references.map((r) => {
                  const active = settings.templateAssetId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={active}
                      title={r.originalName}
                      onClick={() => form.setValue("settings", { ...settings, templateAssetId: active ? undefined : r.id }, { shouldDirty: true })}
                      className={cn("relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border bg-muted transition-all", active ? "border-primary ring-2 ring-primary/40" : "hover:border-foreground/30")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt={r.originalName} className="size-full object-cover" />
                      {active && (
                        <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {settings.templateAssetId && <p className="text-xs text-muted-foreground">{d.create.templateHint}</p>}
            </div>
          )}
        </div>
      )}

      <AdvancedSettings value={settings} onChange={(v) => form.setValue("settings", v, { shouldDirty: true })} hasBrandKit={hasBrandKit} hasLogo={Boolean(selectedKit?.logo)} />

      {!anyProviderConfigured && <p className="text-xs text-destructive">{d.create.noProvider}</p>}

      <Button type="submit" size="lg" disabled={busy || !anyProviderConfigured} className="h-12 w-full rounded-xl text-[15px] font-medium">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? d.create.starting : d.create.generate}
        {!busy && pricing.data && <span className="ml-1 rounded-full bg-primary-foreground/15 px-2 py-0.5 text-xs font-normal">{f(d.credits.costGeneration, { n: pricing.data.costs.generation })}</span>}
      </Button>
    </form>
  );
}
