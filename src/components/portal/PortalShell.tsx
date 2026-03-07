"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PortalFooter } from "../PortalFooter";

export type NavItem = {
  label: string;
  href: string;
  hint?: string;
  icon?: string;
};

const DEFAULT_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: "⌂" },
  { label: "Billing", href: "/billing", icon: "⟠" },
  { label: "Downloads", href: "/downloads", icon: "⇩" },
  { label: "Settings", href: "/settings", icon: "⚙" },
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

  footerLinks?: FooterLink[];
  footerRight?: React.ReactNode;
  brandName?: string;
  compactFooter?: boolean;

  headerRight?: React.ReactNode;

  userEmail?: string | null;
  userName?: string | null;
  planName?: string | null;

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

/* ---------------- Icons ---------------- */

type IconName = "home" | "billing" | "downloads" | "settings" | "logout";

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
    default:
      return null;
  }
}

function inferIcon(item: NavItem): IconName {
  const href = item.href;
  const label = (item.label || "").toLowerCase();
  if (href.startsWith("/dashboard") || label.includes("overview") || label.includes("dashboard")) return "home";
  if (href.startsWith("/billing") || label.includes("billing") || label.includes("subscription")) return "billing";
  if (href.startsWith("/downloads") || label.includes("download")) return "downloads";
  return "settings";
}

/* ---------------- Sidebar row (Prosperworks-ish) ---------------- */

function SidebarRow({
  label,
  active,
  iconName,
  onClick,
}: {
  label: string;
  active: boolean;
  iconName: IconName;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative w-full select-none text-left",
        "flex items-center gap-3",
        "rounded-md px-3 py-2",
        "transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/7 hover:text-white"
      )}
    >
      <span
        aria-hidden="true"
        className={cx("absolute left-0 top-1 bottom-1 w-[3px] rounded-full", active ? "opacity-100" : "opacity-0")}
        style={{ background: "var(--primary)" }}
      />

      <span aria-hidden="true" className={cx("grid h-8 w-8 place-items-center rounded-md", active ? "bg-white/10" : "bg-white/5")}>
        <Icon name={iconName} className="h-[16px] w-[16px] text-white/85" />
      </span>

      <span className="text-[13px] font-medium">{label}</span>
    </button>
  );
}

/* ---------------- PortalShell ---------------- */

