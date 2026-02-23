// src/app/api/billing/verify/route.ts
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE = "https://api.paystack.co";

// Legacy single-plan env (backwards compatible)
const LEGACY_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";
const LEGACY_AMOUNT_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO || "0");

// New multi-cycle env (recommended)
const PLAN_CODE_MONTHLY = process.env.PAYSTACK_PLAN_CODE_MONTHLY || "";
const PLAN_CODE_ANNUAL = process.env.PAYSTACK_PLAN_CODE_ANNUAL || "";
const AMOUNT_KOBO_MONTHLY = Number(process.env.PAYSTACK_AMOUNT_KOBO_MONTHLY || "19900"); // R199
const AMOUNT_KOBO_ANNUAL = Number(process.env.PAYSTACK_AMOUNT_KOBO_ANNUAL || "214900"); // R2149

// Fallback amounts (lowest denomination).
const FALLBACK_MONTHLY_AMOUNT = 19900;
const FALLBACK_ANNUAL_AMOUNT = 214900;

// If Paystack doesn’t return next_payment_date (rare), use a sensible fallback.
const DEFAULT_PRO_PERIOD_DAYS_MONTHLY = Number(process.env.PRO_PERIOD_DAYS || "30");
const DEFAULT_PRO_PERIOD_DAYS_ANNUAL = Number(process.env.PRO_PERIOD_DAYS_ANNUAL || "365");

type PaystackResponse<T> = {
  status: boolean;
  message?: string;
  data?: T;
};

type PaystackCustomer = {
  id: number;
  email: string;
  customer_code: string;
};

type PaystackSubscription = {
  id: number;
  status: string;
  subscription_code: string;
  next_payment_date?: string | null;
  plan?: {
    plan_code: string;
  };
};

function toLowerEmail(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function safeDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function lower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

async function paystackGet<T>(path: string): Promise<PaystackResponse<T>> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as PaystackResponse<T> | null;

  if (!res.ok || !json?.status) {
    const msg =
      (json as any)?.message ||
      (json as any)?.error ||
      `Paystack request failed (${res.status}).`;
    throw new Error(msg);
  }

  return json;
}

function pickManageableSubscription(list: PaystackSubscription[]): PaystackSubscription | null {
  if (!Array.isArray(list) || list.length === 0) return null;

  const active = list.find((s) => lower(s?.status) === "active");
  if (active) return active;

  const fallbacks = new Set(["trialing", "non-renewing", "paused", "attention"]);
  const fb = list.find((s) => fallbacks.has(lower(s?.status)));
  return fb ?? list[0] ?? null;
}

function inferCycle(planCode?: string | null, amountKobo?: number | null): "monthly" | "annual" {
  const pc = safeTrim(planCode);

  // Prefer explicit plan code match (best signal)
  if (pc && PLAN_CODE_ANNUAL && pc === PLAN_CODE_ANNUAL) return "annual";
  if (pc && PLAN_CODE_MONTHLY && pc === PLAN_CODE_MONTHLY) return "monthly";

  // Fallback: amount match (useful if plan codes are missing)
  if (typeof amountKobo === "number" && amountKobo > 0) {
    if (AMOUNT_KOBO_ANNUAL > 0 && amountKobo === AMOUNT_KOBO_ANNUAL) return "annual";
    if (AMOUNT_KOBO_MONTHLY > 0 && amountKobo === AMOUNT_KOBO_MONTHLY) return "monthly";
    if (LEGACY_AMOUNT_KOBO > 0 && amountKobo === LEGACY_AMOUNT_KOBO) return "monthly";
    if (amountKobo === FALLBACK_ANNUAL_AMOUNT) return "annual";
    if (amountKobo === FALLBACK_MONTHLY_AMOUNT) return "monthly";
  }

  // Default
  return "monthly";
}

