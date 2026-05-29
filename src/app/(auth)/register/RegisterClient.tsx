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
    const raw = String(sp.get("plan") ?? "")
      .toLowerCase()
      .trim();
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
      setDevVerifyUrl(
        typeof data?.dev_verifyUrl === "string" ? data.dev_verifyUrl : null,
      );

      if (data?.emailSent) {
        showSuccess(
          "Account created. We sent you a verification email — please verify your email, then log in.",
        );
      } else {
        showSuccess(
          "Account created. Please verify your email before logging in. If you don’t receive an email, click ‘Resend verification email’.",
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
      setDevVerifyUrl(
        typeof data?.dev_verifyUrl === "string" ? data.dev_verifyUrl : null,
      );
      showSuccess(
        "Verification email sent. Please check your inbox (and spam/promotions).",
      );
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
    <main className="min-h-screen min-h-[100svh] overflow-hidden bg-[#eef6f7] text-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-28 h-[34rem] w-[48rem] rotate-[-35deg] rounded-[5rem] bg-[#073340]" />
        <div className="absolute left-[38%] top-0 h-44 w-[30rem] skew-x-[-35deg] bg-[#0f4a55] opacity-95" />
        <div className="absolute right-0 top-0 h-[30rem] w-[34rem] rounded-bl-[12rem] bg-[radial-gradient(circle_at_top_right,rgba(33,93,99,0.18),transparent_70%)]" />
        <div className="absolute bottom-[-12rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-[#215D63]/10 blur-3xl" />
      </div>

      <section className="relative flex min-h-screen min-h-[100svh] items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
        <div className="grid w-full max-w-[1200px] overflow-hidden rounded-[2rem] border border-white/45 bg-white/86 shadow-[0_28px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#073340] via-[#164e59] to-[#277077] px-6 py-6 text-white sm:px-8 lg:min-h-[600px] lg:px-10 lg:py-8">
            <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 right-[-9rem] h-[28rem] w-[28rem] rounded-full bg-white/10" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-52 w-52 rounded-tl-[10rem] bg-black/10" />

            <div className="relative flex h-full flex-col justify-between gap-7">
              <div>
                <div className="inline-flex items-center gap-4 rounded-[1.4rem] border border-white/16 bg-white/10 p-2.5 pr-5 shadow-[0_18px_44px_rgba(0,0,0,0.18)] backdrop-blur">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_18px_44px_rgba(0,0,0,0.16)] ring-1 ring-white/25">
                    <Image
                      src="/logo/ekasibooks.png"
                      alt="eKasiBooks"
                      width={96}
                      height={96}
                      priority
                      className="h-10 w-10 object-contain"
                    />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50 ring-1 ring-white/16">
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      Secure portal access
                    </div>
                    <p className="mt-2 text-sm font-bold uppercase tracking-[0.3em] text-white/72">
                      eKasiBooks Portal
                    </p>
                  </div>
                </div>

                <div className="mt-8 max-w-[620px]">
                  <p className="inline-flex rounded-full bg-white/12 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-50 ring-1 ring-white/15">
                    Business access workspace
                  </p>
                  <h1 className="mt-4 text-4xl font-black leading-[0.98] tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.8rem]">
                    Create your business access.
                  </h1>
                  <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-white/76 sm:text-base">
                    Register your portal account to manage subscriptions,
                    downloads, cloud sync and account security from one
                    controlled workspace.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <BrandFeature
                  title="Portal access"
                  desc="Create your account and verify your email before signing in."
                />
                <BrandFeature
                  title="Downloads"
                  desc="Access installers and updates for your business tools."
                />
                <BrandFeature
                  title="Cloud sync"
                  desc="Keep desktop entitlement and company access aligned."
                />
              </div>
            </div>
          </div>

          <div className="relative bg-white px-6 py-6 sm:px-8 lg:px-9 lg:py-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(33,93,99,0.10),transparent_24rem)]" />
            <div className="relative flex min-h-full flex-col justify-center">
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="rounded-full bg-[#e8f7f5] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#215D63]">
                  Get started
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                  Secure access
                </span>
              </div>

              <div>
                <h2 className="text-2xl font-black tracking-[-0.04em] text-slate-950">
                  Create account
                </h2>
                <p className="mt-1.5 max-w-sm text-sm leading-5 text-slate-600">
                  Use your email and password to create your eKasiBooks portal
                  account.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {msg && (
                  <div
                    className={`rounded-xl border px-3 py-2.5 text-sm ${msgClass(msg)}`}
                  >
                    {msg.text}
                  </div>
                )}

                {created && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                    <div className="font-semibold">
                      Almost there — verify your email
                    </div>
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
                        {resendLoading
                          ? "Sending..."
                          : "Resend verification email"}
                      </button>
                    </div>
                  </div>
                )}

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Full name
                  </span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#215D63] focus:ring-4 focus:ring-[#215D63]/12 disabled:bg-slate-50 disabled:text-slate-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    autoComplete="name"
                    disabled={loading || created}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Email
                  </span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#215D63] focus:ring-4 focus:ring-[#215D63]/12 disabled:bg-slate-50 disabled:text-slate-500"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    inputMode="email"
                    disabled={loading || created}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Password
                  </span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#215D63] focus:ring-4 focus:ring-[#215D63]/12 disabled:bg-slate-50 disabled:text-slate-500"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    disabled={loading || created}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#215D63] focus:ring-4 focus:ring-[#215D63]/12 disabled:bg-slate-50 disabled:text-slate-500"
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

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  {PASSWORD_RULE}.
                </div>

                <label className="flex select-none items-center gap-2 text-sm font-medium text-slate-700">
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

                <div className="space-y-3 pt-1">
                  <button
                    onClick={() => (!created ? register() : undefined)}
                    disabled={loading || created}
                    className="w-full rounded-xl bg-[#215D63] py-2.5 font-bold text-white shadow-[0_14px_30px_rgba(33,93,99,0.24)] transition hover:-translate-y-0.5 hover:bg-[#1b5055] hover:shadow-[0_18px_40px_rgba(33,93,99,0.30)] disabled:translate-y-0 disabled:opacity-60"
                    type="button"
                  >
                    {created
                      ? "Account created"
                      : loading
                        ? "Creating account..."
                        : "Create account"}
                  </button>

                  <button
                    onClick={handleLoginClick}
                    disabled={loading || created}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 font-bold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-sm disabled:translate-y-0 disabled:opacity-60"
                    type="button"
                  >
                    Back to login
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  After registering, verify your email before signing in. OTP
                  remains available later for quick sign-ins when needed.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandFeature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur">
      <p className="font-bold text-white">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-white/70">{desc}</p>
    </div>
  );
}
