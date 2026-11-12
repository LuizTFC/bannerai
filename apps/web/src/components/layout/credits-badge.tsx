"use client";

import { Coins } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { usePricing } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Balance + "buy" shortcut shown in the sidebar. Turns amber when fewer than one banner is left. */
export function CreditsBadge({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const { d, f } = useT();
  const pricing = usePricing();
  if (!user) return null;
  const low = pricing.data ? user.creditBalance < pricing.data.costs.generation : false;
  return (
    <Link
      href="/credits"
      onClick={onNavigate}
      className={cn("mb-2 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-muted", low ? "border-amber-500/40 bg-amber-500/10" : "bg-card")}
    >
      <Coins className={cn("size-4", low ? "text-amber-600 dark:text-amber-400" : "text-primary")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {user.creditBalance} {d.credits.creditsUnit}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{low ? d.credits.lowBalance : pricing.data ? f(d.credits.costGeneration, { n: pricing.data.costs.generation }) : ""}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-primary">{d.credits.buyShort}</span>
    </Link>
  );
}
