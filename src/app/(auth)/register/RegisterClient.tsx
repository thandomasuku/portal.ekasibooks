"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

type Msg = { type: "success" | "error" | "info"; text: string } | null;

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULE =
  "Password must be at least 8 characters long and include a capital letter, a number, and a special character";

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

export default function RegisterPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/billing";
  }, [sp]);

  const planParam = useMemo(() => {
    const raw = String(sp.get("plan") ?? "").toLowerCase().trim();
    if (raw === "growth") return "growth";
    if (raw === "pro") return "pro";
    if (raw === "trial") return "trial";
    return "starter";
  }, [sp]);

  const loginHref = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("next", nextUrl);
    if (planParam) qs.set("plan", planParam);
    return `/login?${qs.toString()}`;
  }, [nextUrl, planParam]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);

  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [created, setCreated] = useState(false);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

  const emailOk = useMemo(() => {
    const e = email.trim();
    return e.length >= 5 && e.includes("@") && e.includes(".");
  }, [email]);

  useEffect(() => {
    trackAnalytics("register_page_view", {
      page: "/register",
      next_url: nextUrl,
      plan: planParam,
    });
  }, [nextUrl, planParam]);

  function showError(text: string) {
    setMsg({ type: "error", text });
  }

  function showSuccess(text: string) {
    setMsg({ type: "success", text });
  }

  const msgClass = (m: Msg) =>
    !m
      ? ""
      : m.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : m.type === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-sky-50 border-sky-200 text-sky-800";

  async function register() {
    if (loading) return;

    setMsg(null);
    setDevVerifyUrl(null);
    setEmailSent(null);

    if (!name.trim()) {
      await trackAnalytics("register_validation_failed", {
        reason: "missing_name",
        next_url: nextUrl,
        plan: planParam,
      });
      return showError("Please enter your full name.");
    }

    if (!emailOk) {
      await trackAnalytics("register_validation_failed", {
        reason: "invalid_email",
        next_url: nextUrl,
        plan: planParam,
      });
      return showError("Please enter a valid email address.");
    }

    if (!password.trim()) {
      await trackAnalytics("register_validation_failed", {
        reason: "missing_password",
        next_url: nextUrl,
        plan: planParam,
      });
      return showError("Password is required.");
    }

    if (!PASSWORD_REGEX.test(password)) {
      await trackAnalytics("register_validation_failed", {
        reason: "weak_password",
        next_url: nextUrl,
        plan: planParam,
      });
      return showError(PASSWORD_RULE);
    }

    if (password !== confirm) {
      await trackAnalytics("register_validation_failed", {
        reason: "password_mismatch",
        next_url: nextUrl,
        plan: planParam,
      });
      return showError("Passwords do not match.");
    }

    if (!agree) {
      await trackAnalytics("register_validation_failed", {
        reason: "terms_not_accepted",
        next_url: nextUrl,
        plan: planParam,
      });
      return showError("Please accept the Terms & Privacy Policy.");
    }

    await trackAnalytics("register_attempt", {
      next_url: nextUrl,
      plan: planParam,
      remember,
    });

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          remember,
          name: name.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await trackAnalytics("register_failed", {
          reason: data?.error || `http_${res.status}`,
          next_url: nextUrl,
          plan: planParam,
        });
        throw new Error(data?.error || "Registration failed");
      }

      await trackAnalytics("register_success", {
        email_sent: Boolean(data?.emailSent),
        next_url: nextUrl,
        plan: planParam,
      });

      setCreated(true);
      setEmailSent(Boolean(data?.emailSent));
      setDevVerifyUrl(typeof data?.dev_verifyUrl === "string" ? data.dev_verifyUrl : null);

      if (data?.emailSent) {
        showSuccess(
          "Account created. We sent you a verification email — please verify your email, then log in."
        );
      } else {
        showSuccess(
          "Account created. Please verify your email before logging in. If you don’t receive an email, click ‘Resend verification email’."
        );
      }
    } catch (e: any) {
      showError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (resendLoading) return;
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) {
      await trackAnalytics("register_resend_validation_failed", {
        reason: "invalid_email",
        next_url: nextUrl,
        plan: planParam,
      });
      return showError("Please enter a valid email first.");
    }

    await trackAnalytics("register_resend_attempt", {
      next_url: nextUrl,
      plan: planParam,
    });

    setResendLoading(true);
    setMsg(null);
    setDevVerifyUrl(null);

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await trackAnalytics("register_resend_failed", {
          reason: data?.error || `http_${res.status}`,
          next_url: nextUrl,
          plan: planParam,
        });
        throw new Error(data?.error || "Failed to resend verification email");
      }

      await trackAnalytics("register_resend_success", {
        next_url: nextUrl,
        plan: planParam,
      });

      setEmailSent(Boolean(data?.emailSent));
      setDevVerifyUrl(typeof data?.dev_verifyUrl === "string" ? data.dev_verifyUrl : null);
      showSuccess("Verification email sent. Please check your inbox (and spam/promotions).");
    } catch (e: any) {
      showError(e?.message || "Failed to resend verification email");
    } finally {
      setResendLoading(false);
    }
  }

