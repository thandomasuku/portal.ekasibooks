import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || ""; // optional (for subscriptions)
const PAYSTACK_AMOUNT_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO || "0"); // required
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ""; // for callback URL

function cleanBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    // 1) Auth (server-side, cookie)
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

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Env sanity
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing PAYSTACK_SECRET_KEY env var." },
        { status: 500 }
      );
    }

    if (!PAYSTACK_AMOUNT_KOBO || Number.isNaN(PAYSTACK_AMOUNT_KOBO) || PAYSTACK_AMOUNT_KOBO <= 0) {
      return NextResponse.json(
        { error: "Missing/invalid PAYSTACK_AMOUNT_KOBO env var (must be > 0)." },
        { status: 500 }
      );
    }

    // If you're in production, you *really* want an APP_URL for a correct callback.
    if (process.env.NODE_ENV === "production" && !APP_URL) {
      return NextResponse.json(
        { error: "Missing APP_URL env var (required in production for Paystack callback)." },
        { status: 500 }
      );
    }

    // 3) Initialize transaction with Paystack
    // We intentionally keep the endpoint name as /subscribe so the existing UI continues to work.
    //
    // IMPORTANT: We include `reference` later in the redirect URL so the Billing page can
    // call /api/billing/verify immediately on return.

    const payload: Record<string, any> = {
  email: user.email,
  amount: PAYSTACK_AMOUNT_KOBO,
  callback_url: `${cleanBaseUrl(APP_URL)}/billing/callback`,
  metadata: {
    userId: user.id,
    source: "ekasi-portal",
  },
};

    // If you are using Paystack Plans (recurring), set PAYSTACK_PLAN_CODE
    if (PAYSTACK_PLAN_CODE) payload.plan = PAYSTACK_PLAN_CODE;

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

    const authUrl: string | undefined = json?.data?.authorization_url;
    const reference: string | undefined = json?.data?.reference;
    const access_code: string | undefined = json?.data?.access_code;

    if (!authUrl || !reference) {
      return NextResponse.json(
        { error: "Paystack response missing authorization_url or reference." },
        { status: 502 }
      );
    }

    // 4) Persist a pending payment record (helps reconciliation + support)
    await prisma.payment.upsert({
      where: { reference },
      create: {
        userId: user.id,
        provider: "paystack",
        reference,
        amountKobo: PAYSTACK_AMOUNT_KOBO,
        currency: "ZAR",
        status: "pending" as any,
        raw: json?.data ?? undefined,
      },
      update: {
        userId: user.id,
        amountKobo: PAYSTACK_AMOUNT_KOBO,
        currency: "ZAR",
        status: "pending" as any,
        raw: json?.data ?? undefined,
      },
    });

    // Return exactly what your UI expects
    return NextResponse.json(
      {
        authorization_url: authUrl,
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
