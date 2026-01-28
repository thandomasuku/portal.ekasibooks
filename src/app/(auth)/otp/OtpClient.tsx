"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Msg = { type: "success" | "error" | "info"; text: string } | null;

export default function OtpPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const initialEmail = (sp.get("email") ?? "").trim().toLowerCase();
  const remember = sp.get("remember") === "1";

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  }, [sp]);

  const [email] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // Resend cooldown (nice UX, prevents spam clicks)
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function showError(text: string) {
    setMsg({ type: "error", text });
  }
  function showSuccess(text: string) {
    setMsg({ type: "success", text });
  }

  const otpClean = useMemo(() => otp.replace(/\D/g, "").slice(0, 6), [otp]);
  const otpReady = otpClean.length === 6;

  async function verify() {
    if (loading) return;

    if (!email.trim()) {
      return showError("Missing email address. Please go back and request an OTP again.");
    }

    if (!otpReady) {
      return showError("Please enter the 6-digit OTP code.");
    }

    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // ✅ Backend expects `code` (not `otp`)
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: otpClean,
          remember,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "OTP verification failed");

      showSuccess("OTP verified. Redirecting...");
      router.replace(nextUrl);
    } catch (e: any) {
      showError(e?.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (loading) return;

    if (!email.trim()) {
      return showError("Missing email address. Please go back and request an OTP again.");
    }

    if (cooldown > 0) return;

    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "OTP request failed");

      setCooldown(30);
      setOtp("");
      showSuccess("New OTP sent. Check your email.");
    } catch (e: any) {
      showError(e?.message || "OTP request failed");
    } finally {
      setLoading(false);
    }
  }

  const msgClass = (m: Msg) =>
    !m
      ? ""
      : m.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : m.type === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-slate-50 border-slate-200 text-slate-700";

  // If someone lands here without email, guide them out cleanly
  const missingEmail = !email.trim();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-semibold">Enter OTP</h1>

        {missingEmail ? (
          <p className="text-slate-600 mt-1">
            We couldn’t find an email address for this OTP session. Please go back and request a new OTP.
          </p>
        ) : (
          <p className="text-slate-600 mt-1">
            We sent a code to <span className="font-medium">{email}</span>
          </p>
        )}

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">OTP Code</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-500"
              value={otpClean}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={loading || missingEmail}
              onKeyDown={(e) => {
                if (e.key === "Enter") verify();
              }}
            />
          </label>

          {msg && (
            <div className={`text-sm rounded-xl border px-3 py-2 ${msgClass(msg)}`}>
              {msg.text}
            </div>
          )}

          <button
            onClick={verify}
            disabled={loading || missingEmail || !otpReady}
            className="w-full rounded-xl bg-slate-900 text-white py-2 font-medium disabled:opacity-60"
          >
            {loading ? "Working..." : "Verify OTP"}
          </button>

          <button
            onClick={resendOtp}
            disabled={loading || missingEmail || cooldown > 0}
            className="w-full rounded-xl border border-slate-300 py-2 font-medium disabled:opacity-60"
            title={cooldown > 0 ? `Try again in ${cooldown}s` : undefined}
          >
            {cooldown > 0 ? `Resend OTP (${cooldown}s)` : "Resend OTP"}
          </button>

          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-xl border border-slate-300 py-2 font-medium"
          >
            Back to login
          </button>

          {!missingEmail ? (
            <p className="text-xs text-slate-500">
              Didn’t receive it? Check spam/junk. You can resend after a short cooldown.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
