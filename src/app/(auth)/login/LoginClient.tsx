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
    <main className="bg-[#f6f9fb]">
      <div
        className="
          min-h-screen min-h-[100svh] md:min-h-[100dvh]
          overflow-x-hidden
          touch-pan-y
          [overscroll-behavior-y:auto]
          [-webkit-overflow-scrolling:touch]
        "
      >
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-6 sm:px-6 sm:pt-6 sm:pb-8 lg:px-8 lg:py-10">
          <div className="rounded-3xl bg-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="relative bg-gradient-to-br from-[#0b2a3a] via-[#0e3a4f] to-[#215D63] p-6 text-white sm:p-8 lg:p-12">
                <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-black/10 blur-3xl" />

                <div className="relative">
                  <div className="mb-6 flex justify-center">
                    <Image
                      src="/logo/ekasibooks.png"
                      alt="eKasiBooks"
                      width={120}
                      height={120}
                      priority
                      className="h-auto w-[104px] sm:w-[120px]"
                    />
                  </div>

                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      Secure portal access
                    </div>
                  </div>

                  <h1 className="mt-5 text-center text-3xl font-semibold tracking-tight lg:text-4xl">
                    eKasiBooks Portal
                  </h1>

                  <p className="mt-3 text-center leading-relaxed text-white/85">
                    Sign in to manage invoices, customers, and subscription access — with
                    password login or quick OTP when needed.
                  </p>

                  <div className="mt-8 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 sm:mt-10">
                    <p className="text-sm text-white/90">
                      New to eKasiBooks?{" "}
                      <button
                        onClick={handleRegisterClick}
                        className="ml-1 inline-flex items-center font-semibold underline underline-offset-4 hover:text-white"
                        type="button"
                      >
                        Create an account
                      </button>
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 sm:p-8 lg:p-12">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
                  <p className="mt-1 text-slate-600">
                    Enter your email, then choose password login or OTP.
                  </p>
                </div>

                <div className="mt-8 space-y-4">
                  {msg && (
                    <div className={`rounded-xl border px-3 py-2 text-sm ${msgClass(msg)}`}>
                      <div className="flex flex-col gap-2">
                        <div>{msg.text}</div>

                        {needsVerify && (
                          <button
                            type="button"
                            onClick={resendVerification}
                            disabled={resendLoading}
                            className="w-fit rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {resendLoading ? "Sending..." : "Resend verification email"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {!isProd && devOtp && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Dev OTP:{" "}
                      <span className="font-mono font-semibold tracking-widest">{devOtp}</span>
                    </div>
                  )}

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Email</span>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30 disabled:bg-slate-50 disabled:text-slate-500"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      inputMode="email"
                      disabled={isBusy}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Password</span>
                    <input
                      type="password"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30 disabled:bg-slate-50 disabled:text-slate-500"
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

                  <label className="flex select-none items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      disabled={isBusy}
                    />
                    Remember me for 7 days
                  </label>

                  <div className="grid grid-cols-1 gap-3 pt-2">
                    <button
                      onClick={loginWithPassword}
                      disabled={isBusy}
                      className="rounded-xl bg-[#215D63] py-2 font-semibold text-white shadow-sm hover:bg-[#1c4f54] disabled:opacity-60"
                      type="button"
                    >
                      {pwLoading ? "Signing in..." : "Login with password"}
                    </button>

                    <button
                      onClick={requestOtp}
                      disabled={isBusy || !emailOk}
                      className="rounded-xl border border-slate-300 py-2 font-semibold hover:bg-slate-50 disabled:opacity-60"
                      title={!emailOk ? "Enter a valid email first" : undefined}
                      type="button"
                    >
                      {otpLoading ? "Requesting OTP..." : "Request OTP instead"}
                    </button>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-500">
                    OTP emails can sometimes be delayed (up to a few minutes) depending on your
                    inbox provider. Please check spam/promotions if you don’t see it.
                  </p>

                  <p className="text-xs leading-relaxed text-slate-500">
                    Tip: OTP is handy when you don’t want to type your password. Password
                    remains the default.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 px-1 text-center text-xs text-slate-500">
            By continuing, you agree to our Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </main>
  );
}