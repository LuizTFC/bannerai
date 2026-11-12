"use client";

import type { BannerDto, BannerVersionDto } from "@bannerai/shared";
import { ArrowLeft, BadgeCheck, Check, Columns2, Download, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteBannerDialog } from "@/components/banners/delete-banner-dialog";
import { BannerCanvas } from "@/components/studio/banner-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/client";
import { useApproveVersion, useBanner, useRenameBanner, useRestoreVersion } from "@/lib/api/queries";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import { CompareDialog } from "./compare-dialog";
import { EditChat } from "./edit-chat";
import { VersionHistory } from "./version-history";

function TitleEditor({ banner }: { banner: BannerDto }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(banner.title);
  const { d } = useT();
  const rename = useRenameBanner(banner.id);
  // Re-sync the draft when the title changes from the server (e.g. the AI named the event).
  const [syncedTitle, setSyncedTitle] = useState(banner.title);
  if (syncedTitle !== banner.title) {
    setSyncedTitle(banner.title);
    setValue(banner.title);
  }
  const save = async () => {
    const title = value.trim();
    setEditing(false);
    if (!title || title === banner.title) return setValue(banner.title);
    try {
      await rename.mutateAsync(title);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.editor.couldNotRename);
    }
  };
  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex items-center gap-1.5"
      >
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => void save()} maxLength={120} className="h-8 w-full max-w-[260px]" />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label={d.editor.saveTitle}>
          <Check className="size-4" />
        </Button>
      </form>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="group flex w-full min-w-0 items-center gap-1.5 text-left" title={d.editor.rename}>
      <h1 className="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">{banner.title}</h1>
      <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export function BannerEditor({ bannerId }: { bannerId: string }) {
  const router = useRouter();
  const { d, f } = useT();
  const query = useBanner(bannerId);
  const restore = useRestoreVersion(bannerId);
  const approve = useApproveVersion(bannerId);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const banner = query.data;

  // Follow the newest version automatically whenever one lands.
  const latestId = banner?.currentVersion?.id ?? null;
  const [trackedLatest, setTrackedLatest] = useState<string | null>(null);
  if (latestId !== trackedLatest) {
    setTrackedLatest(latestId);
    setSelectedVersionId(null);
  }

  if (query.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> {d.editor.loading}
      </div>
    );
  }
  if (query.isError || !banner) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-base font-medium">{notFound ? d.editor.notFound : d.editor.loadFailed}</p>
        <Button asChild variant="outline">
          <Link href="/banners">{d.editor.backToBanners}</Link>
        </Button>
      </div>
    );
  }

  const active = banner.activeGeneration;
  const shownVersion: BannerVersionDto | null = banner.versions.find((v) => v.id === selectedVersionId) ?? banner.currentVersion;
  const progressLabel = active ? (active.status === "pending" ? d.editor.queued : active.kind === "initial" ? d.editor.designing : d.editor.applying) : undefined;

  const onApprove = async (v: BannerVersionDto) => {
    try {
      const result = await approve.mutateAsync(v.id);
      toast.success(d.editor.approvedToast, { description: banner.brandKitId ? f(d.editor.approvedLearned, { n: result.learned.length }) : d.editor.approvedNoKit });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.editor.approveFailed);
    }
  };

  const onRestore = async (v: BannerVersionDto) => {
    try {
      await restore.mutateAsync(v.id);
      setSelectedVersionId(null);
      toast.success(f(d.editor.restored, { n: v.versionNumber }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.editor.couldNotRestore);
    }
  };

  // On lg+ the editor is locked to the viewport height (flex-none stops it from growing with a long
  // conversation) so the canvas and the side panel scroll independently instead of the whole page.
  return (
    <div className="flex flex-1 flex-col lg:h-dvh lg:flex-none lg:flex-row lg:overflow-hidden">
      {/* Workspace */}
      <section className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-3 sm:flex-nowrap sm:px-6">
          <Button asChild variant="ghost" size="icon-sm" aria-label={d.common.back} className="shrink-0">
            <Link href="/banners">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1 basis-0">
            <TitleEditor banner={banner} />
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">{banner.aspectRatio}</Badge>
              {shownVersion && <span>v{shownVersion.versionNumber}</span>}
              {shownVersion && banner.approvedVersionId === shownVersion.id && (
                <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="size-3" /> {d.editor.approved}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            {banner.versions.length > 1 && (
              <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setCompareOpen(true)}>
                <Columns2 className="size-4" /> {d.editor.compare}
              </Button>
            )}
            {shownVersion && !active && banner.approvedVersionId !== shownVersion.id && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => void onApprove(shownVersion)} disabled={approve.isPending}>
                    {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                    <span className="hidden sm:inline">{d.editor.approve}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{d.editor.approveTip}</TooltipContent>
              </Tooltip>
            )}
            {shownVersion && (
              <Button asChild size="sm">
                <a href={shownVersion.downloadUrl}>
                  <Download className="size-4" /> <span className="hidden sm:inline">{d.common.downloadPng}</span>
                  <span className="sm:hidden">PNG</span>
                </a>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={d.editor.more}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {banner.versions.length > 1 && (
                  <DropdownMenuItem onSelect={() => setCompareOpen(true)} className="sm:hidden">
                    <Columns2 /> {d.editor.compareVersions}
                  </DropdownMenuItem>
                )}
                {shownVersion && banner.currentVersion && shownVersion.id !== banner.currentVersion.id && (
                  <DropdownMenuItem onSelect={() => void onRestore(shownVersion)}>{f(d.editor.restoreVersion, { n: shownVersion.versionNumber })}</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)} disabled={Boolean(active)}>
                  <Trash2 /> {d.editor.deleteBanner}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="studio-grid-bg flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-4 sm:p-8">
          <BannerCanvas aspectRatio={banner.aspectRatio} version={shownVersion} generating={Boolean(active)} progressLabel={progressLabel} />
          {banner.status === "failed" && !active && banner.versions.length === 0 && <p className="mt-4 text-center text-sm text-muted-foreground">{d.editor.failedHint}</p>}
        </div>
      </section>

      {/* Side panel */}
      <aside className="flex h-[70dvh] w-full shrink-0 flex-col border-t bg-background lg:h-auto lg:w-[400px] lg:border-l lg:border-t-0 xl:w-[440px]">
        <Tabs defaultValue="edit" className="flex h-full min-h-0 flex-col gap-0">
          <TabsList className="m-3 grid w-auto grid-cols-2">
            <TabsTrigger value="edit">{d.editor.refine}</TabsTrigger>
            <TabsTrigger value="versions">
              {d.editor.versions}
              {banner.versions.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{banner.versions.length}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="min-h-0 flex-1">
            <EditChat banner={banner} selectedVersionId={selectedVersionId} />
          </TabsContent>
          <TabsContent value="versions" className="min-h-0 flex-1 overflow-y-auto">
            <VersionHistory banner={banner} selectedVersionId={selectedVersionId} onSelect={(v) => setSelectedVersionId(v.id)} onRestore={(v) => void onRestore(v)} restoring={restore.isPending} />
          </TabsContent>
        </Tabs>
      </aside>

      {banner.versions.length > 1 && <CompareDialog key={`${compareOpen}-${shownVersion?.id}`} banner={banner} open={compareOpen} onOpenChange={setCompareOpen} initialRightId={shownVersion?.id} />}
      <DeleteBannerDialog banner={banner} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={() => router.replace("/banners")} />
    </div>
  );
}
