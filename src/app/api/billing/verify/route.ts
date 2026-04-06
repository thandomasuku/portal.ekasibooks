// src/app/api/billing/verify/route.ts
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";
import { syncSubscriptionFromPaystack } from "@/lib/paystackSync";

export const dynamic = "force-dynamic";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE = "https://api.paystack.co";

/**
 * Legacy single-plan env (backwards compatible)
 */
const LEGACY_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";
const LEGACY_AMOUNT_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO || "0");

/**
 * Legacy multi-cycle env (backwards compatible, but single-tier)
 */
const LEGACY_PLAN_CODE_MONTHLY = process.env.PAYSTACK_PLAN_CODE_MONTHLY || "";
const LEGACY_PLAN_CODE_ANNUAL = process.env.PAYSTACK_PLAN_CODE_ANNUAL || "";
const LEGACY_AMOUNT_KOBO_MONTHLY = Number(process.env.PAYSTACK_AMOUNT_KOBO_MONTHLY || "19900");
const LEGACY_AMOUNT_KOBO_ANNUAL = Number(process.env.PAYSTACK_AMOUNT_KOBO_ANNUAL || "214900");

/**
 * New tier+cycle plan codes (recommended)
 */
const PLAN_CODES = {
  starter: {
    monthly: process.env.PAYSTACK_PLAN_CODE_STARTER_MONTHLY || "",
    annual: process.env.PAYSTACK_PLAN_CODE_STARTER_ANNUAL || "",
  },
  growth: {
    monthly: process.env.PAYSTACK_PLAN_CODE_GROWTH_MONTHLY || "",
    annual: process.env.PAYSTACK_PLAN_CODE_GROWTH_ANNUAL || "",
  },
  pro: {
    monthly: process.env.PAYSTACK_PLAN_CODE_PRO_MONTHLY || "",
    annual: process.env.PAYSTACK_PLAN_CODE_PRO_ANNUAL || "",
  },
} as const;

/**
 * New tier+cycle amounts (optional). Defaults match your marketing pricing (VAT incl).
 */
const AMOUNTS_KOBO = {
  starter: {
    monthly: Number(process.env.PAYSTACK_AMOUNT_KOBO_STARTER_MONTHLY || "19900"),
    annual: Number(process.env.PAYSTACK_AMOUNT_KOBO_STARTER_ANNUAL || "214900"),
  },
  growth: {
    monthly: Number(process.env.PAYSTACK_AMOUNT_KOBO_GROWTH_MONTHLY || "39900"),
    annual: Number(process.env.PAYSTACK_AMOUNT_KOBO_GROWTH_ANNUAL || "430900"),
  },
  pro: {
    monthly: Number(process.env.PAYSTACK_AMOUNT_KOBO_PRO_MONTHLY || "59900"),
    annual: Number(process.env.PAYSTACK_AMOUNT_KOBO_PRO_ANNUAL || "646900"),
  },
} as const;

// Fallback amounts (lowest denomination).
const FALLBACK_MONTHLY_AMOUNT = 19900;
const FALLBACK_ANNUAL_AMOUNT = 214900;

// If Paystack doesn’t return next_payment_date (rare), use a sensible fallback.
const DEFAULT_PAID_PERIOD_DAYS_MONTHLY = Number(process.env.PAID_PERIOD_DAYS || "30");
const DEFAULT_PAID_PERIOD_DAYS_ANNUAL = Number(process.env.PAID_PERIOD_DAYS_ANNUAL || "365");

type Tier = "starter" | "growth" | "pro";
type BillingCycle = "monthly" | "annual";

