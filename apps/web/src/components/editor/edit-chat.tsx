"use client";

import type { BannerDto, GenerationDto } from "@bannerai/shared";
import { AlertCircle, Bot, Loader2, RotateCcw, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { useEditBanner, usePricing, useRetryGeneration } from "@/lib/api/queries";
import { handleInsufficientCredits } from "@/lib/credits-errors";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/format";
import { formatRelativeFor, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Bubble({ role, children, tone }: { role: "user" | "ai"; children: React.ReactNode; tone?: "error" | "muted" }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Bot className="size-4" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
          tone === "error" && "border border-destructive/30 bg-destructive/5 text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {children}
      </div>
      {isUser && (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted">
          <User className="size-4" />
        </span>
      )}
    </div>
  );
}

export function EditChat({ banner, selectedVersionId }: { banner: BannerDto; selectedVersionId: string | null }) {
  const [instruction, setInstruction] = useState("");
  const { d, f, locale } = useT();
  const router = useRouter();
  const pricing = usePricing();
  const edit = useEditBanner(banner.id);
  const retry = useRetryGeneration(banner.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = banner.activeGeneration;
  const canEdit = banner.versions.length > 0 && !active;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [banner.generations.length, active?.status]);

  const submit = async (text: string) => {
    const value = text.trim();
    if (!value || !canEdit) return;
    try {
      await edit.mutateAsync({ instruction: value, sourceVersionId: selectedVersionId ?? undefined });
      setInstruction("");
    } catch (err) {
      if (handleInsufficientCredits(err, d, f, (href) => router.push(href))) return;
      toast.error(err instanceof ApiError ? err.message : d.chat.couldNotStartEdit);
    }
  };

  const onRetry = async (g: GenerationDto) => {
    try {
      await retry.mutateAsync(g.id);
    } catch (err) {
      if (handleInsufficientCredits(err, d, f, (href) => router.push(href))) return;
      toast.error(err instanceof ApiError ? err.message : d.chat.couldNotRetry);
    }
  };

  const versionByGeneration = new Map(banner.versions.map((v) => [v.generationId, v]));
  const selectedVersion = banner.versions.find((v) => v.id === selectedVersionId) ?? banner.currentVersion;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <Bubble role="user">{banner.prompt}</Bubble>
        {banner.generations.map((g) => {
          const version = versionByGeneration.get(g.id);
          return (
            <div key={g.id} className="space-y-3">
              {g.kind === "edit" && g.instruction && <Bubble role="user">{g.instruction}</Bubble>}
              {g.status === "succeeded" && version && (
                <Bubble role="ai">
                  {g.kind === "initial" ? d.chat.hereIsBanner : d.chat.applied}{" "}
                  <span className="text-muted-foreground">
                    v{version.versionNumber} · {formatDuration(g.durationMs)} · {formatRelativeFor(d, locale, g.completedAt ?? g.createdAt)}
                  </span>
                </Bubble>
              )}
              {g.status === "failed" && (
                <Bubble role="ai" tone="error">
                  <span className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {g.errorMessage ?? d.chat.failed}
                      <Button variant="outline" size="xs" className="ml-2 mt-1 h-6" onClick={() => void onRetry(g)} disabled={retry.isPending || Boolean(active)}>
                        <RotateCcw className="size-3" /> {d.common.retry}
                      </Button>
                    </span>
                  </span>
                </Bubble>
              )}
              {(g.status === "pending" || g.status === "running") && (
                <Bubble role="ai" tone="muted">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {g.status === "pending" ? d.editor.queued : g.kind === "initial" ? d.editor.designing : d.editor.applying}
                  </span>
                </Bubble>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        {canEdit && (
          <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {d.chat.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => void submit(s)} className="shrink-0 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {selectedVersion && banner.currentVersion && selectedVersion.id !== banner.currentVersion.id ? (
              <>
                {d.editor.editingFrom} <span className="font-medium text-foreground">v{selectedVersion.versionNumber}</span>
              </>
            ) : null}
          </span>
          {pricing.data && canEdit && <span>{f(d.credits.costEdit, { n: pricing.data.costs.edit })}</span>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(instruction);
          }}
          className="relative"
        >
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(instruction);
              }
            }}
            disabled={!canEdit || edit.isPending}
            placeholder={active ? d.chat.placeholderWait : banner.versions.length === 0 ? d.chat.placeholderNoVersion : d.chat.placeholder}
            rows={2}
            className="min-h-[64px] resize-none rounded-2xl pr-12"
          />
          <Button type="submit" size="icon-sm" disabled={!canEdit || edit.isPending || !instruction.trim()} className="absolute bottom-2 right-2 rounded-full" aria-label={d.chat.send}>
            {edit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
