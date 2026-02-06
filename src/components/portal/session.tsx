"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type SessionLoadState = "loading" | "ready" | "unauth" | "error";

export type Entitlement = {
  plan: "FREE" | "PRO" | string;
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  features: {
    readOnly: boolean;
    limits: {
      invoice: number;
      quote: number;
      purchase_order: number;
    };
  };
};

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string | null;
  lastLoginAt: string | null;
  fullName: string | null;
  companyName: string | null;
  phone: string | null;
};

type SessionResponse = {
  user: SessionUser;
  entitlement: Entitlement;
};

type SessionContextValue = {
  state: SessionLoadState;
  error: string | null;
  user: SessionUser | null;
  entitlement: Entitlement | null;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function fetchSession(): Promise<SessionResponse> {
  const res = await fetch(`/api/session?ts=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error("unauth"), { code: "unauth" });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = data?.error || data?.message || `Session failed (${res.status}).`;
    throw new Error(msg);
  }
  const data = await res.json().catch(() => null);
  if (!data?.user || !data?.entitlement) throw new Error("Invalid session response.");
  return data as SessionResponse;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [state, setState] = useState<SessionLoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setState((prev) => (prev === "ready" ? "ready" : "loading"));
    try {
      const data = await fetchSession();
      setUser(data.user);
      setEntitlement(data.entitlement);
      setState("ready");
    } catch (e: any) {
      const code = e?.code || (e?.message === "unauth" ? "unauth" : null);
      if (code === "unauth") {
        setUser(null);
        setEntitlement(null);
        setState("unauth");
        return;
      }
      setError(e?.message || "Failed to load session.");
      setState("error");
    }
  }, []);

  // initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // If we become unauth while on a protected page, bounce to login.
  useEffect(() => {
    if (state !== "unauth") return;

    // preserve next
    const next = `${pathname}${sp?.toString() ? `?${sp.toString()}` : ""}`;
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }, [state, router, pathname, sp]);

  const value = useMemo<SessionContextValue>(
    () => ({ state, error, user, entitlement, refresh }),
    [state, error, user, entitlement, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
