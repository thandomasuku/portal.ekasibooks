"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { PremiumCard, KpiCard, DetailTile, Chip } from "@/components/portal/ui";

type LoadState = "loading" | "ready" | "unauth" | "error";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

export default function DashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  }, [sp]);

  const [user, setUser] = useState<any>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState("loading");
      setError(null);

      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;

        if (!res.ok) {
          setUser(null);
          setState("unauth");
          return;
        }

        const data = await res.json().catch(() => null);
        if (cancelled) return;

        setUser(data);
        setState("ready");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Network error while checking session.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle =
    state === "ready"
      ? "Manage your account, subscription and downloads."
      : state === "unauth"
      ? "Your session has expired."
      : state === "error"
      ? "We couldn’t confirm your session."
      : "Preparing your workspace...";

  const planName = state === "ready" ? String(user?.plan ?? "FREE") : "FREE";
  const planUpper = String(planName).toUpperCase();
  const portalStatus = planUpper === "FREE" ? "Limited" : "Active";

  const name =
    user?.email && typeof user.email === "string"
      ? String(user.email).split("@")[0]
      : null;

  return (
    <PortalShell
      badge="Secure portal"
      title="Account Overview"
      subtitle={subtitle}
      backHref="/"
      backLabel="Home"
      userEmail={state === "ready" ? (user?.email ?? null) : null}
      planName={planName}
      tipText="Tip: This portal manages access and billing — your invoices live inside the desktop app."
      footerRight={
        <span className="inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
          Portal v1
        </span>
      }
      headerRight={
        state === "ready" ? (
          <button
            onClick={() => router.push("/billing")}
            className="rounded-xl bg-[#215D63] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-[#1c4f54]"
          >
            Manage billing
          </button>
        ) : null
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
          onPrimary={() => router.refresh()}
          secondaryLabel="Go to login"
          onSecondary={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)}
        />
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          <PremiumCard tone="brand">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <Chip>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Portal status: {portalStatus}
                </Chip>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Welcome back{name ? `, ${name}` : ""}.
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Manage billing, downloads and account security — everything in one place.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => router.push("/downloads")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-800"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/10">
                    ⇩
                  </span>
                  Get desktop app
                </button>

                <button
                  onClick={() => router.push("/settings")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-slate-900/5 ring-1 ring-slate-200">
                    ⚙
                  </span>
                  Security settings
                </button>
              </div>
            </div>
          </PremiumCard>

          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Plan" value={String(user?.plan ?? "—")} icon="★" />
            <KpiCard label="Email" value={String(user?.email ?? "—")} icon="✉" />
            <KpiCard label="Created" value={fmtDate(user?.createdAt)} icon="⏱" />
            <KpiCard label="Last login" value={fmtDate(user?.lastLoginAt)} icon="✓" />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <PremiumCard className="xl:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Account details</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Your portal identity and access level.
                  </p>
                </div>

                <Chip tone="success">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Secure
                </Chip>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailTile label="Email" value={user?.email ?? "—"} />
                <DetailTile label="Plan" value={String(user?.plan ?? "—")} />
                <DetailTile label="Created" value={fmtDate(user?.createdAt)} />
                <DetailTile label="Last login" value={fmtDate(user?.lastLoginAt)} />
              </div>

              <div className="mt-6 rounded-2xl bg-gradient-to-br from-[#0b2a3a]/5 via-[#0e3a4f]/5 to-[#215D63]/10 p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-800">
                  <span className="font-semibold">Access:</span>{" "}
                  {String(user?.plan ?? "").toUpperCase() === "FREE"
                    ? "You’re on the FREE plan — upgrade anytime to unlock full features."
                    : "You have an active subscription — full access enabled."}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  This portal manages your subscription and account. The accounting work happens in the desktop app.
                </p>
              </div>
            </PremiumCard>

            <PremiumCard>
              <h3 className="text-lg font-semibold text-slate-900">Quick actions</h3>
              <p className="mt-1 text-sm text-slate-600">Get to what you need fast.</p>

              <div className="mt-5 space-y-3">
                <ActionRow
                  title="Download eKasiBooks Desktop"
                  subtitle="Windows installer & updates"
                  icon="⇩"
                  tone="brand"
                  onClick={() => router.push("/downloads")}
                />
                <ActionRow
                  title="Billing & invoices"
                  subtitle="Subscription, payments, receipts"
                  icon="⟠"
                  tone="primary"
                  onClick={() => router.push("/billing")}
                />
                <ActionRow
                  title="Profile & security"
                  subtitle="Password, OTP and settings"
                  icon="⚙"
                  tone="neutral"
                  onClick={() => router.push("/settings")}
                />
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-700">
                  Next: we can add a Support page (tickets + FAQ) and wire it into the footer.
                </p>
              </div>
            </PremiumCard>
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
      ? "bg-[#215D63] text-white hover:bg-[#1c4f54]"
      : "bg-white text-slate-900 hover:bg-slate-50";

  const ringClass = tone === "neutral" ? "ring-1 ring-slate-200 shadow-sm" : "shadow-sm";

  const iconChip =
    tone === "neutral"
      ? "bg-slate-900/5 ring-1 ring-slate-200 text-slate-700"
      : "bg-white/15 ring-1 ring-white/20 text-white";

  return (
    <button
      onClick={onClick}
      className={[
        "w-full rounded-2xl px-4 py-3 text-left transition hover:-translate-y-[1px]",
        toneClass,
        ringClass,
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div className={["grid h-10 w-10 place-items-center rounded-2xl", iconChip].join(" ")}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className={tone === "neutral" ? "text-xs text-slate-600" : "text-xs text-white/80"}>
            {subtitle}
          </div>
        </div>
        <div className={tone === "neutral" ? "ml-auto text-slate-400" : "ml-auto text-white/80"}>
          →
        </div>
      </div>
    </button>
  );
}

function DashboardSkeleton() {
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="h-5 w-44 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-72 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="h-5 w-40 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-56 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-6 space-y-3">
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
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
