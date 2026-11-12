"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { en, type Dictionary } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { ptBR } from "./dictionaries/pt-BR";

export const LOCALES = ["en", "pt-BR", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
const STORAGE_KEY = "cbs.locale";

const dictionaries: Record<Locale, Dictionary> = { en, "pt-BR": ptBR, es };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** Maps a BCP-47 tag (navigator.language) to one of the supported locales. */
export function localeFromLanguageTag(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith("pt")) return "pt-BR";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("en")) return "en";
  return null;
}

export function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
}

const listeners = new Set<() => void>();
let currentLocale: Locale | null = null;

function resolveInitialLocale(): Locale {
  if (currentLocale) return currentLocale;
  currentLocale = readStoredLocale() ?? localeFromLanguageTag(typeof navigator !== "undefined" ? navigator.language : null) ?? DEFAULT_LOCALE;
  return currentLocale;
}

function setGlobalLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  writeStoredLocale(locale);
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (params[key] !== undefined ? String(params[key]) : `{${key}}`));
}

interface I18nContextValue {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Locale provider. The locale is resolved client-side (localStorage → browser language → English)
 * and kept in a module-level store so the server render and the first client render agree
 * (both start from English and switch after hydration).
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, resolveInitialLocale, () => DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setGlobalLocale(next), []);
  const value = useMemo<I18nContextValue>(() => ({ locale, dictionary: dictionaries[locale], setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Returns the dictionary for the active locale plus a small interpolation helper. */
export function useT() {
  const { dictionary, locale } = useI18n();
  const f = useCallback((template: string, params?: Params) => interpolate(template, params), []);
  return { d: dictionary, f, locale };
}

/** Intl-aware date formatting for the active locale. */
export function formatDateFor(locale: Locale, iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  try {
    return new Intl.DateTimeFormat(locale, opts).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatRelativeFor(d: Dictionary, locale: Locale, iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return d.common.justNow;
  if (minutes < 60) return interpolate(d.common.minutesAgo, { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return interpolate(d.common.hoursAgo, { n: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return interpolate(d.common.daysAgo, { n: days });
  return formatDateFor(locale, iso);
}
