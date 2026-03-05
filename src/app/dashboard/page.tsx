"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { PremiumCard, KpiCard, DetailTile, Chip } from "@/components/portal/ui";
import { useSession } from "@/components/portal/session";

/* =========================
   Types (matches /api/entitlement)
   ========================= */

type Entitlement = {
  plan: "FREE" | "STARTER" | "GROWTH" | "PRO" | string;
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  features: {
    readOnly: boolean;
    limits: {
      invoice: number;
      quote: number;
      purchase_order: number;
      companies?: number;
    };
  };
};

/* =========================
   Helpers
   ========================= */

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function normalizePlan(plan?: string | null) {
  return String(plan ?? "FREE").toUpperCase();
}

function displayNameFromEmail(email?: string | null) {
  if (!email) return null;
  const local = String(email).split("@")[0] ?? "";
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  return cleaned ? cleaned : null;
}

function capitalizeWords(s: string) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function msHuman(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  const hh = h % 24;
  const mm = m % 60;

  if (d > 0) return `${d}d ${hh}h`;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function parseDateMs(iso?: string | null) {
  if (!iso) return Number.NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NaN;
}

function normalizeStatus(raw?: string | null) {
  return String(raw ?? "").trim().toLowerCase();
}

function statusFromEntitlement(ent: any) {
  const plan = normalizePlan(ent?.plan);
  const statusRaw = normalizeStatus(ent?.status);
  const readOnly = !!ent?.features?.readOnly;

  const now = Date.now();
  const graceUntilMs = parseDateMs(ent?.graceUntil ?? null);
  const periodEndMs = parseDateMs(ent?.currentPeriodEnd ?? null);

  const withinGrace = Number.isFinite(graceUntilMs) && now <= graceUntilMs;

  if (plan === "FREE") {
    return {
      label: "FREE",
      tone: "neutral" as const,
      dot: "bg-slate-400",
      hint: "Limited access. Trial limits apply in the desktop app.",
      countdownTargetMs: Number.NaN,
      countdownLabel: null as string | null,
      isBillingProblem: false,
    };
  }

  if (readOnly) {
    return {
      label: "READ_ONLY",
      tone: "neutral" as const,
      dot: "bg-amber-500",
      hint: "Your subscription is not active or is blocked. Desktop will be read-only.",
      countdownTargetMs: Number.NaN,
      countdownLabel: null as string | null,
      isBillingProblem: true,
    };
  }

  if (withinGrace) {
    return {
      label: "GRACE",
      tone: "brand" as const,
      dot: "bg-amber-500",
      hint: "You’re in grace. Access remains enabled until grace ends.",
      countdownTargetMs: graceUntilMs,
      countdownLabel: "Grace ends in",
      isBillingProblem: true,
    };
  }

  const isActiveish = statusRaw === "active" || statusRaw === "trialing" || statusRaw === "trial";
  if (isActiveish) {
    return {
      label: "ACTIVE",
      tone: "success" as const,
      dot: "bg-emerald-500",
      hint: "Subscription active. Full access enabled.",
      countdownTargetMs: Number.isFinite(periodEndMs) ? periodEndMs : Number.NaN,
      countdownLabel: Number.isFinite(periodEndMs) ? "Renews in" : null,
      isBillingProblem: false,
    };
  }

  const isProblem = ["past_due", "canceled", "cancelled", "blocked", "unpaid"].includes(statusRaw);

  return {
    label: (statusRaw || "unknown").toUpperCase(),
    tone: "neutral" as const,
    dot: isProblem ? "bg-amber-500" : "bg-slate-400",
    hint: "Status reported by billing system.",
    countdownTargetMs: Number.NaN,
    countdownLabel: null as string | null,
    isBillingProblem: isProblem,
  };
}

/* =========================
   Entitlement fetch
   ========================= */

function usePortalEntitlement(enabled: boolean, refreshKey: number) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setError(null);

    fetch("/api/entitlement", { cache: "no-store", credentials: "include" })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || data?.message || `HTTP ${r.status}`);
        return data as Entitlement;
      })
      .then((data) => {
        if (!cancelled) setEntitlement(data);
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e?.message || "Failed to load entitlement"));
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return { entitlement, entitlementError: error };
}

/* =========================
   Premium UI primitives
   ========================= */

