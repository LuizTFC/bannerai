"use client";

import { IMAGE_MIME_TYPES } from "@bannerai/shared";
import { ImagePlus, Loader2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function AssetDropzone({ onFiles, multiple, uploading, label, hint, className }: { onFiles: (files: File[]) => void; multiple?: boolean; uploading?: boolean; label: string; hint?: string; className?: string }) {
  const { d } = useT();
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted, rejected) => {
      if (rejected.length) toast.error(d.brandKit.dropzoneUnsupported);
      if (accepted.length) onFiles(accepted);
    },
    accept: Object.fromEntries(IMAGE_MIME_TYPES.map((m) => [m, []])),
    maxSize: 10 * 1024 * 1024,
    multiple: Boolean(multiple),
    disabled: uploading,
  });
  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center transition-colors",
        isDragActive ? "border-primary bg-primary/5" : "hover:border-foreground/30 hover:bg-muted/40",
        uploading && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input {...getInputProps()} />
      {uploading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <ImagePlus className="size-5 text-muted-foreground" />}
      <p className="mt-2 text-sm font-medium">{uploading ? d.uploader.uploading : label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
