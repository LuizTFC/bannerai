"use client";

import { ASPECT_RATIO_OPTIONS, type AspectRatio, type UserSettings } from "@bannerai/shared";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader } from "@/components/common/page-header";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/endpoints";
import { useProviders, useUpdateUserSettings } from "@/lib/api/queries";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const { user, logout } = useAuth();
  const { d } = useT();
  const providers = useProviders();
  const update = useUpdateUserSettings();
  const { theme, setTheme } = useTheme();
  // next-themes only knows the theme on the client; avoid a hydration mismatch on the pressed state.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });

  // AuthGuard guarantees the user is loaded before this renders, so the initial state is correct.
  const [settings, setSettings] = useState<UserSettings>(user?.settings ?? {});

  const save = async () => {
    try {
      await update.mutateAsync(settings);
      toast.success(d.settings.saved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : d.settings.saveFailed);
    }
  };

  if (!user) return null;
  const engine = providers.data?.providers.find((p) => p.id === providers.data?.defaultProvider);
  const engineStatus = providers.data ? (engine?.configured ? d.common.configured : d.common.notConfigured) : "…";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
      <PageHeader title={d.settings.title} description={d.settings.subtitle} />
      <div className="mt-8 space-y-5">
        <Section title={d.settings.account}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="size-14">
              <AvatarImage src={user.avatarUrl ?? undefined} alt="" referrerPolicy="no-referrer" />
              <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">{d.settings.signedInWithGoogle}</p>
            </div>
            <Button variant="outline" onClick={() => void logout()}>
              <LogOut className="size-4" /> {d.common.signOut}
            </Button>
          </div>
        </Section>

        <Section title={d.settings.defaults} description={d.settings.defaultsDesc}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{d.settings.defaultAspect}</Label>
                <Select value={settings.defaultAspectRatio ?? "16:9"} onValueChange={(v) => setSettings((s) => ({ ...s, defaultAspectRatio: v as AspectRatio }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {d.aspect[o.value].label} · {o.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{d.settings.bannerLanguage}</Label>
                <Select value={settings.preferredLanguage ?? "auto"} onValueChange={(v) => setSettings((s) => ({ ...s, preferredLanguage: v as UserSettings["preferredLanguage"] }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{d.settings.detect}</SelectItem>
                    <SelectItem value="pt-BR">{d.languages["pt-BR"]}</SelectItem>
                    <SelectItem value="en">{d.languages.en}</SelectItem>
                    <SelectItem value="es">{d.languages.es}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={update.isPending}>
                {update.isPending && <Loader2 className="size-4 animate-spin" />} {d.settings.saveDefaults}
              </Button>
            </div>
          </div>
        </Section>

        <Section title={d.settings.appearance}>
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["light", d.settings.light, Sun],
                  ["dark", d.settings.dark, Moon],
                  ["system", d.settings.system, Monitor],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={mounted && theme === value}
                  className={cn("flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm transition-colors hover:border-foreground/30", mounted && theme === value && "border-primary bg-primary/[0.06] text-primary")}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{d.settings.uiLanguage}</Label>
              <LocaleSwitcher className="w-full sm:w-72" />
            </div>
          </div>
        </Section>

        <Section title={d.settings.status}>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{d.settings.api}</dt>
              <dd className={cn("font-medium", health.data?.status === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {health.isPending ? "…" : health.data?.status === "ok" ? d.settings.online : d.settings.degraded}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{d.settings.database}</dt>
              <dd className="font-medium">{health.data?.database ?? "…"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{d.create.aiEngine}</dt>
              <dd className="font-medium">{engineStatus}</dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
