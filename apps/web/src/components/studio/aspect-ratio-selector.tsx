"use client";

import { ASPECT_RATIO_OPTIONS, type AspectRatio } from "@bannerai/shared";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function AspectRatioSelector({ value, onChange, disabled }: { value: AspectRatio; onChange: (v: AspectRatio) => void; disabled?: boolean }) {
  const { d } = useT();
  return (
    <div role="radiogroup" aria-label={d.create.aspectRatio} className="grid grid-cols-2 gap-2.5">
      {ASPECT_RATIO_OPTIONS.map((opt) => {
        const selected = opt.value === value;
        const text = d.aspect[opt.value];
        // Fit the proportion preview inside a 56x40 box
        const scale = Math.min(56 / opt.width, 40 / opt.height);
        const w = Math.round(opt.width * scale);
        const h = Math.round(opt.height * scale);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "group relative flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-all",
              "hover:border-foreground/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected && "border-primary bg-primary/[0.06] shadow-[0_0_0_1px_var(--primary)]",
              disabled && "opacity-60",
            )}
          >
            <span className="grid h-10 w-14 shrink-0 place-items-center">
              <span
                className={cn("rounded-[3px] border-2 transition-colors", selected ? "border-primary bg-primary/20" : "border-muted-foreground/50 bg-muted group-hover:border-foreground/50")}
                style={{ width: w, height: h }}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">
                {text.label} <span className="text-muted-foreground">{opt.value}</span>
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{text.description}</span>
            </span>
            {selected && (
              <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
