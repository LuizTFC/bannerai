import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

/** Shows the paywall toast for a 402 and returns true; false for any other error. */
export function handleInsufficientCredits(err: unknown, d: Dictionary, f: (t: string, p?: Record<string, string | number>) => string, go: (href: string) => void): boolean {
  if (!(err instanceof ApiError) || err.code !== "insufficient_credits") return false;
  const details = (err.details ?? {}) as { required?: number; balance?: number };
  toast.error(d.credits.insufficientTitle, {
    description: f(d.credits.insufficientDesc, { required: details.required ?? "?", balance: details.balance ?? "?" }),
    action: { label: d.credits.buy, onClick: () => go("/credits") },
    duration: 8000,
  });
  return true;
}
