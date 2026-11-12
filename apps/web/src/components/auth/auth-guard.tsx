"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/** Client-side gate for private routes. The API enforces the real authorization. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status, error, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { d } = useT();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <Logo className="size-10" />
      {status === "error" ? (
        <div className="max-w-sm space-y-3">
          <p className="text-base font-medium">{d.guard.cantReach}</p>
          <p className="text-sm text-muted-foreground">{error ?? d.guard.backendHint}</p>
          <Button onClick={() => void refresh()} variant="outline">
            {d.common.tryAgain}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{d.guard.loading}</p>
      )}
    </div>
  );
}
