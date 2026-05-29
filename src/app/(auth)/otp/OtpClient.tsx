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
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#eef6f7] text-slate-950">
      <div className="pointer-events-none absolute -left-24 top-0 h-[520px] w-[620px] -rotate-[34deg] rounded-[5rem] bg-[#073743]" />
      <div className="pointer-events-none absolute left-[36%] top-0 h-32 w-[620px] -translate-y-12 -rotate-[48deg] bg-[#0a3d47]" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-[44%] bg-[radial-gradient(circle_at_74%_8%,rgba(11,52,66,0.12),transparent_30%),radial-gradient(circle_at_6%_92%,rgba(20,184,166,0.10),transparent_28%)]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-8 sm:px-10 lg:px-12">
        <div className="grid w-full max-w-[1180px] overflow-hidden rounded-[2rem] border border-white/60 bg-white shadow-2xl shadow-slate-300/70 lg:grid-cols-[1.12fr_0.88fr]">
          <section className="relative overflow-hidden bg-[#0f5963] px-8 py-10 text-white sm:px-12 lg:px-14 lg:py-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_86%_82%,rgba(91,221,206,0.25),transparent_34%)]" />
            <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full border-[72px] border-white/10" />

            <div className="relative z-10 flex min-h-[620px] flex-col justify-between gap-10">
              <div>
                <div className="mb-11 inline-flex items-center gap-4 rounded-3xl border border-white/15 bg-white/10 px-4 py-3 shadow-sm backdrop-blur">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-xl shadow-black/20 ring-1 ring-white/25">
                    <div className="flex items-center gap-1 text-lg font-black tracking-tight text-[#1d3f99]">
                      <span className="rounded border-2 border-[#1d3f99] px-1.5 py-1 leading-none">e</span>
                      <span className="rounded border-2 border-[#1d3f99] px-1.5 py-1 leading-none">K</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-white">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      Secure OTP access
                    </div>
                    <p className="text-sm font-black uppercase tracking-[0.34em] text-white/72">
                      eKasiBooks Portal
                    </p>
                  </div>
                </div>

                <div className="mb-5 inline-flex rounded-full bg-white/12 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-white/90">
                  Email verification workspace
                </div>

                <h1 className="max-w-2xl text-3xl font-black leading-[1.06] tracking-[-0.04em] text-white sm:text-4xl lg:text-[2.95rem]">
                  Quick access without typing your password.
                </h1>
                <p className="mt-6 max-w-2xl text-base font-semibold leading-7 text-white/78">
                  Use the one-time code sent to your email to continue securely to billing, downloads, cloud sync and company access.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/14 bg-white/12 p-5 shadow-sm backdrop-blur">
                  <p className="font-extrabold text-white">Password stays primary</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    OTP remains available when you need a quick sign-in option.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/14 bg-white/12 p-5 shadow-sm backdrop-blur">
                  <p className="font-extrabold text-white">Email-based access</p>
                  <p className="mt-2 text-sm leading-6 text-white/72">
                    Codes can be resent after a short cooldown if delivery is delayed.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="relative bg-white px-8 py-10 sm:px-12 lg:px-12 lg:py-11">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_8%,rgba(11,52,66,0.08),transparent_30%)]" />
            <div className="relative z-10 mx-auto flex min-h-[620px] max-w-[430px] flex-col justify-center">
              <div className="mb-8 flex items-center justify-between gap-4">
                <span className="rounded-full bg-teal-50 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-teal-800">
                  Verify access
                </span>
                <span className="rounded-full bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-slate-500">
                  Secure OTP
                </span>
              </div>

              <h2 className="text-3xl font-black tracking-tight text-slate-950">Enter OTP</h2>
              {missingEmail ? (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  We couldn’t find an email address for this OTP session. Please go back and request a new OTP.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  We sent a 6-digit code to <span className="font-extrabold text-slate-900">{email}</span>.
                </p>
              )}

              <div className="mt-7 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">OTP code</span>
                  <input
                    className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-lg font-extrabold tracking-[0.32em] text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10 disabled:bg-slate-50 disabled:text-slate-500"
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
                  className="h-12 w-full rounded-xl bg-[#1f6b6f] px-4 font-extrabold text-white shadow-lg shadow-teal-900/10 transition hover:bg-[#195d60] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Working..." : "Verify OTP"}
                </button>

                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={loading || missingEmail || cooldown > 0}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-extrabold text-slate-950 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  title={cooldown > 0 ? `Try again in ${cooldown}s` : undefined}
                >
                  {cooldown > 0 ? `Resend OTP (${cooldown}s)` : "Resend OTP"}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(loginHref)}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-extrabold text-slate-950 transition hover:bg-slate-50"
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

              <p className="mt-7 text-center text-xs text-slate-500">
                By continuing, you agree to our Terms and Privacy Policy.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