export function PortalShell({
  badge = "Secure portal",
  title,
  subtitle,
  children,
  backHref = "/dashboard",
  backLabel = "Back",
  navItems = DEFAULT_NAV,
  footerLinks = [
    { label: "Support", href: "/support" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
  ],
  footerRight,
  brandName = "eKasiBooks",
  compactFooter,
  headerRight,
  userEmail,
  userName,
  planName,
  compact = true,
  mobileTopOffsetPx = 60,
  brandLogoSrc = "/ekasibooks-logo.png",
}: PortalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const currentPath = pathname || "/dashboard";

  useEffect(() => {
    setSidebarOpen(false);
  }, [currentPath, sp]);

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

  const resolvedEmail = userEmail ?? "";
  const resolvedName = userName ?? deriveDisplayName(resolvedEmail) ?? "User";
  const initials = useMemo(() => getInitials(resolvedName || resolvedEmail || "User"), [resolvedName, resolvedEmail]);
  const plan = String(planName ?? "FREE").toUpperCase();

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

  // Shared sidebar look
  const SIDEBAR_BG = "#2f3b46"; // Prosperworks-ish charcoal
  const SIDEBAR_DIV = "rgba(255,255,255,0.08)";

  return (
    <div className={cx("h-screen w-full overflow-hidden", compact && "portal-compact")}>
      {/* Mobile top bar */}
      <div className="fixed left-0 top-0 z-30 w-full border-b border-slate-200/70 bg-white/70 backdrop-blur lg:hidden">
        <div className="flex w-full items-center justify-between px-3 py-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-slate-900 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            aria-label="Open menu"
          >
            <span className="text-base leading-none">☰</span>
            Menu
          </button>

          <div className="relative h-8 w-[130px]">
            <Image src={brandLogoSrc} alt={`${brandName} logo`} fill sizes="130px" className="object-contain" priority />
          </div>
        </div>
      </div>

      {/* 2-column shell */}
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[240px_1fr]">
        {/* Desktop sidebar */}
        <aside
          className="hidden h-full text-white lg:block"
          style={{
            background: SIDEBAR_BG,
            borderRight: `1px solid ${SIDEBAR_DIV}`,
          }}
        >
          <div className="flex h-full flex-col">
            {/* Brand */}
            <div className="flex flex-col items-center px-4 pt-6 pb-4">
              <div className="text-[15px] font-semibold tracking-tight text-white">
                {brandName}
              </div>

              {/* Accent underline */}
              <div className="mt-3 h-[3px] w-10 rounded-full"
                  style={{ background: "var(--primary)" }}
              />

              {/* subtle divider */}
              <div
                className="mt-4 h-px w-full"
                style={{ background: "rgba(255,255,255,0.08)" }}
              />
            </div>

            {/* Identity */}
            <div className="px-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[12px] font-semibold">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white/90">{resolvedName}</div>
                  <div className="truncate text-[12px] text-white/60">{resolvedEmail}</div>
                </div>
              </div>

              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />
                {plan}
              </div>
            </div>

            <div className="mx-4 mb-3 h-px" style={{ background: SIDEBAR_DIV }} />

            {/* Nav */}
            <div className="px-3">
              <div className="px-1 pb-2 text-[11px] font-semibold text-white/55">Navigation</div>

              <div className="space-y-1">
                {navItems.map((item) => {
                  const active =
                    (item.href === "/dashboard" && currentPath === "/dashboard") ||
                    (item.href !== "/dashboard" && currentPath.startsWith(item.href));

                  return (
                    <SidebarRow
                      key={item.href}
                      label={item.label}
                      active={active}
                      iconName={inferIcon(item)}
                      onClick={() => router.push(item.href)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex-1" />

            {/* Account */}
            <div className="px-3 pb-4">
              <div className="mx-1 mb-2 mt-3 h-px" style={{ background: SIDEBAR_DIV }} />
              <div className="px-1 pb-2 text-[11px] font-semibold text-white/55">Account</div>

              <SidebarRow
                label={logoutLoading ? "Logging out..." : "Logout"}
                active={false}
                iconName="logout"
                onClick={onLogout}
              />

              {logoutError ? (
                <div className="mt-2 rounded-md bg-white/8 px-3 py-2 text-xs text-white/80">{logoutError}</div>
              ) : null}

              <div className="mt-4 flex items-center justify-between px-1 text-xs text-white/50">
                <span>{brandName} Portal</span>
                <span className="rounded-md bg-white/8 px-2 py-1">v1</span>
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
            <div
              className="absolute left-0 top-0 h-full w-[344px] max-w-[88vw] text-white shadow-2xl"
              style={{ background: SIDEBAR_BG }}
            >
              <div className="flex h-full flex-col p-4">
             <div className="relative flex items-center justify-center">
  <div className="text-sm font-semibold text-white">
    {brandName}
  </div>

  <button
    onClick={() => setSidebarOpen(false)}
    className="absolute right-0 rounded-xl px-3 py-2 text-sm font-semibold ring-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
    style={{ borderColor: "rgba(255,255,255,0.12)" }}
    aria-label="Close"
  >
    ✕
  </button>
</div>

                <div className="mt-4 h-px" style={{ background: SIDEBAR_DIV }} />

                {/* Identity */}
                <div className="mt-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-[12px] font-semibold">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-white/90">{resolvedName}</div>
                      <div className="truncate text-[12px] text-white/60">{resolvedEmail}</div>
                    </div>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                    <span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />
                    {plan}
                  </div>
                </div>

                <div className="mt-4 h-px" style={{ background: SIDEBAR_DIV }} />

                {/* Mobile nav */}
                <div className="mt-4">
                  <div className="px-1 pb-2 text-[11px] font-semibold text-white/55">Navigation</div>

                  <div className="space-y-1">
                    {navItems.map((item) => {
                      const active =
                        (item.href === "/dashboard" && currentPath === "/dashboard") ||
                        (item.href !== "/dashboard" && currentPath.startsWith(item.href));

                      return (
                        <SidebarRow
                          key={item.href}
                          label={item.label}
                          active={active}
                          iconName={inferIcon(item)}
                          onClick={() => router.push(item.href)}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1" />

                {/* Mobile account */}
                <div className="pt-4">
                  <div className="h-px" style={{ background: SIDEBAR_DIV }} />
                  <div className="mt-4 px-1 pb-2 text-[11px] font-semibold text-white/55">Account</div>

                  <SidebarRow
                    label={logoutLoading ? "Logging out..." : "Logout"}
                    active={false}
                    iconName="logout"
                    onClick={onLogout}
                  />

                  {logoutError ? (
                    <div className="mt-2 rounded-md bg-white/8 px-3 py-2 text-xs text-white/80">{logoutError}</div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between px-1 text-xs text-white/50">
                    <span>{brandName} Portal</span>
                    <span className="rounded-md bg-white/8 px-2 py-1">v1</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Right column scroll area */}
<main
  className={cx(
    "h-full overflow-y-auto overscroll-contain",
    "px-3 py-4 lg:px-10 lg:py-8",
    "lg:pt-8"
  )}
  style={{ paddingTop: `${mobileTopOffsetPx + 8}px` }}
>
          <div className="mx-auto flex min-h-full max-w-[1600px] flex-col">
            <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />
                  {badge}
                </div>

                <h1 className="mt-2 text-xl font-semibold text-slate-900 sm:mt-3 sm:text-2xl">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-slate-600 sm:text-base">{subtitle}</p> : null}
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {headerRight}
                {backLabel ? (
                  <button
                    onClick={() => router.push(backHref)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] sm:px-4 sm:text-sm"
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