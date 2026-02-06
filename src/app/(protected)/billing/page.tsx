"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { PremiumCard, KpiCard, DetailTile, Chip } from "@/components/portal/ui";

type LoadState = "loading" | "ready" | "unauth" | "error";

type Entitlement = {
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

/* ---------------- UI primitives (compact + aligned) ---------------- */

const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#215D63] px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-[#1c4f54] disabled:opacity-70 disabled:hover:translate-y-0";

const BTN_SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50 disabled:opacity-70 disabled:hover:translate-y-0";

const BTN_ICON_PRIMARY = "grid h-7 w-7 place-items-center rounded-lg bg-white/15";
const BTN_ICON_SECONDARY =
  "grid h-7 w-7 place-items-center rounded-lg bg-slate-900/5 ring-1 ring-slate-200";

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
  return "Unknown";
}

function statusTone(status: string): "success" | "brand" | "neutral" {
  const s = normalizeStatus(status);
  if (s === "active") return "success";
  if (s === "trial" || s === "trialing") return "brand";
  return "neutral";
}

function statusDotClass(status: string) {
  const s = normalizeStatus(status);
  if (s === "active") return "bg-emerald-500";
  if (s === "trial" || s === "trialing") return "bg-sky-500";
  if (s === "past_due") return "bg-amber-500";
  if (s === "canceled" || s === "cancelled") return "bg-slate-400";
  if (s === "free") return "bg-slate-400";
  return "bg-slate-400";
}

