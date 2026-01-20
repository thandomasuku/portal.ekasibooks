"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type NavItem = {
  label: string;
  href: string;
  hint?: string;
  icon?: string;
};

const DEFAULT_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", hint: "Account status & access", icon: "⌂" },
  { label: "Billing", href: "/billing", hint: "Subscription & invoices", icon: "⟠" },
  { label: "Downloads", href: "/downloads", hint: "Desktop app installers", icon: "⇩" },
  { label: "Settings", href: "/settings", hint: "Profile & security", icon: "⚙" },
];

type FooterLink = { label: string; href: string };

type PortalShellProps = {
  // Header (right side)
  badge?: string; // e.g. "Secure portal", "Billing", "Downloads"
  title: string;
  subtitle?: string;

  // Content for the right column
  children: React.ReactNode;

  // Back button in header
  backHref?: string;
  backLabel?: string;

  // Sidebar
  navItems?: NavItem[];
  tipText?: string;

  // Footer
  footerLinks?: FooterLink[];
  footerRight?: React.ReactNode; // e.g. version badge
  brandName?: string; // used in footer
  compactFooter?: boolean;

  // Optional: render something top-right in header (e.g. CTA button)
  headerRight?: React.ReactNode;

  // Optional: provide plan/email to display in sidebar
  userEmail?: string | null;
  planName?: string | null;

  // Mobile padding tweak
  mobileTopOffsetPx?: number; // default 72

  // Brand logo (public path)
  brandLogoSrc?: string; // default "/ekasibooks-logo.png"
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
    { label: "Status", href: "/status" },
  ],
  footerRight,
  brandName = "eKasiBooks",
  compactFooter,
  headerRight,
  userEmail,
  planName,
  mobileTopOffsetPx = 72,
  brandLogoSrc = "/ekasibooks-logo.png",
}: PortalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentPath = pathname || "/dashboard";

  const planUpper = String(planName ?? "FREE").toUpperCase();
  const planTone =
    planUpper === "FREE"
      ? "bg-white/10 ring-white/15 text-white/90"
      : "bg-emerald-300/15 ring-emerald-200/20 text-white";

  // close mobile sidebar on navigation changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [currentPath, sp]);

  const year = new Date().getFullYear();

  return (
    // Root locks viewport: ONLY the right column scrolls.
    <div className="h-screen w-full overflow-hidden bg-[#f6f9fb]">
      {/* Mobile top bar */}
      <div className="fixed left-0 top-0 z-30 w-full border-b border-slate-200/70 bg-white/70 backdrop-blur lg:hidden">
        <div className="flex w-full items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
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
              <div className="text-xs text-slate-600">{userEmail ?? "Secure portal access"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2-column shell */}
      <div className="grid h-full w-full grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* Desktop sidebar (fixed) */}
        <aside className="relative hidden h-full overflow-hidden border-r border-white/10 bg-gradient-to-br from-[#0b2a3a] via-[#0e3a4f] to-[#215D63] text-white lg:block">
          <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-black/10 blur-3xl" />

          <div className="flex h-full flex-col px-5 py-6">
            <BrandBlock brandName={brandName} logoSrc={brandLogoSrc} />

            <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
              <div className="text-xs font-medium text-white/70">Signed in as</div>
              <div className="mt-1 text-sm font-semibold text-white break-all">{userEmail ?? "—"}</div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div
                  className={cx(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                    planTone
                  )}
                >
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-300" />
                  Plan: {planUpper}
                </div>
                <span className="text-[11px] text-white/60">Secure access</span>
              </div>
            </div>

            <nav className="mt-6 flex-1">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                Navigation
              </div>

              <div className="space-y-2">
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
                        "group relative w-full overflow-hidden rounded-2xl px-4 py-3 text-left ring-1 transition-all duration-200",
                        "hover:-translate-y-[1px] hover:ring-white/20 hover:bg-white/10",
                        active ? "bg-white/12 ring-white/25" : "bg-white/5 ring-white/10"
                      )}
                    >
                      <span
                        className={cx(
                          "absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-200",
                          active
                            ? "bg-emerald-300 opacity-100"
                            : "bg-transparent opacity-0 group-hover:opacity-50 group-hover:bg-white/30"
                        )}
                      />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                            <span className="text-sm">{item.icon ?? "•"}</span>
                          </span>

                          <div>
                            <div className="text-sm font-semibold text-white">{item.label}</div>
                            {item.hint ? (
                              <div className="mt-0.5 text-xs text-white/65">{item.hint}</div>
                            ) : null}
                          </div>
                        </div>

                        <span className="text-xs font-semibold text-white/70 transition group-hover:text-white">
                          →
                        </span>
                      </div>

                      <span className="pointer-events-none absolute -right-16 -top-10 h-24 w-24 rounded-full bg-white/10 blur-2xl opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                <p className="text-sm text-white/90">{tipText}</p>
              </div>
            </nav>

            <p className="mt-4 text-center text-xs text-white/55">{brandName} Portal</p>
          </div>
        </aside>

        {/* Mobile sidebar */}
        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[340px] max-w-[88vw] border-r border-white/10 bg-gradient-to-br from-[#0b2a3a] via-[#0e3a4f] to-[#215D63] text-white shadow-xl">
              <div className="relative flex h-full flex-col p-5">
                <div className="pointer-events-none absolute -top-20 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-black/10 blur-3xl" />

                <div className="relative flex items-center justify-between">
                  <BrandBlock brandName={brandName} logoSrc={brandLogoSrc} compact />
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="relative mt-5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                  <div className="text-xs font-medium text-white/70">Signed in as</div>
                  <div className="mt-1 text-sm font-semibold text-white break-all">{userEmail ?? "—"}</div>
                </div>

                <div className="relative mt-5 space-y-2">
                  {navItems.map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => router.push(item.href)}
                      className="w-full rounded-2xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <p className="relative mt-auto text-center text-xs text-white/55">{brandName} Portal</p>
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
            // Mobile needs room for fixed top bar; desktop doesn't.
            "pt-[calc(var(--mobileTopOffsetPx)_+_8px)] lg:pt-8"
          )}
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
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
                  >
                    {backLabel}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Page content */}
            <div className="flex-1">{children}</div>

            {/* Footer */}
            <PortalFooter
              brandName={brandName}
              links={footerLinks}
              right={footerRight}
              compact={compactFooter}
              year={year}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------------- Footer ---------------- */

function PortalFooter({
  brandName,
  year,
  links,
  right,
  compact,
}: {
  brandName: string;
  year: number;
  links: Array<{ label: string; href: string }>;
  right?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <footer className={cx("mt-10", compact ? "pb-2" : "pb-10")}>
      <div className="rounded-3xl bg-white/70 p-5 ring-1 ring-slate-200/70 backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{brandName}</span> © {year}. All rights
            reserved.
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-semibold text-slate-700 underline-offset-4 transition hover:text-slate-900 hover:underline"
              >
                {l.label}
              </a>
            ))}
          </div>

          {right ? (
            <div className="text-sm text-slate-600">{right}</div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Secure portal
            </div>
          )}
        </div>
      </div>
    </footer>
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
    <div className="flex items-center gap-3">
      <div className={cx("relative", compact ? "h-12 w-[180px]" : "h-16 w-[240px]")}>
        <Image
          src={logoSrc}
          alt={`${brandName} logo`}
          fill
          sizes={compact ? "180px" : "240px"}
          className="object-contain"
          priority
        />
      </div>
    </div>
  );
}