const BTN_BASE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold " +
  "shadow-sm transition will-change-transform " +
  "hover:-translate-y-[1px] active:translate-y-0 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:opacity-60 disabled:hover:translate-y-0";

const BTN_PRIMARY = cx(BTN_BASE, "text-white");
const BTN_SECONDARY = cx(BTN_BASE, "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50");

const ICON_CHIP = "grid h-7 w-7 place-items-center rounded-lg bg-white/12 ring-1 ring-white/15 text-[12px]";

/* =========================
   Billing CTA rules
   ========================= */

function billingCta(planUpper: string, status: ReturnType<typeof statusFromEntitlement>) {
  const isFree = planUpper === "FREE";
  if (isFree) return { label: "View plans", subtitle: "See Starter, Growth and Pro", href: "/billing" };
  if (status.isBillingProblem) return { label: "Fix billing", subtitle: "Resolve payment to restore access", href: "/billing" };
  return { label: "Manage plan", subtitle: "Payments, receipts & subscription", href: "/billing" };
}

function Stagger({
  children,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}) {
  return (
    <div className={cx("ek-enter", className)} style={{ animationDelay: `${Math.max(0, delayMs)}ms` }}>
      {children}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <button onClick={onCopy} className={BTN_SECONDARY} type="button">
      {copied ? "Copied ✓" : label}
    </button>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  }, [sp]);

  const { state, user, error, refresh } = useSession();

  const [entRefreshKey, setEntRefreshKey] = useState(0);
  const { entitlement, entitlementError } = usePortalEntitlement(state === "ready", entRefreshKey);

  const subtitle =
    state === "ready"
      ? entitlementError
        ? `Session ok, but entitlement failed: ${entitlementError}`
        : "Manage your account, subscription and downloads."
      : state === "unauth"
      ? "Your session has expired."
      : state === "error"
      ? "We couldn’t confirm your session."
      : "Preparing your workspace...";

  const planUpper = normalizePlan(entitlement?.plan);
  const name = user?.email ? capitalizeWords(displayNameFromEmail(user.email) ?? "") : null;

  const status = useMemo(() => statusFromEntitlement(entitlement), [entitlement]);
  const cta = useMemo(() => billingCta(planUpper, status), [planUpper, status]);

  const countdown = useMemo(() => {
    if (!Number.isFinite(status.countdownTargetMs)) return null;
    const ms = status.countdownTargetMs - Date.now();
    if (ms <= 0) return null;
    return msHuman(ms);
  }, [status.countdownTargetMs]);

  const entitlementSnapshot = useMemo(() => {
    return {
      plan: entitlement?.plan ?? null,
      status: entitlement?.status ?? null,
      currentPeriodEnd: entitlement?.currentPeriodEnd ?? null,
      graceUntil: entitlement?.graceUntil ?? null,
      features: entitlement?.features ?? null,
    };
  }, [entitlement]);

  return (
    <PortalShell
      badge="Secure portal"
      title="Account overview"
      subtitle={subtitle}
      backHref="/"
      backLabel="Home"
      userEmail={state === "ready" ? (user?.email ?? null) : null}
      userName={state === "ready" ? (name ? name : null) : null}
      planName={planUpper}
      headerRight={
        state === "ready" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refresh();
                setEntRefreshKey((n) => n + 1);
              }}
              className={BTN_SECONDARY}
              type="button"
            >
              Refresh
            </button>

            <button
              onClick={() => router.push(cta.href)}
              className={BTN_PRIMARY}
              style={{ background: "var(--primary)" }}
              title={cta.subtitle}
              type="button"
            >
              <span className={cx("rounded-lg px-2 py-1 text-[11px] font-extrabold", "bg-white/15 ring-1 ring-white/20")}>
                ⟠
              </span>
              {cta.label}
            </button>
          </div>
        ) : null
      }
      footerRight={
        <div className="flex items-center gap-2">
          <Chip>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Portal
          </Chip>
          <span className="inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            v1
          </span>
        </div>
      }
    >
      {state === "loading" ? (
        <DashboardSkeleton />
      ) : state === "unauth" ? (
        <EmptyState
          title="Please log in to continue"
          body="Your session isn’t active. Log in again to access your portal."
          primaryLabel="Go to login"
          onPrimary={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)}
          secondaryLabel="Back to home"
          onSecondary={() => router.push("/")}
        />
      ) : state === "error" ? (
        <EmptyState
          title="Session check failed"
          body={error ?? "Something went wrong. Please try again."}
          primaryLabel="Retry"
          onPrimary={() => refresh()}
          secondaryLabel="Go to login"
          onSecondary={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)}
        />
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          <Stagger delayMs={0}>
            <PremiumCard tone="soft" className="portal-card-premium">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={status.tone}>
                      <span className={cx("h-2 w-2 rounded-full", status.dot)} />
                      Status: {status.label}
                    </Chip>

                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs font-semibold text-slate-700">{planUpper} plan</span>

                    {countdown && status.countdownLabel ? (
                      <>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {status.countdownLabel}: {countdown}
                        </span>
                      </>
                    ) : null}
                  </div>

                  <h2 className="mt-3 text-lg font-semibold text-slate-900">Welcome back{name ? `, ${name}` : ""}.</h2>

                  <p className="mt-1 text-sm text-slate-600">{status.hint}</p>

                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                    <span className="font-semibold text-slate-700">Note:</span> Accounting work happens in the desktop app.
                    The portal manages access, billing and downloads.
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    onClick={() => router.push("/downloads")}
                    className={BTN_PRIMARY}
                    style={{ background: "rgb(15 23 42)" }}
                    type="button"
                  >
                    <span className={ICON_CHIP}>⇩</span>
                    Get desktop app
                  </button>

                  <button onClick={() => router.push(cta.href)} className={BTN_SECONDARY} title={cta.subtitle} type="button">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900/5 text-[12px] ring-1 ring-slate-200">
                      ⟠
                    </span>
                    {cta.label}
                  </button>

                  <button onClick={() => router.push("/settings")} className={BTN_SECONDARY} type="button">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900/5 text-[12px] ring-1 ring-slate-200">
                      ⚙
                    </span>
                    Security
                  </button>
                </div>
              </div>
            </PremiumCard>
          </Stagger>

          {/* KPI row */}
          <Stagger delayMs={70}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-start">
              <div className="ek-enter" style={{ animationDelay: "70ms" }}>
                <KpiCard label="Plan" value={planUpper} icon="★" hint={`Companies allowed: ${String(entitlement?.features?.limits?.companies ?? 1)}`} />
              </div>
              <div className="ek-enter" style={{ animationDelay: "110ms" }}>
                <KpiCard label="Email" value={String(user?.email ?? "—")} icon="✉" />
              </div>
              <div className="ek-enter" style={{ animationDelay: "150ms" }}>
                <KpiCard label="Created" value={fmtDate((user as any)?.createdAt)} icon="⏱" />
              </div>
              <div className="ek-enter" style={{ animationDelay: "190ms" }}>
                <KpiCard label="Last login" value={fmtDate((user as any)?.lastLoginAt)} icon="✓" />
              </div>
            </div>
          </Stagger>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:items-start">
            <Stagger delayMs={140} className="xl:col-span-2">
              <PremiumCard className="portal-card-premium">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Subscription & access</h3>
                    <p className="mt-1 text-sm text-slate-600">This is the effective entitlement the desktop app will apply.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Chip tone={status.tone}>
                      <span className={cx("h-2 w-2 rounded-full", status.dot)} />
                      {status.label}
                    </Chip>

                    <CopyButton text={safeJson(entitlementSnapshot)} label="Copy snapshot" />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DetailTile label="Plan" value={planUpper} />
                  <DetailTile label="Portal status" value={String(entitlement?.status ?? "—")} />
                  <DetailTile label="Read-only" value={entitlement?.features?.readOnly ? "Yes" : "No"} />
                  <DetailTile label="Companies" value={String(entitlement?.features?.limits?.companies ?? 1)} />
                  <DetailTile label="Current period ends" value={fmtDate(entitlement?.currentPeriodEnd)} />
                  <DetailTile label="Grace until" value={fmtDate(entitlement?.graceUntil)} />
                </div>

                <div className="mt-5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">Trial limits (FREE)</div>
                  <p className="mt-1 text-xs text-slate-600">These limits are enforced in the desktop app and are shown here for clarity.</p>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <DetailTile label="Invoices" value={String(entitlement?.features?.limits?.invoice ?? 5)} />
                    <DetailTile label="Quotes" value={String(entitlement?.features?.limits?.quote ?? 5)} />
                    <DetailTile label="Purchase orders" value={String(entitlement?.features?.limits?.purchase_order ?? 5)} />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 text-xs font-semibold text-slate-700">Entitlement snapshot</div>
                  <pre className="max-h-[200px] overflow-auto rounded-2xl bg-slate-950 p-4 text-[12px] text-slate-100 ring-1 ring-slate-800">
                    {safeJson(entitlementSnapshot)}
                  </pre>
                </div>
              </PremiumCard>
            </Stagger>

            <Stagger delayMs={180}>
              <PremiumCard className="portal-card-premium">
                <h3 className="text-base font-semibold text-slate-900">Quick actions</h3>
                <p className="mt-1 text-sm text-slate-600">Get to what you need fast.</p>

                <div className="mt-4 space-y-2">
                  <ActionRow
                    title="Download eKasiBooks Desktop"
                    subtitle="Windows installer & updates"
                    icon="⇩"
                    tone="brand"
                    onClick={() => router.push("/downloads")}
                  />
                  <ActionRow title={cta.label} subtitle={cta.subtitle} icon="⟠" tone="primary" onClick={() => router.push(cta.href)} />
                  <ActionRow
                    title="Profile & security"
                    subtitle="Password, OTP and settings"
                    icon="⚙"
                    tone="neutral"
                    onClick={() => router.push("/settings")}
                  />
                </div>

                {countdown && status.countdownLabel ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold text-slate-700">{status.countdownLabel}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{countdown}</div>
                  </div>
                ) : null}
              </PremiumCard>
            </Stagger>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

