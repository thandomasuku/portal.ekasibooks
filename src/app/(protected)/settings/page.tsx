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

function cleanStr(v: any, max: number) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : "";
}

export default function SettingsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/settings";
  }, [sp]);

  const [user, setUser] = useState<any>(null);
  const [ent, setEnt] = useState<Entitlement | null>(null);

  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  // ---- Edit Profile Modal state ----
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [form, setForm] = useState<{ fullName: string; companyName: string; phone: string }>({
    fullName: "",
    companyName: "",
    phone: "",
  });

  // ---- Password Modal (OTP step-up) ----
  const [pwOpen, setPwOpen] = useState(false);
  const [pwStep, setPwStep] = useState<"request" | "verify">("request");
  const [pwSending, setPwSending] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [pwForm, setPwForm] = useState<{ otpCode: string; newPassword: string; confirmPassword: string }>({
    otpCode: "",
    newPassword: "",
    confirmPassword: "",
  });

  async function loadAll() {
    setState("loading");
    setError(null);

    try {
      // 1) Auth identity (email/id)
      const meRes = await fetch(`/api/auth/me?ts=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });

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

      // /api/auth/me returns { authenticated, user: {...} }
      const meUser = meJson?.user ?? meJson;
      setUser(meUser);

      // 2) Entitlement (plan) — best-effort
      try {
        const entRes = await fetch(`/api/entitlement?ts=${Date.now()}`, {
          credentials: "include",
          cache: "no-store",
        });

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
        // ignore
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

  const canEditProfile = state === "ready" && !(ent?.features?.readOnly);
  const canManageSecurity = state === "ready" && !(ent?.features?.readOnly);

  function openEdit() {
    setFormMsg(null);

    const u = user ?? {};
    setForm({
      fullName: cleanStr(u?.fullName, 80),
      companyName: cleanStr(u?.companyName, 120),
      phone: cleanStr(u?.phone, 30),
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
      if (!res.ok) throw new Error((data as any)?.error || "Failed to save profile");

      setFormMsg({ type: "success", text: "Profile saved." });

      // Optimistic UI update (instant refresh)
      setUser((prev: any) => {
        const base = prev ?? {};
        return { ...base, ...payload };
      });

      setEditOpen(false);

      // Best-effort refetch (sync)
      loadAll();
    } catch (e: any) {
      setFormMsg({ type: "error", text: e?.message || "Failed to save profile" });
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
      if (!res.ok) throw new Error((data as any)?.error || "Failed to send OTP");

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

      if (!otpCode || otpCode.length < 4) throw new Error("Please enter the OTP code.");
      if (!newPassword || newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");

      const res = await fetch("/api/auth/password/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ otpCode, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "Failed to update password");

      setPwMsg({ type: "success", text: "Password updated successfully." });

      setTimeout(() => {
        setPwOpen(false);
        setPwStep("request");
        setPwForm({ otpCode: "", newPassword: "", confirmPassword: "" });
      }, 600);
    } catch (e: any) {
      setPwMsg({ type: "error", text: e?.message || "Failed to update password" });
    } finally {
      setPwSaving(false);
    }
  }

  const formMsgClass =
    !formMsg
      ? ""
      : formMsg.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : formMsg.type === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-sky-200 bg-sky-50 text-sky-800";

  const pwMsgClass =
    !pwMsg
      ? ""
      : pwMsg.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : pwMsg.type === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <PortalShell
      badge="Settings"
      title="Profile & Security"
      subtitle={subtitle}
      userEmail={user?.email ?? null}
      planName={planName}
      tipText="Tip: For security, changing a password requires an OTP verification (step-up)."
      headerRight={
        <button
          onClick={() => loadAll()}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
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
        <div className="space-y-5">
          {/* Hero */}
          <PremiumCard tone="brand">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <Chip>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Account security: Protected
                </Chip>

                <h2 className="mt-2 text-lg font-semibold text-slate-900">Keep your account safe.</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Review your profile info and security options. Password changes are protected by OTP verification.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  disabled
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white opacity-60"
                  title="Coming soon"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/10 text-[12px]">✓</span>
                  Enable MFA (soon)
                </button>

                <button
                  onClick={() => router.push("/billing")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#215D63] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-[#1c4f54]"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-white/15 text-[12px]">⟠</span>
                  View plan
                </button>
              </div>
            </div>
          </PremiumCard>

          {/* KPI row */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Email" value={userEmail} icon="✉" />
            <KpiCard label="Plan" value={planName} icon="★" />
            <KpiCard label="Account ID" value={userId} icon="ID" />
            <KpiCard label="Last login" value={fmtDate(user?.lastLoginAt)} icon="✓" />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Profile */}
            <PremiumCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Profile details</h2>
                  <p className="mt-1 text-sm text-slate-600">Your basic account information.</p>
                </div>

                <Chip tone="success">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Verified
                </Chip>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailTile label="Email" value={userEmail} />
                <DetailTile label="Plan" value={planName} />
                <DetailTile label="Account ID" value={userId} />
                <DetailTile label="Last login" value={fmtDate(user?.lastLoginAt)} />

                <DetailTile label="Full name" value={String(user?.fullName ?? "—")} />
                <DetailTile label="Company" value={String(user?.companyName ?? "—")} />
                <DetailTile label="Phone" value={String(user?.phone ?? "—")} />
                <DetailTile label="Created" value={fmtDate(user?.createdAt)} />
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-700">
                  You can edit your profile details below. Email changes will be added later with verification.
                </p>
                <p className="mt-1 text-xs text-slate-500">If your account is read-only, profile updates are disabled.</p>
              </div>

              <button
                disabled={!canEditProfile}
                onClick={openEdit}
                className={[
                  "mt-5 w-full rounded-2xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-900 transition",
                  canEditProfile ? "hover:bg-slate-50" : "opacity-60 cursor-not-allowed",
                ].join(" ")}
                title={!canEditProfile ? "Your account is read-only or unavailable right now" : "Edit your profile"}
                type="button"
              >
                Edit profile
              </button>
            </PremiumCard>

            {/* Security */}
            <PremiumCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Security</h2>
                  <p className="mt-1 text-sm text-slate-600">Password, sessions, and access controls.</p>
                </div>
                <Chip tone="success">Secure</Chip>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-800">
                    <span className="font-semibold">Login methods enabled:</span>
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    <li>• OTP sign-in (enabled)</li>
                    <li>• Email + password (optional — once you set a password)</li>
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">
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
                disabled={!canManageSecurity}
                onClick={openPassword}
                className={[
                  "mt-5 w-full rounded-2xl py-2 text-sm font-semibold text-white transition",
                  canManageSecurity ? "bg-slate-900 hover:bg-slate-800" : "bg-slate-900 opacity-60 cursor-not-allowed",
                ].join(" ")}
                title={!canManageSecurity ? "Your account is read-only or unavailable right now" : "Set / change password"}
                type="button"
              >
                Set / change password
              </button>
            </PremiumCard>
          </div>
        </div>
      )}

      {/* ---------- Edit Profile Modal ---------- */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Edit profile</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Update your profile details. Email changes are not supported yet.
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
                <div className={["rounded-xl border px-3 py-2 text-sm", formMsgClass].join(" ")}>
                  {formMsg.text}
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Full name</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30"
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="e.g. Syrus Masuku"
                  disabled={saving}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Company name</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30"
                  value={form.companyName}
                  onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                  placeholder="e.g. Onkabetse IT Solutions"
                  disabled={saving}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Phone</span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="e.g. +27 71 234 5678"
                  disabled={saving}
                />
                <p className="mt-1 text-xs text-slate-500">Tip: Use numbers, spaces, +, dashes, brackets.</p>
              </label>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="flex-1 rounded-xl border border-slate-300 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveProfile}
                className="flex-1 rounded-xl bg-[#215D63] py-2 text-sm font-semibold text-white hover:bg-[#1c4f54] disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
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
                <h3 className="text-base font-semibold text-slate-900">Set / change password</h3>
                <p className="mt-1 text-sm text-slate-600">
                  For security, we’ll verify your account with an OTP before updating your password.
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
                <div className={["rounded-xl border px-3 py-2 text-sm", pwMsgClass].join(" ")}>
                  {pwMsg.text}
                </div>
              ) : null}

              {pwStep === "request" ? (
                <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-800">
                    We’ll send an OTP to <span className="font-semibold">{userEmail}</span>.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Click “Send OTP”, then enter the code and your new password.
                  </p>

                  <button
                    type="button"
                    onClick={requestPasswordOtp}
                    className="mt-4 w-full rounded-xl bg-[#215D63] py-2 text-sm font-semibold text-white hover:bg-[#1c4f54] disabled:opacity-60"
                    disabled={pwSending}
                  >
                    {pwSending ? "Sending..." : "Send OTP"}
                  </button>
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">OTP code</span>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30"
                      value={pwForm.otpCode}
                      onChange={(e) => setPwForm((p) => ({ ...p, otpCode: e.target.value }))}
                      placeholder="Enter OTP"
                      disabled={pwSaving}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={requestPasswordOtp}
                        className="text-xs font-semibold text-[#215D63] hover:underline disabled:opacity-60"
                        disabled={pwSending || pwSaving}
                      >
                        {pwSending ? "Sending..." : "Resend OTP"}
                      </button>
                      <span className="text-xs text-slate-500">Check spam if you don’t see it.</span>
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">New password</span>
                    <input
                      type="password"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30"
                      value={pwForm.newPassword}
                      onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
                      placeholder="At least 8 characters"
                      disabled={pwSaving}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Confirm new password</span>
                    <input
                      type="password"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30"
                      value={pwForm.confirmPassword}
                      onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="Repeat password"
                      disabled={pwSaving}
                    />
                  </label>

                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPwMsg(null);
                        setPwStep("request");
                        setPwForm({ otpCode: "", newPassword: "", confirmPassword: "" });
                      }}
                      className="flex-1 rounded-xl border border-slate-300 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                      disabled={pwSaving || pwSending}
                    >
                      Back
                    </button>

                    <button
                      type="button"
                      onClick={submitPasswordUpdate}
                      className="flex-1 rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      disabled={pwSaving}
                    >
                      {pwSaving ? "Updating..." : "Update password"}
                    </button>
                  </div>
                </>
              )}
            </div>
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
        "w-full rounded-2xl px-3 py-2.5 text-left transition",
        "hover:-translate-y-[1px]",
        toneClass,
        ringClass,
        disabled ? "opacity-60 cursor-not-allowed hover:translate-y-0" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div className={["grid h-9 w-9 place-items-center rounded-2xl text-[14px]", iconChip].join(" ")}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className={tone === "neutral" ? "text-xs text-slate-600" : "text-xs text-white/80"}>
            {subtitle}
          </div>
        </div>
        <div className={tone === "neutral" ? "ml-auto text-slate-400" : "ml-auto text-white/80"}>→</div>
      </div>
    </button>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
        <div className="h-5 w-48 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-3 h-4 w-80 rounded-lg bg-slate-200 animate-pulse" />
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
          <div className="h-16 rounded-3xl bg-slate-200 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="h-5 w-40 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-64 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-5 space-y-3">
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-12 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
          <div className="mt-5 h-16 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="mt-5 h-11 rounded-2xl bg-slate-200 animate-pulse" />
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
          <div className="h-5 w-32 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-3 h-4 w-56 rounded-lg bg-slate-200 animate-pulse" />
          <div className="mt-5 space-y-3">
            <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-14 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-20 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
          <div className="mt-5 h-11 rounded-2xl bg-slate-200 animate-pulse" />
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
