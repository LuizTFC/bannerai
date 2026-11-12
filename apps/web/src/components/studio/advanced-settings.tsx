"use client";

import { DESIGN_STYLES, LOGO_PLACEMENTS, TEXT_POSITIONS, type GenerationSettings, type LogoPlacement, type TextPosition } from "@bannerai/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ColorField } from "./color-field";
import { FontSelect } from "./font-select";

const POSITION_ICONS: Record<TextPosition, React.ComponentType<{ className?: string }>> = {
  auto: Sparkles,
  center: AlignCenter,
  left: AlignLeft,
  right: AlignRight,
};

function countActive(s: GenerationSettings): number {
  return [s.primaryColor, s.secondaryColor, s.accentColor, s.fontFamily, s.designStyle, s.textPosition && s.textPosition !== "auto", s.logoPlacement && s.logoPlacement !== "ai", s.additionalInstructions, s.textRenderingMode === "overlay", s.useBrandKit === false].filter(Boolean).length;
}

export function AdvancedSettings({ value, onChange, hasBrandKit, hasLogo }: { value: GenerationSettings; onChange: (v: GenerationSettings) => void; hasBrandKit: boolean; hasLogo?: boolean }) {
  const [open, setOpen] = useState(false);
  const { d, f } = useT();
  const set = <K extends keyof GenerationSettings>(key: K, v: GenerationSettings[K]) => onChange({ ...value, [key]: v });
  const active = countActive(value);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-medium">
          {d.advanced.title}
          {active > 0 && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{f(d.advanced.active, { n: active })}</span>}
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t px-4 pb-5 pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ColorField label={d.advanced.primaryColor} value={value.primaryColor} onChange={(v) => set("primaryColor", v)} />
          <ColorField label={d.advanced.secondaryColor} value={value.secondaryColor} onChange={(v) => set("secondaryColor", v)} />
          <ColorField label={d.advanced.accentColor} value={value.accentColor} onChange={(v) => set("accentColor", v)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{d.advanced.preferredFont}</Label>
          <FontSelect value={value.fontFamily} onChange={(v) => set("fontFamily", v)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{d.advanced.designStyle}</Label>
          <div className="flex flex-wrap gap-1.5">
            {DESIGN_STYLES.map((style) => {
              const selected = value.designStyle === style;
              return (
                <button
                  key={style}
                  type="button"
                  title={d.styles[style].description}
                  aria-pressed={selected}
                  onClick={() => set("designStyle", selected ? undefined : style)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {d.styles[style].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{d.advanced.textPosition}</Label>
          <div role="radiogroup" className="grid grid-cols-4 gap-1.5">
            {TEXT_POSITIONS.map((p) => {
              const Icon = POSITION_ICONS[p];
              const selected = (value.textPosition ?? "auto") === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={d.positions[p].description}
                  onClick={() => set("textPosition", p === "auto" ? undefined : p)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-medium transition-colors",
                    selected ? "border-primary bg-primary/[0.06] text-primary" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {d.positions[p].label}
                </button>
              );
            })}
          </div>
        </div>

        {hasLogo && value.useBrandKit !== false && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{d.advanced.logoPlacement}</Label>
            <Select value={value.logoPlacement ?? "ai"} onValueChange={(v) => set("logoPlacement", v === "ai" ? undefined : (v as LogoPlacement))}>
              <SelectTrigger className="w-full" aria-label={d.advanced.logoPlacement}>
                <SelectValue>{d.logoPlacements[value.logoPlacement ?? "ai"]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOGO_PLACEMENTS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {d.logoPlacements[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{d.advanced.logoPlacementDesc}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="additional" className="text-xs text-muted-foreground">
            {d.advanced.additional}
          </Label>
          <Textarea
            id="additional"
            value={value.additionalInstructions ?? ""}
            onChange={(e) => set("additionalInstructions", e.target.value || undefined)}
            placeholder={d.advanced.additionalPlaceholder}
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        <div className="space-y-3 rounded-xl bg-muted/50 p-3">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">{d.advanced.overlayTitle}</span>
              <span className="block text-xs text-muted-foreground">{d.advanced.overlayDesc}</span>
            </span>
            <Switch checked={value.textRenderingMode === "overlay"} onCheckedChange={(c) => set("textRenderingMode", c ? "overlay" : undefined)} />
          </label>
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">{d.advanced.brandKitTitle}</span>
              <span className="block text-xs text-muted-foreground">{hasBrandKit ? d.advanced.brandKitOn : d.advanced.brandKitOff}</span>
            </span>
            <Switch checked={value.useBrandKit !== false} onCheckedChange={(c) => set("useBrandKit", c ? undefined : false)} disabled={!hasBrandKit} />
          </label>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
