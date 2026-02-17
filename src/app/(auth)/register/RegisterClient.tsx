"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

type Msg = { type: "success" | "error" | "info"; text: string } | null;

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULE = "Password must be at least 8 characters long and include a capital letter, a number, and a special character";

export default function RegisterPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  }, [sp]);

  const [name, setName] = useState(""); // optional; keep if your API supports it
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);

  const [agree, setAgree] = useState(true); // set false if you want strict checkbox
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

    if (!emailOk) return showError("Please enter a valid email address.");
    if (!password.trim()) return showError("Password is required.");
    if (!PASSWORD_REGEX.test(password))
      return showError(PASSWORD_RULE);
    if (password !== confirm) return showError("Passwords do not match.");
    if (!agree) return showError("Please accept the Terms & Privacy Policy.");

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
          // Keep name optional; remove if your API doesn't accept it
          name: name.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Registration failed");

      setCreated(true);
      setEmailSent(Boolean(data?.emailSent));
      setDevVerifyUrl(typeof data?.dev_verifyUrl === "string" ? data.dev_verifyUrl : null);

      if (data?.emailSent) {
        showSuccess("Account created. We sent you a verification email — please verify your email, then log in.");
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
    if (!e || !e.includes("@")) return showError("Please enter a valid email first.");

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
      if (!res.ok) throw new Error(data?.error || "Failed to resend verification email");

      setEmailSent(Boolean(data?.emailSent));
      setDevVerifyUrl(typeof data?.dev_verifyUrl === "string" ? data.dev_verifyUrl : null);
      showSuccess("Verification email sent. Please check your inbox (and spam/promotions).");
    } catch (e: any) {
      showError(e?.message || "Failed to resend verification email");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f9fb]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:py-14">
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_18px_60px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* LEFT brand panel */}
            <div className="relative p-8 lg:p-12 text-white bg-gradient-to-br from-[#0b2a3a] via-[#0e3a4f] to-[#215D63]">
              <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-black/10 blur-3xl" />

              <div className="relative">
                <div className="flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                    Create your account
                  </div>
                </div>

                <div className="mb-6 mt-5 flex justify-center">
                  <Image
                    src="/logo/ekasibooks.png"
                    alt="eKasiBooks"
                    width={120}
                    height={120}
                    priority
                    className="h-auto w-[120px]"
                  />
                </div>

                <h1 className="text-center text-3xl font-semibold tracking-tight lg:text-4xl">
                  Join eKasiBooks
                </h1>

                <p className="mt-3 text-center text-white/85 leading-relaxed">
                  Set your password once, then sign in with password or OTP whenever
                  you want.
                </p>

                <div className="mt-8 space-y-3 text-sm text-white/90">
                  <BrandFeature
                    title="Secure by design"
                    desc="Sessions, logout, and account access are properly managed."
                  />
                  <BrandFeature
                    title="Password required"
                    desc="Your password is mandatory on registration for trust and security."
                  />
                  <BrandFeature
                    title="OTP is optional"
                    desc="Use OTP when you don’t want to type your password."
                  />
                </div>

                <div className="mt-10 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15">
                  <p className="text-sm text-white/90">
                    Already have an account?{" "}
                    <button
                      onClick={() => router.push("/login")}
                      className="ml-1 inline-flex items-center font-semibold underline underline-offset-4 hover:text-white"
                    >
                      Login
                    </button>
                  </p>
                </div>
              </div>
            </div>

            {/* RIGHT form */}
            <div className="p-8 lg:p-12">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Create account
                </h2>
                <p className="mt-1 text-slate-600">
                  Use your email and set a password to get started.
                </p>
              </div>

              <div className="mt-8 space-y-4">
                {msg && (
                  <div className={`text-sm rounded-xl border px-3 py-2 ${msgClass(msg)}`}>
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
                        <div className="font-semibold text-slate-900">Dev verify link (SMTP not configured):</div>
                        <div className="mt-1 break-all">{devVerifyUrl}</div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const qs = new URLSearchParams({ email: email.trim().toLowerCase(), registered: "1" });
                          router.push(`/login?${qs.toString()}`);
                        }}
                        className="inline-flex items-center justify-center rounded-xl bg-[#215D63] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Go to login
                      </button>
                      <button
                        type="button"
                        onClick={resendVerification}
                        disabled={resendLoading}
                        className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-60"
                      >
                        {resendLoading ? "Sending…" : "Resend verification email"}
                      </button>
                    </div>
                  </div>
                )}

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Full name (optional)
                  </span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30 disabled:bg-slate-50 disabled:text-slate-500"
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
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30 disabled:bg-slate-50 disabled:text-slate-500"
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
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30 disabled:bg-slate-50 disabled:text-slate-500"
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
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#215D63]/30 disabled:bg-slate-50 disabled:text-slate-500"
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

                <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={loading || created}
                  />
                  Remember me for 7 days
                </label>

                <label className="flex items-start gap-2 text-sm text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    disabled={loading || created}
                    className="mt-1"
                  />
                  <span>
                    I agree to the{" "}
                    <span className="font-semibold">Terms</span> &{" "}
                    <span className="font-semibold">Privacy Policy</span>.
                  </span>
                </label>

                <button
                  onClick={() => (!created ? register() : undefined)}
                  disabled={loading || created}
                  className="w-full rounded-xl bg-[#215D63] text-white py-2 font-semibold shadow-sm hover:bg-[#1c4f54] disabled:opacity-60"
                >
                  {created ? "Account created" : loading ? "Creating account..." : "Create account"}
                </button>

                <button
                  onClick={() => router.push("/login")}
                  disabled={loading || created}
                  className="w-full rounded-xl border border-slate-300 py-2 font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  Back to login
                </button>

                <p className="text-xs text-slate-500">
                  You can still use OTP for login later — it’s optional. Your password
                  is the primary credential.
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
      <div className="mt-1 h-5 w-5 shrink-0 rounded-lg bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-white/70" />
      </div>
      <div>
        <div className="font-semibold text-white">{title}</div>
        <div className="text-white/80">{desc}</div>
      </div>
    </div>
  );
}
