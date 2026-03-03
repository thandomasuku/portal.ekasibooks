import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Core env (do NOT duplicate secret key)
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || "ZAR").toUpperCase();
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

/**
 * Legacy env (backwards compatible)
 * - PAYSTACK_PLAN_CODE            (single plan)
 * - PAYSTACK_AMOUNT_KOBO          (single amount)
 * - PAYSTACK_PLAN_CODE_MONTHLY    (single monthly plan)
 * - PAYSTACK_PLAN_CODE_ANNUAL     (single annual plan)
 * - PAYSTACK_AMOUNT_KOBO_MONTHLY  (single monthly amount)
 * - PAYSTACK_AMOUNT_KOBO_ANNUAL   (single annual amount)
 */
const LEGACY_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";
const LEGACY_AMOUNT_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO || "0");

const LEGACY_PLAN_CODE_MONTHLY = process.env.PAYSTACK_PLAN_CODE_MONTHLY || "";
const LEGACY_PLAN_CODE_ANNUAL = process.env.PAYSTACK_PLAN_CODE_ANNUAL || "";

const LEGACY_AMOUNT_KOBO_MONTHLY = Number(process.env.PAYSTACK_AMOUNT_KOBO_MONTHLY || "0");
const LEGACY_AMOUNT_KOBO_ANNUAL = Number(process.env.PAYSTACK_AMOUNT_KOBO_ANNUAL || "0");

