"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/endpoints";
import { queryKeys, useCredits, usePricing } from "@/lib/api/queries";
import { formatRelativeFor, useT } from "@/lib/i18n";
import { currencyForLocale, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CreditPacks } from "./credit-packs";

export function CreditsView() {
  const { d, f, locale } = useT();
  const { user } = useAuth();
  const pricing = usePricing();
  const credits = useCredits();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const handled = useRef(false);
  const currency = currencyForLocale(locale);

  // Back from Stripe: confirm the session (works even before the webhook is configured).
  useEffect(() => {
    if (handled.current) return;
    const status = params.get("status");
    const sessionId = params.get("session_id");
    if (!status) return;
    handled.current = true;
    if (status === "cancelled") toast.info(d.credits.cancelled);
    if (status === "success" && sessionId) {
      void api.billing
        .checkoutStatus(sessionId)
        .then((r) => {
          if (r.status === "paid") toast.success(d.credits.successTitle, { description: d.credits.successDesc });
          else toast.info(d.credits.pendingTitle, { description: d.credits.pendingDesc });
          void qc.invalidateQueries({ queryKey: queryKeys.credits });
          void qc.invalidateQueries({ queryKey: queryKeys.me });
        })
        .catch(() => toast.info(d.credits.pendingTitle, { description: d.credits.pendingDesc }));
    }
    router.replace("/credits");
  }, [params, router, qc, d]);

  const balance = credits.data?.balance ?? user?.creditBalance ?? 0;
  const costs = credits.data?.costs ?? pricing.data?.costs;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
      <PageHeader title={d.credits.title} description={d.credits.subtitle} />

      <section className="mt-8 flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Coins className="size-6" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{d.credits.balance}</p>
            <p className="text-3xl font-semibold tracking-tight">
              {balance} <span className="text-base font-normal text-muted-foreground">{d.credits.creditsUnit}</span>
            </p>
          </div>
        </div>
        {costs && (
          <div className="text-sm text-muted-foreground sm:text-right">
            <p>{f(d.credits.costGeneration, { n: costs.generation })}</p>
            <p>{f(d.credits.costEdit, { n: costs.edit })}</p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.credits.packs}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{d.credits.packsDesc}</p>
        {pricing.data && !pricing.data.purchasesEnabled && <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{d.credits.purchasesDisabled}</p>}
        <div className="mt-5">
          {pricing.data ? (
            <CreditPacks pricing={pricing.data} currency={currency} checkout />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-48 rounded-2xl" />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{d.credits.history}</h2>
        <div className="mt-4 overflow-hidden rounded-2xl border">
          {credits.isPending ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : !credits.data || credits.data.transactions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{d.credits.historyEmpty}</p>
          ) : (
            <ul className="divide-y">
              {credits.data.transactions.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {d.credits.types[t.type]}
                      {t.packId && t.amountPaid != null && t.currency && (t.currency === "brl" || t.currency === "usd") ? <span className="font-normal text-muted-foreground"> · {formatMoney(t.amountPaid, t.currency)}</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{formatRelativeFor(d, locale, t.createdAt)}</p>
                  </div>
                  <span className={cn("font-mono text-sm font-semibold", t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    {t.amount > 0 ? "+" : ""}
                    {t.amount}
                  </span>
                  <span className="w-12 text-right font-mono text-xs text-muted-foreground">{t.balanceAfter}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
