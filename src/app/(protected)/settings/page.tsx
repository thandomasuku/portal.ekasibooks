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
  features: { readOnly: boolean; limits: any };
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function normalizePlan(plan?: string | null) {
  return String(plan ?? "FREE").toUpperCase();
}

export default function SettingsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/settings";
  }, [sp]);

  const [user, setUser] = useState<any>(null); // { authenticated, user: { id,email,... } } OR { id,email } depending on your API
  const [ent, setEnt] = useState<Entitlement | null>(null);

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setState("loading");
    setError(null);

    try {
      // 1) Auth identity (email/id)
      const meRes = await fetch("/api/auth/me", { credentials: "include" });
      if (meRes.status === 401 || meRes.status === 403) {
        setUser(null);
        setEnt(null);
        setState("unauth");
        return;
      }
      if (!meRes.ok) {
        setUser(null);
        setEnt(null);
        setState("error");
        setError(`Failed to load profile (${meRes.status}).`);
        return;
      }

      const meJson = await meRes.json().catch(() => null);
      if (!meJson) {
        setState("error");
        setError("Profile returned an invalid response.");
        return;
      }

      // your /api/auth/me currently returns { authenticated, user: {...} }
      const meUser = meJson?.user ?? meJson;
      setUser(meUser);

      // 2) Entitlement (plan) — best-effort (don’t block settings if it fails)
      try {
        const entRes = await fetch("/api/entitlement", { credentials: "include" });

        // If entitlement says unauth, treat as unauth
        if (entRes.status === 401 || entRes.status === 403) {
          setUser(null);
          setEnt(null);
          setState("unauth");
          return;
        }

        if (entRes.ok) {
          const entJson = await entRes.json().catch(() => null);
          if (entJson) setEnt(entJson);
        }
      } catch {
        // ignore (settings can still render)
      }

      setState("ready");
    } catch (e: any) {
      setError(e?.message || "Network error while checking session.");
      setState("error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadAll();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planName = normalizePlan(ent?.plan);
  const userEmail = String(user?.email ?? "—");
  const userId = String(user?.id ?? "—");

  const subtitle =
    state === "ready"
      ? "Manage your personal details and security settings."
      : state === "unauth"
      ? "Your session has expired."
      : state === "error"
      ? "We couldn’t confirm your session."
      : "Loading account details...";

  // Password plan (UX messaging only for now)
  const passwordMode = "OTP sign-in (current)";
  const passwordNote =
    "You’re currently using OTP sign-in. In a future update, you’ll be able to set a password (optional) and manage sessions.";

  return (
    <PortalShell
      badge="Settings"
      title="Profile & Security"
      subtitle={subtitle}
      userEmail={user?.email ?? null}
      planName={planName}
      tipText="Tip: OTP is a secure way to sign in — password & sessions management will be added next."
      headerRight={
        <button
          onClick={() => loadAll()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
        >
          Refresh
        </button>
      }
      footerRight={
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-slate-500">Security & profile</span>
          <Chip>Settings</Chip>
        </div>
      }
    >
      {state === "loading" ? (
        <SettingsSkeleton />
      ) : state === "unauth" ? (
        <EmptyState
          title="Please log in to continue"
          body="Your session isn’t active. Log in again to manage your settings."
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
          onPrimary={() => loadAll()}
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
                  Account security: Protected
                </Chip>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">Keep your account safe.</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Review your profile info and security options — password & sessions will unlock as APIs are enabled.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  disabled
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white opacity-60"
                  title="Coming soon"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/10">✓</span>
                  Enable MFA (soon)
                </button>

                <button
                  onClick={() => router.push("/billing")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#215D63] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-[#1c4f54]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/15">⟠</span>
                  View plan
                </button>
              </div>
            </div>
          </PremiumCard>

          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Email" value={userEmail} icon="✉" />
            <KpiCard label="Plan" value={planName} icon="★" />
            <KpiCard label="Account ID" value={userId} icon="ID" />
            <KpiCard label="Last login" value={fmtDate(user?.lastLoginAt)} icon="✓" />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Profile */}
            <PremiumCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Profile details</h2>
                  <p className="mt-1 text-sm text-slate-600">Your basic account information.</p>
                </div>

                <Chip tone="success">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Verified
                </Chip>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4">
                <DetailTile label="Email" value={userEmail} />
                <DetailTile label="Plan" value={planName} />
                <DetailTile label="Account ID" value={userId} />
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-700">Profile editing will be enabled once the API supports updates.</p>
                <p className="mt-1 text-xs text-slate-500">For now, contact support if you need to change your email.</p>
              </div>

              <button
                disabled
                className="mt-6 w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-900 opacity-60"
                title="Coming soon"
              >
                Edit profile (soon)
              </button>
            </PremiumCard>

            {/* Security */}
            <PremiumCard>
              <h2 className="text-lg font-semibold text-slate-900">Security</h2>
              <p className="mt-1 text-sm text-slate-600">Password, sessions, and access controls.</p>

              <div className="mt-6 space-y-3">
                <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-800">
                    <span className="font-semibold">Sign-in method:</span> {passwordMode}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{passwordNote}</p>
                </div>

                <ActionRow
                  title="Password"
                  subtitle="Set / change your account password (coming soon)"
                  icon="🔒"
                  tone="neutral"
                  disabled
                  onClick={() => {}}
                />
                <ActionRow
                  title="Active sessions"
                  subtitle="View and manage logged-in devices (coming soon)"
                  icon="💻"
                  tone="neutral"
                  disabled
                  onClick={() => {}}
                />

                <div className="rounded-2xl bg-gradient-to-br from-[#0b2a3a]/5 via-[#0e3a4f]/5 to-[#215D63]/10 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-800">
                    <span className="font-semibold">Sessions policy:</span> Max 2 active sessions allowed per account.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    When session management is enabled, you’ll be able to sign out other devices here.
                  </p>
                </div>
              </div>

              <button
                disabled
                className="mt-6 w-full rounded-2xl bg-slate-900 py-2.5 text-sm font-semibold text-white opacity-60"
                title="Coming soon"
              >
                Change password (soon)
              </button>
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
  disabled,
}: {
  title: string;
  subtitle: string;
  icon: string;
  tone: "primary" | "brand" | "neutral";
  onClick: () => void;
  disabled?: boolean;
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
      disabled={disabled}
      className={[
        "w-full rounded-2xl px-4 py-3 text-left transition",
        "hover:-translate-y-[1px]",
        toneClass,
        ringClass,
        disabled ? "opacity-60 cursor-not-allowed hover:translate-y-0" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div className={["grid h-10 w-10 place-items-center rounded-2xl", iconChip].join(" ")}>{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className={tone === "neutral" ? "text-xs text-slate-600" : "text-xs text-white/80"}>{subtitle}</div>
        </div>
        <div className={tone === "neutral" ? "ml-auto text-slate-400" : "ml-auto text-white/80"}>→</div>
      </div>
    </button>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="h-5 w-48 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-3 h-4 w-80 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="h-5 w-40 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-64 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-6 space-y-3">
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
          <div className="mt-6 h-20 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="mt-6 h-11 rounded-2xl bg-slate-200 animate-pulse" />
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="h-5 w-32 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-56 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-6 space-y-3">
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-24 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
          <div className="mt-6 h-11 rounded-2xl bg-slate-200 animate-pulse" />
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
