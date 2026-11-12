"use client";

import type { AspectRatio, ReferenceImageDto } from "@bannerai/shared";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { BannerCanvas } from "./banner-canvas";
import { CreateBannerForm } from "./create-banner-form";

export function CreateStudio() {
  const [preview, setPreview] = useState<{ aspectRatio: AspectRatio; prompt: string; references: ReferenceImageDto[] }>({ aspectRatio: "16:9", prompt: "", references: [] });
  const { d } = useT();

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Controls */}
      <section className="w-full shrink-0 border-b bg-background lg:w-[420px] lg:border-b-0 lg:border-r xl:w-[460px]">
        <div className="px-5 py-6 lg:h-[calc(100dvh)] lg:overflow-y-auto lg:px-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight">{d.create.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{d.create.subtitle}</p>
          </div>
          <CreateBannerForm onPreviewChange={setPreview} />
        </div>
      </section>

      {/* Workspace */}
      <section className="studio-grid-bg relative flex min-h-[46vh] flex-1 flex-col items-center justify-center p-5 sm:p-8 lg:min-h-0">
        <BannerCanvas aspectRatio={preview.aspectRatio} version={null} />
        {preview.prompt.trim().length > 0 && (
          <p className="mt-5 max-w-xl text-center text-xs leading-relaxed text-muted-foreground line-clamp-3">“{preview.prompt.trim()}”</p>
        )}
      </section>
    </div>
  );
}
