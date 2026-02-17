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

        // ✅ Auto-redirect to login, then user can continue to dashboard
        setTimeout(() => {
          router.push("/login?next=/dashboard&verified=1");
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
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border bg-white p-8 shadow-sm">
        {state.status === "missing" && (
          <>
            <h1 className="text-2xl font-semibold">Missing token</h1>
            <p className="mt-2 text-slate-600">Your verification link is missing a token.</p>
            <div className="mt-6">
              <Link className="text-teal-700 underline" href="/login">
                Go to login
              </Link>
            </div>
          </>
        )}

        {state.status === "verifying" && (
          <>
            <h1 className="text-2xl font-semibold">Verifying…</h1>
            <p className="mt-2 text-slate-600">Please wait while we verify your email.</p>
          </>
        )}

        {state.status === "success" && (
          <>
            <h1 className="text-2xl font-semibold">Email verified ✅</h1>
            <p className="mt-2 text-slate-600">
              Redirecting you to login…
            </p>
            <div className="mt-6">
              <Link className="text-teal-700 underline" href="/login?next=/dashboard&verified=1">
                Go now
              </Link>
            </div>
          </>
        )}

        {state.status === "error" && (
          <>
            <h1 className="text-2xl font-semibold">Verification failed</h1>
            <p className="mt-2 text-slate-600">{state.message}</p>

            {state.code === "TOKEN_EXPIRED" && state.email && (
              <div className="mt-4">
                <Link className="text-teal-700 underline" href={`/login?email=${encodeURIComponent(state.email)}`}>
                  Resend verification email
                </Link>
              </div>
            )}

            <div className="mt-6 flex gap-4">
              <Link className="text-teal-700 underline" href="/login">
                Go to login
              </Link>
              <Link className="text-teal-700 underline" href="/register">
                Register again
              </Link>
            </div>
          </>
        )}

        {state.status === "idle" && (
          <>
            <h1 className="text-2xl font-semibold">Preparing…</h1>
          </>
        )}
      </div>
    </main>
  );
}
