"use client";

import type { BannerDto, BannerVersionDto } from "@bannerai/shared";
import { Check, Download, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelativeFor, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function VersionHistory({
  banner,
  selectedVersionId,
  onSelect,
  onRestore,
  restoring,
}: {
  banner: BannerDto;
  selectedVersionId: string | null;
  onSelect: (v: BannerVersionDto) => void;
  onRestore: (v: BannerVersionDto) => void;
  restoring?: boolean;
}) {
  const { d, f, locale } = useT();
  const versions = [...banner.versions].reverse();
  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 py-10 text-center text-sm text-muted-foreground">
        <History className="mb-2 size-5" />
        {d.versions.empty}
      </div>
    );
  }
  return (
    <ul className="space-y-2 px-4 py-4">
      {versions.map((v) => {
        const current = banner.currentVersion?.id === v.id;
        const selected = (selectedVersionId ?? banner.currentVersion?.id) === v.id;
        return (
          <li key={v.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(v)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(v)}
              className={cn("group flex w-full gap-3 rounded-xl border p-2 text-left transition-colors hover:bg-muted/60", selected && "border-primary bg-primary/[0.05]")}
            >
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.url} alt="" className="size-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">v{v.versionNumber}</span>
                  {current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      <Check className="size-3" /> {d.versions.current}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground" title={v.label}>
                  {v.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatRelativeFor(d, locale, v.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon-xs" aria-label={f(d.versions.download, { n: v.versionNumber })} onClick={(e) => e.stopPropagation()}>
                      <a href={v.downloadUrl}>
                        <Download className="size-3.5" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{d.versions.downloadPng}</TooltipContent>
                </Tooltip>
                {!current && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={f(d.versions.restore, { n: v.versionNumber })}
                        disabled={restoring}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestore(v);
                        }}
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{d.versions.restoreTip}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
