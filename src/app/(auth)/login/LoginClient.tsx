"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

type Msg = { type: "success" | "error" | "info"; text: string } | null;

async function trackAnalytics(eventName: string, params?: Record<string, any>) {
  try {
    const analytics = (await import("@/lib/analytics")) as any;

    if (typeof analytics.trackEvent === "function") {
      analytics.trackEvent(eventName, params);
      return;
    }

    if (typeof analytics.track === "function") {
      analytics.track(eventName, params);
      return;
    }

    if (typeof analytics.event === "function") {
      analytics.event(eventName, params);
      return;
    }
  } catch {
    // Fall through to window.gtag
  }

  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params ?? {});
  }
}

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();

  const isProd = process.env.NODE_ENV === "production";

  const [email, setEmail] = useState(isProd ? "" : "test@example.com");
  const [password, setPassword] = useState(isProd ? "" : "Password@123");
  const [remember, setRemember] = useState(true);

  const [pwLoading, setPwLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const [needsVerify, setNeedsVerify] = useState(false);

  // Show dev OTP (if API returns devCode in non-prod)
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const isBusy = pwLoading || otpLoading;

  const emailOk = useMemo(() => {
    const e = email.trim();
    return e.length >= 5 && e.includes("@") && e.includes(".");
  }, [email]);

  const nextUrl = useMemo(() => {
    const next = params.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  }, [params]);

  const planParam = useMemo(() => {
    const raw = String(params.get("plan") ?? "").toLowerCase().trim();
    if (raw === "growth") return "growth";
    if (raw === "pro") return "pro";
    if (raw === "trial") return "trial";
    if (raw === "starter") return "starter";
    return "";
  }, [params]);

  const registerHref = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("next", nextUrl);
    if (planParam) qs.set("plan", planParam);
    return `/register?${qs.toString()}`;
  }, [nextUrl, planParam]);

  useEffect(() => {
    trackAnalytics("login_page_view", {
      page: "/login",
      next_url: nextUrl,
      plan: planParam || undefined,
    });
  }, [nextUrl, planParam]);

  function showError(text: string) {
    setMsg({ type: "error", text });
  }

  function showSuccess(text: string) {
    setMsg({ type: "success", text });
  }

  function showInfo(text: string) {
    setMsg({ type: "info", text });
  }

  async function loginWithPassword() {
    if (isBusy) return;
    if (!emailOk) {
      await trackAnalytics("login_password_validation_failed", {
        reason: "invalid_email",
        next_url: nextUrl,
        plan: planParam || undefined,
      });
      return showError("Please enter a valid email address.");
    }
    if (!password.trim()) {
      await trackAnalytics("login_password_validation_failed", {
        reason: "missing_password",
        next_url: nextUrl,
        plan: planParam || undefined,
      });
      return showError("Please enter your password.");
    }

    await trackAnalytics("login_password_attempt", {
      remember,
      next_url: nextUrl,
      plan: planParam || undefined,
    });

    setPwLoading(true);
    setMsg(null);
    setDevOtp(null);
    setNeedsVerify(false);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          remember,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && (data as any)?.code === "EMAIL_NOT_VERIFIED") {
          setNeedsVerify(true);
          await trackAnalytics("login_password_failed", {
            reason: "email_not_verified",
            next_url: nextUrl,
            plan: planParam || undefined,
          });
          throw new Error((data as any)?.error || "Please verify your email before logging in.");
        }

        await trackAnalytics("login_password_failed", {
          reason: (data as any)?.code || (data as any)?.error || `http_${res.status}`,
          next_url: nextUrl,
          plan: planParam || undefined,
        });

        throw new Error((data as any)?.error || "Login failed");
      }

      await trackAnalytics("login_password_success", {
        remember,
        next_url: nextUrl,
        plan: planParam || undefined,
      });

      showSuccess("Login successful. Redirecting...");
      router.replace(nextUrl);
    } catch (e: any) {
      showError(e?.message || "Login failed");
    } finally {
      setPwLoading(false);
    }
  }

  async function requestOtp() {
    if (isBusy) return;
    if (!emailOk) {
      await trackAnalytics("login_otp_validation_failed", {
        reason: "invalid_email",
        next_url: nextUrl,
        plan: planParam || undefined,
      });
      return showError("Please enter a valid email address.");
    }

    await trackAnalytics("login_otp_request_attempt", {
      remember,
      next_url: nextUrl,
      plan: planParam || undefined,
    });

    setOtpLoading(true);
    setMsg(null);
    setDevOtp(null);
    setNeedsVerify(false);

    showInfo(
      "Requesting OTP… delivery can take up to 1–2 minutes on some email providers. Please also check spam/promotions."
    );

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && (data as any)?.code === "EMAIL_NOT_VERIFIED") {
          setNeedsVerify(true);
          await trackAnalytics("login_otp_request_failed", {
            reason: "email_not_verified",
            next_url: nextUrl,
            plan: planParam || undefined,
          });
          throw new Error((data as any)?.error || "Please verify your email before using OTP login.");
        }

        await trackAnalytics("login_otp_request_failed", {
          reason: (data as any)?.code || (data as any)?.error || `http_${res.status}`,
          next_url: nextUrl,
          plan: planParam || undefined,
        });

        throw new Error((data as any)?.error || "OTP request failed");
      }

      if (!isProd && (data as any)?.devCode) {
        setDevOtp(String((data as any).devCode));
      }

      await trackAnalytics("login_otp_request_success", {
        remember,
        next_url: nextUrl,
        plan: planParam || undefined,
      });

      showSuccess(
        "OTP requested. If it doesn’t arrive within 2 minutes, check spam/promotions or tap Resend on the next screen."
      );

      const qs = new URLSearchParams({
        email: email.trim().toLowerCase(),
        remember: remember ? "1" : "0",
        next: nextUrl,
      });

      if (planParam) qs.set("plan", planParam);

      router.push(`/otp?${qs.toString()}`);
    } catch (e: any) {
      showError(e?.message || "OTP request failed");
    } finally {
      setOtpLoading(false);
    }
  }

  async function resendVerification() {
    if (resendLoading) return;
    if (!emailOk) {
      await trackAnalytics("login_resend_verification_validation_failed", {
        reason: "invalid_email",
        next_url: nextUrl,
        plan: planParam || undefined,
      });
      return showError("Please enter a valid email address first.");
    }

    await trackAnalytics("login_resend_verification_attempt", {
      next_url: nextUrl,
      plan: planParam || undefined,
    });

    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await trackAnalytics("login_resend_verification_failed", {
          reason: (data as any)?.code || (data as any)?.error || `http_${res.status}`,
          next_url: nextUrl,
          plan: planParam || undefined,
        });
        throw new Error((data as any)?.error || "Resend failed");
      }

      await trackAnalytics("login_resend_verification_success", {
        next_url: nextUrl,
        plan: planParam || undefined,
      });

      showSuccess("Verification email sent. Please check your inbox (and spam/promotions).");
      setNeedsVerify(false);
    } catch (e: any) {
      showError(e?.message || "Resend failed");
    } finally {
      setResendLoading(false);
    }
  }

  async function handleRegisterClick() {
    await trackAnalytics("login_register_click", {
      next_url: nextUrl,
      plan: planParam || undefined,
      destination: registerHref,
    });
    router.push(registerHref);
  }

  const msgClass = (m: Msg) =>
    !m
      ? ""
      : m.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : m.type === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-sky-50 border-sky-200 text-sky-800";

  return (
    <main className="min-h-screen min-h-[100svh] overflow-hidden bg-[#eef6f7] text-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-28 h-[34rem] w-[48rem] rotate-[-35deg] rounded-[5rem] bg-[#073340]" />
        <div className="absolute left-[38%] top-0 h-44 w-[30rem] skew-x-[-35deg] bg-[#0f4a55] opacity-95" />
        <div className="absolute right-0 top-0 h-[30rem] w-[34rem] rounded-bl-[12rem] bg-[radial-gradient(circle_at_top_right,rgba(33,93,99,0.18),transparent_70%)]" />
        <div className="absolute bottom-[-12rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-[#215D63]/10 blur-3xl" />
      </div>

      <section className="relative flex min-h-screen min-h-[100svh] items-center justify-center px-4 py-2 sm:px-5 lg:px-6">
        <div className="grid w-full max-w-[1040px] overflow-hidden rounded-[1.35rem] border border-white/45 bg-white/88 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl lg:max-h-[calc(100svh-1rem)] lg:grid-cols-[1.04fr_0.96fr]">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#073340] via-[#164e59] to-[#277077] px-5 py-5 text-white sm:px-7 lg:px-8 lg:py-6">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 right-[-9rem] h-[28rem] w-[28rem] rounded-full bg-white/10" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-52 w-52 rounded-tl-[10rem] bg-black/10" />

            <div className="relative flex h-full flex-col justify-center gap-5">
              <div>
                <div className="inline-flex items-center gap-3 rounded-[1.25rem] border border-white/16 bg-white/10 p-2 pr-4 shadow-[0_16px_36px_rgba(0,0,0,0.16)] backdrop-blur">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_16px_36px_rgba(0,0,0,0.14)] ring-1 ring-white/25">
                    <Image
                      src="/logo/ekasibooks.png"
                      alt="eKasiBooks"
                      width={96}
                      height={96}
                      priority
                      className="h-9 w-9 object-contain"
                    />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-cyan-50 ring-1 ring-white/16">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      Secure portal access
                    </div>
                    <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.28em] text-white/72">
                      eKasiBooks Portal
                    </p>
                  </div>
                </div>

                <div className="mt-6 max-w-[520px]">
                  <p className="inline-flex rounded-full bg-white/12 px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-cyan-50 ring-1 ring-white/15">
                    Business access workspace
                  </p>
                  <h1 className="mt-3 max-w-[480px] text-[1.95rem] font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-[2.15rem] lg:text-[2.35rem]">
                    Manage your business access.
                  </h1>
                  <p className="mt-2.5 max-w-[440px] text-sm font-medium leading-5 text-white/76">
                    Sign in to manage subscriptions, downloads, cloud sync and account security from one controlled portal.
                  </p>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                  <p className="font-bold text-white">Cloud sync</p>
                  <p className="mt-1 text-xs leading-4 text-white/70">Keep desktop entitlement and company access aligned.</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                  <p className="font-bold text-white">Downloads</p>
                  <p className="mt-1 text-xs leading-4 text-white/70">Access installers and updates for your business tools.</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                  <p className="font-bold text-white">Security</p>
                  <p className="mt-1 text-xs leading-4 text-white/70">Use password login or request an OTP when needed.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative bg-white px-5 py-5 sm:px-7 lg:px-8 lg:py-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(33,93,99,0.10),transparent_24rem)]" />
            <div className="relative flex min-h-full flex-col justify-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[1.35rem] font-black tracking-[-0.04em] text-slate-950 sm:text-[1.5rem]">Sign in</h2>
                  <span className="rounded-full bg-[#e8f7f5] px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#215D63]">
                    Welcome back
                  </span>
                </div>
                <p className="mt-1 max-w-sm text-sm leading-5 text-slate-600">
                  Use your eKasiBooks credentials to enter the portal workspace.
                </p>
              </div>

              <div className="mt-3.5 space-y-3">
                {msg && (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${msgClass(msg)}`}>
                    <div className="flex flex-col gap-2">
                      <div>{msg.text}</div>

                      {needsVerify && (
                        <button
                          type="button"
                          onClick={resendVerification}
                          disabled={resendLoading}
                          className="w-fit rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {resendLoading ? "Sending..." : "Resend verification email"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!isProd && devOtp && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    Dev OTP: <span className="font-mono font-semibold tracking-widest">{devOtp}</span>
                  </div>
                )}

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Email</span>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none transition focus:border-[#215D63] focus:ring-4 focus:ring-[#215D63]/12 disabled:bg-slate-50 disabled:text-slate-500"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    inputMode="email"
                    disabled={isBusy}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Password</span>
                  <input
                    type="password"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none transition focus:border-[#215D63] focus:ring-4 focus:ring-[#215D63]/12 disabled:bg-slate-50 disabled:text-slate-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    autoComplete="current-password"
                    disabled={isBusy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loginWithPassword();
                    }}
                  />
                </label>

                <label className="flex select-none items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={isBusy}
                    className="h-4 w-4 accent-[#215D63]"
                  />
                  Remember me for 7 days
                </label>

                <div className="space-y-3 pt-1">
                  <button
                    onClick={loginWithPassword}
                    disabled={isBusy}
                    className="w-full rounded-xl bg-[#215D63] py-2.5 font-bold text-white shadow-[0_14px_30px_rgba(33,93,99,0.22)] transition hover:-translate-y-0.5 hover:bg-[#1b5055] hover:shadow-[0_18px_40px_rgba(33,93,99,0.28)] disabled:translate-y-0 disabled:opacity-60"
                    type="button"
                  >
                    {pwLoading ? "Signing in..." : "Sign in with password"}
                  </button>

                  <button
                    onClick={requestOtp}
                    disabled={isBusy || !emailOk}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 font-bold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm disabled:translate-y-0 disabled:opacity-60"
                    title={!emailOk ? "Enter a valid email first" : undefined}
                    type="button"
                  >
                    {otpLoading ? "Requesting OTP..." : "Request OTP instead"}
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs leading-relaxed text-slate-600">
                  OTP emails can take a few minutes. Check spam/promotions if you don’t see it.
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2 shadow-sm">
                <p className="text-sm font-semibold text-slate-700">New to eKasiBooks?</p>
                <button
                  onClick={handleRegisterClick}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-bold text-[#215D63] transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#215D63]/25 active:translate-y-0"
                  type="button"
                >
                  Create account
                </button>
              </div>

              <p className="mt-2 text-center text-[0.68rem] leading-4 text-slate-500">
                By continuing, you agree to our{" "}
                <a
                  href="https://www.ekasibooks.co.za/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#215D63] underline underline-offset-2 hover:text-[#173f45]"
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="https://www.ekasibooks.co.za/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#215D63] underline underline-offset-2 hover:text-[#173f45]"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
