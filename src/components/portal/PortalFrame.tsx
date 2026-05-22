"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { PortalShell } from "./PortalShell";
import { useSession } from "./session";

type EntitlementSnapshot = {
  plan?: string | null;
  tier?: string | null;
  status?: string | null;
};

type PageMeta = {
  badge: string;
  title: string;
  subtitle?: string;
};

const PAGE_META: Record<string, PageMeta> = {
  "/dashboard": {
    badge: "Overview",
    title: "Account Command Centre",
    subtitle: "Manage your eKasiBooks account, subscription, downloads, and portal settings.",
  },
  "/billing": {
    badge: "Billing",
    title: "Subscription & Billing",
    subtitle: "Review your plan, billing status, renewal dates, and subscription access.",
  },
  "/downloads": {
    badge: "Downloads",
    title: "Desktop installers",
    subtitle: "Download the latest eKasiBooks desktop installer and review release information.",
  },
  "/settings": {
    badge: "Settings",
    title: "Settings",
    subtitle: "Manage your profile, account details, and portal preferences.",
  },
  "/admin": {
    badge: "Admin",
    title: "Operations console",
    subtitle: "Manage portal users, subscriptions, entitlement visibility and desktop activity.",
  },
  "/admin/users": {
    badge: "Admin",
    title: "Users",
    subtitle: "Review portal users, subscriptions, entitlement status and desktop activity.",
  },
  "/admin/users/detail": {
    badge: "Admin",
    title: "User profile",
    subtitle: "Review profile, entitlement, subscription, sessions and company activity.",
  },
};

function normalizePlanName(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "FREE";
  return raw.toUpperCase();
}

function getPageMeta(pathname: string | null): PageMeta {
  const path = pathname || "/dashboard";

  if (path.startsWith("/admin/users/")) return PAGE_META["/admin/users/detail"];
  if (path.startsWith("/admin/users")) return PAGE_META["/admin/users"];
  if (path.startsWith("/admin")) return PAGE_META["/admin"];
  if (path.startsWith("/billing")) return PAGE_META["/billing"];
  if (path.startsWith("/downloads")) return PAGE_META["/downloads"];
  if (path.startsWith("/settings")) return PAGE_META["/settings"];
  if (path.startsWith("/dashboard")) return PAGE_META["/dashboard"];

  return {
    badge: "Portal",
    title: "eKasiBooks Portal",
    subtitle: "Manage your eKasiBooks account.",
  };
}

export function PortalFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, user } = useSession();
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);

  const pageMeta = useMemo(() => getPageMeta(pathname), [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadEntitlement() {
      if (state !== "ready") return;

      try {
        const res = await fetch(`/api/entitlement?ts=${Date.now()}`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = (await res.json().catch(() => null)) as EntitlementSnapshot | null;
        if (!cancelled) setEntitlement(data);
      } catch {
        // Keep the shell usable even if entitlement cannot be fetched.
      }
    }

    void loadEntitlement();

    return () => {
      cancelled = true;
    };
  }, [state]);

  const planName = normalizePlanName(entitlement?.plan ?? entitlement?.tier ?? "FREE");

  return (
    <PortalShell
      badge={pageMeta.badge}
      title={pageMeta.title}
      subtitle={pageMeta.subtitle}
      userEmail={state === "ready" ? user?.email ?? null : null}
      userName={state === "ready" ? user?.displayName ?? user?.fullName ?? null : null}
      userRole={state === "ready" ? user?.role ?? null : null}
      planName={planName}
      backLabel=""
    >
      {children}
    </PortalShell>
  );
}
