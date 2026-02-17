import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Core env (do NOT duplicate secret key)
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || "ZAR").toUpperCase();
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

// Legacy single-plan env (backwards compatible)
const LEGACY_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || ""; // optional (subscriptions)
const LEGACY_AMOUNT_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO || "0");

// New multi-cycle env (recommended)
const PLAN_CODE_MONTHLY = process.env.PAYSTACK_PLAN_CODE_MONTHLY || "";
const PLAN_CODE_ANNUAL = process.env.PAYSTACK_PLAN_CODE_ANNUAL || "";

const AMOUNT_KOBO_MONTHLY = Number(process.env.PAYSTACK_AMOUNT_KOBO_MONTHLY || "0");
const AMOUNT_KOBO_ANNUAL = Number(process.env.PAYSTACK_AMOUNT_KOBO_ANNUAL || "0");

type BillingCycle = "monthly" | "annual";

function cleanBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function safeBillingCycle(v: unknown): BillingCycle {
  const s = String(v || "").toLowerCase();
  return s === "annual" ? "annual" : "monthly";
}

function resolvePaystackConfig(cycle: BillingCycle) {
  // Prefer new env vars. Fallback to legacy single-plan vars.
  if (cycle === "annual") {
    const amount = AMOUNT_KOBO_ANNUAL > 0 ? AMOUNT_KOBO_ANNUAL : LEGACY_AMOUNT_KOBO;
    const plan = PLAN_CODE_ANNUAL || LEGACY_PLAN_CODE;
    return { amountKobo: amount, planCode: plan };
  }

  // monthly
  const amount = AMOUNT_KOBO_MONTHLY > 0 ? AMOUNT_KOBO_MONTHLY : LEGACY_AMOUNT_KOBO;
  const plan = PLAN_CODE_MONTHLY || LEGACY_PLAN_CODE;
  return { amountKobo: amount, planCode: plan };
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
     * 2) Determine billing cycle from request body
     * ------------------------------------------------- */
    let cycle: BillingCycle = "monthly";
    try {
      const body = await req.json().catch(() => ({}));
      cycle = safeBillingCycle(body?.cycle);
    } catch {
      cycle = "monthly";
    }

    const { amountKobo, planCode } = resolvePaystackConfig(cycle);

    /* -------------------------------------------------
     * 3) Environment sanity checks
     * ------------------------------------------------- */
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY env var." }, { status: 500 });
    }

    if (!amountKobo || amountKobo <= 0) {
      return NextResponse.json(
        {
          error:
            "Missing/invalid Paystack amount env var. Set PAYSTACK_AMOUNT_KOBO_MONTHLY / PAYSTACK_AMOUNT_KOBO_ANNUAL (or legacy PAYSTACK_AMOUNT_KOBO).",
        },
        { status: 500 }
      );
    }

    const baseUrl = APP_URL !== "" ? cleanBaseUrl(APP_URL) : req.nextUrl.origin; // safe dev fallback

    /* -------------------------------------------------
     * 4) Initialize Paystack transaction
     * ------------------------------------------------- */
    const payload: Record<string, any> = {
      email: user.email,
      amount: amountKobo, // kobo (e.g. 19900 / 214900)
      currency: PAYSTACK_CURRENCY,
      callback_url: `${baseUrl}/billing`, // 🔥 IMPORTANT
      metadata: {
        userId: user.id,
        source: "ekasi-portal",
        billingCycle: cycle,
        // for debugging/support
        selectedPlanCode: planCode || null,
        selectedAmountKobo: amountKobo,
      },
    };

    // Optional recurring plan (subscription)
    if (planCode) {
      payload.plan = planCode;
    }

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
     * 5) Persist pending payment (idempotent)
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
            planCode: planCode || null,
            amountKobo,
          },
        } as any,
      },
    });

    /* -------------------------------------------------
     * 6) Return exactly what UI expects
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