function expectedAmountKobo(cycle: "monthly" | "annual") {
  const monthly = AMOUNT_KOBO_MONTHLY > 0 ? AMOUNT_KOBO_MONTHLY : FALLBACK_MONTHLY_AMOUNT;
  const annual = AMOUNT_KOBO_ANNUAL > 0 ? AMOUNT_KOBO_ANNUAL : FALLBACK_ANNUAL_AMOUNT;
  return cycle === "annual" ? annual : monthly;
}

function validatePaymentSignals(opts: { planCode?: string | null; amountKobo?: number | null }) {
  const planCode = safeTrim(opts.planCode);
  const amountKobo = typeof opts.amountKobo === "number" ? opts.amountKobo : null;

  const allowedPlans = new Set(
    [PLAN_CODE_MONTHLY, PLAN_CODE_ANNUAL, LEGACY_PLAN_CODE].map(safeTrim).filter(Boolean)
  );

  // 1) If we have a plan code, it must be one of ours.
  if (planCode) {
    if (!allowedPlans.has(planCode)) {
      return { ok: false as const, reason: "unknown_plan" as const, cycle: null as any };
    }

    const cycle = inferCycle(planCode, amountKobo);
    const expected = expectedAmountKobo(cycle);

    // If Paystack supplies an amount, enforce it.
    if (amountKobo != null && amountKobo > 0 && amountKobo !== expected) {
      return { ok: false as const, reason: "amount_mismatch" as const, cycle };
    }

    return { ok: true as const, cycle };
  }

  // 2) No plan code: accept ONLY if amount matches one of our expected amounts.
  if (amountKobo != null && amountKobo > 0) {
    const monthlyExpected = expectedAmountKobo("monthly");
    const annualExpected = expectedAmountKobo("annual");
    if (amountKobo === monthlyExpected) return { ok: true as const, cycle: "monthly" as const };
    if (amountKobo === annualExpected) return { ok: true as const, cycle: "annual" as const };
    if (LEGACY_AMOUNT_KOBO > 0 && amountKobo === LEGACY_AMOUNT_KOBO) {
      return { ok: true as const, cycle: "monthly" as const };
    }
  }

  return { ok: false as const, reason: "unrecognized_payment" as const, cycle: null as any };
}

async function syncSubscriptionFromPaystack(userId: string, email: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      customerCode: true,
      subscriptionCode: true,
      planCode: true,
      currentPeriodEnd: true,
    },
  });

  const haveCustomerCode = Boolean(safeTrim(sub?.customerCode));
  const haveSubscriptionCode = Boolean(safeTrim(sub?.subscriptionCode));

  if (haveCustomerCode && haveSubscriptionCode) {
    return {
      synced: false,
      customerCode: safeTrim(sub?.customerCode),
      subscriptionCode: safeTrim(sub?.subscriptionCode),
      planCode: sub?.planCode ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    };
  }

  let customer: PaystackCustomer | null = null;
  try {
    const custResp = await paystackGet<PaystackCustomer>(`/customer/${encodeURIComponent(email)}`);
    customer = custResp.data ?? null;
  } catch {
    return {
      synced: false,
      customerCode: safeTrim(sub?.customerCode),
      subscriptionCode: safeTrim(sub?.subscriptionCode),
      planCode: sub?.planCode ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      note: "paystack_customer_lookup_failed",
    };
  }

  if (!customer?.id || !customer?.customer_code) {
    return {
      synced: false,
      customerCode: safeTrim(sub?.customerCode),
      subscriptionCode: safeTrim(sub?.subscriptionCode),
      planCode: sub?.planCode ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      note: "paystack_customer_missing",
    };
  }

  const customerCode = safeTrim(customer.customer_code);

  let subscriptionCode = safeTrim(sub?.subscriptionCode);
  let planCode: string | null = sub?.planCode ?? null;
  let currentPeriodEnd: Date | null = sub?.currentPeriodEnd ?? null;

  try {
    const subsResp = await paystackGet<PaystackSubscription[]>(
      `/subscription?customer=${encodeURIComponent(String(customer.id))}`
    );

    const discovered = pickManageableSubscription(subsResp.data || []);
    const discoveredCode = safeTrim(discovered?.subscription_code);
    if (discoveredCode) subscriptionCode = discoveredCode;

    const discoveredPlan = safeTrim(discovered?.plan?.plan_code);
    if (discoveredPlan) planCode = discoveredPlan;

    const discoveredPeriodEnd = safeDate(discovered?.next_payment_date);
    if (discoveredPeriodEnd) currentPeriodEnd = discoveredPeriodEnd;
  } catch {
    // ignore
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      provider: "paystack",
      status: "active" as any,
      customerCode,
      subscriptionCode: subscriptionCode || undefined,
      planCode: planCode || undefined,
      currentPeriodEnd: currentPeriodEnd || undefined,
    },
    update: {
      customerCode,
      ...(subscriptionCode ? { subscriptionCode } : {}),
      ...(planCode ? { planCode } : {}),
      ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
    },
  });

  return {
    synced: true,
    customerCode,
    subscriptionCode: subscriptionCode || "",
    planCode,
    currentPeriodEnd,
  };
}

