"use client";

import { ASPECT_RATIO_OPTIONS, type BannerSummaryDto } from "@bannerai/shared";
import { Download, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDateFor, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DeleteBannerDialog } from "./delete-banner-dialog";

const STATUS_CLASS: Record<BannerSummaryDto["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  generating: "bg-primary/10 text-primary",
  ready: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
};

export function BannerCard({ banner }: { banner: BannerSummaryDto }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { d, locale } = useT();
  const opt = ASPECT_RATIO_OPTIONS.find((o) => o.value === banner.aspectRatio)!;
  return (
    <article className="group fade-in flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md">
      <Link href={`/banners/${banner.id}`} className="checkerboard relative block aspect-[4/3] overflow-hidden">
        {banner.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner.thumbnailUrl} alt={banner.title} className={cn("size-full transition-transform duration-500 group-hover:scale-[1.02]", opt.width >= opt.height ? "object-cover" : "object-contain")} loading="lazy" />
        ) : (
          <div className="checkerboard grid size-full place-items-center">
            {banner.status === "generating" ? <Loader2 className="size-5 animate-spin text-primary" /> : <span className="text-xs text-muted-foreground">{d.banners.noImage}</span>}
          </div>
        )}
        <span className={cn("absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur", STATUS_CLASS[banner.status])}>{d.banners.status[banner.status]}</span>
      </Link>
      <div className="flex items-start gap-2 p-3.5">
        <div className="min-w-0 flex-1">
          <Link href={`/banners/${banner.id}`} className="block truncate text-sm font-semibold hover:underline">
            {banner.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatDateFor(locale, banner.createdAt)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{banner.aspectRatio}</Badge>
            {banner.currentVersion && <Badge variant="outline">v{banner.currentVersion.versionNumber}</Badge>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={d.banners.actions}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/banners/${banner.id}`}>
                <Pencil /> {d.banners.openEdit}
              </Link>
            </DropdownMenuItem>
            {banner.currentVersion && (
              <DropdownMenuItem asChild>
                <a href={banner.currentVersion.downloadUrl}>
                  <Download /> {d.common.downloadPng}
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)} disabled={banner.status === "generating"}>
              <Trash2 /> {d.common.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DeleteBannerDialog banner={banner} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </article>
  );
}
