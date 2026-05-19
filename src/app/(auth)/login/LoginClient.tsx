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
    <main className="min-h-screen min-h-[100svh] bg-white">
      <div
        className="
          grid min-h-screen min-h-[100svh] w-full grid-cols-1
          overflow-x-hidden
          touch-pan-y
          [overscroll-behavior-y:auto]
          [-webkit-overflow-scrolling:touch]
          lg:grid-cols-2
        "
      >
        <section className="relative flex min-h-[36svh] items-center overflow-hidden bg-gradient-to-br from-[#071f2d] via-[#0e3a4f] to-[#215D63] px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-12 xl:px-16">
          <div className="pointer-events-none absolute -top-28 -left-28 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-cyan-200/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-black/15 blur-3xl" />

          <div className="relative mx-auto w-full max-w-lg lg:mx-0">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_18px_44px_rgba(0,0,0,0.16)] ring-1 ring-white/20 sm:h-16 sm:w-16">
                <Image
                  src="/logo/ekasibooks.png"
                  alt="eKasiBooks"
                  width={96}
                  height={96}
                  priority
                  className="h-10 w-10 object-contain sm:h-12 sm:w-12"
                />
              </div>

              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Secure portal access
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/60 sm:text-sm">
                  eKasiBooks Portal
                </p>
              </div>
            </div>

            <h1 className="mt-7 max-w-md text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Manage your business access.
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-7 text-white/78 sm:text-base">
              Sign in to manage subscriptions, downloads, cloud sync and account security.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:mt-7">
              <div className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur">
                <p className="text-sm font-semibold text-white">
                  Cloud sync ready
                </p>
                <p className="mt-1 text-sm leading-6 text-white/70">
                  Keep desktop entitlement and company access aligned.
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur">
                <p className="text-sm font-semibold text-white">
                  Quick OTP access
                </p>
                <p className="mt-1 text-sm leading-6 text-white/70">
                  Use password login or request an OTP when convenient.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-white/82">
                  New to eKasiBooks?
                </p>
                <button
                  onClick={handleRegisterClick}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#123b4a] shadow-sm transition hover:-translate-y-0.5 hover:bg-white/92 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white/60 active:translate-y-0"
                  type="button"
                >
                  Create an account
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-[64svh] items-center justify-center bg-[#f6f9fb] px-5 py-8 sm:px-8 lg:min-h-screen lg:px-12 xl:px-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(33,93,99,0.12),transparent_32rem)]" />

          <div className="relative w-full max-w-[460px]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.10)] sm:p-7">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
                  <p className="mt-1 text-slate-600">
                    Enter your email, then choose password login or OTP.
                  </p>
                </div>

                <div className="mt-6 space-y-3.5">
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
                      className="rounded-xl bg-[#215D63] py-2.5 font-semibold text-white shadow-sm hover:bg-[#1c4f54] disabled:opacity-60"
                      type="button"
                    >
                      {pwLoading ? "Signing in..." : "Login with password"}
                    </button>

                    <button
                      onClick={requestOtp}
                      disabled={isBusy || !emailOk}
                      className="rounded-xl border border-slate-300 py-2.5 font-semibold hover:bg-slate-50 disabled:opacity-60"
                      title={!emailOk ? "Enter a valid email first" : undefined}
                      type="button"
                    >
                      {otpLoading ? "Requesting OTP..." : "Request OTP instead"}
                    </button>
                  </div>

                  <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                    OTP emails can take a few minutes. Check spam/promotions if you don’t see it.
                  </p>
                </div>
            </div>

            <p className="mt-6 px-1 text-center text-xs text-slate-500">
              By continuing, you agree to our Terms and Privacy Policy.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}