"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PremiumCard,
  PortalAlert,
  PortalButton,
  PortalEmptyState,
  PortalInput,
  PortalSkeleton,
  cx,
} from "@/components/portal/ui";
import { useSession } from "@/components/portal/session";
import { formatDateTime } from "@/lib/dates";

/* =========================
   Small utilities
   ========================= */

async function trackAnalytics(eventName: string, params?: Record<string, any>) {
  try {
    const analytics = (await import("@/lib/analytics")) as any;

    if (typeof analytics.trackEvent === "function") {
      analytics.trackEvent(eventName, params);
      return;
    }

    if (typeof analytics.track === "function") {
      analytics.track(eventName, params);
      return;
    }

    if (typeof analytics.event === "function") {
      analytics.event(eventName, params);
      return;
    }
  } catch {
    // Fall through to window.gtag
  }

  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params ?? {});
  }
}

/* =========================
   Page-level UI primitives
   ========================= */

const BTN_ICON_PRIMARY = "grid h-7 w-7 place-items-center rounded-lg bg-white/15";
const BTN_ICON_SECONDARY =
  "grid h-7 w-7 place-items-center rounded-lg bg-slate-900/5 ring-1 ring-slate-200";
const BILLING_PILL_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-teal-200/35 bg-teal-50/90 px-4 py-2 text-sm font-black text-teal-900 shadow-sm ring-1 ring-white/20 transition hover:-translate-y-[1px] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed disabled:opacity-60";

/* ---------------- Name helpers ---------------- */

function displayNameFromEmail(email?: string | null) {
  if (!email) return null;
  const local = String(email).split("@")[0] ?? "";
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  return cleaned || null;
}

function capitalizeWords(s: string) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ---------------- Formatting helpers ---------------- */

function moneyZar(v?: number | null) {
  if (v == null || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `R${v}`;
  }
}

function fmtDate(d?: string | null) {
  return formatDateTime(d);
}

function normalizeStatus(raw?: string | null) {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return "unknown";
  return s;
}

function statusLabel(status: string) {
  const s = normalizeStatus(status);
  if (s === "active") return "Active";
  if (s === "trial" || s === "trialing") return "Trial";
  if (s === "past_due") return "Past due";
  if (s === "canceled" || s === "cancelled") return "Canceled";
  if (s === "free") return "Free";
  if (s === "grace") return "Grace";
  if (s === "read_only" || s === "readonly") return "Read-only";
  if (s === "blocked") return "Blocked";
  return "Unknown";
}

function statusTone(status: string): "success" | "brand" | "neutral" {
  const s = normalizeStatus(status);
  if (s === "active") return "success";
  if (s === "trial" || s === "trialing") return "brand";
  if (s === "grace") return "brand";
  if (s === "read_only" || s === "readonly" || s === "blocked") return "neutral";
  return "neutral";
}

function statusDotClass(status: string) {
  const s = normalizeStatus(status);
  if (s === "active") return "bg-emerald-500";
  if (s === "trial" || s === "trialing") return "bg-sky-500";
  if (s === "grace") return "bg-amber-500";
  if (s === "past_due") return "bg-amber-500";
  if (s === "read_only" || s === "readonly") return "bg-amber-500";
  if (s === "blocked") return "bg-red-500";
  if (s === "canceled" || s === "cancelled") return "bg-slate-400";
  if (s === "free") return "bg-slate-400";
  return "bg-slate-400";
}

/* ---------------- Billing cycle UI helpers ---------------- */

type BillingCycle = "monthly" | "annual";
type PaidTier = "starter" | "growth" | "pro";

function CycleToggle({
  value,
  onChange,
  saveLabel = "Save 10%",
}: {
  value: BillingCycle;
  onChange: (v: BillingCycle) => void;
  saveLabel?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        aria-pressed={value === "monthly"}
        className={cx(
          "h-9 rounded-xl px-4 text-sm font-semibold transition",
          value === "monthly" ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
        )}
        style={value === "monthly" ? { background: "var(--primary)" } : undefined}
      >
        Monthly
      </button>

      <button
        type="button"
        onClick={() => onChange("annual")}
        aria-pressed={value === "annual"}
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
          value === "annual" ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
        )}
        style={value === "annual" ? { background: "var(--primary)" } : undefined}
      >
        Annual
        <span
          className={cx(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold",
            value === "annual"
              ? "bg-white/15 text-white ring-1 ring-white/25"
              : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
          )}
          title="Annual plan discount"
        >
          {saveLabel}
        </span>
      </button>
    </div>
  );
}