function extractPlanCodeFromPaystackVerifyData(data: any): string | null {
  const candidates = [
    data?.plan?.plan_code,
    data?.plan_code,
    data?.subscription?.plan?.plan_code,
    data?.subscription?.plan_code,
    data?.authorization?.plan,
  ];
  for (const c of candidates) {
    const v = safeTrim(c);
    if (v) return v;
  }
  return null;
}

function extractPlanCodeFromInitializeRaw(raw: any): string | null {
  const ek = raw?._ekasi || raw?.metadata || raw?.data?.metadata || raw?.data?.raw?.metadata || null;
  const candidates = [
    ek?.planCode,
    ek?.selectedPlanCode,
    ek?.selected_plan_code,
    ek?.selectedPlan,
    ek?.plan,
    raw?.plan,
    raw?.data?.plan,
  ];
  for (const c of candidates) {
    const v = safeTrim(c);
    if (v) return v;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY env var." }, { status: 500 });
    }

    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // tolerate empty POST body
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";

    // If no reference, try to sync (useful for existing subscriptions)
    if (!reference) {
      const email = toLowerEmail(user.email);
      const sync = await syncSubscriptionFromPaystack(user.id, email);

      return NextResponse.json(
        {
          ok: true,
          mode: "sync",
          synced: sync.synced === true,
          customerCode: sync.customerCode ?? "",
          subscriptionCode: sync.subscriptionCode ?? "",
          planCode: sync.planCode ?? null,
          currentPeriodEnd: sync.currentPeriodEnd ? sync.currentPeriodEnd.toISOString() : null,
          note: (sync as any).note || null,
        },
        { status: 200 }
      );
    }

    // IMPORTANT: fetch any existing pending payment BEFORE we overwrite it with verify payload.
    // This lets us recover planCode / cycle from initialize metadata (_ekasi).
    const pendingPayment = await prisma.payment.findUnique({
      where: { reference },
      select: { raw: true, amountKobo: true },
    });

    // Verify with Paystack (server-side)
    const upstream = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const json = await upstream.json().catch(() => null);

    if (!upstream.ok || !json?.status) {
      const msg = json?.message || `Paystack verify failed (${upstream.status}).`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const data = json?.data || {};
    const payStatus = String(data?.status || "").toLowerCase();
    const payReference = String(data?.reference || reference);
    const amountKobo = typeof data?.amount === "number" ? data.amount : undefined;
    const currency = typeof data?.currency === "string" ? data.currency : undefined;

    const paidAt =
      safeDate(data?.paid_at) ||
      safeDate(data?.paidAt) ||
      safeDate(data?.created_at) ||
      new Date();

    const payEmail = toLowerEmail(data?.customer?.email);
    const userEmail = toLowerEmail(user.email);
    if (payEmail && payEmail !== userEmail) {
      return NextResponse.json(
        { error: "Payment email does not match logged-in user." },
        { status: 409 }
      );
    }

    // Record payment
    await prisma.payment.upsert({
      where: { reference: payReference },
      create: {
        userId: user.id,
        provider: "paystack",
        reference: payReference,
        amountKobo: amountKobo ?? undefined,
        currency: currency ?? undefined,
        status: (payStatus === "success" ? "success" : "failed") as any,
        paidAt: payStatus === "success" ? paidAt : undefined,
        raw: data,
      },
      update: {
        userId: user.id,
        amountKobo: amountKobo ?? undefined,
        currency: currency ?? undefined,
        status: (payStatus === "success" ? "success" : "failed") as any,
        paidAt: payStatus === "success" ? paidAt : undefined,
        raw: data,
      },
    });

    if (payStatus !== "success") {
      return NextResponse.json({ ok: false, status: payStatus }, { status: 200 });
    }

    // --- Validate payment is for one of OUR plans/amounts (prevents accidental/under-payment upgrades)
    // Prefer Paystack plan code; fall back to what we recorded during initialize (pendingPayment.raw._ekasi).
    let planCodeSignal: string | null = extractPlanCodeFromPaystackVerifyData(data);

    if (!planCodeSignal) {
      planCodeSignal = extractPlanCodeFromInitializeRaw(pendingPayment?.raw as any);
    }

    // Some Paystack verify payloads omit amount, but we may have stored it during initialize.
    const amountSignal =
      typeof amountKobo === "number" && amountKobo > 0
        ? amountKobo
        : typeof pendingPayment?.amountKobo === "number"
        ? pendingPayment.amountKobo
        : null;

    const validation = validatePaymentSignals({
      planCode: planCodeSignal,
      amountKobo: amountSignal,
    });

    if (!validation.ok) {
      // Transaction verified, but it doesn't match our Pro pricing/plan codes — do NOT grant Pro.
      return NextResponse.json(
        {
          ok: false,
          status: "success",
          warning: "payment_not_recognized",
          reason: (validation as any).reason,
        },
        { status: 200 }
      );
    }

    // Unlock Pro
    await prisma.entitlement.upsert({
      where: { userId: user.id },
      create: { userId: user.id, tier: "pro" as any, status: "active" as any },
      update: { tier: "pro" as any, status: "active" as any },
    });

    const customerCode: string | undefined = data?.customer?.customer_code || undefined;

    const subscriptionCode: string | undefined =
      data?.subscription?.subscription_code || data?.subscription_code || undefined;

    const planCodeFromPaystack: string | undefined =
      data?.plan?.plan_code || data?.plan_code || data?.subscription?.plan?.plan_code || undefined;

    // Use the strongest plan code we have:
    // 1) Paystack plan code
    // 2) initialize-captured plan code
    // 3) legacy env fallback (last resort)
    const planCode =
      safeTrim(planCodeFromPaystack) ||
      safeTrim(planCodeSignal) ||
      safeTrim(LEGACY_PLAN_CODE) ||
      undefined;

    const cycle = validation.cycle;

    const nextPayment =
      safeDate(data?.subscription?.next_payment_date) || safeDate(data?.next_payment_date) || null;

    const fallbackDays =
      cycle === "annual" ? DEFAULT_PRO_PERIOD_DAYS_ANNUAL : DEFAULT_PRO_PERIOD_DAYS_MONTHLY;

    const currentPeriodEnd = nextPayment ? nextPayment : addDays(paidAt, fallbackDays);

    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        provider: "paystack",
        status: "active" as any,
        customerCode,
        subscriptionCode,
        planCode,
        currentPeriodEnd,
      },
      update: {
        status: "active" as any,
        customerCode,
        subscriptionCode,
        planCode,
        currentPeriodEnd,
        canceledAt: null,
      },
    });

    return NextResponse.json(
      { ok: true, status: "success", cycle, planCode: planCode ?? null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to verify transaction." },
      { status: 500 }
    );
  }
}