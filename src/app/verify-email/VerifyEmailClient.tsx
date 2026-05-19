"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

type VerifyState =
  | { status: "idle" }
  | { status: "missing" }
  | { status: "verifying" }
  | { status: "success" }
  | { status: "error"; message: string; code?: string; email?: string };

function StatusIcon({ tone }: { tone: "loading" | "success" | "error" | "missing" }) {
  const common =
    "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl shadow-sm";

  if (tone === "success") {
    return (
      <div className={`${common} border-emerald-200 bg-emerald-50 text-emerald-700`}>
        ✓
      </div>
    );
  }

  if (tone === "error") {
    return (
      <div className={`${common} border-rose-200 bg-rose-50 text-rose-700`}>
        !
      </div>
    );
  }

  if (tone === "missing") {
    return (
      <div className={`${common} border-amber-200 bg-amber-50 text-amber-700`}>
        ?
      </div>
    );
  }

  return (
    <div className={`${common} border-teal-200 bg-teal-50 text-teal-700`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700" />
    </div>
  );
}

function AuthBrandPanel() {
  return (
    <section className="relative flex min-h-[42vh] overflow-hidden bg-[#103847] px-6 py-10 text-white lg:min-h-screen lg:px-12 xl:px-20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.10),transparent_28%),radial-gradient(circle_at_78%_76%,rgba(76,197,178,0.30),transparent_34%),linear-gradient(135deg,#0b2f42_0%,#123f4d_48%,#1e6868_100%)]" />
      <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-teal-300/10 blur-3xl" />

      <div className="relative z-10 flex w-full max-w-3xl flex-col justify-center">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-2xl shadow-black/20 ring-1 ring-white/30">
            <div className="flex gap-1 text-[#243f96]">
              <span className="grid h-10 w-7 place-items-center rounded-md border-2 border-current text-lg font-semibold">
                e
              </span>
              <span className="grid h-10 w-7 place-items-center rounded-md border-2 border-current text-lg font-semibold">
                K
              </span>
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Email verification
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.38em] text-white/70">
              eKasiBooks Portal
            </p>
          </div>
        </div>

        <div className="mt-12 max-w-2xl">
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl xl:text-6xl">
            Secure your portal access.
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/86 sm:text-lg">
            Verify your email address to activate your account, manage subscriptions,
            download the desktop app and keep cloud sync access protected.
          </p>
        </div>

        <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-sm backdrop-blur">
            <p className="text-sm font-bold">Account protection</p>
            <p className="mt-2 text-sm leading-6 text-white/74">
              Email verification helps keep access and subscription changes secure.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-sm backdrop-blur">
            <p className="text-sm font-bold">Portal ready</p>
            <p className="mt-2 text-sm leading-6 text-white/74">
              Once verified, you can continue to your account and billing area.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-semibold text-white/90 backdrop-blur">
          Need to sign in instead?{" "}
          <Link className="font-black underline underline-offset-4" href="/login">
            Go to login
          </Link>
        </div>
      </div>
    </section>
  );
}

function VerifyCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex min-h-[58vh] items-center justify-center bg-slate-50 px-6 py-10 lg:min-h-screen lg:px-10">
      <div className="w-full max-w-xl">
        <div className="rounded-[2rem] border border-slate-200/80 bg-white p-8 shadow-2xl shadow-slate-900/10 sm:p-10">
          {children}
        </div>

        <p className="mt-8 text-center text-xs leading-6 text-slate-500">
          By continuing, you agree to our{" "}
          <Link className="text-slate-700 underline underline-offset-4" href="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="text-slate-700 underline underline-offset-4" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

export default function VerifyEmailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);

  const [state, setState] = useState<VerifyState>({ status: "idle" });

  useEffect(() => {
    if (!token) {
      setState({ status: "missing" });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setState({ status: "verifying" });

        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setState({
            status: "error",
            message: data?.error || data?.message || "Verification failed.",
            code: data?.code,
            email: data?.email,
          });
          return;
        }

        setState({ status: "success" });

        const redirectTo =
          typeof data?.redirectTo === "string" && data.redirectTo.startsWith("/")
            ? data.redirectTo
            : "/billing";

        setTimeout(() => {
          router.push(redirectTo);
        }, 1200);
      } catch {
        if (cancelled) return;
        setState({ status: "error", message: "Verification failed. Please try again." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <AuthBrandPanel />

      <VerifyCard>
        {state.status === "missing" && (
          <div className="text-center">
            <StatusIcon tone="missing" />
            <p className="mt-7 text-xs font-black uppercase tracking-[0.35em] text-teal-700">
              Missing link
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Missing verification token
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">
              This verification link is missing the token we need to activate your email address.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[#1f6b6d] px-5 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition hover:bg-[#18585a]"
                href="/login"
              >
                Go to login
              </Link>
              <Link
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-900 transition hover:bg-slate-50"
                href="/register"
              >
                Create account
              </Link>
            </div>
          </div>
        )}

        {state.status === "verifying" && (
          <div className="text-center">
            <StatusIcon tone="loading" />
            <p className="mt-7 text-xs font-black uppercase tracking-[0.35em] text-teal-700">
              Please wait
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Verifying your email
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">
              We are checking your verification link and preparing your portal access.
            </p>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left text-sm leading-6 text-slate-600">
              This should only take a moment. Please keep this page open while we confirm your account.
            </div>
          </div>
        )}

        {state.status === "success" && (
          <div className="text-center">
            <StatusIcon tone="success" />
            <p className="mt-7 text-xs font-black uppercase tracking-[0.35em] text-teal-700">
              Verified
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Email verified
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">
              Your email address has been verified. Redirecting you to your account now.
            </p>

            <div className="mt-8">
              <Link
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1f6b6d] px-5 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition hover:bg-[#18585a]"
                href="/billing"
              >
                Continue now
              </Link>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="text-center">
            <StatusIcon tone="error" />
            <p className="mt-7 text-xs font-black uppercase tracking-[0.35em] text-rose-700">
              Verification failed
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              We could not verify this link
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">
              {state.message}
            </p>

            {state.code === "TOKEN_EXPIRED" && state.email && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left text-sm leading-6 text-amber-900">
                This verification link has expired. Return to login with your email address and request a new verification email.
              </div>
            )}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Link
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[#1f6b6d] px-5 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition hover:bg-[#18585a]"
                href={
                  state.code === "TOKEN_EXPIRED" && state.email
                    ? `/login?email=${encodeURIComponent(state.email)}`
                    : "/login"
                }
              >
                {state.code === "TOKEN_EXPIRED" && state.email
                  ? "Resend email"
                  : "Go to login"}
              </Link>
              <Link
                className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-900 transition hover:bg-slate-50"
                href="/register"
              >
                Register again
              </Link>
            </div>
          </div>
        )}

        {state.status === "idle" && (
          <div className="text-center">
            <StatusIcon tone="loading" />
            <p className="mt-7 text-xs font-black uppercase tracking-[0.35em] text-teal-700">
              Preparing
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Preparing verification
            </h1>
          </div>
        )}
      </VerifyCard>
    </main>
  );
}
