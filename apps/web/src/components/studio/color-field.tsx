"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ColorField({ label, value, onChange, placeholder = "#000000", className }: { label: string; value?: string; onChange: (v: string | undefined) => void; placeholder?: string; className?: string }) {
  const id = useId();
  const { d, f } = useT();
  const valid = value ? HEX_RE.test(value) : true;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
      )}
      <div className="flex items-center gap-2">
        <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border shadow-xs" style={{ backgroundColor: valid && value ? value : undefined }} aria-label={f(d.advanced.swatch, { label })}>
          {!value && <span className="checkerboard absolute inset-0" />}
          <input type="color" value={valid && value ? value : "#888888"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
        <Input
          id={id}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value.trim() : undefined)}
          aria-invalid={!valid}
          className="h-9 font-mono text-xs uppercase"
          maxLength={7}
        />
        {value && (
          <button type="button" onClick={() => onChange(undefined)} aria-label={f(d.advanced.clear, { label })} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