async function handleLoginClick() {
  await trackAnalytics("register_login_click", {
    next_url: nextUrl,
    plan: planParam,
  });
  router.push(loginHref);
}

  async function handleGoToLoginAfterRegister() {
  const qs = new URLSearchParams();
  qs.set("email", email.trim().toLowerCase());
  qs.set("registered", "1");
  qs.set("next", nextUrl);
  if (planParam) qs.set("plan", planParam);

  const destination = `/login?${qs.toString()}`;

  await trackAnalytics("register_go_to_login_click", {
    next_url: nextUrl,
    plan: planParam,
    registered: true,
  });

  router.push(destination);
}
  return (
    <main className="min-h-screen bg-[#f6f9fb] text-slate-950">
      <div className="grid min-h-screen min-h-[100svh] grid-cols-1 overflow-x-hidden lg:grid-cols-2">
        {/* LEFT brand panel */}
        <section className="relative flex min-h-[36svh] items-center overflow-hidden bg-gradient-to-br from-[#0b2a3a] via-[#0e3a4f] to-[#215D63] px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:px-12 xl:px-16">
          <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-1/4 right-[-8rem] h-96 w-96 rounded-full bg-[#3bb7a6]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-black/15 blur-3xl" />

          <div className="relative mx-auto w-full max-w-lg lg:mx-0">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_16px_45px_rgba(0,0,0,0.16)] ring-1 ring-white/30">
                <Image
                  src="/logo/ekasibooks.png"
                  alt="eKasiBooks"
                  width={76}
                  height={76}
                  priority
                  className="h-auto w-[50px]"
                />
              </div>

              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/15">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Create your account
                </div>
                <div className="text-xs font-semibold uppercase tracking-[0.34em] text-white/70">
                  eKasiBooks Portal
                </div>
              </div>
            </div>

            <h1 className="mt-7 max-w-md text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
              Create your portal account.
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-7 text-white/80 sm:text-base">
              Manage subscriptions, company access, downloads and cloud sync from one secure place.
            </p>

            <div className="mt-7 grid max-w-lg gap-3 sm:grid-cols-2">
              <BrandFeature
                title="Secure access"
                desc="Password login, OTP and account security are managed in one place."
              />
              <BrandFeature
                title="Portal ready"
                desc="Manage subscriptions, downloads and cloud sync access."
              />
            </div>

            <div className="mt-6 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-white/82">Already have an account?</p>
                <button
                  onClick={handleLoginClick}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#123b4a] shadow-sm transition hover:-translate-y-0.5 hover:bg-white/92 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white/60 active:translate-y-0"
                  type="button"
                >
                  Back to login
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT form panel */}
        <section className="relative flex min-h-[64svh] items-center justify-center bg-[#f6f9fb] px-5 py-8 sm:px-8 lg:min-h-screen lg:px-12">
          <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#215D63]/10 blur-3xl" />

          <div className="relative w-full max-w-[560px]">
            <div className="rounded-[1.75rem] bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.10)] ring-1 ring-slate-200 sm:p-7">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#215D63]">
                  Get started
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  Create account
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Use your email and password to get started.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {msg && (
                  <div className={`rounded-xl border px-3 py-2 text-sm ${msgClass(msg)}`}>
                    {msg.text}
                  </div>
                )}

                {created && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                    <div className="font-semibold">Almost there — verify your email</div>
                    <div className="mt-1 text-sm text-emerald-900/80">
                      We require email verification before login.
                      {emailSent
                        ? " Check your inbox (and spam/promotions)."
                        : " If you don’t receive an email, click ‘Resend verification email’."}
                    </div>

                    {devVerifyUrl && (
                      <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs text-slate-800 ring-1 ring-emerald-200">
                        <div className="font-semibold text-slate-900">
                          Dev verify link (SMTP not configured):
                        </div>
                        <div className="mt-1 break-all">{devVerifyUrl}</div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleGoToLoginAfterRegister}
                        className="inline-flex items-center justify-center rounded-xl bg-[#215D63] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1c4f54]"
                      >
                        Go to login
                      </button>

                      <button
                        type="button"
                        onClick={resendVerification}
                        disabled={resendLoading}
                        className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60"
                      >
                        {resendLoading ? "Sending..." : "Resend verification email"}
                      </button>
                    </div>
                  </div>
                )}

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Full name (required)
                  </span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#215D63] focus:ring-2 focus:ring-[#215D63]/20 disabled:bg-slate-50 disabled:text-slate-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Syrus Example"
                    autoComplete="name"
                    disabled={loading || created}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#215D63] focus:ring-2 focus:ring-[#215D63]/20 disabled:bg-slate-50 disabled:text-slate-500"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    inputMode="email"
                    disabled={loading || created}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Password</span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#215D63] focus:ring-2 focus:ring-[#215D63]/20 disabled:bg-slate-50 disabled:text-slate-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    disabled={loading || created}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#215D63] focus:ring-2 focus:ring-[#215D63]/20 disabled:bg-slate-50 disabled:text-slate-500"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-type your password"
                    autoComplete="new-password"
                    disabled={loading || created}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !created) register();
                    }}
                  />
                </label>

                <label className="flex select-none items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={loading || created}
                    className="h-4 w-4 accent-[#215D63]"
                  />
                  Remember me for 7 days
                </label>

                <label className="flex select-none items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    disabled={loading || created}
                    className="mt-1 h-4 w-4 accent-[#215D63]"
                  />
                  <span>
                    I agree to the{" "}
                    <a
                      href="https://www.ekasibooks.co.za/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#215D63] underline underline-offset-2 transition hover:text-[#163f43] focus:outline-none focus:ring-2 focus:ring-[#215D63]/25"
                    >
                      Terms
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://www.ekasibooks.co.za/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#215D63] underline underline-offset-2 transition hover:text-[#163f43] focus:outline-none focus:ring-2 focus:ring-[#215D63]/25"
                    >
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>

                <button
                  onClick={() => (!created ? register() : undefined)}
                  disabled={loading || created}
                  className="w-full rounded-xl bg-[#215D63] py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#1c4f54] disabled:opacity-60"
                  type="button"
                >
                  {created ? "Account created" : loading ? "Creating account..." : "Create account"}
                </button>

                <button
                  onClick={handleLoginClick}
                  disabled={loading || created}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                  type="button"
                >
                  Back to login
                </button>

                <p className="text-xs leading-relaxed text-slate-500">
                  OTP remains available later for quick sign-ins when needed.
                </p>
              </div>
            </div>

            <p className="mt-6 px-1 text-center text-xs text-slate-500">
              By continuing, you agree to our{" "}
              <a
                href="https://www.ekasibooks.co.za/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#215D63] underline underline-offset-2 hover:text-[#163f43]"
              >
                Terms
              </a>{" "}
              and{" "}
              <a
                href="https://www.ekasibooks.co.za/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#215D63] underline underline-offset-2 hover:text-[#163f43]"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function BrandFeature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/15 backdrop-blur">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-6 text-white/70">{desc}</div>
    </div>
  );
}