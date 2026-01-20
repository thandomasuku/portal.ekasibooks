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
  const [user, setUser] = useState<any>(null); // best-effort for sidebar email display

  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  // UI display price (Paystack is source of truth)
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

    // Correct handling: only treat 401/403 as unauth.
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
      setUser(data);
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

      try {
        await loadEntitlement();
        if (cancelled) return;

        // best-effort fetch for sidebar email (doesn't gate the page)
        void loadUserNonBlocking();

        // If Paystack redirected back here, verify the reference immediately.
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

  const heroStatusLabel = statusLabel(status);
  const heroTone = statusTone(status);

  return (
    <PortalShell
      badge="Billing"
      title="Subscription & Billing"
      subtitle={subtitle}
      backHref="/dashboard"
      backLabel="Back to overview"
      userEmail={user?.email ?? null}
      planName={planName}
      tipText="Tip: Billing is handled by Paystack — the portal never stores your card details."
      headerRight={
        <button
          onClick={() => loadEntitlement()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
        >
          Refresh
        </button>
      }
      footerRight={
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-slate-500">Payments powered by Paystack</span>
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
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Status: {heroStatusLabel}
                </Chip>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">Your plan: {planName}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Upgrade anytime. Billing is secure and handled by Paystack.
                </p>

                {planName !== "FREE" && graceUntil ? (
                  <div className="mt-3 text-xs text-slate-500">
                    Grace period until <span className="font-semibold text-slate-700">{fmtDate(graceUntil)}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {planName === "FREE" ? (
                  <button
                    onClick={onUpgrade}
                    disabled={upgradeLoading}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-2xl bg-[#215D63] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                      "hover:-translate-y-[1px] hover:bg-[#1c4f54]",
                      upgradeLoading ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/15">⟠</span>
                    {upgradeLoading ? "Redirecting..." : `Upgrade to Pro (${moneyZar(price)}/mo)`}
                  </button>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#215D63] px-4 py-2.5 text-sm font-semibold text-white opacity-60"
                    title="Manage coming next"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/15">⟠</span>
                    Manage plan (soon)
                  </button>
                )}

                <button
                  onClick={() => loadEntitlement()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-slate-900/5 ring-1 ring-slate-200">
                    ↻
                  </span>
                  Refresh status
                </button>
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
                        Your subscription is <span className="font-semibold">active</span>. Manage or cancel anytime.
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Billing is powered by Paystack.</p>
                </div>

                {planName === "FREE" ? (
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <p className="text-sm font-semibold text-slate-900">Free tier limits</p>
                    <p className="mt-1 text-xs text-slate-500">
                      After you hit the limits, the desktop app becomes read-only until you subscribe.
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <MiniStat label="Invoices" value={`${limits.invoice}`} />
                      <MiniStat label="Quotes" value={`${limits.quote}`} />
                      <MiniStat label="Purchase Orders" value={`${limits.purchase_order}`} />
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="text-sm font-semibold text-slate-900">
                    {planName === "FREE" ? "Free plan includes:" : "Your plan includes:"}
                  </p>

                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    <Feature ok label="Desktop app access" />
                    <Feature ok label="Invoice creation" />
                    <Feature ok label="Customer management" />
                    <Feature ok={planName !== "FREE"} label="Unlimited invoices" />
                    <Feature ok={planName !== "FREE"} label="Branded invoices (logo & footer)" />
                    <Feature ok={planName !== "FREE"} label="Priority support" />
                  </ul>
                </div>
              </div>

              {upgradeError ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {upgradeError}
                </div>
              ) : null}

              {verifyLoading ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Verifying payment…
                </div>
              ) : verifyNote ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {verifyNote}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {planName === "FREE" ? (
                  <button
                    onClick={onUpgrade}
                    disabled={upgradeLoading}
                    className={[
                      "rounded-2xl bg-[#215D63] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition",
                      "hover:-translate-y-[1px] hover:bg-[#1c4f54]",
                      upgradeLoading ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    {upgradeLoading ? "Redirecting..." : `Upgrade to Pro (${moneyZar(price)}/mo)`}
                  </button>
                ) : (
                  <button
                    disabled
                    className="rounded-2xl bg-[#215D63] px-4 py-2.5 text-sm font-semibold text-white opacity-60"
                    title="Manage coming next"
                  >
                    Manage plan (soon)
                  </button>
                )}

                <button
                  onClick={() => loadEntitlement()}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
                >
                  Refresh status
                </button>

                <button
                  disabled
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 opacity-60"
                  title="Coming next"
                >
                  Download receipt (soon)
                </button>
              </div>
            </PremiumCard>

            {/* RIGHT (premium upgrade) */}
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
                  <p className="mt-1 text-xs text-slate-600">
                    For security, we don’t store card details in the portal.
                  </p>
                </div>

                <button
                  disabled
                  className="mt-6 w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-900 opacity-60"
                  title="Coming next"
                >
                  Update payment method (soon)
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
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {planName === "FREE" ? "—" : fmtDate(renewsAt)}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <MiniStat label="Plan" value={planName} />
                    <MiniStat label="Monthly price" value={planName === "FREE" ? "—" : `${moneyZar(price)}/mo`} />
                  </div>
                </div>

                <button
                  disabled
                  className="mt-6 w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-900 opacity-60"
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
                  <p className="mt-1 text-xs text-slate-500">
                    Once webhooks are live, we’ll show invoices and receipts here.
                  </p>
                </div>

                <button
                  disabled
                  className="mt-6 w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-900 opacity-60"
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
      <div className="text-sm font-semibold text-slate-900 break-all">{value}</div>
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

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="h-5 w-52 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-3 h-4 w-80 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="h-5 w-44 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-72 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
          <div className="mt-6 h-28 rounded-2xl bg-slate-200 animate-pulse" />
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
            <div className="h-5 w-44 rounded-lg bg-slate-200 animate-pulse" />
            <div className="mt-3 h-4 w-56 rounded-lg bg-slate-200 animate-pulse" />
            <div className="mt-6 h-24 rounded-2xl bg-slate-200 animate-pulse" />
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
            <div className="h-5 w-44 rounded-lg bg-slate-200 animate-pulse" />
            <div className="mt-3 h-4 w-56 rounded-lg bg-slate-200 animate-pulse" />
            <div className="mt-6 h-24 rounded-2xl bg-slate-200 animate-pulse" />
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

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onPrimary}
          className="rounded-xl bg-[#215D63] px-4 py-2 font-semibold text-white shadow-sm hover:bg-[#1c4f54]"
        >
          {primaryLabel}
        </button>
        <button
          onClick={onSecondary}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
