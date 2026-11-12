"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { UserDto } from "@bannerai/shared";
import { api } from "@/lib/api/endpoints";
import { ApiError, onUnauthorized, setCsrfToken } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queries";
import { isLocale, useI18n } from "@/lib/i18n";

interface AuthContextValue {
  user: UserDto | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const { setLocale } = useI18n();

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        const data = await api.auth.me();
        setCsrfToken(data.csrfToken);
        return data.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setCsrfToken(null);
          return null;
        }
        throw err;
      }
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  // The interface language saved on the account wins over the browser default.
  const savedLocale = me.data?.settings.uiLanguage;
  useEffect(() => {
    if (isLocale(savedLocale)) setLocale(savedLocale);
  }, [savedLocale, setLocale]);

  useEffect(() => {
    return onUnauthorized(() => {
      setCsrfToken(null);
      qc.setQueryData(queryKeys.me, null);
      if (pathname !== "/login") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    });
  }, [qc, router, pathname]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setCsrfToken(null);
      qc.clear();
      router.replace("/login");
    }
  }, [qc, router]);

  const refresh = useCallback(async () => {
    await me.refetch();
  }, [me]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      status: me.isPending ? "loading" : me.isError ? "error" : me.data ? "authenticated" : "unauthenticated",
      error: me.error instanceof Error ? me.error.message : null,
      refresh,
      logout,
    }),
    [me.data, me.isPending, me.isError, me.error, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
