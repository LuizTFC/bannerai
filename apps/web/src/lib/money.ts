import type { Currency } from "@bannerai/shared";

const LOCALE_FOR: Record<Currency, string> = { brl: "pt-BR", usd: "en-US" };

/** Formats an amount in the smallest unit (cents/centavos) for display. */
export function formatMoney(amountMinor: number, currency: Currency, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale ?? LOCALE_FOR[currency], { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Currency to show for an interface locale (purchases are charged in this currency). */
export const currencyForLocale = (locale: string): Currency => (locale === "pt-BR" ? "brl" : "usd");
