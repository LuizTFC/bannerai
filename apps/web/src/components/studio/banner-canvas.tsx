"use client";

import { ASPECT_RATIO_OPTIONS, type AspectRatio, type BannerVersionDto } from "@bannerai/shared";
import { ImageIcon, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ratioStyle = (aspectRatio: AspectRatio) => {
  const opt = ASPECT_RATIO_OPTIONS.find((o) => o.value === aspectRatio)!;
  return { aspectRatio: `${opt.width} / ${opt.height}` };
};

/**
 * The hero element of the workspace: shows the current version, a generating state, or an
 * empty placeholder with the selected proportions.
 */
export function BannerCanvas({
  aspectRatio,
  version,
  generating,
  progressLabel,
  className,
  children,
}: {
  aspectRatio: AspectRatio;
  version: BannerVersionDto | null;
  generating?: boolean;
  progressLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { d, f } = useT();
  const portrait = aspectRatio === "9:16";
  return (
    <div className={cn("flex w-full items-center justify-center", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)] transition-shadow",
          portrait ? "max-h-[78vh] max-w-[min(100%,calc(78vh*9/16))]" : "max-w-[1100px]",
          version && !generating && "glow-ring",
        )}
        style={ratioStyle(aspectRatio)}
      >
        {version ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={version.id} src={version.url} alt={f(d.editor.versionAlt, { n: version.versionNumber })} className={cn("fade-in size-full object-cover", generating && "opacity-60 blur-[1px]")} />
        ) : (
          <div className="checkerboard absolute inset-0 grid place-items-center">
            {!generating && (
              <div className="flex flex-col items-center text-center">
                <div className="grid size-12 place-items-center rounded-2xl bg-background/80 shadow-sm">
                  <ImageIcon className="size-5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">{d.create.canvasEmpty}</p>
                <p className="text-xs text-muted-foreground">{f(d.create.canvasReady, { ratio: aspectRatio })}</p>
              </div>
            )}
          </div>
        )}
        {generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/55 backdrop-blur-[2px]">
            <div className="absolute inset-x-0 top-0 h-1 overflow-hidden">
              <div className="shimmer h-full w-full" />
            </div>
            <div className="grid size-12 place-items-center rounded-2xl bg-background shadow-md">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
            <p className="text-sm font-medium">{progressLabel ?? d.editor.generating}</p>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
