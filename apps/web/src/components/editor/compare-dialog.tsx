"use client";

import type { BannerDto, BannerVersionDto } from "@bannerai/shared";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/lib/i18n";

function Pane({ version, versions, onChange, label }: { version: BannerVersionDto; versions: BannerVersionDto[]; onChange: (id: string) => void; label: string }) {
  const { d, f } = useT();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Select value={version.id} onValueChange={onChange}>
          <SelectTrigger size="sm" className="h-8 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                v{v.versionNumber} · {v.label.length > 24 ? v.label.slice(0, 24) + "…" : v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="checkerboard overflow-hidden rounded-xl border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={version.url} alt={f(d.editor.versionAlt, { n: version.versionNumber })} className="w-full object-contain" />
      </div>
    </div>
  );
}

export function CompareDialog({ banner, open, onOpenChange, initialLeftId, initialRightId }: { banner: BannerDto; open: boolean; onOpenChange: (o: boolean) => void; initialLeftId?: string; initialRightId?: string }) {
  const { d } = useT();
  const versions = banner.versions;
  const fallbackLeft = versions.at(-2)?.id ?? versions[0]?.id;
  const fallbackRight = versions.at(-1)?.id;
  const [leftId, setLeftId] = useState(initialLeftId ?? fallbackLeft);
  const [rightId, setRightId] = useState(initialRightId ?? fallbackRight);
  const left = versions.find((v) => v.id === leftId) ?? versions[0];
  const right = versions.find((v) => v.id === rightId) ?? versions.at(-1);
  if (!left || !right) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{d.compareDialog.title}</DialogTitle>
          <DialogDescription>{d.compareDialog.desc}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Pane label={d.compareDialog.before} version={left} versions={versions} onChange={setLeftId} />
          <Pane label={d.compareDialog.after} version={right} versions={versions} onChange={setRightId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