/**
 * New tier+cycle plan codes (recommended)
 * These should be the Paystack "plan codes" you created.
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
 * New tier+cycle amounts (optional).
 * If you are using Paystack subscriptions with a plan, Paystack can still require `amount` on initialize.
 * Defaults match your PricingClient.tsx (VAT inclusive):
 * - Starter: R199 / R2149
 * - Growth:  R399 / R4309
 * - Pro:     R599 / R6469
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

type BillingCycle = "monthly" | "annual";
type Tier = "starter" | "growth" | "pro";

function cleanBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function safeBillingCycle(v: unknown): BillingCycle {
  const s = String(v || "").toLowerCase();
  return s === "annual" ? "annual" : "monthly";
}

function safeTier(v: unknown): Tier {
  const s = String(v || "").toLowerCase();
  if (s === "growth") return "growth";
  if (s === "pro") return "pro";
  return "starter";
}

function resolvePaystackConfig(tier: Tier, cycle: BillingCycle) {
  // 1) Prefer new tier+cycle env
  const amountFromTier = AMOUNTS_KOBO[tier][cycle];
  const planFromTier = PLAN_CODES[tier][cycle];

  // 2) Fallback to legacy multi-cycle env (single plan per cycle)
  const legacyAmount = cycle === "annual" ? LEGACY_AMOUNT_KOBO_ANNUAL : LEGACY_AMOUNT_KOBO_MONTHLY;
  const legacyPlan = cycle === "annual" ? LEGACY_PLAN_CODE_ANNUAL : LEGACY_PLAN_CODE_MONTHLY;

  // 3) Final fallback to legacy single plan/amount
  const fallbackAmount =
    legacyAmount > 0 ? legacyAmount : LEGACY_AMOUNT_KOBO > 0 ? LEGACY_AMOUNT_KOBO : amountFromTier;

  const fallbackPlan = legacyPlan || LEGACY_PLAN_CODE || "";

  return {
    amountKobo: amountFromTier > 0 ? amountFromTier : fallbackAmount,
    planCode: planFromTier || fallbackPlan,
  };
}

function normalizeTierFromDb(v: unknown): Tier | null {
  const s = String(v || "").toLowerCase();
  if (s === "starter" || s === "growth" || s === "pro") return s;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    /* -------------------------------------------------
     * 1) Auth (server-side, cookie-based)
     * ------------------------------------------------- */
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* -------------------------------------------------
     * 2) Read body: tier + cycle
     * ------------------------------------------------- */
    let cycle: BillingCycle = "monthly";
    let tier: Tier = "starter";

    try {
      const body = await req.json().catch(() => ({}));
      cycle = safeBillingCycle(body?.cycle);
      tier = safeTier(body?.tier);
    } catch {
      cycle = "monthly";
      tier = "starter";
    }

    /* -------------------------------------------------
     * 3) Prevent duplicate active subscription (same tier)
     * ------------------------------------------------- */
    // Allow upgrades/downgrades by letting them start a new checkout,
    // but block if they already have an active subscription for the SAME tier.
    const ent = await prisma.entitlement.findUnique({
      where: { userId: user.id },
      select: { tier: true, status: true },
    });

    const currentTier = normalizeTierFromDb(ent?.tier);
    const currentStatus = String(ent?.status || "").toLowerCase();

    if (currentTier === tier && currentStatus === "active") {
      return NextResponse.json(
        { error: `You already have an active ${tier.toUpperCase()} subscription.` },
        { status: 400 }
      );
    }

    const { amountKobo, planCode } = resolvePaystackConfig(tier, cycle);

    /* -------------------------------------------------
     * 4) Environment sanity checks
     * ------------------------------------------------- */
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing PAYSTACK_SECRET_KEY env var." },
        { status: 500 }
      );
    }

    if (!amountKobo || amountKobo <= 0) {
      return NextResponse.json(
        {
          error:
            "Missing/invalid Paystack amount. Set PAYSTACK_AMOUNT_KOBO_<TIER>_<CYCLE> (or legacy PAYSTACK_AMOUNT_KOBO_*).",
        },
        { status: 500 }
      );
    }

    if (!planCode) {
      return NextResponse.json(
        {
          error:
            "Missing Paystack plan code. Set PAYSTACK_PLAN_CODE_<TIER>_<CYCLE> (or legacy PAYSTACK_PLAN_CODE_*).",
        },
        { status: 500 }
      );
    }

    const baseUrl = APP_URL !== "" ? cleanBaseUrl(APP_URL) : req.nextUrl.origin; // safe dev fallback

    /* -------------------------------------------------
     * 5) Initialize Paystack transaction
     * ------------------------------------------------- */
    const payload: Record<string, any> = {
      email: user.email,
      amount: amountKobo, // kobo (e.g. 19900 / 214900)
      currency: PAYSTACK_CURRENCY,
      callback_url: `${baseUrl}/billing`, // IMPORTANT
      metadata: {
        userId: user.id,
        source: "ekasi-portal",
        billingCycle: cycle,
        tier,
        // for debugging/support
        selectedPlanCode: planCode || null,
        selectedAmountKobo: amountKobo,
      },
      // Recurring plan (subscription)
      plan: planCode,
    };

    const upstream = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await upstream.json().catch(() => null);

    if (!upstream.ok || !json?.status) {
      const msg = json?.message || `Paystack initialize failed (${upstream.status}).`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const authorization_url: string | undefined = json?.data?.authorization_url;
    const reference: string | undefined = json?.data?.reference;
    const access_code: string | undefined = json?.data?.access_code;

    if (!authorization_url || !reference) {
      return NextResponse.json(
        { error: "Paystack response missing authorization_url or reference." },
        { status: 502 }
      );
    }

    /* -------------------------------------------------
     * 6) Persist pending payment (idempotent)
     * ------------------------------------------------- */
    await prisma.payment.upsert({
      where: { reference },
      create: {
        userId: user.id,
        provider: "paystack",
        reference,
        amountKobo: amountKobo,
        currency: PAYSTACK_CURRENCY,
        status: "pending" as any,
        raw: {
          ...(json?.data ?? {}),
          _ekasi: {
            billingCycle: cycle,
            tier,
            planCode: planCode || null,
            amountKobo,
          },
        } as any,
      },
      update: {
        amountKobo: amountKobo,
        currency: PAYSTACK_CURRENCY,
        status: "pending" as any,
        raw: {
          ...(json?.data ?? {}),
          _ekasi: {
            billingCycle: cycle,
            tier,
            planCode: planCode || null,
            amountKobo,
          },
        } as any,
      },
    });

    /* -------------------------------------------------
     * 7) Return exactly what UI expects
     * ------------------------------------------------- */
    return NextResponse.json(
      {
        authorization_url,
        reference,
        access_code,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to start Paystack checkout." },
      { status: 500 }
    );
  }
}