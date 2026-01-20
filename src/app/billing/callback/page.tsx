"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

    (async () => {
      setState("checking");
      await check();
      if (cancelled) return;

      // Poll a few times for webhook delays (prod will usually flip quickly)
      const id = setInterval(async () => {
        tries += 1;
        if (tries > 10) {
          clearInterval(id);
          return;
        }
        await check();
      }, 3000);

      return () => clearInterval(id);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f9fb] p-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl bg-white p-8 shadow ring-1 ring-slate-200">
          <h1 className="text-2xl font-semibold text-slate-900">Payment status</h1>
          <p className="mt-2 text-slate-600">
            We’re confirming your subscription with Paystack.
          </p>

          {reference ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-xs font-medium text-slate-500">Reference</div>
              <div className="mt-1 break-all text-sm font-semibold text-slate-900">{reference}</div>
            </div>
          ) : null}

          <div className="mt-6">
            {state === "checking" ? (
              <Banner tone="info" title="Checking entitlement…">
                This usually takes a few seconds.
              </Banner>
            ) : state === "active" ? (
              <Banner tone="success" title="Subscription active ✅">
                Your plan is now <b>PRO</b>. You can continue using the full app.
              </Banner>
            ) : state === "pending" ? (
              <Banner tone="warn" title="Payment received, confirming…">
                If webhooks aren’t live yet (dev), confirmation may not update immediately.
                You can refresh status, or return to Billing and try again later.
              </Banner>
            ) : state === "unauth" ? (
              <Banner tone="warn" title="Please log in">
                Your session isn’t active. Log in and then come back to Billing.
              </Banner>
            ) : (
              <Banner tone="error" title="Couldn’t confirm subscription">
                {msg ?? "Something went wrong. Please try again."}
              </Banner>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => check()}
              className="rounded-xl border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50"
            >
              Refresh status
            </button>

            <button
              onClick={() => router.push("/billing")}
              className="rounded-xl bg-[#215D63] px-4 py-2 font-semibold text-white hover:bg-[#1c4f54]"
            >
              Back to billing
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-xl border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50"
            >
              Go to dashboard
            </button>
          </div>

          {ent ? (
            <p className="mt-5 text-xs text-slate-500">
              Current entitlement: <b>{ent.plan}</b> ({ent.status})
            </p>
          ) : null}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">eKasiBooks Portal</p>
      </div>
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
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-slate-200 bg-slate-50 text-slate-900";

  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm opacity-90">{children}</div>
    </div>
  );
}
