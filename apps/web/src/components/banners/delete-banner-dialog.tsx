"use client";

import type { BannerDto, BannerSummaryDto } from "@bannerai/shared";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/client";
import { useDeleteBanner } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";

export function DeleteBannerDialog({ banner, open, onOpenChange, onDeleted }: { banner: BannerDto | BannerSummaryDto; open: boolean; onOpenChange: (o: boolean) => void; onDeleted?: () => void }) {
  const del = useDeleteBanner();
  const { d, f } = useT();
  const confirm = async () => {
    try {
      await del.mutateAsync(banner.id);
      toast.success(d.deleteDialog.deleted);
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.deleteDialog.failed);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{f(d.deleteDialog.title, { title: banner.title })}</DialogTitle>
          <DialogDescription>{f(d.deleteDialog.desc, { count: banner.versionCount })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            {d.common.cancel}
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={del.isPending}>
            {del.isPending && <Loader2 className="size-4 animate-spin" />} {d.common.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
