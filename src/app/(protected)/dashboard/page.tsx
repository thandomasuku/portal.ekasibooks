"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PremiumCard,
  PortalButton,
  PortalEmptyState,
  PortalSkeleton,
  cx,
} from "@/components/portal/ui";
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
  return String(raw ?? "")
    .trim()
    .toLowerCase();
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
      summary:
        "You are currently on the FREE plan. Upgrade when you are ready for cloud sync and higher limits.",
      countdownTargetMs: Number.NaN,
      countdownLabel: null as string | null,
      isBillingProblem: false,
    };
  }

  if (readOnly) {
    return {
      label: "READ ONLY",
      tone: "neutral" as const,
      dot: "bg-amber-500",
      hint: "Your subscription is not active or is blocked. Desktop will be read-only.",
      summary:
        "Your portal can still be viewed, but desktop access may be restricted until billing is resolved.",
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
      summary:
        "Your account is still usable during the grace period. Please confirm billing before grace ends.",
      countdownTargetMs: graceUntilMs,
      countdownLabel: "Grace ends in",
      isBillingProblem: true,
    };
  }

  const isActiveish =
    statusRaw === "active" || statusRaw === "trialing" || statusRaw === "trial";
  if (isActiveish) {
    return {
      label: "ACTIVE",
      tone: "success" as const,
      dot: "bg-emerald-500",
      hint: "Subscription active. Full access enabled.",
      summary:
        "Your portal, desktop entitlement and cloud-enabled features are in good standing.",
      countdownTargetMs: Number.isFinite(periodEndMs)
        ? periodEndMs
        : Number.NaN,
      countdownLabel: Number.isFinite(periodEndMs) ? "Renews in" : null,
      isBillingProblem: false,
    };
  }

  const isProblem = [
    "past_due",
    "canceled",
    "cancelled",
    "blocked",
    "unpaid",
  ].includes(statusRaw);

  return {
    label: (statusRaw || "UNKNOWN").toUpperCase(),
    tone: "neutral" as const,
    dot: isProblem ? "bg-amber-500" : "bg-slate-400",
    hint: "Status reported by billing system.",
    summary:
      "This account status comes from the billing system. Refresh if you recently made a payment.",
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
        if (!r.ok)
          throw new Error(data?.error || data?.message || `HTTP ${r.status}`);
        return data as Entitlement;
      })
      .then((data) => {
        if (!cancelled) setEntitlement(data);
      })
      .catch((e: any) => {
        if (!cancelled)
          setError(String(e?.message || "Failed to load entitlement"));
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return { entitlement, entitlementError: error };
}

/* =========================
   Billing CTA rules
   ========================= */

function billingCta(
  planUpper: string,
  status: ReturnType<typeof statusFromEntitlement>,
) {
  const isFree = planUpper === "FREE";
  if (isFree)
    return {
      label: "View plans",
      subtitle: "See Starter, Growth and Pro",
      href: "/billing",
    };
  if (status.isBillingProblem)
    return {
      label: "Fix billing",
      subtitle: "Resolve payment to restore access",
      href: "/billing",
    };
  return {
    label: "Manage plan",
    subtitle: "Payments, receipts & subscription",
    href: "/billing",
  };
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
    <div
      className={cx("ek-enter", className)}
      style={{ animationDelay: `${Math.max(0, delayMs)}ms` }}
    >
      {children}
    </div>
  );
}

function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
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
    <PortalButton onClick={onCopy} variant="secondary" type="button">
      {copied ? "Copied ✓" : label}
    </PortalButton>
  );
}


