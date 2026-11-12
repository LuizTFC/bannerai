"use client";

import type { Currency, PricingInfo } from "@bannerai/shared";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useT } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Credit packs grid. With `checkout`, buttons start a Stripe Checkout; otherwise they link to sign-in. */
export function CreditPacks({ pricing, currency, checkout, signInHref }: { pricing: PricingInfo; currency: Currency; checkout?: boolean; signInHref?: string }) {
  const { d, f } = useT();
  const [pending, setPending] = useState<string | null>(null);

  const buy = async (packId: string) => {
    setPending(packId);
    try {
      const session = await api.billing.checkout(packId, currency);
      window.location.assign(session.url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.credits.checkoutFailed);
      setPending(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {pricing.packs.map((pack) => {
        const price = pack.prices[currency];
        const perCredit = price / pack.credits;
        const banners = Math.floor(pack.credits / pricing.costs.generation);
        return (
          <div key={pack.id} className={cn("relative flex flex-col rounded-2xl border bg-card p-5", pack.highlight && "border-primary shadow-[0_0_0_1px_var(--primary)]")}>
            {pack.highlight && (
              <span className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                <Sparkles className="size-3" /> {d.credits.popular}
              </span>
            )}
            <p className="text-3xl font-semibold tracking-tight">
              {pack.credits} <span className="text-base font-normal text-muted-foreground">{d.credits.creditsUnit}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{f(d.credits.bannersApprox, { n: banners })}</p>
            <p className="mt-4 text-2xl font-semibold">{formatMoney(price, currency)}</p>
            <p className="text-xs text-muted-foreground">{f(d.credits.perCredit, { price: formatMoney(Math.round(perCredit), currency) })}</p>
            <div className="mt-5">
              {checkout ? (
                <Button className="w-full" disabled={!pricing.purchasesEnabled || pending !== null} onClick={() => void buy(pack.id)}>
                  {pending === pack.id ? <Loader2 className="size-4 animate-spin" /> : null} {d.credits.checkout}
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <a href={signInHref ?? "/login"}>{d.credits.checkout}</a>
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
