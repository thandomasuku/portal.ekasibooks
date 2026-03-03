"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { PremiumCard, KpiCard, DetailTile, Chip } from "@/components/portal/ui";
import { useSession } from "@/components/portal/session";

/* =========================
   Page-level UI primitives
   ========================= */

const BTN_BASE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:opacity-70 disabled:hover:translate-y-0";

const BTN_PRIMARY = [BTN_BASE, "text-white", "hover:-translate-y-[1px]"].join(" ");

const BTN_SECONDARY = [
  BTN_BASE,
  "border border-slate-200 bg-white text-slate-900",
  "hover:-translate-y-[1px] hover:bg-slate-50",
].join(" ");

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
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
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
        className={[
          "h-9 rounded-xl px-4 text-sm font-semibold transition",
          value === "monthly" ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50",
        ].join(" ")}
        style={value === "monthly" ? { background: "var(--primary)" } : undefined}
      >
        Monthly
      </button>

      <button
        type="button"
        onClick={() => onChange("annual")}
        aria-pressed={value === "annual"}
        className={[
          "h-9 rounded-xl px-4 text-sm font-semibold transition inline-flex items-center gap-2",
          value === "annual" ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50",
        ].join(" ")}
        style={value === "annual" ? { background: "var(--primary)" } : undefined}
      >
        Annual
        <span
          className={[
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold",
            value === "annual"
              ? "bg-white/15 text-white ring-1 ring-white/25"
              : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
          ].join(" ")}
          title="Annual plan discount"
        >
          {saveLabel}
        </span>
      </button>
    </div>
  );
}