export default function BillingPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/billing";
  }, [sp]);

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [user, setUser] = useState<any>(null);

  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  const [manualRef, setManualRef] = useState("");
  const [manualErr, setManualErr] = useState<string | null>(null);

  // ✅ manage plan states
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  // UI-only display price (Paystack remains source of truth)
  const price = 199;

  async function loadEntitlement() {
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/entitlement", { credentials: "include" });
    } catch (e: any) {
      setEnt(null);
      setError(e?.message || "Network error while loading billing details.");
      setState("error");
      return;
    }

    if (res.status === 401 || res.status === 403) {
      setEnt(null);
      setState("unauth");
      return;
    }

    if (!res.ok) {
      const msg = `Billing details failed (${res.status}).`;
      setEnt(null);
      setError(msg);
      setState("error");
      return;
    }

    const data = (await res.json().catch(() => null)) as Entitlement | null;
    if (!data) {
      setEnt(null);
      setError("Billing details returned an invalid response.");
      setState("error");
      return;
    }

    setEnt(data);
    setState("ready");
  }

  async function loadUserNonBlocking() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return;

      const data = await res.json().catch(() => null);
      if (!data) return;

      // ✅ unwrap nested user
      setUser(data.user ?? data);
    } catch {
      // ignore
    }
  }

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

      await loadEntitlement();
    } catch (e: any) {
      setVerifyNote(e?.message || "Failed to verify payment.");
    } finally {
      setVerifyLoading(false);
      setUpgradeLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState("loading");
      setError(null);
      setUpgradeError(null);
      setVerifyNote(null);
      setManualErr(null);
      setManageError(null);

      try {
        await loadEntitlement();
        if (cancelled) return;

        void loadUserNonBlocking();

        const ref = sp.get("reference") || sp.get("trxref") || "";
        if (ref) {
          void verifyReference(ref);
        } else if (sp.get("paid") === "1") {
          setVerifyNote("Payment detected. If your plan doesn’t update in a moment, click Refresh.");
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Network error while checking session.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const planName = String(ent?.plan ?? "FREE").toUpperCase();
  const isPaid = planName !== "FREE";

  const status = isPaid ? normalizeStatus(ent?.status ?? "active") : "free";
  const renewsAt = ent?.currentPeriodEnd ?? null;
  const graceUntil = ent?.graceUntil ?? null;

  const limits = ent?.features?.limits ?? {
    invoice: 5,
    quote: 5,
    purchase_order: 5,
  };

  const subtitle =
    state === "ready"
      ? "Manage your plan, payments, and subscription status."
      : state === "unauth"
      ? "Your session has expired — please log in again."
      : state === "error"
      ? "We couldn’t load billing details right now."
      : "Preparing billing...";

  async function onUpgrade() {
    if (upgradeLoading) return;

    setUpgradeError(null);
    setUpgradeLoading(true);

    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        credentials: "include",
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

  // ✅ manage plan => redirect to Paystack hosted subscription management page
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

  const heroStatusLabel = statusLabel(status);
  const heroTone = statusTone(status);
  const heroDot = statusDotClass(status);

  return (
    <PortalShell
      badge="Billing"
      title="Subscription & Billing"
      subtitle={subtitle}
      backHref="/dashboard"
      backLabel="Back to overview"
      userEmail={user?.email ?? null}
      planName={planName}
      // Removed tipText to match "no Quick tips" direction
      headerRight={
        <button onClick={() => loadEntitlement()} className={BTN_SECONDARY}>
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
          body={error ?? "Something went wrong. Please try again."}
          primaryLabel="Retry"
          onPrimary={() => loadEntitlement()}
          secondaryLabel="Go to login"
          onSecondary={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)}
        />
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          <PremiumCard tone="brand">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <Chip tone={heroTone === "success" ? "success" : heroTone === "brand" ? "brand" : "neutral"}>
                  <span className={`h-2 w-2 rounded-full ${heroDot}`} />
                  Status: {heroStatusLabel}
                </Chip>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">Your plan: {planName}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Upgrade anytime. Billing is secure and handled by Paystack.
                  {planName !== "FREE" ? (
                    <>
                      {" "}
                      <span className="font-semibold text-slate-700">Cancel anytime</span> via{" "}
                      <span className="font-semibold text-slate-700">Manage plan</span>.
                    </>
                  ) : null}
                </p>

                {planName !== "FREE" ? (
                  <p className="mt-2 text-xs text-slate-500">
                    You’re always in control — manage billing, update your card, or cancel securely on Paystack.
                  </p>
                ) : null}

                {planName !== "FREE" && graceUntil ? (
                  <div className="mt-3 text-xs text-slate-500">
                    Grace period until <span className="font-semibold text-slate-700">{fmtDate(graceUntil)}</span>
                  </div>
                ) : null}
              </div>

            {/* Actions (aligned + compact) */}
<div className="flex w-full flex-col items-end gap-1 md:w-auto">
  {/* Buttons row */}
  <div className="flex flex-wrap items-center justify-end gap-2">
    {planName === "FREE" ? (
      <button onClick={onUpgrade} disabled={upgradeLoading} className={BTN_PRIMARY}>
        <span className={BTN_ICON_PRIMARY}>⟠</span>
        {upgradeLoading ? "Redirecting..." : `Upgrade to Pro (${moneyZar(price)}/mo)`}
      </button>
    ) : (
      <button
        onClick={onManagePlan}
        disabled={manageLoading}
        className={BTN_PRIMARY}
        title="Manage subscription on Paystack"
      >
        <span className={BTN_ICON_PRIMARY}>⚙</span>
        {manageLoading ? "Opening..." : "Manage plan"}
      </button>
    )}

    <button onClick={() => loadEntitlement()} className={BTN_SECONDARY}>
      <span className={BTN_ICON_SECONDARY}>↻</span>
      Refresh status
    </button>
  </div>

  {/* Caption under the row (only for paid plans) */}
  {planName !== "FREE" ? (
    <span className="text-[11px] leading-tight text-slate-500">
  Cancel anytime (secure Paystack portal).
</span>

  ) : null}
</div>

            </div>
          </PremiumCard>

          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Plan" value={planName} icon="★" />
            <KpiCard label="Status" value={heroStatusLabel} icon="✓" />
            <KpiCard label="Renews" value={planName === "FREE" ? "—" : fmtDate(renewsAt)} icon="⏱" />
            <KpiCard label="Price" value={planName === "FREE" ? "—" : `${moneyZar(price)}/mo`} icon="R" />
          </div>

          {/* Notices */}
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

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* LEFT */}
            <PremiumCard className="lg:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Current plan</h3>
                  <p className="mt-1 text-sm text-slate-600">Your subscription details and included features.</p>
                </div>

                <Chip tone={heroTone === "success" ? "success" : heroTone === "brand" ? "brand" : "neutral"}>
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${heroDot}`} />
                  {heroStatusLabel}
                </Chip>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DetailTile label="Plan" value={planName} />
                <DetailTile label="Price" value={planName === "FREE" ? "—" : `${moneyZar(price)}/mo`} />
                <DetailTile label="Renews" value={planName === "FREE" ? "—" : fmtDate(renewsAt)} />
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-700">
                    {planName === "FREE" ? (
                      <>
                        You’re on the <span className="font-semibold">FREE</span> plan. Upgrade to unlock full access.
                      </>
                    ) : (
                      <>
                        Your subscription is <span className="font-semibold">{heroStatusLabel.toLowerCase()}</span>. You
                        can update your payment method or cancel via <span className="font-semibold">Manage plan</span>.
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Paystack handles checkout & tokenization. We only store subscription status.
                  </p>
                </div>

                {/* Plan comparison */}
                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Plan comparison</p>
                      <p className="mt-1 text-xs text-slate-500">Quick view of what Pro unlocks.</p>
                    </div>
                    <Chip tone="neutral">Free vs Pro</Chip>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <PlanCard
                      title="FREE"
                      price="R0"
                      active={planName === "FREE"}
                      items={[
                        { ok: true, label: "Desktop app access" },
                        { ok: true, label: "Customer management" },
                        { ok: true, label: `Invoices up to ${limits.invoice}` },
                        { ok: true, label: `Quotes up to ${limits.quote}` },
                        { ok: true, label: `Purchase orders up to ${limits.purchase_order}` },
                        { ok: false, label: "Unlimited invoices & quotes" },
                        { ok: false, label: "Branded invoices (logo & footer)" },
                        { ok: false, label: "Priority support" },
                      ]}
                    />
                    <PlanCard
                      title="PRO"
                      price={`${moneyZar(price)}/mo`}
                      active={planName !== "FREE"}
                      highlight
                      items={[
                        { ok: true, label: "Desktop app access" },
                        { ok: true, label: "Unlimited invoices & quotes" },
                        { ok: true, label: "Branded invoices (logo & footer)" },
                        { ok: true, label: "Priority support" },
                        { ok: true, label: "Future: team access & roles" },
                        { ok: true, label: "Future: statements & automation" },
                      ]}
                    />
                  </div>

                 
                </div>

                {/* Paystack flow clarity */}
                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-sm font-semibold text-slate-900">How payment works</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StepTile n="1" title="Checkout on Paystack" body="We redirect you to Paystack’s secure payment page." />
                    <StepTile n="2" title="Redirect back here" body="Paystack returns you to Billing with a reference." />
                    <StepTile n="3" title="We verify + unlock Pro" body="We verify the reference, then update your plan." />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    If verification is delayed (rare), paste the reference below to verify manually.
                  </p>
                </div>

                {/* Manual verify */}
                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Verify payment</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Paste a Paystack reference / trxref to confirm your payment.
                      </p>
                    </div>
                    <Chip tone="neutral">Manual</Chip>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      placeholder="e.g. 9t5k9m9d0x / trxref"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none ring-0 placeholder:text-slate-400 focus:border-slate-300"
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

                {/* FAQ */}
                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-sm font-semibold text-slate-900">FAQ</p>
                  <div className="mt-3 space-y-3">
                    <Faq
                      q="Do you store my card details?"
                      a="No. Paystack stores and secures payment methods. eKasiBooks only stores your subscription status."
                    />
                    <Faq
                      q="My plan didn’t update after payment — what now?"
                      a="Click Refresh. If it still doesn’t update, paste the Paystack reference in Verify payment above."
                    />
                    <Faq
                      q="Can I cancel?"
                      a="Yes. Click “Manage plan” — you can cancel anytime from the secure Paystack billing portal."
                    />
                  </div>
                </div>
              </div>
            </PremiumCard>

            {/* RIGHT */}
            <div className="space-y-6">
              <PremiumCard tone="soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Payment</h3>
                    <p className="mt-1 text-sm text-slate-600">Handled securely by Paystack.</p>
                  </div>
                  <Chip tone="success">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Secure
                  </Chip>
                </div>

                <div className="mt-5 rounded-2xl bg-gradient-to-br from-[#0b2a3a]/5 via-[#0e3a4f]/5 to-[#215D63]/10 p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {planName === "FREE" ? "No payment method saved" : "Stored on Paystack"}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      {planName === "FREE" ? "Not required" : "Protected"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">For security, we don’t store card details in the portal.</p>
                  {planName !== "FREE" ? (
                    <p className="mt-2 text-xs text-slate-600">
                      You can update your card or <span className="font-semibold">cancel anytime</span> via Paystack.
                    </p>
                  ) : null}
                </div>

                <button
                  onClick={planName === "FREE" ? undefined : onManagePlan}
                  disabled={planName === "FREE" || manageLoading}
                  className={`${BTN_SECONDARY} mt-6 w-full ${planName === "FREE" ? "cursor-not-allowed opacity-60" : ""}`}
                  title={planName === "FREE" ? "Upgrade to Pro first" : "Manage subscription on Paystack"}
                >
                  {planName === "FREE" ? "Update payment method" : manageLoading ? "Opening..." : "Manage payment method"}
                </button>
              </PremiumCard>

              <PremiumCard tone="soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Next renewal</h3>
                    <p className="mt-1 text-sm text-slate-600">Your upcoming billing date.</p>
                  </div>
                  <Chip tone="neutral">⏱</Chip>
                </div>

                <div className="mt-5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-medium text-slate-500">Renews on</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{planName === "FREE" ? "—" : fmtDate(renewsAt)}</div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <MiniStat label="Plan" value={planName} />
                    <MiniStat label="Monthly price" value={planName === "FREE" ? "—" : `${moneyZar(price)}/mo`} />
                  </div>
                </div>

                <button
                  disabled
                  className={`${BTN_SECONDARY} mt-6 w-full cursor-not-allowed opacity-60`}
                  title="Coming next"
                >
                  View invoices (soon)
                </button>
              </PremiumCard>

              <PremiumCard tone="soft">
                <h3 className="text-lg font-semibold text-slate-900">Receipts & history</h3>
                <p className="mt-1 text-sm text-slate-600">Invoices and receipts will appear here.</p>

                <div className="mt-5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-700">No records yet.</p>
                  <p className="mt-1 text-xs text-slate-500">Once webhooks are live, we’ll show invoices and receipts here.</p>
                </div>

                <button
                  disabled
                  className={`${BTN_SECONDARY} mt-6 w-full cursor-not-allowed opacity-60`}
                  title="Coming next"
                >
                  Download latest receipt (soon)
                </button>
              </PremiumCard>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

/* ---------------- Local helpers ---------------- */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="break-all text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

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
        highlight ? "border-[#215D63]/30 ring-1 ring-[#215D63]/20" : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{price}</div>
        </div>
        {active ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Current</span>
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

function StepTile({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-slate-900/5 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
          {n}
        </span>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
      </div>
      <p className="mt-2 text-xs text-slate-600">{body}</p>
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

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="h-5 w-52 animate-pulse rounded-lg bg-slate-200" />
        <div className="mt-3 h-4 w-80 animate-pulse rounded-lg bg-slate-200" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-20 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-20 animate-pulse rounded-3xl bg-slate-200" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 lg:col-span-2">
          <div className="h-5 w-44 animate-pulse rounded-lg bg-slate-200" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded-lg bg-slate-200" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="h-16 animate-pulse rounded-2xl bg-slate-200" />
            <div className="h-16 animate-pulse rounded-2xl bg-slate-200" />
            <div className="h-16 animate-pulse rounded-2xl bg-slate-200" />
          </div>
          <div className="mt-6 h-28 animate-pulse rounded-2xl bg-slate-200" />
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
            <div className="h-5 w-44 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-3 h-4 w-56 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-200" />
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
            <div className="h-5 w-44 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-3 h-4 w-56 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-200" />
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
    <div className="rounded-3xl bg-white p-8 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-slate-600">{body}</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button onClick={onPrimary} className={BTN_PRIMARY}>
          {primaryLabel}
        </button>
        <button onClick={onSecondary} className={BTN_SECONDARY}>
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
