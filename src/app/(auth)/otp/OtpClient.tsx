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

  const planParam = useMemo(() => {
    const raw = String(sp.get("plan") ?? "").toLowerCase().trim();
    if (raw === "growth") return "growth";
    if (raw === "pro") return "pro";
    if (raw === "trial") return "trial";
    if (raw === "starter") return "starter";
    return "";
  }, [sp]);

  const loginHref = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("next", nextUrl);
    if (planParam) qs.set("plan", planParam);
    return `/login?${qs.toString()}`;
  }, [nextUrl, planParam]);

  const [email] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

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
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : m.type === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-slate-200 bg-slate-50 text-slate-700";

  const missingEmail = !email.trim();

  return (
    <main className="min-h-screen w-full overflow-hidden bg-[#f5f8fb] text-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <section className="relative flex min-h-[42vh] items-center overflow-hidden bg-[#0b3442] px-6 py-12 text-white sm:px-10 lg:min-h-screen lg:px-16 xl:px-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_78%_76%,rgba(71,199,181,0.28),transparent_34%)]" />
          <div className="pointer-events-none absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-teal-300/10 blur-3xl" />

          <div className="relative z-10 w-full max-w-2xl">
            <div className="mb-10 flex flex-wrap items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-2xl shadow-black/20 ring-1 ring-white/20">
                <div className="flex items-center gap-1 text-2xl font-black tracking-tight text-[#1d3f99]">
                  <span className="rounded-md border-2 border-[#1d3f99] px-1.5 py-1 leading-none">e</span>
                  <span className="rounded-md border-2 border-[#1d3f99] px-1.5 py-1 leading-none">K</span>
                </div>
              </div>

              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-extrabold text-white shadow-sm backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Secure OTP verification
                </div>
                <p className="text-sm font-bold uppercase tracking-[0.34em] text-white/70">
                  eKasiBooks Portal
                </p>
              </div>
            </div>

            <h1 className="max-w-xl text-4xl font-black leading-[1.03] tracking-tight sm:text-5xl xl:text-6xl">
              Quick access without typing your password.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-white/85 sm:text-lg">
              Use the one-time code sent to your email to continue securely to your portal, billing, downloads and company access.
            </p>

            <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-sm backdrop-blur">
                <p className="text-sm font-extrabold text-white">Password stays primary</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  OTP is available when you need a quicker login option.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-5 shadow-sm backdrop-blur">
                <p className="text-sm font-extrabold text-white">Email-based access</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Codes can be resent after a short cooldown if delivery is delayed.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm text-white/85 shadow-sm backdrop-blur">
              Rather use your password?{" "}
              <button
                type="button"
                onClick={() => router.push(loginHref)}
                className="font-extrabold text-white underline underline-offset-4 hover:text-white/90"
              >
                Back to login
              </button>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_6%,rgba(11,52,66,0.10),transparent_28%),radial-gradient(circle_at_12%_94%,rgba(20,184,166,0.08),transparent_28%)]" />

          <div className="relative z-10 w-full max-w-[500px]">
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-7 shadow-2xl shadow-slate-200/80 sm:p-9">
              <p className="text-xs font-black uppercase tracking-[0.38em] text-teal-800">Verify access</p>
              <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950">Enter OTP</h2>

              {missingEmail ? (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  We couldn’t find an email address for this OTP session. Please go back and request a new OTP.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  We sent a 6-digit code to <span className="font-extrabold text-slate-900">{email}</span>.
                </p>
              )}

              <div className="mt-8 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">OTP code</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg font-extrabold tracking-[0.32em] text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10 disabled:bg-slate-50 disabled:text-slate-500"
                    value={otpClean}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={loading || missingEmail}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") verify();
                    }}
                  />
                </label>

                {msg && (
                  <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${msgClass(msg)}`}>
                    {msg.text}
                  </div>
                )}

                <button
                  type="button"
                  onClick={verify}
                  disabled={loading || missingEmail || !otpReady}
                  className="w-full rounded-xl bg-[#1f6b6f] px-4 py-3 font-extrabold text-white shadow-lg shadow-teal-900/10 transition hover:bg-[#195d60] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Working..." : "Verify OTP"}
                </button>

                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={loading || missingEmail || cooldown > 0}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-extrabold text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  title={cooldown > 0 ? `Try again in ${cooldown}s` : undefined}
                >
                  {cooldown > 0 ? `Resend OTP (${cooldown}s)` : "Resend OTP"}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(loginHref)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-extrabold text-slate-950 transition hover:bg-slate-50"
                >
                  Back to login
                </button>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600">
                  {!missingEmail ? (
                    <p>
                      Didn’t receive it? Check spam, junk or promotions. OTP emails can sometimes take a few minutes depending on your inbox provider.
                    </p>
                  ) : (
                    <p>
                      Return to the login page and request a fresh OTP so we can attach the code to your email address.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-7 text-center text-xs text-slate-500">
              By continuing, you agree to our Terms and Privacy Policy.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