function TierToggle({ value, onChange }: { value: PaidTier; onChange: (v: PaidTier) => void }) {
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
            className={[
              "h-9 rounded-xl px-4 text-sm font-semibold transition",
              active ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50",
            ].join(" ")}
            style={active ? { background: "var(--primary)" } : undefined}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Small utilities ---------------- */

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

export default function BillingPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/billing";
  }, [sp]);

  const { state, user, error: sessionError, refresh } = useSession();

  const [ent, setEnt] = useState<any>(null);
  const [entError, setEntError] = useState<string | null>(null);

  const fetchEntitlement = useCallback(async () => {
    setEntError(null);
    try {
      const r = await fetch(`/api/entitlement?ts=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(data?.error || data?.message || `Entitlement failed (${r.status}).`);
      }
      setEnt(data);
    } catch (e: any) {
      setEntError(e?.message || "Failed to load entitlement.");
    }
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    void fetchEntitlement();
  }, [state, fetchEntitlement]);

  const onRefreshAll = useCallback(async () => {
    await refresh();
    // ✅ always try entitlement refresh after session refresh (avoids stale `state` closure)
    await fetchEntitlement();
  }, [refresh, fetchEntitlement]);

  const entAny = (ent ?? {}) as any;

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

  const planName = String(entAny?.plan ?? "FREE").toUpperCase();
  const planLabel = planLabelFromEnt(planName);
  const isPaid = planLabel !== "FREE";

  const renewsAt = (entAny?.currentPeriodEnd as string | null) ?? null;
  const graceUntil = (entAny?.graceUntil as string | null) ?? null;

  const featureReadOnly = !!entAny?.features?.readOnly;

  // ✅ Keep tier toggle aligned ONLY once you're paid (avoid overriding user's choice on FREE)
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
    return normalizeStatus(entAny?.status ?? "active");
  }, [entAny?.status, featureReadOnly, isPaid, withinGrace]);

  const limits =
    entAny?.features?.limits ?? {
      invoice: 5,
      quote: 5,
      purchase_order: 5,
      companies: 1,
    };

  const subtitle =
    state === "ready"
      ? "Manage your plan and subscription in one place."
      : state === "unauth"
      ? "Your session has expired — please log in again."
      : state === "error"
      ? "We couldn’t load billing details right now."
      : "Preparing billing...";

  const selected = PRICE_TABLE[selectedTier];
  const priceForSelected =
    cycle === "annual" ? `${moneyZar(selected.annual)}/yr` : `${moneyZar(selected.monthly)}/mo`;
  const annualSaveForSelected = selected.monthly * 12 - selected.annual;

  async function onUpgrade() {
    if (upgradeLoading) return;

    setUpgradeError(null);
    setUpgradeLoading(true);

    try {
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

  const priceLabelForPaid = entAny?.amount
    ? entAny?.interval === "annual" || entAny?.interval === "yearly"
      ? `${moneyZar(entAny.amount)}/yr`
      : `${moneyZar(entAny.amount)}/mo`
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
      plan: entAny?.plan ?? null,
      status: entAny?.status ?? null,
      currentPeriodEnd: entAny?.currentPeriodEnd ?? null,
      graceUntil: entAny?.graceUntil ?? null,
      features: entAny?.features ?? null,
    };
  }, [entAny]);

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
        <button onClick={onRefreshAll} className={BTN_SECONDARY}>
          Refresh
        </button>
      }
      footerRight={
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">Payments powered by Paystack</span>
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
          onPrimary={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)}
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
          onSecondary={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)}
        />
      ) : (
        <div className="space-y-6">
          <PremiumCard>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <Chip tone={heroTone === "success" ? "success" : heroTone === "brand" ? "brand" : "neutral"}>
                  <span className={`h-2 w-2 rounded-full ${heroDot}`} />
                  {planLabel} • {heroStatusLabel}
                </Chip>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  {planLabel === "FREE"
                    ? "Choose a plan when you’re ready"
                    : effectiveStatus === "read_only"
                    ? "Your account is in read-only mode"
                    : "Your subscription is active"}
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  {planLabel === "FREE"
                    ? "Paid plans unlock more companies. Everything else stays the same."
                    : effectiveStatus === "read_only"
                    ? "Your subscription is not active. The desktop app will be read-only until billing is resolved."
                    : "Manage billing securely on Paystack — update your card, cancel anytime."}
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  Company limit: <span className="font-semibold text-slate-700">{companyLimit}</span>
                </p>

                {planLabel !== "FREE" && graceUntil ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Grace window until <span className="font-semibold text-slate-700">{fmtDate(graceUntil)}</span>
                  </p>
                ) : null}
              </div>

              <div className="flex w-full flex-col items-end gap-2 md:w-auto">
                {planLabel === "FREE" ? (
                  <div className="w-full md:w-auto space-y-2">
                    <CycleToggle value={cycle} onChange={setCycle} />
                    <TierToggle value={selectedTier} onChange={setSelectedTier} />
                    <div className="text-[11px] text-slate-600">
                      Annual saves{" "}
                      <span className="font-extrabold text-slate-900">R{annualSaveForSelected}</span> per year.
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {planLabel === "FREE" ? (
                    <button
                      onClick={onUpgrade}
                      disabled={upgradeLoading}
                      className={BTN_PRIMARY}
                      style={{ background: "var(--primary)" }}
                    >
                      <span className={BTN_ICON_PRIMARY}>⟠</span>
                      {upgradeLoading
                        ? "Redirecting..."
                        : `Subscribe • ${PRICE_TABLE[selectedTier].title} (${priceForSelected})`}
                    </button>
                  ) : (
                    <button
                      onClick={onManagePlan}
                      disabled={manageLoading}
                      className={BTN_PRIMARY}
                      style={{ background: "var(--primary)" }}
                      title="Manage subscription on Paystack"
                    >
                      <span className={BTN_ICON_PRIMARY}>⚙</span>
                      {manageLoading ? "Opening..." : "Manage plan"}
                    </button>
                  )}

                  <button onClick={onRefreshAll} className={BTN_SECONDARY}>
                    <span className={BTN_ICON_SECONDARY}>↻</span>
                    Refresh status
                  </button>
                </div>

                {planLabel !== "FREE" ? (
                  <span className="text-[11px] leading-tight text-slate-500">
                    Cancel anytime (secure Paystack portal).
                  </span>
                ) : null}
              </div>
            </div>
          </PremiumCard>

          {planLabel !== "FREE" && withinGrace ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-amber-900">Grace period active</div>
                <div className="text-xs text-amber-800">
                  {graceCountdown != null ? (
                    <>
                      <span className="font-semibold">{graceCountdown}</span> day{graceCountdown === 1 ? "" : "s"}{" "}
                      remaining • Ends <span className="font-semibold">{fmtDate(graceUntil)}</span>
                    </>
                  ) : (
                    <>
                      Ends <span className="font-semibold">{fmtDate(graceUntil)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-2 text-sm text-amber-900/80">
                You still have paid access during grace. Update your payment method to avoid a downgrade.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={onManagePlan} disabled={manageLoading} className={BTN_SECONDARY}>
                  <span className={BTN_ICON_SECONDARY}>⚙</span>
                  {manageLoading ? "Opening..." : "Update payment method"}
                </button>
                <button onClick={onRefreshAll} className={BTN_SECONDARY}>
                  <span className={BTN_ICON_SECONDARY}>↻</span>
                  Refresh
                </button>
              </div>
            </div>
          ) : null}

          {entError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{entError}</div>
          ) : null}

          {upgradeError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{upgradeError}</div>
          ) : null}

          {manageError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{manageError}</div>
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Plan" value={planLabel} icon="★" />
            <KpiCard label="Status" value={heroStatusLabel} icon="✓" />
            <KpiCard label="Renews" value={planLabel === "FREE" ? "—" : fmtDate(renewsAt)} icon="⏱" />
            <KpiCard label="Price" value={kpiPrice} icon="R" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <PremiumCard className="lg:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Plan details</h3>
                  <p className="mt-1 text-sm text-slate-600">Subscription status and what’s included.</p>
                </div>

                <Chip tone={heroTone === "success" ? "success" : heroTone === "brand" ? "brand" : "neutral"}>
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${heroDot}`} />
                  {heroStatusLabel}
                </Chip>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DetailTile label="Plan" value={planLabel} />
                <DetailTile label="Price" value={planLabel === "FREE" ? "—" : priceLabelForPaid} />
                <DetailTile label="Renews" value={planLabel === "FREE" ? "—" : fmtDate(renewsAt)} />
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-700">
                  {planLabel === "FREE" ? (
                    <>
                      You’re on the <span className="font-semibold">FREE</span> plan. Paid plans increase your company
                      limit.
                    </>
                  ) : effectiveStatus === "read_only" ? (
                    <>
                      Your account is <span className="font-semibold">read-only</span>. Resolve billing to restore full
                      access.
                    </>
                  ) : (
                    <>
                      Your subscription is{" "}
                      <span className="font-semibold">{heroStatusLabel.toLowerCase()}</span>. Manage it securely via{" "}
                      <span className="font-semibold">Paystack</span>.
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Paystack handles checkout & tokenization. We store subscription status only.
                </p>
              </div>

              <div className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Plan comparison</p>
                    <p className="mt-1 text-xs text-slate-500">
                      The only difference is the number of companies you can create.
                    </p>
                  </div>
                  <Chip tone="neutral">Companies</Chip>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <PlanCard
                    title="FREE"
                    price="R0"
                    active={planLabel === "FREE"}
                    items={[
                      { ok: true, label: "Desktop app access" },
                      { ok: true, label: `Companies: 1` },
                      { ok: true, label: `Invoices up to ${limits.invoice}` },
                      { ok: true, label: `Quotes up to ${limits.quote}` },
                      { ok: true, label: `Purchase orders up to ${limits.purchase_order}` },
                    ]}
                  />
                  <PlanCard
                    title="STARTER"
                    price={
                      cycle === "annual"
                        ? `${moneyZar(PRICE_TABLE.starter.annual)}/yr`
                        : `${moneyZar(PRICE_TABLE.starter.monthly)}/mo`
                    }
                    active={planLabel === "STARTER" && !featureReadOnly}
                    highlight={selectedTier === "starter" && planLabel === "FREE"}
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
                    highlight={selectedTier === "growth" && planLabel === "FREE"}
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
                    highlight={selectedTier === "pro" && planLabel === "FREE"}
                    items={[
                      { ok: true, label: "Desktop app access" },
                      { ok: true, label: "Unlimited documents" },
                      { ok: true, label: `Companies: ${PRICE_TABLE.pro.companies}` },
                      { ok: true, label: "Priority support" },
                    ]}
                  />
                </div>

                {planLabel === "FREE" ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Tip: Choose <span className="font-bold">Annual</span> for best value on any paid plan.
                  </div>
                ) : null}
              </div>

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
                  <button onClick={onManualVerify} disabled={verifyLoading} className={BTN_SECONDARY}>
                    {verifyLoading ? "Verifying…" : "Verify"}
                  </button>
                </div>

                {manualErr ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {manualErr}
                  </div>
                ) : null}
              </div>

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
              <PremiumCard tone="soft">
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
                      {planLabel === "FREE" ? "No payment method saved" : "Stored on Paystack"}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {planLabel === "FREE" ? "Not required" : "Protected"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">For security, we don’t store card details in the portal.</p>
                </div>

                <button
                  onClick={planLabel === "FREE" ? undefined : onManagePlan}
                  disabled={planLabel === "FREE" || manageLoading}
                  className={`${BTN_SECONDARY} mt-6 w-full ${planLabel === "FREE" ? "cursor-not-allowed opacity-60" : ""}`}
                  title={planLabel === "FREE" ? "Subscribe first" : "Manage subscription on Paystack"}
                >
                  {planLabel === "FREE"
                    ? "Update payment method"
                    : manageLoading
                    ? "Opening..."
                    : "Manage payment method"}
                </button>
              </PremiumCard>

              <PremiumCard tone="soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Entitlement snapshot</h3>
                    <p className="mt-1 text-sm text-slate-600">This is what the desktop app will consume.</p>
                  </div>
                  <CopyButton text={safeJson(entitlementSnapshot)} />
                </div>

                <pre className="mt-4 max-h-[260px] overflow-auto rounded-2xl bg-slate-900 p-4 text-[12px] text-slate-100 ring-1 ring-slate-800">
                  {safeJson(entitlementSnapshot)}
                </pre>

                <div className="mt-3 text-[11px] text-slate-500">
                  Effective status: <span className="font-semibold text-slate-700">{heroStatusLabel}</span>
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
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
          ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
        }`}
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
  highlight,
}: {
  title: string;
  price: string;
  items: { ok: boolean; label: string }[];
  active?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border bg-white p-4",
        highlight ? "border-[color:var(--primary)]/30 ring-1 ring-[color:var(--primary)]/15" : "border-slate-200",
      ].join(" ")}
    >
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
        <div className="h-5 w-52 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-3 h-4 w-80 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
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