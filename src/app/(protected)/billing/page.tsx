"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { PremiumCard, KpiCard, DetailTile, Chip } from "@/components/portal/ui";
import { useSession } from "@/components/portal/session";
import { formatDateTime } from "@/lib/dates";

/* =========================
   Small utilities
   ========================= */

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

const BTN_BASE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition " +
  "will-change-transform hover:-translate-y-[1px] active:translate-y-0 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] " +
  "disabled:opacity-70 disabled:hover:translate-y-0";

const BTN_PRIMARY = cx(BTN_BASE, "text-white");
const BTN_SECONDARY = cx(
  BTN_BASE,
  "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
);

const BTN_ICON_PRIMARY = "grid h-7 w-7 place-items-center rounded-lg bg-white/15";
const BTN_ICON_SECONDARY =
  "grid h-7 w-7 place-items-center rounded-lg bg-slate-900/5 ring-1 ring-slate-200";

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
    <button onClick={onCopy} className={BTN_SECONDARY} type="button">
      {copied ? "Copied ✓" : "Copy snapshot"}
    </button>
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
    <div className="space-y-6">
      <PremiumCard className="portal-card-premium">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Chip tone="neutral">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              No active subscription
            </Chip>

            <h2 className="mt-3 text-xl font-semibold text-slate-900 sm:text-2xl">
              Choose your plan
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
              Pick the plan that fits your business today. You can upgrade later as your
              needs grow.
            </p>

            {cameFromPricing ? (
              <div className="mt-3">
                <Chip tone="brand">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  {PRICE_TABLE[requestedPlan].title} preselected from pricing page
                </Chip>
              </div>
            ) : null}
          </div>

          {userEmail ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Signed in as
              </div>
              <div className="mt-1 font-medium text-slate-900">{userEmail}</div>
            </div>
          ) : null}
        </div>
      </PremiumCard>

      <PremiumCard className="portal-card-premium">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Billing cycle</h3>
            <p className="mt-1 text-sm text-slate-600">
              Annual saves more if you already know this is your long-term setup.
            </p>
          </div>

          <CycleToggle value={cycle} onChange={setCycle} />
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
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
                "relative rounded-3xl border bg-white p-5 text-left shadow-sm transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
                active
                  ? "border-[color:var(--primary)] shadow-[0_0_0_4px_rgba(17,179,163,0.10)]"
                  : "border-slate-200 hover:border-slate-300 hover:shadow-md"
              )}
            >
              {plan.badge ? (
                <div className="absolute right-12 top-4 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {plan.badge}
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-900">{plan.title}</div>
                  <div className="mt-1 text-sm text-slate-600">
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
                      ? "border-[color:var(--primary)] bg-[var(--primary)]"
                      : "border-slate-300 bg-white"
                  )}
                />
              </div>

              <div className="mt-5">
                <div className="text-2xl font-semibold tracking-tight text-slate-900">
                  {price}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {plan.companies} compan{plan.companies === 1 ? "y" : "ies"}
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span>Desktop app access</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span>Unlimited documents</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                  <span>{plan.companies} compan{plan.companies === 1 ? "y" : "ies"}</span>
                </div>
                {tier !== "starter" ? (
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                    <span>Priority support</span>
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <PremiumCard className="portal-card-premium">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Selected plan: {selected.title}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {priceLabel} • {selected.companies} compan{selected.companies === 1 ? "y" : "ies"}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Secure checkout. Cancel anytime. Access updates immediately after payment.
            </div>
            {cycle === "annual" ? (
              <div className="mt-2 text-xs text-slate-600">
                Annual saving: <span className="font-bold text-slate-900">R{annualSave}</span>
              </div>
            ) : null}
          </div>

          <button
            onClick={onUpgrade}
            disabled={upgradeLoading}
            className={BTN_PRIMARY}
            style={{ background: "var(--primary)" }}
            type="button"
          >
            <span className={BTN_ICON_PRIMARY}>⟠</span>
            {upgradeLoading ? "Redirecting..." : `Continue with ${selected.title}`}
          </button>
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
    <PortalShell
      badge="Billing"
      title="Subscription & Billing"
      subtitle={subtitle}
      backHref="/dashboard"
      backLabel="Back to overview"
      userEmail={(user as any)?.email ?? null}
      userName={derivedName}
      planName={planLabel}
      headerRight={
        state === "ready" ? (
          <button onClick={onRefreshAll} className={BTN_SECONDARY} type="button">
            Refresh
          </button>
        ) : null
      }
      footerRight={
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">
            Payments powered by Paystack
          </span>
          <Chip>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Billing
          </Chip>
        </div>
      }
    >
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
        <div className="space-y-6">
          {entError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {entError}
            </div>
          ) : null}

          {upgradeError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {upgradeError}
            </div>
          ) : null}

          {verifyLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Verifying payment…
            </div>
          ) : verifyNote ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {verifyNote}
            </div>
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
        <div className="space-y-6">
          {/* HERO */}
          <PremiumCard className="portal-card-premium">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <Chip
                  tone={
                    heroTone === "success"
                      ? "success"
                      : heroTone === "brand"
                      ? "brand"
                      : "neutral"
                  }
                >
                  <span className={cx("h-2 w-2 rounded-full", heroDot)} />
                  {planLabel} • {heroStatusLabel}
                </Chip>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  {effectiveStatus === "read_only"
                    ? "Your account is in read-only mode"
                    : "Your subscription is active"}
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  {effectiveStatus === "read_only"
                    ? "Your subscription is not active. The desktop app will be read-only until billing is resolved."
                    : "Manage billing securely on Paystack — update your card, cancel anytime."}
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  Company limit:{" "}
                  <span className="font-semibold text-slate-700">{companyLimit}</span>
                </p>

                {graceUntil ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Grace window until{" "}
                    <span className="font-semibold text-slate-700">{fmtDate(graceUntil)}</span>
                  </p>
                ) : null}
              </div>

              <div className="flex w-full flex-col items-end gap-2 md:w-auto">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={onManagePlan}
                    disabled={manageLoading}
                    className={BTN_PRIMARY}
                    style={{ background: "var(--primary)" }}
                    title="Manage subscription on Paystack"
                    type="button"
                  >
                    <span className={BTN_ICON_PRIMARY}>⚙</span>
                    {manageLoading ? "Opening..." : "Manage plan"}
                  </button>

                  <button onClick={onRefreshAll} className={BTN_SECONDARY} type="button">
                    <span className={BTN_ICON_SECONDARY}>↻</span>
                    Refresh status
                  </button>
                </div>

                <span className="text-[11px] leading-tight text-slate-500">
                  Cancel anytime (secure Paystack portal).
                </span>
              </div>
            </div>
          </PremiumCard>

          {/* GRACE STRIP */}
          {withinGrace ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-amber-900">Grace period active</div>
                <div className="text-xs text-amber-800">
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
                </div>
              </div>
              <div className="mt-2 text-sm text-amber-900/80">
                You still have paid access during grace. Update your payment method to avoid a
                downgrade.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={onManagePlan}
                  disabled={manageLoading}
                  className={BTN_SECONDARY}
                  type="button"
                >
                  <span className={BTN_ICON_SECONDARY}>⚙</span>
                  {manageLoading ? "Opening..." : "Update payment method"}
                </button>
                <button onClick={onRefreshAll} className={BTN_SECONDARY} type="button">
                  <span className={BTN_ICON_SECONDARY}>↻</span>
                  Refresh
                </button>
              </div>
            </div>
          ) : null}

          {/* ERRORS / NOTES */}
          {entError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {entError}
            </div>
          ) : null}

          {upgradeError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {upgradeError}
            </div>
          ) : null}

          {manageError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {manageError}
            </div>
          ) : null}

          {verifyLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Verifying payment…
            </div>
          ) : verifyNote ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {verifyNote}
            </div>
          ) : null}

          {/* KPI */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Plan" value={planLabel} icon="★" />
            <KpiCard label="Status" value={heroStatusLabel} icon="✓" />
            <KpiCard label="Renews" value={fmtDate(renewsAt)} icon="⏱" />
            <KpiCard label="Price" value={kpiPrice} icon="R" />
          </div>

          {/* MAIN GRID */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <PremiumCard className="portal-card-premium lg:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Plan details</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Subscription status and what’s included.
                  </p>
                </div>

                <Chip
                  tone={
                    heroTone === "success"
                      ? "success"
                      : heroTone === "brand"
                      ? "brand"
                      : "neutral"
                  }
                >
                  <span className={cx("mr-2 inline-block h-2 w-2 rounded-full", heroDot)} />
                  {heroStatusLabel}
                </Chip>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DetailTile label="Plan" value={planLabel} />
                <DetailTile label="Price" value={priceLabelForPaid} />
                <DetailTile label="Renews" value={fmtDate(renewsAt)} />
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-700">
                  {effectiveStatus === "read_only" ? (
                    <>
                      Your account is <span className="font-semibold">read-only</span>. Resolve
                      billing to restore full access.
                    </>
                  ) : (
                    <>
                      Your subscription is{" "}
                      <span className="font-semibold">
                        {heroStatusLabel.toLowerCase()}
                      </span>
                      . Manage it securely via <span className="font-semibold">Paystack</span>.
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Paystack handles checkout & tokenization. We store subscription status only.
                </p>
              </div>

              {/* PLAN COMPARISON */}
              <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Plan comparison</p>
                    <p className="mt-1 text-xs text-slate-500">
                      The main difference is the number of companies you can create.
                    </p>
                  </div>
                  <Chip tone="neutral">Companies</Chip>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              </div>

              {/* VERIFY */}
              <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Verify payment</p>
                    <p className="mt-1 text-xs text-slate-500">
                      If your plan didn’t update after checkout, paste the Paystack reference.
                    </p>
                  </div>
                  <Chip tone="neutral">Manual</Chip>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={manualRef}
                    onChange={(e) => setManualRef(e.target.value)}
                    placeholder="e.g. 9t5k9m9d0x / trxref"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-300 focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                  />
                  <button
                    onClick={onManualVerify}
                    disabled={verifyLoading}
                    className={BTN_SECONDARY}
                    type="button"
                  >
                    {verifyLoading ? "Verifying…" : "Verify"}
                  </button>
                </div>

                {manualErr ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {manualErr}
                  </div>
                ) : null}
              </div>

              {/* FAQ */}
              <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-900">FAQ</p>
                <div className="mt-3 space-y-3">
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
              </div>
            </PremiumCard>

            <div className="space-y-6">
              <PremiumCard tone="soft" className="portal-card-premium">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Payment method</h3>
                    <p className="mt-1 text-sm text-slate-600">Handled securely by Paystack.</p>
                  </div>
                  <Chip tone="success">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Secure
                  </Chip>
                </div>

                <div className="mt-5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      Stored on Paystack
                    </span>
                    <span className="text-xs font-semibold text-slate-600">Protected</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    For security, we don’t store card details in the portal.
                  </p>
                </div>

                <button
                  onClick={onManagePlan}
                  disabled={manageLoading}
                  className={cx(BTN_SECONDARY, "mt-6 w-full")}
                  title="Manage subscription on Paystack"
                  type="button"
                >
                  {manageLoading ? "Opening..." : "Manage payment method"}
                </button>
              </PremiumCard>

              <PremiumCard tone="soft" className="portal-card-premium">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Entitlement snapshot
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      This is what the desktop app will consume.
                    </p>
                  </div>
                  <CopyButton text={safeJson(entitlementSnapshot)} />
                </div>

                <pre className="mt-4 max-h-[260px] overflow-auto rounded-2xl bg-slate-900 p-4 text-[12px] text-slate-100 ring-1 ring-slate-800">
                  {safeJson(entitlementSnapshot)}
                </pre>

                <div className="mt-3 text-[11px] text-slate-500">
                  Effective status:{" "}
                  <span className="font-semibold text-slate-700">{heroStatusLabel}</span>
                </div>
              </PremiumCard>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

/* ---------------- Local helpers ---------------- */

function Feature({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cx(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
          ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
        )}
      >
        {ok ? "✓" : "—"}
      </span>
      <span className={ok ? "" : "text-slate-400"}>{label}</span>
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
    <div className="relative overflow-visible rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{price}</div>
        </div>
        {active ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Current
          </span>
        ) : null}
      </div>

      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {items.map((it) => (
          <Feature key={it.label} ok={it.ok} label={it.label} />
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{q}</div>
      <div className="mt-1 text-sm text-slate-600">{a}</div>
    </div>
  );
}

/* ---------------- Skeleton + EmptyState ---------------- */

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="h-5 w-52 animate-pulse rounded-lg bg-slate-200" />
        <div className="mt-3 h-4 w-80 animate-pulse rounded-lg bg-slate-200" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-16 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-16 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-16 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-16 animate-pulse rounded-3xl bg-slate-200" />
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
    <div className="rounded-3xl bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-slate-600">{body}</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onPrimary}
          className={BTN_PRIMARY}
          style={{ background: "var(--primary)" }}
          type="button"
        >
          {primaryLabel}
        </button>
        <button onClick={onSecondary} className={BTN_SECONDARY} type="button">
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}