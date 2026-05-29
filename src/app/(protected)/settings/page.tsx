"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PremiumCard,
  PortalButton,
  PortalInput,
  PortalAlert,
  PortalEmptyState,
  PortalSkeleton,
  cx,
} from "@/components/portal/ui";
import { useSession } from "@/components/portal/session";

type UserProfile = {
  id?: string | null;
  email?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
};

type Entitlement = {
  plan?: "FREE" | "STARTER" | "GROWTH" | "PRO" | string;
  status?: string;
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

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function normalizePlan(plan?: string | null) {
  return String(plan ?? "FREE").toUpperCase();
}

function cleanStr(v: any, max: number) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : "";
}

const SETTINGS_PILL_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-teal-200/35 bg-teal-50/90 px-4 py-2 text-sm font-black text-teal-900 shadow-sm ring-1 ring-white/20 transition hover:-translate-y-[1px] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed disabled:opacity-60";

const SETTINGS_DARK_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-white/15 bg-[#0b1220] px-4 py-2 text-sm font-black text-white shadow-[0_14px_30px_rgba(11,18,32,0.28)] transition hover:-translate-y-[1px] hover:bg-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed disabled:opacity-60";


function messageTone(
  type?: "success" | "error" | "info",
): "success" | "danger" | "info" {
  if (type === "success") return "success";
  if (type === "error") return "danger";
  return "info";
}

export default function SettingsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/settings";
  }, [sp]);

  // ✅ Session no longer provides entitlement
  const { state, user, error, refresh } = useSession();

  // ✅ Entitlement comes from /api/entitlement (single source of truth)
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [entLoading, setEntLoading] = useState(false);
  const [entError, setEntError] = useState<string | null>(null);

  const fetchEntitlement = useCallback(async () => {
    setEntLoading(true);
    setEntError(null);

    try {
      const res = await fetch(`/api/entitlement?ts=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (res.status === 401 || res.status === 403) {
        setEnt(null);
        return;
      }

      if (!res.ok) {
        throw new Error(
          data?.error || data?.message || `Entitlement failed (${res.status}).`,
        );
      }

      setEnt((data ?? null) as Entitlement);
    } catch (e: any) {
      setEnt(null);
      setEntError(e?.message || "Failed to load entitlement.");
    } finally {
      setEntLoading(false);
    }
  }, []);

  // load entitlement once session is ready
  useEffect(() => {
    if (state !== "ready") return;
    void fetchEntitlement();
  }, [state, fetchEntitlement]);

  // Treat session.user as a loosely typed profile object (UI-only typing fix)
  const sessionUser = (user as UserProfile | null) ?? null;

  // Local mirror for optimistic UI (profile edit modal)
  const [userLocal, setUserLocal] = useState<UserProfile | null>(null);

  // ---- Edit Profile Modal state ----
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [form, setForm] = useState<{
    fullName: string;
    companyName: string;
    phone: string;
  }>({
    fullName: "",
    companyName: "",
    phone: "",
  });

  // ---- Password Modal (OTP step-up) ----
  const [pwOpen, setPwOpen] = useState(false);
  const [pwStep, setPwStep] = useState<"request" | "verify">("request");
  const [pwSending, setPwSending] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [pwForm, setPwForm] = useState<{
    otpCode: string;
    newPassword: string;
    confirmPassword: string;
  }>({
    otpCode: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    setUserLocal(sessionUser);
    setForm({
      fullName: String(sessionUser?.fullName ?? ""),
      companyName: String(sessionUser?.companyName ?? ""),
      phone: String(sessionUser?.phone ?? ""),
    });
  }, [sessionUser]);

  const planName = normalizePlan(ent?.plan ?? "FREE");

  // Prefer optimistic local user, fallback to session user, then empty object
  const u: UserProfile = userLocal ?? sessionUser ?? {};

  const userEmail = String(u.email ?? "—");
  const userId = String(u.id ?? "—");


  const readOnly = !!ent?.features?.readOnly;

  const canEditProfile = state === "ready" && !readOnly;
  const canManageSecurity = state === "ready" && !readOnly;

  function openEdit() {
    setFormMsg(null);

    const uu: UserProfile = sessionUser ?? {};
    setForm({
      fullName: cleanStr(uu.fullName, 80),
      companyName: cleanStr(uu.companyName, 120),
      phone: cleanStr(uu.phone, 30),
    });

    setEditOpen(true);
  }

  async function saveProfile() {
    if (saving) return;
    setSaving(true);
    setFormMsg(null);

    try {
      const payload = {
        fullName: cleanStr(form.fullName, 80),
        companyName: cleanStr(form.companyName, 120),
        phone: cleanStr(form.phone, 30),
      };

      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error((data as any)?.error || "Failed to save profile");

      setFormMsg({ type: "success", text: "Profile saved." });

      // Optimistic UI update (instant refresh)
      setUserLocal((prev) => {
        const base: UserProfile = prev ?? {};
        return { ...base, ...payload };
      });

      setEditOpen(false);

      // Best-effort refetch (sync)
      void refresh();
    } catch (e: any) {
      setFormMsg({
        type: "error",
        text: e?.message || "Failed to save profile",
      });
    } finally {
      setSaving(false);
    }
  }

  function openPassword() {
    setPwMsg(null);
    setPwStep("request");
    setPwForm({ otpCode: "", newPassword: "", confirmPassword: "" });
    setPwOpen(true);
  }

  async function requestPasswordOtp() {
    if (pwSending) return;
    setPwSending(true);
    setPwMsg(null);

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ purpose: "PASSWORD_UPDATE" }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error((data as any)?.error || "Failed to send OTP");

      setPwMsg({
        type: "success",
        text: "OTP sent. Check your inbox (and spam).",
      });
      setPwStep("verify");
    } catch (e: any) {
      setPwMsg({ type: "error", text: e?.message || "Failed to send OTP" });
    } finally {
      setPwSending(false);
    }
  }

  async function submitPasswordUpdate() {
    if (pwSaving) return;
    setPwSaving(true);
    setPwMsg(null);

    try {
      const otpCode = cleanStr(pwForm.otpCode, 12);
      const newPassword = String(pwForm.newPassword ?? "");
      const confirmPassword = String(pwForm.confirmPassword ?? "");

      if (!otpCode || otpCode.length < 4)
        throw new Error("Please enter the OTP code.");
      if (!newPassword || newPassword.length < 8)
        throw new Error("Password must be at least 8 characters.");
      if (newPassword !== confirmPassword)
        throw new Error("Passwords do not match.");

      const res = await fetch("/api/auth/password/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ otpCode, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error((data as any)?.error || "Failed to update password");

      setPwMsg({ type: "success", text: "Password updated successfully." });

      setTimeout(() => {
        setPwOpen(false);
        setPwStep("request");
        setPwForm({ otpCode: "", newPassword: "", confirmPassword: "" });
      }, 600);
    } catch (e: any) {
      setPwMsg({
        type: "error",
        text: e?.message || "Failed to update password",
      });
    } finally {
      setPwSaving(false);
    }
  }


  return (
    <>
      {state === "loading" ? (
        <SettingsSkeleton />
      ) : state === "unauth" ? (
        <PremiumCard className="portal-card-premium">
          <PortalEmptyState
            icon="🔐"
            title="Please log in to continue"
            description="Your session isn’t active. Log in again to manage your settings."
            action={
              <div className="flex flex-col gap-3 sm:flex-row">
                <PortalButton
                  onClick={() =>
                    router.push(`/login?next=${encodeURIComponent(nextUrl)}`)
                  }
                  type="button"
                >
                  Go to login
                </PortalButton>
                <PortalButton
                  onClick={() => router.push("/")}
                  variant="secondary"
                  type="button"
                >
                  Back to home
                </PortalButton>
              </div>
            }
          />
        </PremiumCard>
      ) : state === "error" ? (
        <PremiumCard className="portal-card-premium">
          <PortalEmptyState
            icon="⚠️"
            title="Session check failed"
            description={error ?? "Something went wrong. Please try again."}
            action={
              <div className="flex flex-col gap-3 sm:flex-row">
                <PortalButton onClick={() => refresh()} type="button">
                  Retry
                </PortalButton>
                <PortalButton
                  onClick={() =>
                    router.push(`/login?next=${encodeURIComponent(nextUrl)}`)
                  }
                  variant="secondary"
                  type="button"
                >
                  Go to login
                </PortalButton>
              </div>
            }
          />
        </PremiumCard>
      ) : (
        <div className="space-y-5">
          {entLoading ? (
            <PortalAlert tone="info">Loading account entitlement…</PortalAlert>
          ) : null}

          {entError ? (
            <PortalAlert tone="warning" title="Couldn’t load entitlement">
              {entError}
            </PortalAlert>
          ) : null}

          {/* Settings overview */}
          <section className="relative overflow-hidden rounded-[24px] border border-white/15 bg-[#0b3f49] p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-95"
              style={{
                background:
                  "radial-gradient(circle at 18% 0%, rgba(255,255,255,0.16), transparent 28%), radial-gradient(circle at 90% 15%, rgba(20,184,166,0.26), transparent 34%), linear-gradient(135deg, rgba(5,39,50,0.95), rgba(22,103,108,0.90))",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-[#062834]/75"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 top-6 h-44 w-72 rotate-12 rounded-[42px] bg-white/10"
            />

            <div className="relative">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SettingsChip>
                      <span className="h-2 w-2 rounded-full bg-[#12d6b2]" />
                      Protected account
                    </SettingsChip>
                    <SettingsChip>{readOnly ? "Read-only" : "Editable"}</SettingsChip>
                    <SettingsChip>{planName} plan</SettingsChip>
                  </div>

                  <p className="mt-4 text-[11px] font-black uppercase tracking-[0.34em] text-[#9be7dc]">
                    Account settings
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                    Profile & security
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-white/78">
                    Manage your profile information and security preferences. Password updates are protected with OTP verification.
                  </p>

                  {readOnly ? (
                    <PortalAlert tone="warning" className="mt-4">
                      Your account is currently read-only. Profile and security updates are disabled until access is restored.
                    </PortalAlert>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                  <button
                    disabled={!canEditProfile}
                    onClick={openEdit}
                    type="button"
                    className={SETTINGS_PILL_BUTTON}
                    title={
                      !canEditProfile
                        ? "Your account is read-only or unavailable right now"
                        : "Edit your profile"
                    }
                  >
                    Edit profile
                  </button>

                  <button
                    disabled={!canManageSecurity}
                    onClick={openPassword}
                    type="button"
                    className={SETTINGS_DARK_BUTTON}
                    title={
                      !canManageSecurity
                        ? "Your account is read-only or unavailable right now"
                        : "Set or change your password"
                    }
                  >
                    Change password
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SettingsMetricCard
                  label="Email"
                  value={String(userEmail)}
                  caption="Signed-in account"
                  icon="✉"
                />
                <SettingsMetricCard
                  label="Plan"
                  value={planName}
                  caption={readOnly ? "Read-only access" : "Active access"}
                  icon="★"
                />
                <SettingsMetricCard
                  label="Last login"
                  value={fmtDate(sessionUser?.lastLoginAt)}
                  caption="Latest session"
                  icon="◷"
                />
                <SettingsMetricCard
                  label="Security"
                  value="OTP protected"
                  caption="Password step-up"
                  icon="✓"
                />
              </div>
            </div>
          </section>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              {/* Profile */}
              <SettingsSectionCard
                eyebrow="Profile"
                title="Profile details"
                description="Your basic account information."
                badge="Verified"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SettingsMetricCard
                    variant="solid"
                    label="Full name"
                    value={String(sessionUser?.fullName ?? "—")}
                    caption="Display name"
                    icon="SI"
                  />
                  <SettingsMetricCard
                    variant="solid"
                    label="Company"
                    value={String(sessionUser?.companyName ?? "—")}
                    caption="Business profile"
                    icon="▣"
                  />
                  <SettingsMetricCard
                    variant="solid"
                    label="Phone"
                    value={String(sessionUser?.phone ?? "—")}
                    caption="Contact number"
                    icon="☎"
                  />
                  <SettingsMetricCard
                    variant="solid"
                    label="Created"
                    value={fmtDate(sessionUser?.createdAt)}
                    caption="Account opened"
                    icon="◷"
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-white/12 bg-white/10 p-4 text-sm font-medium leading-6 text-white/78 shadow-inner">
                  You can edit your profile details below. Email changes will be added later with verification.
                  <p className="mt-1 text-xs text-white/58">
                    If your account is read-only, profile updates are disabled.
                  </p>
                </div>

                <PortalButton
                  disabled={!canEditProfile}
                  onClick={openEdit}
                  variant="secondary"
                  className="mt-4 w-full rounded-2xl bg-white text-slate-900 hover:bg-white/95"
                  title={
                    !canEditProfile
                      ? "Your account is read-only or unavailable right now"
                      : "Edit your profile"
                  }
                  type="button"
                >
                  Edit profile
                </PortalButton>
              </SettingsSectionCard>

              {/* Security */}
              <SettingsSectionCard
                eyebrow="Security"
                title="Password & access"
                description="Password, sessions, and access controls."
                badge="Secure"
              >
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/12 bg-white/10 p-4 shadow-inner">
                    <p className="text-sm text-white/90">
                      <span className="font-black">Login methods enabled:</span>
                    </p>
                    <ul className="mt-2 space-y-1 text-xs font-medium text-white/70">
                      <li>• OTP sign-in (enabled)</li>
                      <li>• Email + password (optional — once you set a password)</li>
                    </ul>
                    <p className="mt-2 text-xs text-white/55">
                      Changing your password requires OTP verification to protect your account.
                    </p>
                  </div>

                  <ActionRow
                    title="Password"
                    subtitle="Set / change your password (requires OTP)"
                    icon="🔒"
                    tone="neutral"
                    disabled={!canManageSecurity}
                    onClick={openPassword}
                  />

                  <ActionRow
                    title="Active sessions"
                    subtitle="View and manage logged-in devices (coming soon)"
                    icon="💻"
                    tone="neutral"
                    disabled
                    onClick={() => {}}
                  />

                  <div className="rounded-2xl border border-white/12 bg-white/10 p-4 shadow-inner">
                    <p className="text-sm text-white/90">
                      <span className="font-black">Sessions policy:</span> Max 2 active sessions allowed per account.
                    </p>
                    <p className="mt-1 text-xs text-white/55">
                      When session management is enabled, you’ll be able to sign out other devices here.
                    </p>
                  </div>
                </div>

                <PortalButton
                  disabled={!canManageSecurity}
                  onClick={openPassword}
                  className="mt-4 w-full rounded-2xl bg-[#12bfae] shadow-[0_12px_28px_rgba(18,191,174,0.22)] hover:bg-[#10ad9d]"
                  title={
                    !canManageSecurity
                      ? "Your account is read-only or unavailable right now"
                      : "Set / change password"
                  }
                  type="button"
                >
                  Set / change password
                </PortalButton>
              </SettingsSectionCard>
            </div>

            <div className="space-y-5">
              <SettingsSectionCard
                eyebrow="Status"
                title="Account status"
                description="Quick reference for the signed-in account."
                badge="Verified"
                compact
              >
                <div className="space-y-3">
                  <SettingsStatusRow label="Email" value={String(userEmail)} />
                  <SettingsStatusRow label="Plan" value={planName} />
                  <SettingsStatusRow
                    label="Last login"
                    value={fmtDate(sessionUser?.lastLoginAt)}
                  />
                  <SettingsStatusRow label="Account ID" value={String(userId)} />
                </div>

                <PortalButton
                  onClick={() => router.push("/billing")}
                  variant="secondary"
                  type="button"
                  className="mt-4 w-full justify-center rounded-2xl bg-white text-slate-900 hover:bg-white/95"
                >
                  View billing & access
                </PortalButton>
              </SettingsSectionCard>

              <SettingsSectionCard
                eyebrow="Access"
                title="Entitlement"
                description="Current portal access and billing limits."
                badge={readOnly ? "Read-only" : "Active"}
                compact
              >
                <div className="grid grid-cols-1 gap-3">
                  <SettingsMetricCard
                    variant="solid"
                    label="Companies"
                    value={String(ent?.features?.limits?.companies ?? "—")}
                    caption="Allowed companies"
                    icon="▣"
                  />
                  <SettingsMetricCard
                    variant="solid"
                    label="Read-only"
                    value={readOnly ? "Yes" : "No"}
                    caption="Portal mode"
                    icon="✓"
                  />
                  <SettingsMetricCard
                    variant="solid"
                    label="Renews"
                    value={fmtDate(ent?.currentPeriodEnd)}
                    caption="Current period end"
                    icon="◷"
                  />
                </div>
              </SettingsSectionCard>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Edit Profile Modal ---------- */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Edit profile
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Update your profile details. Email changes are not supported
                  yet.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-xl px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
                disabled={saving}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {formMsg ? (
                <PortalAlert tone={messageTone(formMsg.type)}>
                  {formMsg.text}
                </PortalAlert>
              ) : null}

              <PortalInput
                label="Full name"
                value={form.fullName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fullName: e.target.value }))
                }
                placeholder="e.g. Syrus Masuku"
                disabled={saving}
              />

              <PortalInput
                label="Company name"
                value={form.companyName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, companyName: e.target.value }))
                }
                placeholder="e.g. Onkabetse IT Solutions"
                disabled={saving}
              />

              <PortalInput
                label="Phone"
                value={form.phone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, phone: e.target.value }))
                }
                placeholder="e.g. +27 71 234 5678"
                disabled={saving}
                hint="Tip: Use numbers, spaces, +, dashes, brackets."
              />
            </div>

            <div className="mt-5 flex gap-3">
              <PortalButton
                type="button"
                onClick={() => setEditOpen(false)}
                variant="secondary"
                className="flex-1"
                disabled={saving}
              >
                Cancel
              </PortalButton>

              <PortalButton
                type="button"
                onClick={saveProfile}
                className="flex-1"
                isLoading={saving}
              >
                {saving ? "Saving..." : "Save changes"}
              </PortalButton>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Password Modal (OTP step-up) ---------- */}
      {pwOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Set / change password
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  For security, we’ll verify your account with an OTP before
                  updating your password.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPwOpen(false)}
                className="rounded-xl px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
                disabled={pwSending || pwSaving}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {pwMsg ? (
                <PortalAlert tone={messageTone(pwMsg.type)}>
                  {pwMsg.text}
                </PortalAlert>
              ) : null}

              {pwStep === "request" ? (
                <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-800">
                    We’ll send an OTP to{" "}
                    <span className="font-semibold">{userEmail}</span>.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Click “Send OTP”, then enter the code and your new password.
                  </p>

                  <PortalButton
                    type="button"
                    onClick={requestPasswordOtp}
                    className="mt-4 w-full"
                    isLoading={pwSending}
                  >
                    {pwSending ? "Sending..." : "Send OTP"}
                  </PortalButton>
                </div>
              ) : (
                <>
                  <div>
                    <PortalInput
                      label="OTP code"
                      value={pwForm.otpCode}
                      onChange={(e) =>
                        setPwForm((p) => ({ ...p, otpCode: e.target.value }))
                      }
                      placeholder="Enter OTP"
                      disabled={pwSaving}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={requestPasswordOtp}
                        className="text-xs font-semibold text-[color:var(--primary)] hover:underline disabled:opacity-60"
                        disabled={pwSending || pwSaving}
                      >
                        {pwSending ? "Sending..." : "Resend OTP"}
                      </button>
                      <span className="text-xs text-slate-500">
                        Check spam if you don’t see it.
                      </span>
                    </div>
                  </div>

                  <PortalInput
                    label="New password"
                    type="password"
                    value={pwForm.newPassword}
                    onChange={(e) =>
                      setPwForm((p) => ({
                        ...p,
                        newPassword: e.target.value,
                      }))
                    }
                    placeholder="At least 8 characters"
                    disabled={pwSaving}
                  />

                  <PortalInput
                    label="Confirm new password"
                    type="password"
                    value={pwForm.confirmPassword}
                    onChange={(e) =>
                      setPwForm((p) => ({
                        ...p,
                        confirmPassword: e.target.value,
                      }))
                    }
                    placeholder="Repeat password"
                    disabled={pwSaving}
                  />

                  <div className="mt-2 flex gap-3">
                    <PortalButton
                      type="button"
                      onClick={() => {
                        setPwMsg(null);
                        setPwStep("request");
                        setPwForm({
                          otpCode: "",
                          newPassword: "",
                          confirmPassword: "",
                        });
                      }}
                      variant="secondary"
                      className="flex-1"
                      disabled={pwSaving || pwSending}
                    >
                      Back
                    </PortalButton>

                    <PortalButton
                      type="button"
                      onClick={submitPasswordUpdate}
                      className="flex-1 bg-slate-900 hover:bg-slate-800"
                      isLoading={pwSaving}
                    >
                      {pwSaving ? "Updating..." : "Update password"}
                    </PortalButton>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- Local UI helpers ---------------- */


function SettingsChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[11px] font-black text-white/88 shadow-inner backdrop-blur">
      {children}
    </span>
  );
}

function SettingsMetricCard({
  label,
  value,
  caption,
  icon,
  variant = "glass",
}: {
  label: string;
  value: string;
  caption: string;
  icon: string;
  variant?: "glass" | "solid";
}) {
  const surface =
    variant === "solid"
      ? "border-white/12 bg-[#0c4a54]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      : "border-white/14 bg-[#083d48]/58 shadow-[0_12px_38px_rgba(2,24,32,0.18)]";

  return (
    <div className={cx("relative min-w-0 overflow-hidden rounded-2xl border p-4", surface)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-5 -top-8 h-20 w-20 rounded-full bg-white/8"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-black uppercase tracking-[0.28em] text-white/70">
            {label}
          </p>
          <p className="mt-2 truncate text-lg font-black tracking-tight text-white">
            {value}
          </p>
          <p className="mt-1 truncate text-xs font-bold text-white/58">{caption}</p>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/12 text-sm font-black text-white/85 ring-1 ring-white/10">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SettingsSectionCard({
  eyebrow,
  title,
  description,
  badge,
  children,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  badge: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[22px] border border-white/14 bg-[#0f5960]/82 text-white shadow-[0_20px_70px_rgba(15,23,42,0.16)]",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(circle at 90% 0%, rgba(255,255,255,0.13), transparent 27%), linear-gradient(135deg, rgba(7,54,67,0.80), rgba(31,124,124,0.72))",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-56 rotate-12 rounded-[38px] bg-white/8"
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#9be7dc]">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-white">
              {title}
            </h2>
            <p className="mt-1 text-sm font-medium leading-6 text-white/70">
              {description}
            </p>
          </div>
          <SettingsChip>
            <span className="h-2 w-2 rounded-full bg-[#12d6b2]" />
            {badge}
          </SettingsChip>
        </div>

        <div className={compact ? "mt-4" : "mt-5"}>{children}</div>
      </div>
    </section>
  );
}

function SettingsStatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/12 bg-white/10 px-4 py-3">
      <span className="text-xs font-black uppercase tracking-[0.22em] text-white/58">
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm font-black text-white">
        {value}
      </span>
    </div>
  );
}

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
        ? "text-white"
        : "bg-white text-slate-900 hover:bg-slate-50";

  const ringClass =
    tone === "neutral"
      ? "ring-1 ring-slate-200 shadow-sm"
      : "shadow-[0_18px_60px_rgba(15,23,42,0.12)] ring-1 ring-white/10";

  const iconChip =
    tone === "neutral"
      ? "bg-slate-900/5 ring-1 ring-slate-200 text-slate-700"
      : "bg-white/15 ring-1 ring-white/20 text-white";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative group w-full rounded-2xl px-3 py-2.5 text-left transition-all duration-300 will-change-transform",
        "hover:-translate-y-[2px] active:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        toneClass,
        ringClass,
        disabled ? "opacity-60 cursor-not-allowed hover:translate-y-0" : "",
      ].join(" ")}
      style={tone === "brand" ? { background: "var(--primary)" } : undefined}
      type="button"
    >
      <div className="relative flex items-center gap-3">
        <div
          className={[
            "grid h-9 w-9 place-items-center rounded-2xl text-[14px]",
            iconChip,
          ].join(" ")}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div
            className={
              tone === "neutral"
                ? "text-xs text-slate-600"
                : "text-xs text-white/80"
            }
          >
            {subtitle}
          </div>
        </div>
        <div
          className={
            tone === "neutral"
              ? "ml-auto text-slate-400"
              : "ml-auto text-white/80"
          }
        >
          →
        </div>
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

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <PortalSkeleton className="h-5 w-48" />
        <PortalSkeleton className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <PortalSkeleton className="h-5 w-40" />
          <PortalSkeleton className="mt-3 h-4 w-64 max-w-full" />
          <div className="mt-5 space-y-3">
            <PortalSkeleton className="h-12 rounded-2xl" />
            <PortalSkeleton className="h-12 rounded-2xl" />
            <PortalSkeleton className="h-12 rounded-2xl" />
          </div>
          <PortalSkeleton className="mt-5 h-16 rounded-2xl" />
          <PortalSkeleton className="mt-5 h-11 rounded-2xl" />
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <PortalSkeleton className="h-5 w-32" />
          <PortalSkeleton className="mt-3 h-4 w-56 max-w-full" />
          <div className="mt-5 space-y-3">
            <PortalSkeleton className="h-14 rounded-2xl" />
            <PortalSkeleton className="h-14 rounded-2xl" />
            <PortalSkeleton className="h-20 rounded-2xl" />
          </div>
          <PortalSkeleton className="mt-5 h-11 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