type PaystackResponse<T> = {
  status: boolean;
  message?: string;
  data?: T;
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

async function paystackGetSubscriptionByCode(subscriptionCode: string) {
  const code = safeTrim(subscriptionCode);
  if (!code) return null;

  const resp = await paystackGet<PaystackSubscription>(
    `/subscription/${encodeURIComponent(code)}`
  );

  return resp.data ?? null;
}

function buildAllowedPlanSet() {
  const vals: string[] = [
    PLAN_CODES.starter.monthly,
    PLAN_CODES.starter.annual,
    PLAN_CODES.growth.monthly,
    PLAN_CODES.growth.annual,
    PLAN_CODES.pro.monthly,
    PLAN_CODES.pro.annual,
    LEGACY_PLAN_CODE_MONTHLY,
    LEGACY_PLAN_CODE_ANNUAL,
    LEGACY_PLAN_CODE,
  ].map(safeTrim);

  return new Set(vals.filter(Boolean));
}

function resolveTierAndCycleFromPlanCode(planCode: string): { tier: Tier; cycle: BillingCycle } | null {
  const pc = safeTrim(planCode);
  if (!pc) return null;

  for (const tier of ["starter", "growth", "pro"] as const) {
    for (const cycle of ["monthly", "annual"] as const) {
      if (PLAN_CODES[tier][cycle] && pc === PLAN_CODES[tier][cycle]) {
        return { tier, cycle };
      }
    }
  }

  if (LEGACY_PLAN_CODE_ANNUAL && pc === LEGACY_PLAN_CODE_ANNUAL) {
    return { tier: "pro", cycle: "annual" };
  }
  if (LEGACY_PLAN_CODE_MONTHLY && pc === LEGACY_PLAN_CODE_MONTHLY) {
    return { tier: "pro", cycle: "monthly" };
  }
  if (LEGACY_PLAN_CODE && pc === LEGACY_PLAN_CODE) {
    return { tier: "pro", cycle: "monthly" };
  }

  return null;
}

function resolveTierAndCycleFromMetadata(meta: any): { tier: Tier; cycle: BillingCycle } | null {
  const t = safeTrim(meta?.tier) || safeTrim(meta?.planTier) || safeTrim(meta?.selectedTier);
  const c = safeTrim(meta?.billingCycle) || safeTrim(meta?.cycle);

  const tier = String(t).toLowerCase();
  const cycle = String(c).toLowerCase();

  const isTierOk = tier === "starter" || tier === "growth" || tier === "pro";
  const isCycleOk = cycle === "monthly" || cycle === "annual";

  if (isTierOk && isCycleOk) {
    return { tier: tier as Tier, cycle: cycle as BillingCycle };
  }

  if (isTierOk && !isCycleOk) {
    return { tier: tier as Tier, cycle: "monthly" };
  }

  return null;
}

function expectedAmountKobo(tier: Tier, cycle: BillingCycle) {
  const fromTier = AMOUNTS_KOBO[tier][cycle];
  if (fromTier > 0) return fromTier;

  const legacy = cycle === "annual" ? LEGACY_AMOUNT_KOBO_ANNUAL : LEGACY_AMOUNT_KOBO_MONTHLY;
  if (legacy > 0) return legacy;

  return cycle === "annual" ? FALLBACK_ANNUAL_AMOUNT : FALLBACK_MONTHLY_AMOUNT;
}

function validatePaymentSignals(opts: {
  planCode?: string | null;
  amountKobo?: number | null;
  metaTierCycle?: { tier: Tier; cycle: BillingCycle } | null;
}) {
  const planCode = safeTrim(opts.planCode);
  const amountKobo = typeof opts.amountKobo === "number" ? opts.amountKobo : null;

  const allowedPlans = buildAllowedPlanSet();

  let inferred: { tier: Tier; cycle: BillingCycle } | null = null;

  if (planCode) inferred = resolveTierAndCycleFromPlanCode(planCode);
  if (!inferred && opts.metaTierCycle) inferred = opts.metaTierCycle;

  if (planCode) {
    if (!allowedPlans.has(planCode)) {
      return { ok: false as const, reason: "unknown_plan" as const, tier: null as any, cycle: null as any };
    }

    if (inferred) {
      const expected = expectedAmountKobo(inferred.tier, inferred.cycle);
      if (amountKobo != null && amountKobo > 0 && expected > 0 && amountKobo !== expected) {
        return {
          ok: false as const,
          reason: "amount_mismatch" as const,
          tier: inferred.tier,
          cycle: inferred.cycle,
        };
      }

      return { ok: true as const, tier: inferred.tier, cycle: inferred.cycle };
    }

    return { ok: true as const, tier: "pro" as const, cycle: "monthly" as const };
  }

  if (amountKobo != null && amountKobo > 0) {
    if (opts.metaTierCycle) {
      const expected = expectedAmountKobo(opts.metaTierCycle.tier, opts.metaTierCycle.cycle);
      if (expected > 0 && amountKobo === expected) {
        return { ok: true as const, tier: opts.metaTierCycle.tier, cycle: opts.metaTierCycle.cycle };
      }
    }

    const combos: Array<{ tier: Tier; cycle: BillingCycle }> = [
      { tier: "starter", cycle: "monthly" },
      { tier: "starter", cycle: "annual" },
      { tier: "growth", cycle: "monthly" },
      { tier: "growth", cycle: "annual" },
      { tier: "pro", cycle: "monthly" },
      { tier: "pro", cycle: "annual" },
    ];

    for (const c of combos) {
      const expected = expectedAmountKobo(c.tier, c.cycle);
      if (expected > 0 && amountKobo === expected) {
        return { ok: true as const, tier: c.tier, cycle: c.cycle };
      }
    }

    if (LEGACY_AMOUNT_KOBO > 0 && amountKobo === LEGACY_AMOUNT_KOBO) {
      return { ok: true as const, tier: "pro" as const, cycle: "monthly" as const };
    }
  }

  return { ok: false as const, reason: "unrecognized_payment" as const, tier: null as any, cycle: null as any };
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

function extractMetadataFromPaystackVerifyData(data: any): any {
  return data?.metadata || data?.customer?.metadata || null;
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

function extractTierCycleFromInitializeRaw(raw: any): { tier: Tier; cycle: BillingCycle } | null {
  const ek = raw?._ekasi || raw?.metadata || raw?.data?.metadata || raw?.data?.raw?.metadata || null;
  return resolveTierAndCycleFromMetadata(ek);
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

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";

    if (!reference) {
      const syncPeriodEnd = await syncSubscriptionFromPaystack(user.id);

      const refreshedSub = await prisma.subscription.findUnique({
        where: { userId: user.id },
        select: { planCode: true, currentPeriodEnd: true, customerCode: true, subscriptionCode: true, status: true },
      });

      const inferred = refreshedSub?.planCode
        ? resolveTierAndCycleFromPlanCode(refreshedSub.planCode)
        : null;

      if (inferred) {
        await prisma.entitlement.upsert({
          where: { userId: user.id },
          create: { userId: user.id, tier: inferred.tier as any, status: "active" as any },
          update: { tier: inferred.tier as any, status: "active" as any },
        });
      }

      return NextResponse.json(
        {
          ok: true,
          mode: "sync",
          synced: syncPeriodEnd !== null,
          customerCode: refreshedSub?.customerCode ?? "",
          subscriptionCode: refreshedSub?.subscriptionCode ?? "",
          planCode: refreshedSub?.planCode ?? null,
          tier: inferred?.tier ?? null,
          cycle: inferred?.cycle ?? null,
          currentPeriodEnd: refreshedSub?.currentPeriodEnd
            ? refreshedSub.currentPeriodEnd.toISOString()
            : null,
          status: refreshedSub?.status ?? null,
        },
        { status: 200 }
      );
    }

    const pendingPayment = await prisma.payment.findUnique({
      where: { reference },
      select: { raw: true, amountKobo: true },
    });

    const upstream = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
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
      safeDate(data?.paid_at) || safeDate(data?.paidAt) || safeDate(data?.created_at) || new Date();

    const payEmail = toLowerEmail(data?.customer?.email);
    const userEmail = toLowerEmail(user.email);
    if (payEmail && payEmail !== userEmail) {
      return NextResponse.json({ error: "Payment email does not match logged-in user." }, { status: 409 });
    }

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

    let planCodeSignal: string | null = extractPlanCodeFromPaystackVerifyData(data);
    if (!planCodeSignal) {
      planCodeSignal = extractPlanCodeFromInitializeRaw(pendingPayment?.raw as any);
    }

    const metaFromVerify = extractMetadataFromPaystackVerifyData(data);
    const metaFromInit = extractTierCycleFromInitializeRaw(pendingPayment?.raw as any);
    const metaTierCycle = resolveTierAndCycleFromMetadata(metaFromVerify) || metaFromInit || null;

    const amountSignal =
      typeof amountKobo === "number" && amountKobo > 0
        ? amountKobo
        : typeof pendingPayment?.amountKobo === "number"
          ? pendingPayment.amountKobo
          : null;

    const validation = validatePaymentSignals({
      planCode: planCodeSignal,
      amountKobo: amountSignal,
      metaTierCycle,
    });

    if (!validation.ok) {
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

    const tier: Tier = validation.tier;
    const cycle: BillingCycle = validation.cycle;

    await prisma.entitlement.upsert({
      where: { userId: user.id },
      create: { userId: user.id, tier: tier as any, status: "active" as any },
      update: { tier: tier as any, status: "active" as any },
    });

    const customerCode: string | undefined = data?.customer?.customer_code || undefined;

    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: {
        subscriptionCode: true,
        currentPeriodEnd: true,
        planCode: true,
      },
    });

    const subscriptionCode =
      safeTrim(data?.subscription?.subscription_code) ||
      safeTrim(data?.subscription_code) ||
      safeTrim(existingSubscription?.subscriptionCode) ||
      undefined;

    let planCode =
      safeTrim(data?.plan?.plan_code) ||
      safeTrim(data?.plan_code) ||
      safeTrim(data?.subscription?.plan?.plan_code) ||
      safeTrim(planCodeSignal) ||
      safeTrim(existingSubscription?.planCode) ||
      safeTrim(LEGACY_PLAN_CODE) ||
      undefined;

    let nextPayment =
      safeDate(data?.subscription?.next_payment_date) ||
      safeDate(data?.next_payment_date) ||
      null;

    if (!nextPayment && subscriptionCode) {
      try {
        const liveSub = await paystackGetSubscriptionByCode(subscriptionCode);

        const liveNextPayment = safeDate(liveSub?.next_payment_date);
        if (liveNextPayment) nextPayment = liveNextPayment;

        const livePlanCode = safeTrim(liveSub?.plan?.plan_code);
        if (livePlanCode) planCode = livePlanCode;
      } catch {
        // keep falling through
      }
    }

    const fallbackDays =
      cycle === "annual" ? DEFAULT_PAID_PERIOD_DAYS_ANNUAL : DEFAULT_PAID_PERIOD_DAYS_MONTHLY;

    const provisionalCurrentPeriodEnd =
      nextPayment ||
      existingSubscription?.currentPeriodEnd ||
      addDays(paidAt, fallbackDays);

    await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        provider: "paystack",
        status: "active" as any,
        customerCode,
        subscriptionCode,
        planCode,
        currentPeriodEnd: provisionalCurrentPeriodEnd,
      },
      update: {
        status: "active" as any,
        customerCode,
        subscriptionCode,
        planCode,
        currentPeriodEnd: provisionalCurrentPeriodEnd,
        canceledAt: null,
      },
    });

    // Final authoritative refresh from Paystack.
    // This ensures stale/wrong DB values are corrected immediately after verify.
    await syncSubscriptionFromPaystack(user.id);

    const refreshedSub = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { planCode: true, currentPeriodEnd: true, customerCode: true, subscriptionCode: true, status: true },
    });

    const inferredFromSync = refreshedSub?.planCode
      ? resolveTierAndCycleFromPlanCode(refreshedSub.planCode)
      : null;

    if (inferredFromSync) {
      await prisma.entitlement.upsert({
        where: { userId: user.id },
        create: { userId: user.id, tier: inferredFromSync.tier as any, status: "active" as any },
        update: { tier: inferredFromSync.tier as any, status: "active" as any },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        status: "success",
        tier: inferredFromSync?.tier ?? tier,
        cycle: inferredFromSync?.cycle ?? cycle,
        planCode: refreshedSub?.planCode ?? planCode ?? null,
        currentPeriodEnd: refreshedSub?.currentPeriodEnd
          ? refreshedSub.currentPeriodEnd.toISOString()
          : null,
        customerCode: refreshedSub?.customerCode ?? customerCode ?? "",
        subscriptionCode: refreshedSub?.subscriptionCode ?? subscriptionCode ?? "",
        subscriptionStatus: refreshedSub?.status ?? "active",
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to verify transaction." }, { status: 500 });
  }
}