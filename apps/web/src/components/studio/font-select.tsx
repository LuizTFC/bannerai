"use client";

import { FONT_OPTIONS } from "@bannerai/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";

const NONE = "__none__";

/** Font picker with live previews. The preview uses local/system fallbacks of each family. */
export function FontSelect({ value, onChange, placeholder }: { value?: string; onChange: (v: string | undefined) => void; placeholder?: string }) {
  const { d } = useT();
  const text = placeholder ?? d.advanced.letAiChoose;
  const current = FONT_OPTIONS.find((f) => f.value === value);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={text}>
          {current ? <span style={{ fontFamily: current.cssStack }}>{current.label}</span> : <span className="text-muted-foreground">{text}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{text}</span>
        </SelectItem>
        {FONT_OPTIONS.map((f) => (
          <SelectItem key={f.value} value={f.value}>
            <span className="flex items-baseline gap-2">
              <span className="text-base leading-none" style={{ fontFamily: f.cssStack }}>
                {f.label}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.category}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
