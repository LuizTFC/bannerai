"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FONT_OPTIONS, MAX_BRAND_KITS, MAX_BRAND_KIT_REFERENCES, updateBrandKitSchema, type BrandKitDto, type UpdateBrandKitInput } from "@bannerai/shared";
import { Check, Loader2, MoreHorizontal, Palette, Plus, RefreshCw, Sparkles, Star, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ColorField } from "@/components/studio/color-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { useBrandKitMutations, useBrandKits } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AssetDropzone } from "./asset-dropzone";

type FormValues = {
  name: string;
  organizationName: string;
  organizationType: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColors: string[];
  preferredFonts: string[];
  instructions: string;
};

const toForm = (kit: BrandKitDto): FormValues => ({
  name: kit.name,
  organizationName: kit.organizationName ?? "",
  organizationType: kit.organizationType ?? "",
  primaryColor: kit.primaryColor ?? undefined,
  secondaryColor: kit.secondaryColor ?? undefined,
  accentColors: kit.accentColors,
  preferredFonts: kit.preferredFonts,
  instructions: kit.instructions ?? "",
});

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function NewKitDialog({ open, onOpenChange, onCreate, pending }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string) => Promise<void>; pending: boolean }) {
  const { d } = useT();
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void onCreate(name.trim()).then(() => setName(""));
          }}
        >
          <DialogHeader>
            <DialogTitle>{d.brandKit.newKit}</DialogTitle>
            <DialogDescription>{d.brandKit.subtitle}</DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-1.5">
            <Label htmlFor="kit-name">{d.brandKit.newKitName}</Label>
            <Input id="kit-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={d.brandKit.newKitPlaceholder} maxLength={80} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {d.common.cancel}
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} {d.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KitEditor({ kit }: { kit: BrandKitDto }) {
  const m = useBrandKitMutations();
  const { d, f } = useT();
  const form = useForm<FormValues>({ resolver: zodResolver(updateBrandKitSchema) as never, defaultValues: toForm(kit) });

  // Only reset when the server copy changes (switching kits, after a save), never on background refetches.
  const kitVersion = `${kit.id}:${kit.updatedAt}`;
  useEffect(() => {
    form.reset(toForm(kit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitVersion, form]);

  const [newAccent, setNewAccent] = useState<string | undefined>();

  const run = async (p: Promise<unknown>, success: string) => {
    try {
      await p;
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.common.somethingWrong);
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: UpdateBrandKitInput = {
      name: values.name,
      organizationName: values.organizationName,
      organizationType: values.organizationType,
      primaryColor: values.primaryColor ?? "",
      secondaryColor: values.secondaryColor ?? "",
      accentColors: values.accentColors,
      preferredFonts: values.preferredFonts,
      instructions: values.instructions,
    };
    try {
      await m.update.mutateAsync({ id: kit.id, input: payload });
      // Empty strings mean "unset" for the API schema; clear those fields explicitly.
      const clears: Array<"organizationName" | "organizationType" | "primaryColor" | "secondaryColor" | "instructions"> = [];
      if (!values.organizationName && kit.organizationName) clears.push("organizationName");
      if (!values.organizationType && kit.organizationType) clears.push("organizationType");
      if (!values.primaryColor && kit.primaryColor) clears.push("primaryColor");
      if (!values.secondaryColor && kit.secondaryColor) clears.push("secondaryColor");
      if (!values.instructions && kit.instructions) clears.push("instructions");
      for (const field of clears) await m.clearField.mutateAsync({ id: kit.id, field });
      toast.success(d.brandKit.saved, { description: d.brandKit.savedDesc });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.brandKit.saveFailed);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Section title={d.brandKit.identity} description={d.brandKit.identityDesc}>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kitName">{d.brandKit.kitName}</Label>
              <Input id="kitName" {...form.register("name")} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="organizationType">{d.brandKit.organizationType}</Label>
              <Input id="organizationType" {...form.register("organizationType")} placeholder={d.brandKit.organizationTypePlaceholder} maxLength={80} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="organizationName">{d.brandKit.organizationName}</Label>
            <Input id="organizationName" {...form.register("organizationName")} placeholder={d.brandKit.organizationNamePlaceholder} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller control={form.control} name="primaryColor" render={({ field }) => <ColorField label={d.brandKit.primary} value={field.value} onChange={field.onChange} />} />
            <Controller control={form.control} name="secondaryColor" render={({ field }) => <ColorField label={d.brandKit.secondary} value={field.value} onChange={field.onChange} />} />
          </div>
          <Controller
            control={form.control}
            name="accentColors"
            render={({ field }) => (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{d.brandKit.accents}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {field.value.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 text-xs font-mono">
                      <span className="size-5 rounded-full border" style={{ backgroundColor: c }} />
                      {c}
                      <button type="button" aria-label={f(d.brandKit.remove, { name: c })} onClick={() => field.onChange(field.value.filter((x) => x !== c))} className="text-muted-foreground hover:text-foreground">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {field.value.length < 6 && (
                    <div className="flex items-center gap-2">
                      <ColorField label="" value={newAccent} onChange={setNewAccent} placeholder="#F59E0B" className="w-[190px]" />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!newAccent || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(newAccent)}
                        onClick={() => {
                          if (newAccent && !field.value.includes(newAccent)) field.onChange([...field.value, newAccent]);
                          setNewAccent(undefined);
                        }}
                      >
                        <Plus className="size-4" /> {d.brandKit.add}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          />
        </div>
      </Section>

      <Section title={d.brandKit.logo} description={d.brandKit.logoDesc}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {kit.logo ? (
            <div className="relative shrink-0">
              <div className="checkerboard grid size-36 place-items-center overflow-hidden rounded-2xl border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={kit.logo.url} alt={d.brandKit.logoAlt} className="max-h-full max-w-full object-contain" />
              </div>
              <Button type="button" variant="outline" size="icon-xs" className="absolute -right-2 -top-2 rounded-full" aria-label={d.brandKit.removeLogo} onClick={() => void run(m.removeAsset.mutateAsync({ id: kit.id, assetId: kit.logo!.id }), d.brandKit.logoRemoved)}>
                <X className="size-3.5" />
              </Button>
            </div>
          ) : null}
          <AssetDropzone className="flex-1" label={kit.logo ? d.brandKit.replaceLogo : d.brandKit.uploadLogo} hint={d.brandKit.logoHint} uploading={m.uploadLogo.isPending} onFiles={(files) => void run(m.uploadLogo.mutateAsync({ id: kit.id, file: files[0]! }), d.brandKit.logoUpdated)} />
        </div>
      </Section>

      <Section title={d.brandKit.typography} description={d.brandKit.typographyDesc}>
        <Controller
          control={form.control}
          name="preferredFonts"
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FONT_OPTIONS.map((font) => {
                const selected = field.value.includes(font.value);
                return (
                  <button
                    key={font.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => field.onChange(selected ? field.value.filter((v) => v !== font.value) : field.value.length < 4 ? [...field.value, font.value] : field.value)}
                    className={cn("rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-foreground/30", selected && "border-primary bg-primary/[0.06]")}
                  >
                    <span className="block text-lg leading-tight" style={{ fontFamily: font.cssStack }}>
                      {font.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{font.category}</span>
                  </button>
                );
              })}
            </div>
          )}
        />
      </Section>

      <Section title={d.brandKit.references} description={f(d.brandKit.referencesDesc, { max: MAX_BRAND_KIT_REFERENCES })}>
        {kit.references.length > 0 && (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kit.references.map((r) => (
              <li key={r.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={r.originalName} className="size-full object-cover" />
                <button type="button" aria-label={f(d.brandKit.remove, { name: r.originalName })} onClick={() => void run(m.removeAsset.mutateAsync({ id: kit.id, assetId: r.id }), d.brandKit.referenceRemoved)} className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-background/90 opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {kit.references.length < MAX_BRAND_KIT_REFERENCES && (
          <AssetDropzone multiple label={d.brandKit.dropRefs} hint={d.brandKit.dropRefsHint} uploading={m.uploadReferences.isPending} onFiles={(files) => void run(m.uploadReferences.mutateAsync({ id: kit.id, files }), d.brandKit.referencesAdded)} />
        )}
      </Section>

      <Section title={d.brandKit.styleGuide} description={d.brandKit.styleGuideDesc}>
        {kit.references.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.brandKit.styleGuideNone}</p>
        ) : (
          <div className="space-y-4">
            {kit.styleGuideStale && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{d.brandKit.styleGuideStale}</p>
            )}
            {kit.styleGuide ? (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(["summary", "layout", "textHierarchy", "proportions", "typography", "colors", "devices", "imagery", "logoUsage", "mood"] as const).map((k) =>
                  kit.styleGuide?.[k] ? (
                    <div key={k} className={cn("rounded-xl bg-muted/50 p-3", k === "summary" && "sm:col-span-2")}>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{d.brandKit.guide[k]}</dt>
                      <dd className="mt-1 text-sm leading-relaxed">{kit.styleGuide[k]}</dd>
                    </div>
                  ) : null,
                )}
                {kit.styleGuide.doNot.length > 0 && (
                  <div className="rounded-xl bg-destructive/5 p-3 sm:col-span-2">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-destructive">{d.brandKit.guide.doNot}</dt>
                    <dd className="mt-1 text-sm leading-relaxed">{kit.styleGuide.doNot.join(" · ")}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{m.analyze.isPending ? d.brandKit.analyzing : d.brandKit.styleGuideNone}</p>
            )}
            <Button type="button" variant="outline" size="sm" disabled={m.analyze.isPending} onClick={() => void run(m.analyze.mutateAsync(kit.id), d.brandKit.analyzed)}>
              {m.analyze.isPending ? <Loader2 className="size-4 animate-spin" /> : kit.styleGuide ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}
              {m.analyze.isPending ? d.brandKit.analyzing : kit.styleGuide ? d.brandKit.reanalyze : d.brandKit.analyze}
            </Button>
          </div>
        )}
      </Section>

      <Section title={d.brandKit.preferences} description={d.brandKit.preferencesDesc}>
        {kit.learnedPreferences.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.brandKit.preferencesNone}</p>
        ) : (
          <ul className="space-y-2">
            {kit.learnedPreferences.map((rule) => (
              <li key={rule} className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="flex-1">{rule}</span>
                <button
                  type="button"
                  aria-label={f(d.brandKit.remove, { name: rule })}
                  onClick={() => void run(m.update.mutateAsync({ id: kit.id, input: { learnedPreferences: kit.learnedPreferences.filter((r) => r !== rule) } }), d.brandKit.preferenceRemoved)}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={d.brandKit.instructions} description={d.brandKit.instructionsDesc}>
        <Textarea {...form.register("instructions")} rows={4} placeholder={d.brandKit.instructionsPlaceholder} className="resize-y" />
      </Section>

      <div className="sticky bottom-0 -mx-5 flex justify-end border-t bg-background/90 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:bottom-4 sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button type="submit" size="lg" disabled={m.update.isPending} className="w-full rounded-xl shadow-lg sm:w-auto">
          {m.update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Palette className="size-4" />} {d.brandKit.save}
        </Button>
      </div>
    </form>
  );
}

export function BrandKitEditor() {
  const query = useBrandKits();
  const m = useBrandKitMutations();
  const { d, f } = useT();
  const kits = query.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BrandKitDto | null>(null);

  const selected = kits.find((k) => k.id === selectedId) ?? kits.find((k) => k.isDefault) ?? kits[0] ?? null;

  const create = async (name: string) => {
    try {
      const res = await m.create.mutateAsync(name);
      setSelectedId(res.brandKit.id);
      setNewOpen(false);
      toast.success(d.brandKit.created);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.common.somethingWrong);
    }
  };

  const makeDefault = async (kit: BrandKitDto) => {
    try {
      await m.setDefault.mutateAsync(kit.id);
      toast.success(f(d.brandKit.madeDefault, { name: kit.name }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.common.somethingWrong);
    }
  };

  const remove = async (kit: BrandKitDto) => {
    try {
      await m.remove.mutateAsync(kit.id);
      setDeleteTarget(null);
      if (selectedId === kit.id) setSelectedId(null);
      toast.success(d.brandKit.kitDeleted);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.common.somethingWrong);
    }
  };

  if (query.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-5 py-8 sm:px-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
      <PageHeader
        title={d.brandKit.title}
        description={d.brandKit.subtitle}
        actions={
          <Button onClick={() => setNewOpen(true)} disabled={kits.length >= MAX_BRAND_KITS}>
            <Plus className="size-4" /> {d.brandKit.newKit}
          </Button>
        }
      />

      {kits.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={Palette}
          title={d.brandKit.emptyTitle}
          description={d.brandKit.emptyDesc}
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> {d.brandKit.newKit}
            </Button>
          }
        />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{d.brandKit.yourKits}</p>
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {kits.map((kit) => {
                const active = selected?.id === kit.id;
                return (
                  <li key={kit.id} className="shrink-0 lg:shrink">
                    <div className={cn("group flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors", active ? "border-primary bg-primary/[0.06]" : "hover:bg-muted/60")}>
                      <button type="button" onClick={() => setSelectedId(kit.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background">
                          {kit.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={kit.logo.url} alt="" className="max-h-full max-w-full object-contain p-1" />
                          ) : (
                            <span className="size-4 rounded-full" style={{ background: kit.primaryColor ?? "var(--muted-foreground)" }} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{kit.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{kit.isDefault ? d.common.default : kit.organizationName || kit.organizationType || "—"}</span>
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={d.editor.more}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => void makeDefault(kit)} disabled={kit.isDefault}>
                            {kit.isDefault ? <Check /> : <Star />} {d.brandKit.setDefault}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(kit)}>
                            <Trash2 /> {d.brandKit.deleteKit}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
          <div className="min-w-0">{selected && <KitEditor key={selected.id} kit={selected} />}</div>
        </div>
      )}

      <NewKitDialog open={newOpen} onOpenChange={setNewOpen} onCreate={create} pending={m.create.isPending} />
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{d.brandKit.deleteKit}</DialogTitle>
            <DialogDescription>{deleteTarget ? f(d.brandKit.deleteKitConfirm, { name: deleteTarget.name }) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={m.remove.isPending}>
              {d.common.cancel}
            </Button>
            <Button variant="destructive" onClick={() => deleteTarget && void remove(deleteTarget)} disabled={m.remove.isPending}>
              {m.remove.isPending && <Loader2 className="size-4 animate-spin" />} {d.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