function DashboardChip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200/45 bg-emerald-400/16 text-emerald-50 ring-emerald-100/18"
      : tone === "brand"
        ? "border-amber-200/45 bg-amber-300/16 text-amber-50 ring-amber-100/18"
        : "border-white/24 bg-white/12 text-teal-50 ring-white/12";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold leading-none shadow-sm ring-1 backdrop-blur",
        toneClass,
      )}
    >
      {children}
    </span>
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
  const [showSnapshot, setShowSnapshot] = useState(false);
  const { entitlement, entitlementError } = usePortalEntitlement(
    state === "ready",
    entRefreshKey,
  );

  const subtitle =
    state === "ready"
      ? entitlementError
        ? `Session ok, but entitlement failed: ${entitlementError}`
        : "Manage access, billing, downloads and account security."
      : state === "unauth"
        ? "Your session has expired."
        : state === "error"
          ? "We couldn’t confirm your session."
          : "Preparing your workspace...";

  const planUpper = normalizePlan(entitlement?.plan);
  const name = user?.email
    ? capitalizeWords(displayNameFromEmail(user.email) ?? "")
    : null;

  const status = useMemo(
    () => statusFromEntitlement(entitlement),
    [entitlement],
  );
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

  const companyLimit = String(entitlement?.features?.limits?.companies ?? 1);
  const renewalLabel =
    countdown && status.countdownLabel
      ? `${status.countdownLabel} ${countdown}`
      : entitlement?.currentPeriodEnd
        ? `Renews ${fmtDate(entitlement.currentPeriodEnd)}`
        : "No renewal date available";

  return (
    <>
      {state === "loading" ? (
        <DashboardSkeleton />
      ) : state === "unauth" ? (
        <EmptyState
          title="Please log in to continue"
          body="Your session isn’t active. Log in again to access your portal."
          primaryLabel="Go to login"
          onPrimary={() =>
            router.push(`/login?next=${encodeURIComponent(nextUrl)}`)
          }
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
          onSecondary={() =>
            router.push(`/login?next=${encodeURIComponent(nextUrl)}`)
          }
        />
      ) : (
        <div className="space-y-6">
          <Stagger delayMs={0}>
            <PremiumCard tone="dark" className="overflow-hidden p-0 text-white">
              <div className="relative overflow-hidden p-5 sm:p-6">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-95"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(8,47,73,0.72), rgba(20,88,97,0.44) 46%, rgba(20,184,166,0.12)), radial-gradient(circle at 0% 0%, rgba(94,234,212,0.18), transparent 34%), radial-gradient(circle at 96% 8%, rgba(255,255,255,0.16), transparent 34%)",
                  }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-20 -top-28 h-56 w-80 rotate-12 rounded-[3rem] bg-white/10"
                />

                <div className="relative">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DashboardChip tone={status.tone}>
                      <span
                        className={cx("h-1.5 w-1.5 rounded-full", status.dot)}
                      />
                      {status.label}
                    </DashboardChip>
                    <DashboardChip>{planUpper} plan</DashboardChip>
                    {countdown && status.countdownLabel ? (
                      <DashboardChip>{renewalLabel}</DashboardChip>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-teal-200">
                        Account status
                      </p>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                        Welcome back{name ? `, ${name}` : ""}.
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm leading-5 text-white/76">
                        {status.summary}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
                      <PortalButton
  onClick={() => router.push("/downloads")}
  variant="secondary"
  type="button"
>
  Download desktop app
</PortalButton>
                      <PortalButton
                        onClick={() => router.push(cta.href)}
                        variant="secondary"
                        title={cta.subtitle}
                        type="button"
                      >
                        {cta.label}
                      </PortalButton>
                      <PortalButton
                        onClick={() => router.push("/settings")}
                        variant="secondary"
                        type="button"
                      >
                        Profile & security
                      </PortalButton>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                    <HeroFact label="Access" value={status.hint} />
                    <HeroFact
                      label="Companies"
                      value={`${companyLimit} allowed`}
                    />
                    <HeroFact
                      label="Desktop work"
                      value="Accounting happens in the desktop app"
                    />
                  </div>
                </div>
              </div>
            </PremiumCard>
          </Stagger>

          <Stagger delayMs={70}>
            <SectionCard
              title="Account details"
              subtitle="A quick summary of this portal user and account state."
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Plan"
                  value={planUpper}
                  helper={`${companyLimit} companies allowed`}
                  icon="★"
                />
                <MetricCard
                  label="Email"
                  value={String(user?.email ?? "—")}
                  helper="Portal sign-in address"
                  icon="✉"
                />
                <MetricCard
                  label="Created"
                  value={fmtDate((user as any)?.createdAt)}
                  helper="Account creation date"
                  icon="⏱"
                />
                <MetricCard
                  label="Last login"
                  value={fmtDate((user as any)?.lastLoginAt)}
                  helper="Most recent portal access"
                  icon="✓"
                />
              </div>
            </SectionCard>
          </Stagger>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)] xl:items-start">
            <Stagger delayMs={120}>
              <SectionCard
                title="Subscription & access"
                subtitle="The entitlement your desktop app will apply."
                action={
                  <div className="flex items-center gap-2">
                    <DashboardChip tone={status.tone}>
                      <span
                        className={cx("h-2 w-2 rounded-full", status.dot)}
                      />
                      {status.label}
                    </DashboardChip>
                    <CopyButton
                      text={safeJson(entitlementSnapshot)}
                      label="Copy snapshot"
                    />
                  </div>
                }
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <AccessItem label="Plan" value={planUpper} />
                  <AccessItem
                    label="Portal status"
                    value={String(entitlement?.status ?? "—")}
                  />
                  <AccessItem
                    label="Read-only"
                    value={entitlement?.features?.readOnly ? "Yes" : "No"}
                  />
                  <AccessItem label="Companies" value={companyLimit} />
                  <AccessItem
                    label="Current period ends"
                    value={fmtDate(entitlement?.currentPeriodEnd)}
                  />
                  <AccessItem
                    label="Grace until"
                    value={fmtDate(entitlement?.graceUntil)}
                  />
                </div>

                <div className="mt-5 rounded-3xl border border-white/18 bg-slate-950/24 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h4 className="text-sm font-black text-white">
                        {planUpper === "FREE"
                          ? "Free plan limits"
                          : "Document limits"}
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-white/72">
                        {planUpper === "FREE"
                          ? "These limits are enforced in the desktop app until the account is upgraded."
                          : "These values come from the current entitlement and are shown for clarity."}
                      </p>
                    </div>
                    <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-white/18">
                      Desktop enforced
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <LimitPill
                      label="Invoices"
                      value={String(
                        entitlement?.features?.limits?.invoice ?? 5,
                      )}
                    />
                    <LimitPill
                      label="Quotes"
                      value={String(entitlement?.features?.limits?.quote ?? 5)}
                    />
                    <LimitPill
                      label="Purchase orders"
                      value={String(
                        entitlement?.features?.limits?.purchase_order ?? 5,
                      )}
                    />
                  </div>
                </div>

                <div className="mt-5 overflow-hidden rounded-3xl border border-white/16 bg-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.12)] ring-1 ring-white/10">
                  <button
                    type="button"
                    onClick={() => setShowSnapshot((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60"
                  >
                    <span>Technical entitlement snapshot</span>
                    <span className="text-xs text-white/72">
                      {showSnapshot ? "Hide" : "Show"}
                    </span>
                  </button>

                  {showSnapshot ? (
                    <pre className="max-h-[240px] overflow-auto border-t border-slate-200 bg-slate-950 p-4 text-[12px] text-slate-100">
                      {safeJson(entitlementSnapshot)}
                    </pre>
                  ) : (
                    <div className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-white/72">
                      Hidden by default so the dashboard stays focused. Use this
                      when debugging entitlement sync.
                    </div>
                  )}
                </div>
              </SectionCard>
            </Stagger>

            <Stagger delayMs={170}>
              <SectionCard
                title="Quick actions"
                subtitle="The common portal tasks, grouped in one place."
              >
                <div className="space-y-2">
                  <ActionRow
                    title="Download eKasiBooks Desktop"
                    subtitle="Windows installer and updates"
                    icon="⇩"
                    tone="brand"
                    onClick={() => router.push("/downloads")}
                  />
                  <ActionRow
                    title={cta.label}
                    subtitle={cta.subtitle}
                    icon="⟠"
                    tone="dark"
                    onClick={() => router.push(cta.href)}
                  />
                  <ActionRow
                    title="Profile & security"
                    subtitle="Password, OTP and account details"
                    icon="⚙"
                    tone="light"
                    onClick={() => router.push("/settings")}
                  />
                </div>

                <div className="mt-5 rounded-3xl border border-white/15 bg-[#073540]/46 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.10)] ring-1 ring-white/10 backdrop-blur">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-50/86">
                    Status note
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/76">
                    {status.hint}
                  </p>
                  {countdown && status.countdownLabel ? (
                    <div className="mt-3 rounded-2xl border border-white/14 bg-white/8 p-3 shadow-sm ring-1 ring-white/10">
                      <div className="text-xs font-semibold text-white/76">
                        {status.countdownLabel}
                      </div>
                      <div className="mt-1 text-base font-black text-white">
                        {countdown}
                      </div>
                    </div>
                  ) : null}
                </div>
              </SectionCard>
            </Stagger>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- Local UI helpers ---------------- */

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PremiumCard tone="glass" className="relative overflow-hidden p-5 text-white sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-36 w-56 rotate-12 rounded-[2.5rem] bg-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/50 to-transparent"
      />

      <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-black tracking-tight text-white">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/76">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
      <div className="relative">{children}</div>
    </PremiumCard>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/18 bg-slate-950/18 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.14)] ring-1 ring-white/10 backdrop-blur">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-50/86">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold leading-5 text-white">
        {value}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: string;
}) {
  return (
    <div className="group rounded-3xl border border-white/16 bg-slate-950/18 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur transition duration-300 hover:-translate-y-[2px] hover:bg-white/16 hover:shadow-[0_20px_55px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-50/86">
            {label}
          </div>
          <div className="mt-2 truncate text-base font-black text-white">
            {value}
          </div>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/12 text-sm text-teal-50 shadow-sm ring-1 ring-white/15 transition group-hover:bg-white/18">
          {icon}
        </div>
      </div>
      {helper ? (
        <div className="mt-2 truncate text-xs font-medium text-white/76">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function AccessItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/16 bg-slate-950/18 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-teal-50/86">
        {label}
      </div>
      <div className="mt-2 text-base font-black text-white">{value}</div>
    </div>
  );
}

function LimitPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/16 bg-slate-950/18 p-3 shadow-sm ring-1 ring-white/10">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-50/86">
        {label}
      </div>
      <div className="mt-1 text-base font-black text-white">{value}</div>
    </div>
  );
}

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
  tone: "dark" | "brand" | "light" | "inverted";
  onClick: () => void;
}) {
  const toneClass =
    tone === "brand"
      ? "bg-[#0b5f63]/78 text-white ring-teal-200/28 hover:bg-[#0d6f72]/82"
      : tone === "dark"
        ? "bg-[#073540]/72 text-white ring-white/15 hover:bg-[#0a4550]/76"
        : tone === "inverted"
          ? "bg-[#073540]/62 text-white ring-white/15 hover:bg-[#0a4550]/70"
          : "bg-[#073540]/58 text-white ring-white/15 hover:bg-[#0a4550]/70";

  const iconChip =
    tone === "brand"
      ? "bg-teal-300/14 text-teal-50 ring-teal-100/22"
      : "bg-white/10 text-white ring-white/15";

  const subClass = "text-white/68";
  const arrowClass = "text-white/62";

  return (
    <button
      onClick={onClick}
      className={cx(
        "group relative w-full overflow-hidden rounded-2xl px-3.5 py-2.5 text-left shadow-[0_12px_34px_rgba(15,23,42,0.08)] ring-1 transition-all duration-300 will-change-transform",
        "hover:-translate-y-[2px] hover:shadow-[var(--shadow-md)] active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        toneClass,
      )}
      type="button"
    >
      <div className="relative z-10 flex items-center gap-3">
        <div
          className={cx(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm ring-1",
            iconChip,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black">{title}</div>
          <div
            className={cx(
              "mt-0.5 truncate text-[11px] font-semibold",
              subClass,
            )}
          >
            {subtitle}
          </div>
        </div>
        <div
          className={cx(
            "ml-auto text-lg transition group-hover:translate-x-1",
            arrowClass,
          )}
        >
          →
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            tone === "light"
              ? "radial-gradient(circle at 20% 50%, rgba(15,23,42,0.05), transparent 62%)"
              : "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.14), transparent 62%)",
        }}
      />
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-7 shadow-[var(--shadow-md)] ring-1 ring-slate-200">
        <PortalSkeleton className="h-5 w-52" />
        <PortalSkeleton className="mt-3 h-8 w-96 max-w-full" />
        <PortalSkeleton className="mt-3 h-4 w-[36rem] max-w-full" />

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <PortalSkeleton className="h-16 rounded-2xl" />
          <PortalSkeleton className="h-16 rounded-2xl" />
          <PortalSkeleton className="h-16 rounded-2xl" />
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-md)] ring-1 ring-slate-200">
        <PortalSkeleton className="h-5 w-44" />
        <PortalSkeleton className="mt-3 h-4 w-72 max-w-full" />
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PortalSkeleton className="h-24 rounded-3xl" />
          <PortalSkeleton className="h-24 rounded-3xl" />
          <PortalSkeleton className="h-24 rounded-3xl" />
          <PortalSkeleton className="h-24 rounded-3xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-md)] ring-1 ring-slate-200 xl:col-span-2">
          <PortalSkeleton className="h-5 w-44" />
          <PortalSkeleton className="mt-3 h-4 w-72 max-w-full" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PortalSkeleton className="h-20 rounded-3xl" />
            <PortalSkeleton className="h-20 rounded-3xl" />
            <PortalSkeleton className="h-20 rounded-3xl" />
            <PortalSkeleton className="h-20 rounded-3xl" />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-md)] ring-1 ring-slate-200">
          <PortalSkeleton className="h-5 w-40" />
          <PortalSkeleton className="mt-3 h-4 w-56 max-w-full" />
          <div className="mt-5 space-y-2">
            <PortalSkeleton className="h-16 rounded-3xl" />
            <PortalSkeleton className="h-16 rounded-3xl" />
            <PortalSkeleton className="h-16 rounded-3xl" />
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
  return (
    <PortalEmptyState
      title={title}
      description={body}
      className="bg-white p-8 text-left shadow-[var(--shadow-md)] ring-1 ring-slate-200"
      action={
        <div className="flex flex-col gap-3 sm:flex-row">
          <PortalButton onClick={onPrimary} variant="primary" type="button">
            {primaryLabel}
          </PortalButton>
          <PortalButton onClick={onSecondary} variant="secondary" type="button">
            {secondaryLabel}
          </PortalButton>
        </div>
      }
    />
  );
}
