"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

type Msg = { type: "success" | "error" | "info"; text: string } | null;

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  const isProd = process.env.NODE_ENV === "production";

  const [email, setEmail] = useState(isProd ? "" : "test@example.com");
  const [password, setPassword] = useState(isProd ? "" : "Password@123");
  const [remember, setRemember] = useState(true);

  const [pwLoading, setPwLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const isBusy = pwLoading || otpLoading;

  const emailOk = useMemo(() => {
    const e = email.trim();
    return e.length >= 5 && e.includes("@") && e.includes(".");
  }, [email]);

  const nextUrl = useMemo(() => {
    const next = params.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  }, [params]);

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
    if (!emailOk) return showError("Please enter a valid email address.");
    if (!password.trim()) return showError("Please enter your password.");

    setPwLoading(true);
    setMsg(null);

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
      if (!res.ok) throw new Error((data as any)?.error || "Login failed");

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
    if (!emailOk) return showError("Please enter a valid email address.");

    setOtpLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || "OTP request failed");

      showSuccess("OTP sent. Redirecting...");
      const qs = new URLSearchParams({
        email: email.trim().toLowerCase(),
        remember: remember ? "1" : "0",
        next: nextUrl,
      });

      router.push(`/otp?${qs.toString()}`);
    } catch (e: any) {
      showError(e?.message || "OTP request failed");
    } finally {
      setOtpLoading(false);
    }
  }

  function handleRegisterClick() {
    router.push("/register");
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
    <div className="min-h-screen bg-[#f6f9fb]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* LEFT: eKasiBooks brand panel */}
            <div className="relative bg-gradient-to-br from-[#0b2a3a] via-[#0e3a4f] to-[#215D63] p-8 text-white lg:p-12">
              {/* Soft highlights */}
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
                    className="h-auto w-[120px]"
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

                <div className="mt-8 space-y-3 text-sm text-white/90">
                  <BrandFeature
                    title="Branded invoicing"
                    desc="Generate professional invoices with your business identity."
                  />
                  <BrandFeature
                    title="Password or OTP"
                    desc="Choose your password, or request a one-time code."
                  />
                  <BrandFeature
                    title="Remember me"
                    desc="Stay signed in for up to 7 days if you want."
                  />
                </div>

                <div className="mt-10 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
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

            {/* RIGHT: Form */}
            <div className="p-8 lg:p-12">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
                  <p className="mt-1 text-slate-600">
                    Enter your email, then choose password login or OTP.
                  </p>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                {msg && (
                  <div className={`rounded-xl border px-3 py-2 text-sm ${msgClass(msg)}`}>
                    {msg.text}
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
                    {otpLoading ? "Sending OTP..." : "Request OTP instead"}
                  </button>
                </div>

                <p className="text-xs text-slate-500">
                  Tip: OTP is handy when you don’t want to type your password. Password
                  remains the default.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

function BrandFeature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
        <span className="h-2 w-2 rounded-full bg-white/70" />
      </div>
      <div>
        <div className="font-semibold text-white">{title}</div>
        <div className="text-white/80">{desc}</div>
      </div>
    </div>
  );
}
