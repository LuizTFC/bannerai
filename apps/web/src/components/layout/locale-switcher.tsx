"use client";

import { Languages } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api/endpoints";
import { LOCALES, useI18n, useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Persists the choice locally right away and on the account when signed in. */
export function useChangeLocale() {
  const { setLocale } = useI18n();
  const { user } = useAuth();
  return (locale: Locale) => {
    setLocale(locale);
    if (user) void api.users.updateSettings({ uiLanguage: locale }).catch(() => {});
  };
}

export function LocaleSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const { locale } = useI18n();
  const { d } = useT();
  const change = useChangeLocale();
  return (
    <Select value={locale} onValueChange={(v) => change(v as Locale)}>
      <SelectTrigger size={compact ? "sm" : "default"} className={cn("gap-2", className)} aria-label={d.common.language}>
        <Languages className="size-4 text-muted-foreground" />
        <SelectValue>{d.languages[locale]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((l) => (
          <SelectItem key={l} value={l}>
            {d.languages[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
