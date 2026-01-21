import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || ""; // optional (subscriptions)
const PAYSTACK_AMOUNT_KOBO = Number(process.env.PAYSTACK_AMOUNT_KOBO || "0"); // ZAR cents
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

function cleanBaseUrl(url: string) {
  return url.replace(/\/$/, "");
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
     * 2) Environment sanity checks
     * ------------------------------------------------- */
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing PAYSTACK_SECRET_KEY env var." },
        { status: 500 }
      );
    }

    if (!PAYSTACK_AMOUNT_KOBO || PAYSTACK_AMOUNT_KOBO <= 0) {
      return NextResponse.json(
        { error: "Missing/invalid PAYSTACK_AMOUNT_KOBO env var (must be > 0)." },
        { status: 500 }
      );
    }

    const baseUrl =
      APP_URL !== ""
        ? cleanBaseUrl(APP_URL)
        : req.nextUrl.origin; // safe dev fallback

    /* -------------------------------------------------
     * 3) Initialize Paystack transaction
     * ------------------------------------------------- */
    const payload: Record<string, any> = {
      email: user.email,
      amount: PAYSTACK_AMOUNT_KOBO, // ZAR cents (e.g. 19900)
      currency: "ZAR",
      callback_url: `${baseUrl}/billing`, // 🔥 IMPORTANT
      metadata: {
        userId: user.id,
        source: "ekasi-portal",
      },
    };

    // Optional recurring plan
    if (PAYSTACK_PLAN_CODE) {
      payload.plan = PAYSTACK_PLAN_CODE;
    }

    const upstream = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const json = await upstream.json().catch(() => null);

    if (!upstream.ok || !json?.status) {
      const msg =
        json?.message || `Paystack initialize failed (${upstream.status}).`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const authorization_url: string | undefined =
      json?.data?.authorization_url;
    const reference: string | undefined = json?.data?.reference;
    const access_code: string | undefined = json?.data?.access_code;

    if (!authorization_url || !reference) {
      return NextResponse.json(
        { error: "Paystack response missing authorization_url or reference." },
        { status: 502 }
      );
    }

    /* -------------------------------------------------
     * 4) Persist pending payment (idempotent)
     * ------------------------------------------------- */
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
        amountKobo: PAYSTACK_AMOUNT_KOBO,
        currency: "ZAR",
        status: "pending" as any,
        raw: json?.data ?? undefined,
      },
    });

    /* -------------------------------------------------
     * 5) Return exactly what UI expects
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
