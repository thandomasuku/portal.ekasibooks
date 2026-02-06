"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import { PortalFooter } from "../PortalFooter";

export type NavItem = {
  label: string;
  href: string;
  hint?: string;
  icon?: string; // kept for compatibility, but we render premium SVGs now
};

const DEFAULT_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", hint: "Account status & access", icon: "⌂" },
  { label: "Billing", href: "/billing", hint: "Subscription & invoices", icon: "⟠" },
  { label: "Downloads", href: "/downloads", hint: "Desktop app installers", icon: "⇩" },
  { label: "Settings", href: "/settings", hint: "Profile & security", icon: "⚙" },
];

type FooterLink = { label: string; href: string };

type PortalShellProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;

  backHref?: string;
  backLabel?: string;

  navItems?: NavItem[];
  tipText?: string;

  footerLinks?: FooterLink[];
  footerRight?: React.ReactNode;
  brandName?: string;
  compactFooter?: boolean;

  headerRight?: React.ReactNode;

  // Optional overrides from pages
  userEmail?: string | null;
  userName?: string | null;
  planName?: string | null;

  // Global compact mode
  compact?: boolean;

  mobileTopOffsetPx?: number;
  brandLogoSrc?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function resolveMarketingHref(marketingBase: string, href: string) {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${marketingBase}${href}`;
  return href;
}

function deriveDisplayName(email?: string | null) {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getInitials(nameOrEmail?: string | null) {
  const raw = (nameOrEmail ?? "").trim();
  if (!raw) return "U";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    const one = parts[0];
    if (one.includes("@")) return one.slice(0, 2).toUpperCase();
    return one.slice(0, 2).toUpperCase();
  }
  const a = parts[0]?.[0] ?? "U";
  const b = parts[parts.length - 1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

async function bestEffortLogout() {
  try {
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (res.ok) return { ok: true };

    if (res.status === 404) return { ok: false, message: "Logout endpoint not found." };

    if (res.status === 405) {
      const res2 = await fetch("/api/auth/logout", { method: "GET", credentials: "include" });
      if (res2.ok) return { ok: true };
      return { ok: false, message: `Logout failed (${res2.status}).` };
    }

    return { ok: false, message: `Logout failed (${res.status}).` };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Network error while logging out." };
  }
}

function planDot(planUpper: string) {
  return planUpper === "FREE" ? "bg-slate-300" : "bg-emerald-300";
}

function planChipClasses(planUpper: string) {
  return planUpper === "FREE"
    ? "bg-white/8 ring-white/12 text-white/85"
    : "bg-emerald-300/15 ring-emerald-200/20 text-white";
}

/* ---------------- Icons ---------------- */

type IconName =
  | "home"
  | "billing"
  | "downloads"
  | "settings"
  | "logout"
  | "spark"
  | "arrowRight"
  | "creditCard";

function Icon({ name, className }: { name: IconName; className?: string }) {
  const base = "stroke-current fill-none stroke-[2] vector-effect-non-scaling-stroke";
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9 21v-7h6v7" />
        </svg>
      );
    case "billing":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M6 7h12" />
          <path d="M6 11h12" />
          <path d="M6 15h8" />
          <path d="M6 3h12a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "downloads":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M12 3v10" />
          <path d="M8 9l4 4 4-4" />
          <path d="M4 17v3h16v-3" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19.4 15a7.8 7.8 0 0 0 .1-1l2-1.2-2-3.4-2.3.6a7.7 7.7 0 0 0-.8-.7l.3-2.3H9.3l.3 2.3c-.3.2-.6.5-.8.7l-2.3-.6-2 3.4 2 1.2a7.8 7.8 0 0 0 .1 1L4.6 16.2l2 3.4 2.3-.6c.2.3.5.6.8.8l-.3 2.2h5.4l-.3-2.2c.3-.2.6-.5.8-.8l2.3.6 2-3.4L19.4 15Z" />
        </svg>
      );
    case "logout":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M10 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2" />
          <path d="M15 12H3" />
          <path d="M6 9l-3 3 3 3" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M12 2l1.2 5.2L18 8l-4.8 0.8L12 14l-1.2-5.2L6 8l4.8-0.8L12 2Z" />
          <path d="M19 14l.7 2.8L22 18l-2.3.2L19 21l-.7-2.8L16 18l2.3-.2L19 14Z" />
        </svg>
      );
    case "arrowRight":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M5 12h12" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      );
    case "creditCard":
      return (
        <svg viewBox="0 0 24 24" className={cx(base, className)}>
          <path d="M3 7h18v10H3z" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
        </svg>
      );
    default:
      return null;
  }
}

function inferIcon(item: NavItem): IconName {
  const href = item.href;
  const label = (item.label || "").toLowerCase();
  if (href.startsWith("/dashboard") || label.includes("overview")) return "home";
  if (href.startsWith("/billing") || label.includes("billing") || label.includes("subscription")) return "billing";
  if (href.startsWith("/downloads") || label.includes("download")) return "downloads";
  if (href.startsWith("/settings") || label.includes("setting") || label.includes("profile")) return "settings";
  return "spark";
}

/* ---------------- Sidebar atoms ---------------- */

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {children}
      </div>
    </div>
  );
}

function SidebarDivider({ tight }: { tight?: boolean }) {
  return <div className={cx(tight ? "my-4" : "my-5", "h-px w-full bg-white/10")} />;
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const iconName = inferIcon(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group relative w-full overflow-hidden rounded-2xl px-4 py-3 text-left ring-1 transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40",
        active
          ? "bg-white/14 ring-white/22"
          : "bg-white/6 ring-white/10 hover:bg-white/10 hover:ring-white/18 hover:-translate-y-[1px]"
      )}
    >
      {/* left accent rail */}
      <span
        className={cx(
          "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition",
          active ? "bg-emerald-300 opacity-100" : "bg-white/20 opacity-0 group-hover:opacity-60"
        )}
      />

      {/* subtle glow blob */}
      <span
        className={cx(
          "pointer-events-none absolute -right-16 -top-10 h-24 w-24 rounded-full blur-2xl transition-opacity duration-200",
          active ? "bg-emerald-300/20 opacity-100" : "bg-white/10 opacity-0 group-hover:opacity-100"
        )}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cx(
              "grid h-9 w-9 place-items-center rounded-2xl ring-1 transition",
              active ? "bg-white/16 ring-white/20" : "bg-white/10 ring-white/14 group-hover:bg-white/12"
            )}
          >
            <Icon name={iconName} className="h-[18px] w-[18px] text-white/90" />
          </span>

          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{item.label}</div>
            {item.hint ? <div className="mt-0.5 truncate text-xs text-white/65">{item.hint}</div> : null}
          </div>
        </div>

        <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/0 ring-1 ring-white/0 transition group-hover:bg-white/8 group-hover:ring-white/10">
          <Icon name="arrowRight" className="h-[16px] w-[16px] text-white/70 group-hover:text-white/90" />
        </span>
      </div>
    </button>
  );
}

function QuickActionButton({
  label,
  hint,
  icon,
  onClick,
}: {
  label: string;
  hint: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "group w-full rounded-2xl bg-white/8 px-3 py-3 text-left ring-1 ring-white/12 transition",
        "hover:bg-white/12 hover:ring-white/18 hover:-translate-y-[1px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/14">
          <Icon name={icon} className="h-[18px] w-[18px] text-white/90" />
        </span>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold text-white">{label}</div>
            <span className="text-xs font-semibold text-white/70 transition group-hover:text-white/90">→</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-white/65">{hint}</div>
        </div>
      </div>
    </button>
  );
}

export function PortalShell({
  badge = "Secure portal",
  title,
  subtitle,
  children,
  backHref = "/dashboard",
  backLabel = "Back",
  navItems = DEFAULT_NAV,
  tipText = "Tip: This portal manages access and billing — your invoices live inside the desktop app.",
  footerLinks = [
    { label: "Support", href: "/support" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
  ],
  footerRight,
  brandName = "eKasiBooks",
  compactFooter,
  headerRight,
  userEmail: userEmailProp,
  userName: userNameProp,
  planName,
  compact = true,
  mobileTopOffsetPx = 72,
  brandLogoSrc = "/ekasibooks-logo.png",
}: PortalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // PortalShell-owned identity (fallback)
  const [me, setMe] = useState<{ email: string | null; displayName: string | null } | null>(null);

  // Logout UI state
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const currentPath = pathname || "/dashboard";
  const planUpper = String(planName ?? "FREE").toUpperCase();

  // close mobile sidebar on navigation changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [currentPath, sp]);

  // Auto-load /api/auth/me if page did not supply userEmail
  useEffect(() => {
    let cancelled = false;
    if (userEmailProp) return;

    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;

        const data = await res.json().catch(() => null);
        if (!data) return;

        const u = data.user ?? data;
        const email = (u?.email as string | undefined) ?? null;

        const displayName =
          (u?.displayName as string | undefined) ??
          (u?.name as string | undefined) ??
          deriveDisplayName(email);

        if (cancelled) return;
        setMe({ email, displayName: displayName ?? null });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userEmailProp]);

  const resolvedEmail = userEmailProp ?? me?.email ?? null;
  const resolvedName = userNameProp ?? me?.displayName ?? deriveDisplayName(resolvedEmail) ?? null;
  const avatarInitials = useMemo(
    () => getInitials(resolvedName ?? resolvedEmail ?? "User"),
    [resolvedName, resolvedEmail]
  );

  const year = new Date().getFullYear();

  const marketingBase = (process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ekasibooks.co.za").replace(/\/+$/, "");

  const resolvedFooterLinks = (footerLinks ?? []).map((l) => ({
    ...l,
    href: resolveMarketingHref(marketingBase, l.href),
  }));

  const loginHref = useMemo(() => {
    const next = currentPath && currentPath.startsWith("/") ? currentPath : "/dashboard";
    return `/login?next=${encodeURIComponent(next)}`;
  }, [currentPath]);

  async function onLogout() {
    if (logoutLoading) return;
    setLogoutError(null);
    setLogoutLoading(true);

    const res = await bestEffortLogout();

    if (res.ok) {
      window.location.href = "/login";
      return;
    }

    setLogoutError(res.message || "Failed to log out.");
    setLogoutLoading(false);

    setTimeout(() => {
      window.location.href = loginHref;
    }, 600);
  }

  const LogoutButton = ({ variant }: { variant: "desktop" | "mobile" }) => {
    const base =
      variant === "desktop"
        ? "group w-full rounded-2xl px-4 py-3 text-left ring-1 transition-all duration-200"
        : "group w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold ring-1 transition";

    const cls =
      variant === "desktop"
        ? cx(
            base,
            "bg-white/6 ring-white/10 hover:bg-white/10 hover:ring-white/18 hover:-translate-y-[1px]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/35",
            logoutLoading && "opacity-70"
          )
        : cx(
            base,
            "bg-white/10 ring-white/15 hover:bg-white/15",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/35",
            logoutLoading && "opacity-70"
          );

    return (
      <button
        type="button"
        onClick={onLogout}
        disabled={logoutLoading}
        className={cls}
        aria-label="Log out"
        title="Log out"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/14">
              <Icon name="logout" className="h-[18px] w-[18px] text-white/90" />
            </span>

            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{logoutLoading ? "Logging out..." : "Logout"}</div>
              {variant === "desktop" ? <div className="mt-0.5 text-xs text-white/65">End your session</div> : null}
            </div>
          </div>

          <span className="text-xs font-semibold text-white/65 transition group-hover:text-white/90">
            {logoutLoading ? "…" : "→"}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className={cx("h-screen w-full overflow-hidden bg-[#f6f9fb]", compact && "portal-compact")}>
      {/* Mobile top bar */}
      <div className="fixed left-0 top-0 z-30 w-full border-b border-slate-200/70 bg-white/70 backdrop-blur lg:hidden">
        <div className="flex w-full items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/25"
            aria-label="Open menu"
          >
            <span className="text-base leading-none">☰</span>
            Menu
          </button>

          <div className="flex items-center gap-3">
            <div className="relative h-10 w-[180px]">
              <Image
                src={brandLogoSrc}
                alt={`${brandName} logo`}
                fill
                sizes="180px"
                className="object-contain"
                priority
              />
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-900">{resolvedName ?? "Secure portal"}</div>
              <div className="text-xs text-slate-600">{resolvedEmail ?? "Signed in"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2-column shell */}
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* Desktop sidebar */}
        <aside className="relative hidden h-full overflow-hidden border-r border-white/10 bg-gradient-to-br from-[#071f2c] via-[#0b2f41] to-[#1b5a5f] text-white lg:block">
          {/* ambient blobs */}
          <div className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-28 h-80 w-80 rounded-full bg-black/15 blur-3xl" />

          {/* subtle grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.6) 1px, transparent 1px)",
              backgroundSize: "42px 42px",
            }}
          />

          <div className="relative flex h-full flex-col px-5 py-6">
            <BrandBlock brandName={brandName} logoSrc={brandLogoSrc} />

            {/* Identity card */}
            <div className="mt-6 rounded-3xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/18">
                    <span className="text-sm font-extrabold tracking-wide text-white/95">{avatarInitials}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Signed in</div>
                    <div className="mt-1 truncate text-sm font-semibold text-white">{resolvedName ?? "—"}</div>
                    <div className="mt-0.5 break-all text-xs text-white/65">{resolvedEmail ?? "—"}</div>
                  </div>
                </div>

                <div
                  className={cx(
                    "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                    planChipClasses(planUpper)
                  )}
                  title="Your current plan"
                >
                  <span className={cx("mr-2 inline-block h-2 w-2 rounded-full", planDot(planUpper))} />
                  {planUpper}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-white/55">
                <span>Secure access</span>
                <span>Portal</span>
              </div>
            </div>

            <SidebarDivider />

            {/* Scrollable sidebar body */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {/* Nav */}
                <nav>
                  <SidebarSectionLabel>Navigation</SidebarSectionLabel>
                  <div className="mt-3 space-y-2">
                    {navItems.map((item) => {
                      const active =
                        (item.href === "/dashboard" && currentPath === "/dashboard") ||
                        (item.href !== "/dashboard" && currentPath.startsWith(item.href));

                      return (
                        <NavButton
                          key={item.href}
                          item={item}
                          active={active}
                          onClick={() => router.push(item.href)}
                        />
                      );
                    })}
                  </div>

                  {/* Quick actions (no duplicates) */}
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <QuickActionButton
                      label="Download the app"
                      hint="Get the latest installer"
                      icon="downloads"
                      onClick={() => router.push("/downloads")}
                    />
                  </div>

                  <SidebarDivider tight />

                  {/* Account */}
                  <SidebarSectionLabel>Account</SidebarSectionLabel>
                  <div className="mt-3">
                    <LogoutButton variant="desktop" />
                    {logoutError ? (
                      <div className="mt-2 rounded-2xl bg-white/10 p-3 text-xs text-white/80 ring-1 ring-white/12">
                        {logoutError}
                      </div>
                    ) : null}
                  </div>
                </nav>
              </div>

              {/* bottom */}
              <div className="mt-5 flex items-center justify-between text-xs text-white/55">
                <span>{brandName} Portal</span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">v1</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile sidebar */}
        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-slate-900/45"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[344px] max-w-[88vw] border-r border-white/10 bg-gradient-to-br from-[#071f2c] via-[#0b2f41] to-[#1b5a5f] text-white shadow-2xl">
              <div className="relative flex h-full flex-col p-5">
                <div className="pointer-events-none absolute -top-20 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-black/15 blur-3xl" />

                <div className="relative flex items-center justify-between">
                  <BrandBlock brandName={brandName} logoSrc={brandLogoSrc} compact />
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/35"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="relative mt-5 rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/18">
                        <span className="text-sm font-extrabold tracking-wide text-white/95">{avatarInitials}</span>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                          Signed in
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">{resolvedName ?? "—"}</div>
                        <div className="mt-0.5 break-all text-xs text-white/65">{resolvedEmail ?? "—"}</div>
                      </div>
                    </div>

                    <div
                      className={cx(
                        "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                        planChipClasses(planUpper)
                      )}
                    >
                      <span className={cx("mr-2 inline-block h-2 w-2 rounded-full", planDot(planUpper))} />
                      {planUpper}
                    </div>
                  </div>
                </div>

                <div className="relative mt-5 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  <SidebarSectionLabel>Navigation</SidebarSectionLabel>
                  <div className="mt-3 space-y-2">
                    {navItems.map((item) => {
                      const active =
                        (item.href === "/dashboard" && currentPath === "/dashboard") ||
                        (item.href !== "/dashboard" && currentPath.startsWith(item.href));

                      return (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() => router.push(item.href)}
                          className={cx(
                            "w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold ring-1 transition",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/35",
                            active ? "bg-white/14 ring-white/20" : "bg-white/10 ring-white/15 hover:bg-white/15"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-3">
                              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/14">
                                <Icon name={inferIcon(item)} className="h-[18px] w-[18px] text-white/90" />
                              </span>
                              {item.label}
                            </span>
                            <span className="text-white/70">→</span>
                          </div>
                          {item.hint ? <div className="mt-1 text-xs text-white/65">{item.hint}</div> : null}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick actions (no duplicates) */}
                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <QuickActionButton
                      label="Download the app"
                      hint="Get the latest installer"
                      icon="downloads"
                      onClick={() => router.push("/downloads")}
                    />
                  </div>

                  <SidebarDivider tight />

                  <SidebarSectionLabel>Account</SidebarSectionLabel>
                  <div className="mt-3">
                    <MobileLogout LogoutButton={LogoutButton} />
                    {logoutError ? (
                      <div className="mt-2 rounded-2xl bg-white/10 p-3 text-xs text-white/80 ring-1 ring-white/12">
                        {logoutError}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="relative mt-5 flex items-center justify-between text-xs text-white/55">
                  <span>{brandName} Portal</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/10">v1</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Right column scroll area */}
        <main
          className={cx(
            "h-full overflow-y-auto overscroll-contain",
            "bg-gradient-to-b from-[#f7fafc] to-[#eef4f7]",
            "px-4 py-6 lg:px-10 lg:py-8",
            "pt-[calc(var(--mobileTopOffsetPx)_+_8px)] lg:pt-8"
          )}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          style={{ ["--mobileTopOffsetPx" as any]: `${mobileTopOffsetPx}px` }}
        >
          <div className="mx-auto flex min-h-full max-w-[1600px] flex-col">
            {/* Top header */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {badge}
                </div>

                <h1 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h1>
                {subtitle ? <p className="mt-1 text-slate-600">{subtitle}</p> : null}
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {headerRight}
                {backLabel ? (
                  <button
                    onClick={() => router.push(backHref)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/25"
                  >
                    {backLabel}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex-1">{children}</div>

            <PortalFooter
              brandName={brandName}
              year={year}
              links={resolvedFooterLinks}
              right={footerRight}
              compact={compactFooter}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------------- Brand ---------------- */

function BrandBlock({
  compact,
  brandName,
  logoSrc,
}: {
  compact?: boolean;
  brandName: string;
  logoSrc: string;
}) {
  return (
    <div className="flex items-center">
      <div className={cx("relative", compact ? "h-12 w-[200px]" : "h-16 w-[260px]")}>
        <Image
          src={logoSrc}
          alt={`${brandName} logo`}
          fill
          sizes={compact ? "200px" : "260px"}
          className="object-contain"
          priority
        />
      </div>
    </div>
  );
}

/**
 * Tiny helper so we don't duplicate the LogoutButton wiring for mobile.
 * Keeps your existing nested component approach intact.
 */
function MobileLogout({
  LogoutButton,
}: {
  LogoutButton: ({ variant }: { variant: "desktop" | "mobile" }) => ReactElement;
}) {
  return <LogoutButton variant="mobile" />;
}
