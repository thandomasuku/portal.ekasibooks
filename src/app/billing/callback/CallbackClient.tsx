"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Entitlement = {
  plan: string;
  status: string;
};

type StepState = "checking" | "active" | "pending" | "unauth" | "error";

export default function BillingCallbackPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const reference = useMemo(() => sp.get("reference") || sp.get("trxref") || sp.get("ref") || "", [sp]);

  const [state, setState] = useState<StepState>("checking");
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function check() {
    setMsg(null);
    const res = await fetch("/api/entitlement", { credentials: "include" });

    if (res.status === 401) {
      setState("unauth");
      return;
    }

    if (!res.ok) {
      setState("error");
      setMsg(`Failed to check entitlement (${res.status}).`);
      return;
    }

    const data = (await res.json()) as any;
    setEnt({ plan: String(data?.plan ?? "FREE"), status: String(data?.status ?? "TRIAL") });

    if (String(data?.plan ?? "FREE").toUpperCase() === "PRO") {
      setState("active");
    } else {
      // Webhook might be delayed (or not live in dev). Keep it friendly.
      setState("pending");
    }
  }

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      setState("checking");
      await check();
      if (cancelled) return;

      // Poll a few times for webhook delays (prod will usually flip quickly)
      intervalId = setInterval(async () => {
        tries += 1;
        if (tries > 10 && intervalId) {
          clearInterval(intervalId);
          return;
        }
        await check();
      }, 3000);
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading =
    state === "active"
      ? "Subscription confirmed"
      : state === "pending"
      ? "Payment received"
      : state === "unauth"
      ? "Login required"
      : state === "error"
      ? "Confirmation issue"
      : "Confirming payment";

  const description =
    state === "active"
      ? "Your portal entitlement is active and ready for the desktop app."
      : state === "pending"
      ? "We are waiting for the final Paystack confirmation to update your entitlement."
      : state === "unauth"
      ? "Your session is no longer active. Log in, then return to Billing."
      : state === "error"
      ? "We could not complete the entitlement check right now."
      : "We are checking your subscription status with the portal.";

  return (
    <main className="min-h-screen bg-[#f3f7fa] text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative overflow-hidden bg-[#102538] px-6 py-10 text-white sm:px-10 lg:flex lg:min-h-screen lg:items-center lg:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(20,184,166,0.18),transparent_34%)]" />
          <div className="absolute -left-24 top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute bottom-16 right-8 h-72 w-72 rounded-full bg-teal-300/10 blur-3xl" />

          <div className="relative z-10 mx-auto w-full max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
              eKasiBooks Portal
            </div>

            <h1 className="mt-8 max-w-lg text-4xl font-bold tracking-tight sm:text-5xl">
              Secure payment confirmation.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-slate-200">
              We are confirming your Paystack payment and updating your portal access. This page
              may refresh your entitlement a few times while the webhook finishes processing.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <InfoTile label="Payment provider" value="Paystack" />
              <InfoTile label="Portal area" value="Billing" />
              <InfoTile label="Status check" value="Automatic" />
              <InfoTile label="Next step" value={state === "active" ? "Use PRO" : "Return to billing"} />
            </div>

            <p className="mt-10 text-sm leading-6 text-slate-300">
              You can safely return to Billing if confirmation takes longer than expected. Your
              payment reference is kept on the transaction for follow-up.
            </p>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => router.push("/billing")}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <span aria-hidden="true">←</span>
                Back to billing
              </button>

              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                Payment
              </span>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] sm:p-8">
              <StatusMark state={state} />

              <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-950">{heading}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

              {reference ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Paystack reference
                  </div>
                  <div className="mt-2 break-all rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                    {reference}
                  </div>
                </div>
              ) : null}

              <div className="mt-6">
                {state === "checking" ? (
                  <Banner tone="info" title="Checking entitlement…">
                    This usually takes a few seconds. Keep this page open while we refresh your portal status.
                  </Banner>
                ) : state === "active" ? (
                  <Banner tone="success" title="Subscription active">
                    Your plan is now <b>PRO</b>. You can continue using the full app.
                  </Banner>
                ) : state === "pending" ? (
                  <Banner tone="warn" title="Payment received, confirming…">
                    The payment may already be successful, but the portal is still waiting for the final
                    confirmation. Refresh status, or return to Billing and check again shortly.
                  </Banner>
                ) : state === "unauth" ? (
                  <Banner tone="warn" title="Please log in">
                    Your session is not active. Log in and then come back to Billing.
                  </Banner>
                ) : (
                  <Banner tone="error" title="Couldn’t confirm subscription">
                    {msg ?? "Something went wrong. Please try again."}
                  </Banner>
                )}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => check()}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Refresh status
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/billing")}
                  className="rounded-2xl bg-[#215D63] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c4f54]"
                >
                  Back to billing
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Dashboard
                </button>
              </div>

              {ent ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Current entitlement: <b className="text-slate-900">{ent.plan}</b>{" "}
                  <span className="text-slate-400">/</span>{" "}
                  <b className="text-slate-900">{ent.status}</b>
                </div>
              ) : null}
            </div>

            <p className="mt-8 text-center text-xs text-slate-400">
              eKasiBooks Portal · Secure billing confirmation
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusMark({ state }: { state: StepState }) {
  const cls =
    state === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : state === "pending" || state === "unauth"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : state === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-cyan-200 bg-cyan-50 text-cyan-700";

  const symbol = state === "active" ? "✓" : state === "error" ? "!" : state === "checking" ? "…" : "i";

  return (
    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl font-bold ${cls}`}>
      {symbol}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "info" | "success" | "warn" | "error";
  title: string;
  children: ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-cyan-200 bg-cyan-50 text-cyan-950";

  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm leading-6 opacity-90">{children}</div>
    </div>
  );
}