/* ---------------- Local UI helpers ---------------- */

function ActionRow({
  title,
  subtitle,
  icon,
  tone,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: string;
  tone: "primary" | "brand" | "neutral";
  onClick: () => void;
}) {
  const toneClass =
    tone === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : tone === "brand"
      ? "text-white"
      : "bg-white text-slate-900 hover:bg-slate-50";

  const ringClass = tone === "neutral" ? "ring-1 ring-slate-200 shadow-sm" : "shadow-[var(--shadow-md)] ring-1 ring-white/10";

  const iconChip =
    tone === "neutral"
      ? "bg-slate-900/5 ring-1 ring-slate-200 text-slate-700"
      : "bg-white/15 ring-1 ring-white/20 text-white";

  return (
    <button
      onClick={onClick}
      className={[
        "relative group w-full rounded-2xl px-3 py-2.5 text-left transition-all duration-300 will-change-transform",
        "hover:-translate-y-[2px] active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        toneClass,
        ringClass,
      ].join(" ")}
      style={tone === "brand" ? { background: "var(--primary)" } : undefined}
      type="button"
    >
      <div className="relative flex items-center gap-3">
        <div className={["grid h-9 w-9 place-items-center rounded-2xl text-[14px]", iconChip].join(" ")}>{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className={tone === "neutral" ? "text-xs text-slate-600" : "text-xs text-white/80"}>{subtitle}</div>
        </div>
        <div className={tone === "neutral" ? "ml-auto text-slate-400" : "ml-auto text-white/80"}>→</div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            tone === "neutral"
              ? "radial-gradient(circle at 25% 50%, rgba(15,23,42,0.04), transparent 60%)"
              : "radial-gradient(circle at 25% 50%, rgba(255,255,255,0.14), transparent 60%)",
        }}
      />
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-md)] ring-1 ring-slate-200">
        <div className="h-5 w-52 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-3 h-4 w-80 rounded-lg bg-slate-200 animate-pulse" />

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-3xl bg-white p-6 shadow-[var(--shadow-md)] ring-1 ring-slate-200">
          <div className="h-5 w-44 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-72 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-md)] ring-1 ring-slate-200">
          <div className="h-5 w-40 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-56 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-5 space-y-2">
            <div className="h-11 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-11 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-11 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}) {
  const BTN_BASE =
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition " +
    "hover:-translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";
  const BTN_PRIMARY = cx(BTN_BASE, "text-white");
  const BTN_SECONDARY = cx(BTN_BASE, "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50");

  return (
    <div className="rounded-3xl bg-white p-8 shadow-[var(--shadow-md)] ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-slate-600">{body}</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button onClick={onPrimary} className={BTN_PRIMARY} style={{ background: "var(--primary)" }} type="button">
          {primaryLabel}
        </button>
        <button onClick={onSecondary} className={BTN_SECONDARY} type="button">
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}