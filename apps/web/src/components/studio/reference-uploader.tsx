"use client";

import { IMAGE_MIME_TYPES, MAX_ELEMENT_LABEL_LENGTH, MAX_REFERENCE_IMAGES, type ReferenceImageDto, type ReferenceKind } from "@bannerai/shared";
import { Input } from "@/components/ui/input";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "sonner";
import { api } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MAX_MB = 10;

export function ReferenceUploader({
  references,
  onChange,
  disabled,
  max = MAX_REFERENCE_IMAGES,
  kind = "reference",
  dropLabel,
}: {
  references: ReferenceImageDto[];
  onChange: (refs: ReferenceImageDto[]) => void;
  disabled?: boolean;
  max?: number;
  /** `element` uploads get an editable caption and are sent to the model as mandatory content. */
  kind?: ReferenceKind;
  dropLabel?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const { d, f } = useT();
  const remaining = max - references.length;

  const onDrop = useCallback(
    async (accepted: File[], rejected: readonly FileRejection[]) => {
      if (rejected.length) {
        const tooLarge = rejected.some((r) => r.errors.some((e) => e.code === "file-too-large"));
        toast.error(tooLarge ? f(d.uploader.tooLarge, { mb: MAX_MB }) : d.uploader.unsupported);
      }
      if (!accepted.length) return;
      const files = accepted.slice(0, remaining);
      if (files.length < accepted.length) toast.info(f(d.uploader.limit, { max }));
      setUploading(true);
      try {
        const result = await api.uploads.references(files, kind);
        onChange([...references, ...result.references]);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : d.uploader.failed);
      } finally {
        setUploading(false);
      }
    },
    [references, onChange, remaining, max, kind, d, f],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: Object.fromEntries(IMAGE_MIME_TYPES.map((m) => [m, []])),
    maxSize: MAX_MB * 1024 * 1024,
    multiple: true,
    disabled: disabled || uploading || remaining <= 0,
  });

  const [savingLabel, setSavingLabel] = useState<string | null>(null);
  const rename = async (ref: ReferenceImageDto, label: string) => {
    const trimmed = label.trim().slice(0, MAX_ELEMENT_LABEL_LENGTH);
    if (trimmed === (ref.label ?? "")) return;
    onChange(references.map((r) => (r.id === ref.id ? { ...r, label: trimmed || null } : r)));
    setSavingLabel(ref.id);
    try {
      await api.uploads.updateReference(ref.id, trimmed);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.common.somethingWrong);
    } finally {
      setSavingLabel(null);
    }
  };

  const remove = async (ref: ReferenceImageDto) => {
    onChange(references.filter((r) => r.id !== ref.id));
    try {
      await api.uploads.deleteReference(ref.id);
    } catch {
      /* already detached from the form; a stale file is harmless */
    }
  };

  return (
    <div className="space-y-3">
      {references.length > 0 && kind === "reference" && (
        <ul className="grid grid-cols-3 gap-2">
          {references.map((ref) => (
            <li key={ref.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ref.url} alt={ref.originalName} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => void remove(ref)}
                disabled={disabled}
                aria-label={f(d.uploader.remove, { name: ref.originalName })}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity hover:bg-background group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {references.length > 0 && kind === "element" && (
        <ul className="space-y-2">
          {references.map((ref) => (
            <li key={ref.id} className="flex items-center gap-3 rounded-xl border bg-card p-2">
              <div className="checkerboard size-14 shrink-0 overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ref.url} alt={ref.originalName} className="size-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <Input
                  defaultValue={ref.label ?? ""}
                  placeholder={d.create.elementLabelPlaceholder}
                  aria-label={d.create.elementLabel}
                  maxLength={MAX_ELEMENT_LABEL_LENGTH}
                  disabled={disabled}
                  onBlur={(e) => void rename(ref, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className={cn("h-8 text-sm", savingLabel === ref.id && "opacity-70")}
                />
                <p className="mt-0.5 truncate px-1 text-[11px] text-muted-foreground">{ref.originalName}</p>
              </div>
              <button
                type="button"
                onClick={() => void remove(ref)}
                disabled={disabled}
                aria-label={f(d.uploader.remove, { name: ref.originalName })}
                className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30 hover:bg-muted/40",
            (disabled || uploading) && "cursor-not-allowed opacity-60",
          )}
        >
          <input {...getInputProps()} />
          {uploading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <ImagePlus className="size-5 text-muted-foreground" />}
          <p className="mt-2 text-sm font-medium">{uploading ? d.uploader.uploading : isDragActive ? d.uploader.dropActive : (dropLabel ?? d.uploader.drop)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{f(d.uploader.browse, { mb: MAX_MB, remaining })}</p>
        </div>
      )}
    </div>
  );
}