function TierToggle({
  value,
  onChange,
}: {
  value: PaidTier;
  onChange: (v: PaidTier) => void;
}) {
  const tiers: Array<{ key: PaidTier; label: string }> = [
    { key: "starter", label: "Starter" },
    { key: "growth", label: "Growth" },
    { key: "pro", label: "Pro" },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      {tiers.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={active}
            className={cx(
              "h-9 rounded-xl px-4 text-sm font-semibold transition",
              active ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
            )}
            style={active ? { background: "var(--primary)" } : undefined}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Snapshot utils ---------------- */

type Entitlement = {
  plan?: "FREE" | "STARTER" | "GROWTH" | "PRO" | string;
  status?: string;
  amount?: number | null;
  interval?: string | null;
  currentPeriodEnd?: string | null;
  graceUntil?: string | null;
  features?: {
    readOnly?: boolean;
    limits?: {
      invoice?: number;
      quote?: number;
      purchase_order?: number;
      companies?: number;
    };
  };
};

function safeJson(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function CopyButton({ text }: { text: string }) {
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
    <button onClick={onCopy} className={BILLING_PILL_BUTTON} type="button">
      {copied ? "Copied ✓" : "Copy snapshot"}
    </button>
  );
}


function BillingChip({
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

function BillingMetricCard({
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

function BillingAccessItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/16 bg-slate-950/18 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-teal-50/86">
        {label}
      </div>
      <div className="mt-2 text-base font-black text-white">{value}</div>
    </div>
  );
}

/* ---------------- Pricing model (UI only) ---------------- */

const PRICE_TABLE: Record<
  PaidTier,
  { title: string; monthly: number; annual: number; companies: number; badge?: string }
> = {
  starter: { title: "Starter", monthly: 199, annual: 2149, companies: 1 },
  growth: { title: "Growth", monthly: 399, annual: 4309, companies: 3, badge: "Most popular" },
  pro: { title: "Pro", monthly: 599, annual: 6469, companies: 5 },
};

function planLabelFromEnt(planUpper: string) {
  const p = String(planUpper || "FREE").toUpperCase();
  if (p === "STARTER") return "STARTER";
  if (p === "GROWTH") return "GROWTH";
  if (p === "PRO") return "PRO";
  return "FREE";
}

function entToPaidTier(planUpper: string): PaidTier {
  const p = String(planUpper || "").toUpperCase();
  if (p === "GROWTH") return "growth";
  if (p === "PRO") return "pro";
  return "starter";
}

/* ---------------- FREE onboarding view ---------------- */

type BillingOnboardingViewProps = {
  userEmail?: string | null;
  requestedPlan: PaidTier;
  selectedTier: PaidTier;
  setSelectedTier: (v: PaidTier) => void;
  cycle: BillingCycle;
  setCycle: (v: BillingCycle) => void;
  upgradeLoading: boolean;
  onUpgrade: () => void;
};

function BillingOnboardingView({
  userEmail,
  requestedPlan,
  selectedTier,
  setSelectedTier,
  cycle,
  setCycle,
  upgradeLoading,
  onUpgrade,
}: BillingOnboardingViewProps) {
  const selected = PRICE_TABLE[selectedTier];
  const cameFromPricing = Boolean(requestedPlan);
  const priceLabel =
    cycle === "annual"
      ? `${moneyZar(selected.annual)}/yr`
      : `${moneyZar(selected.monthly)}/mo`;

  const annualSave = selected.monthly * 12 - selected.annual;

  return (
    <div className="space-y-4">
      <PremiumCard tone="dark" className="portal-card-premium">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <BillingChip>
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              No active subscription
            </BillingChip>

            <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
              Choose your plan
            </h2>

            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-200/85">
              Pick the plan that fits your business today. You can upgrade later as your
              needs grow.
            </p>

            {cameFromPricing ? (
              <div className="mt-3">
                <BillingChip tone="brand">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  {PRICE_TABLE[requestedPlan].title} preselected from pricing page
                </BillingChip>
              </div>
            ) : null}
          </div>

          {userEmail ? (
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-200 ring-1 ring-white/10">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Signed in as
              </div>
              <div className="mt-1 font-medium text-white">{userEmail}</div>
            </div>
          ) : null}
        </div>
      </PremiumCard>

      <PremiumCard tone="glass" className="portal-card-premium">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Billing cycle</h3>
            <p className="mt-1 text-sm text-slate-200/85">
              Annual saves more if you already know this is your long-term setup.
            </p>
          </div>

          <CycleToggle value={cycle} onChange={setCycle} />
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {(["starter", "growth", "pro"] as PaidTier[]).map((tier) => {
          const plan = PRICE_TABLE[tier];
          const active = selectedTier === tier;
          const price =
            cycle === "annual"
              ? `${moneyZar(plan.annual)}/yr`
              : `${moneyZar(plan.monthly)}/mo`;

          return (
            <button
              key={tier}
              type="button"
              onClick={() => setSelectedTier(tier)}
              aria-pressed={active}
              className={cx(
                "relative rounded-2xl border p-4 text-left text-white shadow-[0_12px_34px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60",
                active
                  ? "border-teal-200/45 bg-[#0b5f63]/78 shadow-[0_0_0_4px_rgba(94,234,212,0.12)]"
                  : "border-white/15 bg-[#073540]/70 hover:border-white/24 hover:bg-[#0a4550]/76"
              )}
            >
              {plan.badge ? (
                <div className="absolute right-12 top-4 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white ring-1 ring-white/10">
                  {plan.badge}
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-white">{plan.title}</div>
                  <div className="mt-1 text-sm font-semibold text-white/66">
                    {tier === "starter"
                      ? "For freelancers and solo businesses"
                      : tier === "growth"
                      ? "Best for growing businesses"
                      : "For established operations"}
                  </div>
                </div>

                <div
                  className={cx(
                    "mt-1 h-5 w-5 rounded-full border-2 transition",
                    active
                      ? "border-teal-200 bg-teal-300"
                      : "border-white/30 bg-white/10"
                  )}
                />
              </div>

              <div className="mt-4">
                <div className="text-xl font-black tracking-tight text-white">
                  {price}
                </div>
                <div className="mt-1 text-sm font-semibold text-white/62">
                  {plan.companies} compan{plan.companies === 1 ? "y" : "ies"}
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex items-start gap-2 text-sm font-semibold text-white/72">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span>Desktop app access</span>
                </div>
                <div className="flex items-start gap-2 text-sm font-semibold text-white/72">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span>Unlimited documents</span>
                </div>
                <div className="flex items-start gap-2 text-sm font-semibold text-white/72">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span>{plan.companies} compan{plan.companies === 1 ? "y" : "ies"}</span>
                </div>
                {tier !== "starter" ? (
                  <div className="flex items-start gap-2 text-sm font-semibold text-white/72">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                    <span>Priority support</span>
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <PremiumCard tone="dark" className="portal-card-premium">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">
              Selected plan: {selected.title}
            </div>
            <div className="mt-1 text-sm text-slate-200/85">
              {priceLabel} • {selected.companies} compan{selected.companies === 1 ? "y" : "ies"}
            </div>
            <div className="mt-2 text-xs text-slate-300">
              Secure checkout. Cancel anytime. Access updates immediately after payment.
            </div>
            {cycle === "annual" ? (
              <div className="mt-2 text-xs text-slate-300">
                Annual saving: <span className="font-bold text-white">R{annualSave}</span>
              </div>
            ) : null}
          </div>

          <PortalButton onClick={onUpgrade} isLoading={upgradeLoading} type="button" className="justify-center">
            <span className="inline-flex items-center justify-center gap-2">
              <span className={BTN_ICON_PRIMARY}>⟠</span>
              <span>{upgradeLoading ? "Redirecting..." : `Continue with ${selected.title}`}</span>
            </span>
          </PortalButton>
        </div>
      </PremiumCard>
    </div>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const billingViewTrackedRef = useRef(false);
  const paymentSuccessTrackedRef = useRef(false);
  const lastTrackedPlanRef = useRef<string>("");

  const currentBillingUrl = useMemo(() => {
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, sp]);

  const requestedPlan = useMemo(() => {
    const raw = String(sp.get("plan") ?? "").toLowerCase().trim();
    if (raw === "growth") return "growth" as PaidTier;
    if (raw === "pro") return "pro" as PaidTier;
    return "starter" as PaidTier;
  }, [sp]);

  const requestedCycle = useMemo(() => {
    const raw = String(sp.get("cycle") ?? "").toLowerCase().trim();
    return raw === "annual" ? "annual" : "monthly";
  }, [sp]);

  const { state, user, error: sessionError, refresh } = useSession();

  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [entError, setEntError] = useState<string | null>(null);

  const fetchEntitlement = useCallback(async () => {
    setEntError(null);
    try {
      const r = await fetch(`/api/entitlement?ts=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await r.json().catch(() => null);

      if (r.status === 401 || r.status === 403) {
        setEnt(null);
        return;
      }

      if (!r.ok) {
        throw new Error(data?.error || data?.message || `Entitlement failed (${r.status}).`);
      }

      setEnt((data ?? null) as Entitlement);
    } catch (e: any) {
      setEnt(null);
      setEntError(e?.message || "Failed to load entitlement.");
    }
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    void fetchEntitlement();
  }, [state, fetchEntitlement]);

  const onRefreshAll = useCallback(async () => {
  try {
    await fetch("/api/billing/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    // ignore
  }

  await refresh();
  await fetchEntitlement();
}, [refresh, fetchEntitlement]);

  const derivedName = useMemo(() => {
    const em = (user as any)?.email as string | undefined;
    if (!em) return null;
    const base = displayNameFromEmail(em);
    return base ? capitalizeWords(base) : null;
  }, [user]);

  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  const [manualRef, setManualRef] = useState("");
  const [manualErr, setManualErr] = useState<string | null>(null);

  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [showSnapshot, setShowSnapshot] = useState(false);

  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [selectedTier, setSelectedTier] = useState<PaidTier>("starter");

  async function verifyReference(reference: string) {
    const ref = String(reference || "").trim();
    if (!ref) return;

    setVerifyLoading(true);
    setVerifyNote(null);

    try {
      const res = await fetch("/api/billing/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error || data?.message || `Verify failed (${res.status}).`;
        throw new Error(msg);
      }

      if (data?.ok) {
        setVerifyNote("Payment verified ✅ Your plan will update shortly.");
      } else {
        const st = String(data?.status ?? "unknown");
        setVerifyNote(`Payment status: ${st}`);
      }

      await refresh();
      await fetchEntitlement();
    } catch (e: any) {
      setVerifyNote(e?.message || "Failed to verify payment.");
    } finally {
      setVerifyLoading(false);
      setUpgradeLoading(false);
    }
  }

  useEffect(() => {
    setUpgradeError(null);
    setVerifyNote(null);
    setManualErr(null);
    setManageError(null);

    const ref = sp.get("reference") || sp.get("trxref") || "";
    if (ref) {
      void verifyReference(ref);
    } else if (sp.get("paid") === "1") {
      setVerifyNote("Payment detected. If your plan doesn’t update in a moment, click Refresh.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const planName = String(ent?.plan ?? "FREE").toUpperCase();
  const planLabel = planLabelFromEnt(planName);
  const isPaid = planLabel !== "FREE";
  const isFreeOnboarding = planLabel === "FREE";

  useEffect(() => {
    if (planLabel !== "FREE") return;
    setSelectedTier(requestedPlan);
    setCycle(requestedCycle);
  }, [planLabel, requestedPlan, requestedCycle]);

  const renewsAt = ent?.currentPeriodEnd ?? null;
  const graceUntil = ent?.graceUntil ?? null;

  const featureReadOnly = !!ent?.features?.readOnly;

  useEffect(() => {
    if (!isPaid) return;
    setSelectedTier(entToPaidTier(planName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, planName]);

  const withinGrace = useMemo(() => {
    if (!graceUntil) return false;
    const t = Date.parse(graceUntil);
    if (!Number.isFinite(t)) return false;
    return Date.now() <= t;
  }, [graceUntil]);

  const effectiveStatus = useMemo(() => {
    if (!isPaid) return "free";
    if (featureReadOnly) return "read_only";
    if (withinGrace) return "grace";
    return normalizeStatus(ent?.status ?? "active");
  }, [ent?.status, featureReadOnly, isPaid, withinGrace]);

  const limits =
    ent?.features?.limits ?? {
      invoice: 5,
      quote: 5,
      purchase_order: 5,
      companies: 1,
    };

  const subtitle =
    state === "ready"
      ? planLabel === "FREE"
        ? "Choose a plan to activate your account."
        : "Manage your plan and subscription in one place."
      : state === "unauth"
      ? "Your session has expired — please log in again."
      : state === "error"
      ? "We couldn’t load billing details right now."
      : "Preparing billing...";

  const selected = PRICE_TABLE[selectedTier];
  const priceForSelected =
    cycle === "annual" ? `${moneyZar(selected.annual)}/yr` : `${moneyZar(selected.monthly)}/mo`;
  const annualSaveForSelected = selected.monthly * 12 - selected.annual;

  useEffect(() => {
    if (state !== "ready") return;
    if (billingViewTrackedRef.current) return;

    billingViewTrackedRef.current = true;
    void trackAnalytics("billing_page_view", {
      has_subscription: isPaid,
      status: effectiveStatus,
      plan: isPaid ? planLabel.toLowerCase() : "free",
    });
  }, [state, isPaid, effectiveStatus, planLabel]);

  useEffect(() => {
    if (!isFreeOnboarding) return;

    const key = `${selectedTier}:${cycle}`;
    if (lastTrackedPlanRef.current === key) return;
    lastTrackedPlanRef.current = key;

    void trackAnalytics("billing_plan_selected", {
      plan: selectedTier,
      cycle,
    });
  }, [isFreeOnboarding, selectedTier, cycle]);

  useEffect(() => {
    const paidFlag = sp.get("paid") === "1";
    if (!paidFlag || paymentSuccessTrackedRef.current) return;

    paymentSuccessTrackedRef.current = true;
    void trackAnalytics("payment_success", {
      plan: selectedTier,
      cycle,
    });
  }, [sp, selectedTier, cycle]);

  async function onUpgrade() {
    if (upgradeLoading) return;

    setUpgradeError(null);
    setUpgradeLoading(true);

    try {
      await trackAnalytics("checkout_started", {
        plan: selectedTier,
        cycle,
      });

      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle, tier: selectedTier }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error || data?.message || `Subscribe failed (${res.status}).`;
        throw new Error(msg);
      }

      const url = data?.authorization_url as string | undefined;
      if (!url) throw new Error("Missing Paystack authorization_url.");

      window.location.href = url;
    } catch (e: any) {
      setUpgradeError(e?.message || "Failed to start checkout.");
      setUpgradeLoading(false);
    }
  }

  async function onManagePlan() {
    if (manageLoading) return;

    setManageError(null);
    setManageLoading(true);

    try {
      await trackAnalytics("manage_plan_opened", {
        status: effectiveStatus,
        plan: planLabel.toLowerCase(),
      });

      const res = await fetch("/api/billing/manage-link", {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.error || data?.message || `Manage link failed (${res.status}).`;
        throw new Error(msg);
      }

      const url = data?.url as string | undefined;
      if (!url) throw new Error("Missing manage link URL.");

      window.location.href = url;
    } catch (e: any) {
      setManageError(e?.message || "Failed to open subscription management.");
      setManageLoading(false);
    }
  }

  function onManualVerify() {
    const ref = manualRef.trim();
    if (!ref) {
      setManualErr("Paste your Paystack reference (or trxref) to verify.");
      return;
    }
    setManualErr(null);
    void verifyReference(ref);
  }

  const heroStatusLabel = statusLabel(effectiveStatus);
  const heroTone = statusTone(effectiveStatus);
  const heroDot = statusDotClass(effectiveStatus);

  const priceLabelForPaid = ent?.amount
    ? ent?.interval === "annual" || ent?.interval === "yearly"
      ? `${moneyZar(ent.amount)}/yr`
      : `${moneyZar(ent.amount)}/mo`
    : priceForSelected;

  const kpiPrice = planLabel === "FREE" ? "—" : priceLabelForPaid;

  const graceCountdown = useMemo(() => {
    if (!graceUntil) return null;
    const dt = new Date(graceUntil);
    if (Number.isNaN(dt.getTime())) return null;
    const diffMs = dt.getTime() - Date.now();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(days)) return null;
    return Math.max(0, days);
  }, [graceUntil]);

  const entitlementSnapshot = useMemo(() => {
    return {
      plan: ent?.plan ?? null,
      status: ent?.status ?? null,
      currentPeriodEnd: ent?.currentPeriodEnd ?? null,
      graceUntil: ent?.graceUntil ?? null,
      features: ent?.features ?? null,
    };
  }, [ent]);

  const companyLimit = Number(limits?.companies ?? 1);

  return (
    <>
      {state === "loading" ? (
        <BillingSkeleton />
      ) : state === "unauth" ? (
        <EmptyState
          title="Please log in to continue"
          body="Your session isn’t active. Log in again to manage billing."
          primaryLabel="Go to login"
          onPrimary={() => router.push(`/login?next=${encodeURIComponent(currentBillingUrl)}`)}
          secondaryLabel="Back to home"
          onSecondary={() => router.push("/")}
        />
      ) : state === "error" ? (
        <EmptyState
          title="Billing could not load"
          body={sessionError ?? "Something went wrong. Please try again."}
          primaryLabel="Retry"
          onPrimary={() => onRefreshAll()}
          secondaryLabel="Go to login"
          onSecondary={() => router.push(`/login?next=${encodeURIComponent(currentBillingUrl)}`)}
        />
      ) : isFreeOnboarding ? (
        <div className="space-y-4">
          {entError ? (
            <PortalAlert tone="danger">{entError}</PortalAlert>
          ) : null}

          {upgradeError ? (
            <PortalAlert tone="danger">{upgradeError}</PortalAlert>
          ) : null}

          {verifyLoading ? (
            <PortalAlert tone="info">Verifying payment…</PortalAlert>
          ) : verifyNote ? (
            <PortalAlert tone="info">{verifyNote}</PortalAlert>
          ) : null}

          <BillingOnboardingView
            userEmail={(user as any)?.email ?? null}
            requestedPlan={requestedPlan}
            selectedTier={selectedTier}
            setSelectedTier={setSelectedTier}
            cycle={cycle}
            setCycle={setCycle}
            upgradeLoading={upgradeLoading}
            onUpgrade={onUpgrade}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* BILLING STATUS PANEL */}
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
                    <BillingChip
                      tone={
                        heroTone === "success"
                          ? "success"
                          : heroTone === "brand"
                          ? "brand"
                          : "neutral"
                      }
                    >
                      <span className={cx("h-1.5 w-1.5 rounded-full", heroDot)} />
                      {heroStatusLabel}
                    </BillingChip>
                    <BillingChip>{planLabel} plan</BillingChip>
                    {renewsAt ? <BillingChip>Renews {fmtDate(renewsAt)}</BillingChip> : null}
                    <BillingChip>Secure Paystack</BillingChip>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-teal-200">
                        Billing status
                      </p>
                      <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                        {effectiveStatus === "read_only"
                          ? "Payment attention needed."
                          : "Subscription in good standing."}
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm leading-5 text-white/76">
                        {effectiveStatus === "read_only"
                          ? "Your desktop app will stay in read-only mode until billing is resolved."
                          : "Manage your plan, payment method and desktop entitlement from one secure place."}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
                      <button
                        onClick={onManagePlan}
                        disabled={manageLoading}
                        title="Manage subscription on Paystack"
                        type="button"
                        className={BILLING_PILL_BUTTON}
                      >
                        {manageLoading ? "Opening..." : "Manage plan"}
                      </button>
                      <button
                        onClick={onRefreshAll}
                        type="button"
                        className={BILLING_PILL_BUTTON}
                      >
                        Refresh status
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <BillingMetricCard
                      label="Plan"
                      value={planLabel}
                      helper={`${companyLimit} compan${companyLimit === 1 ? "y" : "ies"}`}
                      icon="★"
                    />
                    <BillingMetricCard
                      label="Price"
                      value={kpiPrice}
                      helper="Current value"
                      icon="R"
                    />
                    <BillingMetricCard
                      label="Access"
                      value={featureReadOnly ? "Read-only" : "Full access"}
                      helper="Desktop entitlement"
                      icon="✓"
                    />
                    <BillingMetricCard
                      label="Status"
                      value={heroStatusLabel}
                      helper={
                        withinGrace
                          ? `Grace active${graceCountdown != null ? ` • ${graceCountdown} day${graceCountdown === 1 ? "" : "s"} left` : ""}`
                          : effectiveStatus === "read_only"
                          ? "Resolve billing"
                          : "No action required"
                      }
                      icon="⟠"
                    />
                  </div>
                </div>
              </div>
            </PremiumCard>
          </Stagger>

          {/* GRACE STRIP */}
          {withinGrace ? (
            <PortalAlert tone="info">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold">Grace period active</span>
                <span className="text-xs">
                  {graceCountdown != null ? (
                    <>
                      <span className="font-semibold">{graceCountdown}</span> day
                      {graceCountdown === 1 ? "" : "s"} remaining • Ends{" "}
                      <span className="font-semibold">{fmtDate(graceUntil)}</span>
                    </>
                  ) : (
                    <>
                      Ends <span className="font-semibold">{fmtDate(graceUntil)}</span>
                    </>
                  )}
                </span>
              </div>
              <div className="mt-1">
                You still have paid access during grace. Update your payment method to avoid a downgrade.
              </div>
            </PortalAlert>
          ) : null}

          {/* ERRORS / NOTES */}
          {entError ? <PortalAlert tone="danger">{entError}</PortalAlert> : null}
          {upgradeError ? <PortalAlert tone="danger">{upgradeError}</PortalAlert> : null}
          {manageError ? <PortalAlert tone="danger">{manageError}</PortalAlert> : null}
          {verifyLoading ? (
            <PortalAlert tone="info">Verifying payment…</PortalAlert>
          ) : verifyNote ? (
            <PortalAlert tone="info">{verifyNote}</PortalAlert>
          ) : null}

          {/* ACCOUNT STRIP */}
          <Stagger delayMs={70}>
            <SectionCard
              title="Subscription summary"
              subtitle="The effective billing state your portal and desktop app will apply."
              action={
                <BillingChip
                  tone={
                    heroTone === "success"
                      ? "success"
                      : heroTone === "brand"
                      ? "brand"
                      : "neutral"
                  }
                >
                  <span className={cx("h-2 w-2 rounded-full", heroDot)} />
                  {heroStatusLabel}
                </BillingChip>
              }
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <BillingMetricCard
                  label="Plan"
                  value={planLabel}
                  helper={`${companyLimit} companies allowed`}
                  icon="★"
                />
                <BillingMetricCard
                  label="Renews"
                  value={fmtDate(renewsAt)}
                  helper="Current period end"
                  icon="⏱"
                />
                <BillingMetricCard
                  label="Companies"
                  value={String(companyLimit)}
                  helper="Account allowance"
                  icon="▣"
                />
                <BillingMetricCard
                  label="Read-only"
                  value={featureReadOnly ? "Yes" : "No"}
                  helper="Desktop mode"
                  icon="✓"
                />
              </div>
            </SectionCard>
          </Stagger>

          {/* MAIN GRID */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="space-y-4">
              <Stagger delayMs={120}>
                <SectionCard
                  title="Current plan details"
                  subtitle="Subscription status, renewal and payment verification tools."
                  action={
                    <button
                      onClick={onManagePlan}
                      disabled={manageLoading}
                      type="button"
                      className={BILLING_PILL_BUTTON}
                    >
                      {manageLoading ? "Opening..." : "Manage plan"}
                    </button>
                  }
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <BillingAccessItem label="Plan" value={planLabel} />
                    <BillingAccessItem label="Status" value={heroStatusLabel} />
                    <BillingAccessItem label="Price" value={priceLabelForPaid} />
                    <BillingAccessItem label="Current period ends" value={fmtDate(renewsAt)} />
                    <BillingAccessItem label="Grace until" value={fmtDate(graceUntil)} />
                    <BillingAccessItem label="Companies allowed" value={String(companyLimit)} />
                  </div>

                  <div className="mt-5 rounded-3xl border border-white/18 bg-slate-950/24 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-white">Manual payment verification</p>
                        <p className="mt-1 text-xs leading-5 text-white/72">
                          If your plan did not update after checkout, paste the Paystack reference.
                        </p>
                      </div>
                      <BillingChip>Fallback</BillingChip>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <PortalInput
                        value={manualRef}
                        onChange={(e) => setManualRef(e.target.value)}
                        placeholder="e.g. 9t5k9m9d0x / trxref"
                        className="h-11 bg-white/95"
                      />
                      <PortalButton onClick={onManualVerify} isLoading={verifyLoading} variant="secondary" type="button">
                        {verifyLoading ? "Verifying…" : "Verify"}
                      </PortalButton>
                    </div>

                    {manualErr ? <PortalAlert tone="danger" className="mt-3">{manualErr}</PortalAlert> : null}
                  </div>
                </SectionCard>
              </Stagger>

              <Stagger delayMs={170}>
                <SectionCard
                  title="Compare plans"
                  subtitle="The main difference today is company allowance and access level."
                  action={<BillingChip>Pricing</BillingChip>}
                >
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <PlanCard
                    title="STARTER"
                    price={
                      cycle === "annual"
                        ? `${moneyZar(PRICE_TABLE.starter.annual)}/yr`
                        : `${moneyZar(PRICE_TABLE.starter.monthly)}/mo`
                    }
                    active={planLabel === "STARTER" && !featureReadOnly}
                    items={[
                      { ok: true, label: "Desktop app access" },
                      { ok: true, label: "Unlimited documents" },
                      { ok: true, label: `Companies: ${PRICE_TABLE.starter.companies}` },
                    ]}
                  />

                  <PlanCard
                    title="GROWTH"
                    price={
                      cycle === "annual"
                        ? `${moneyZar(PRICE_TABLE.growth.annual)}/yr`
                        : `${moneyZar(PRICE_TABLE.growth.monthly)}/mo`
                    }
                    active={planLabel === "GROWTH" && !featureReadOnly}
                    items={[
                      { ok: true, label: "Desktop app access" },
                      { ok: true, label: "Unlimited documents" },
                      { ok: true, label: `Companies: ${PRICE_TABLE.growth.companies}` },
                      { ok: true, label: "Priority support" },
                    ]}
                  />

                  <PlanCard
                    title="PRO"
                    price={
                      cycle === "annual"
                        ? `${moneyZar(PRICE_TABLE.pro.annual)}/yr`
                        : `${moneyZar(PRICE_TABLE.pro.monthly)}/mo`
                    }
                    active={planLabel === "PRO" && !featureReadOnly}
                    items={[
                      { ok: true, label: "Desktop app access" },
                      { ok: true, label: "Unlimited documents" },
                      { ok: true, label: `Companies: ${PRICE_TABLE.pro.companies}` },
                      { ok: true, label: "Priority support" },
                    ]}
                  />
                  </div>
                </SectionCard>
              </Stagger>

              <Stagger delayMs={220}>
                <SectionCard
                  title="Questions customers may ask"
                  subtitle="Short answers for payment and subscription concerns."
                  action={<BillingChip>FAQ</BillingChip>}
                >
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <Faq
                    q="Do you store my card details?"
                    a="No. Paystack stores and secures payment methods. eKasiBooks only stores your subscription status."
                  />
                  <Faq
                    q="My plan didn’t update after payment — what now?"
                    a="Click Refresh. If it still doesn’t update, paste the Paystack reference above to verify manually."
                  />
                  <Faq
                    q="Can I cancel?"
                    a="Yes. Click “Manage plan” — you can cancel anytime from the secure Paystack portal."
                  />
                  </div>
                </SectionCard>
              </Stagger>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
              <PremiumCard tone="dark" className="portal-card-premium">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white">Payment method</h3>
                    <p className="mt-1 text-sm text-slate-200/85">Handled securely by Paystack.</p>
                  </div>
                  <BillingChip tone="success">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Secure
                  </BillingChip>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4 ring-1 ring-white/10">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-300">
                    Card security
                  </p>
                  <p className="mt-2 text-base font-black text-white">Stored on Paystack</p>
                  <p className="mt-1 text-sm text-slate-200/85">
                    We do not store card details in the portal.
                  </p>
                </div>

                <button
                  onClick={onManagePlan}
                  disabled={manageLoading}
                  className={`${BILLING_PILL_BUTTON} mt-4 w-full`}
                  title="Manage subscription on Paystack"
                  type="button"
                >
                  {manageLoading ? "Opening..." : "Manage payment method"}
                </button>
              </PremiumCard>

              <PremiumCard tone="glass" className="portal-card-premium">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white">Entitlement snapshot</h3>
                    <p className="mt-1 text-sm text-slate-200/85">
                      Technical view used when debugging desktop access.
                    </p>
                  </div>
                  <CopyButton text={safeJson(entitlementSnapshot)} />
                </div>

                <button
                  type="button"
                  onClick={() => setShowSnapshot((v) => !v)}
                  className="mt-4 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-left text-sm font-black text-white transition hover:border-white/20 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-teal-300"
                >
                  <span>{showSnapshot ? "Hide technical snapshot" : "Show technical snapshot"}</span>
                  <span>{showSnapshot ? "↑" : "↓"}</span>
                </button>

                {showSnapshot ? (
                  <pre className="mt-3 max-h-[240px] overflow-auto rounded-2xl bg-slate-950/90 p-3 text-[12px] text-slate-100 ring-1 ring-white/10">
                    {safeJson(entitlementSnapshot)}
                  </pre>
                ) : (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-white/10 p-3 text-sm text-slate-200">
                    Hidden by default so billing stays focused. Open this only when debugging sync or entitlement issues.
                  </p>
                )}
              </PremiumCard>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- Local helpers ---------------- */

function Feature({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cx(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
          ok ? "bg-emerald-400/18 text-emerald-50 ring-1 ring-emerald-100/18" : "bg-white/10 text-white/40"
        )}
      >
        {ok ? "✓" : "—"}
      </span>
      <span className={ok ? "" : "text-white/40"}>{label}</span>
    </li>
  );
}

function PlanCard({
  title,
  price,
  items,
  active,
}: {
  title: string;
  price: string;
  items: { ok: boolean; label: string }[];
  active?: boolean;
}) {
  return (
    <div className="relative overflow-visible rounded-2xl border border-white/16 bg-slate-950/18 p-3.5 shadow-[0_12px_34px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-white">{title}</div>
          <div className="mt-1 text-xs font-semibold text-white/72">{price}</div>
        </div>
        {active ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Current
          </span>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1.5 text-sm text-white/76">
        {items.map((it) => (
          <Feature key={it.label} ok={it.ok} label={it.label} />
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-white/16 bg-slate-950/18 p-3.5 shadow-[0_12px_34px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur">
      <div className="text-sm font-black text-white">{q}</div>
      <div className="mt-1 text-sm leading-6 text-white/72">{a}</div>
    </div>
  );
}

/* ---------------- Skeleton + EmptyState ---------------- */

function BillingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <PortalSkeleton className="h-5 w-52" />
        <PortalSkeleton className="mt-3 h-4 w-80" />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
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
    <PremiumCard className="portal-card-premium">
      <PortalEmptyState
        title={title}
        description={body}
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <PortalButton onClick={onPrimary} type="button">
              {primaryLabel}
            </PortalButton>
            <PortalButton onClick={onSecondary} variant="secondary" type="button">
              {secondaryLabel}
            </PortalButton>
          </div>
        }
      />
    </PremiumCard>
  );
}
