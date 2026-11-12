"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Wordmark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/endpoints";
import { useT } from "@/lib/i18n";
import { useAuth } from "./auth-provider";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c5.6 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export function LoginCard() {
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useAuth();
  const { d } = useT();
  const errorCode = params.get("error");
  const next = params.get("next");
  const authStatus = useQuery({ queryKey: ["auth-status"], queryFn: api.auth.status, staleTime: 60_000 });

  useEffect(() => {
    if (status === "authenticated") router.replace(next && next.startsWith("/") ? next : "/create");
  }, [status, router, next]);

  const googleReady = authStatus.data?.googleConfigured !== false;
  const errorMessage = errorCode ? (d.login.errors[errorCode as keyof typeof d.login.errors] ?? d.login.errors.generic) : null;

  return (
    <div className="fade-in relative w-full max-w-[400px] rounded-3xl border bg-card/90 p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] backdrop-blur-sm sm:p-10">
      <div className="flex flex-col items-center text-center">
        <Wordmark size="xl" className="flex-col gap-4" />
        <h1 className="sr-only">Bannerai</h1>
        <p className="mt-2 text-balance text-sm leading-relaxed text-muted-foreground">{d.login.tagline}</p>
      </div>

      <div className="mt-8 space-y-3">
        <Button asChild size="lg" className="h-12 w-full gap-3 rounded-xl text-[15px] font-medium" disabled={!googleReady}>
          <a href={api.auth.googleLoginUrl()} aria-disabled={!googleReady}>
            <span className="grid size-6 place-items-center rounded-full bg-white">
              <GoogleIcon />
            </span>
            {d.login.continueWithGoogle}
          </a>
        </Button>
        {!googleReady && <p className="text-center text-xs text-muted-foreground">{d.login.notConfigured}</p>}
        {errorMessage && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">{d.login.onlyTeam}</p>
      <div className="mt-6 flex justify-center">
        <LocaleSwitcher compact className="w-auto border-transparent bg-transparent shadow-none" />
      </div>
    </div>
  );
}
