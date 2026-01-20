import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

// If you don’t use plans, this can be blank.
const PAYSTACK_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";

// For non-subscription (one-time) upgrades, we approximate a 30-day period end.
const DEFAULT_PRO_PERIOD_DAYS = Number(process.env.PRO_PERIOD_DAYS || "30");

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

export async function POST(req: NextRequest) {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing PAYSTACK_SECRET_KEY env var." },
        { status: 500 }
      );
    }

    // Auth
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Body
    const body = await req.json().catch(() => null);
    const reference = typeof body?.reference === "string" ? body.reference.trim() : "";

    if (!reference) {
      return NextResponse.json({ error: "Missing reference." }, { status: 400 });
    }

    // Verify with Paystack (server-side)
    const upstream = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
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
    const payStatus = String(data?.status || "").toLowerCase(); // "success" expected
    const payReference = String(data?.reference || reference);
    const amountKobo = typeof data?.amount === "number" ? data.amount : undefined;
    const currency = typeof data?.currency === "string" ? data.currency : undefined;

    const paidAt =
      safeDate(data?.paid_at) ||
      safeDate(data?.paidAt) ||
      safeDate(data?.created_at) ||
      new Date();

    // Optional safety check: if Paystack returns a different email than the logged-in user,
    // you can reject to prevent accidental cross-linking.
    const payEmail = toLowerEmail(data?.customer?.email);
    if (payEmail && payEmail !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Payment email does not match logged-in user." },
        { status: 409 }
      );
    }

    // Upsert payment record regardless of success (useful audit)
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

    // ✅ Grant entitlement (PRO)
    await prisma.entitlement.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tier: "pro" as any,
        status: "active" as any,
      },
      update: {
        tier: "pro" as any,
        status: "active" as any,
      },
    });

    /**
     * ✅ Keep Subscription record in sync so UI can show renewals.
     *
     * If you are using Paystack plan subscriptions:
     * - Paystack returns fields like `plan`, `subscription`, `authorization`, etc.
     * - webhook will also keep this accurate over time
     *
     * If you are NOT using subscriptions (one-time), we still set a period end
     * (e.g. 30 days) so the UI has something meaningful.
     */
    const customerCode: string | undefined = data?.customer?.customer_code || undefined;

    // Sometimes verify payload includes subscription info (not always)
    const subscriptionCode: string | undefined =
      data?.subscription?.subscription_code ||
      data?.subscription_code ||
      undefined;

    const planCodeFromPaystack: string | undefined =
      data?.plan?.plan_code ||
      data?.plan_code ||
      undefined;

    const planCode = planCodeFromPaystack || (PAYSTACK_PLAN_CODE || undefined);

    const isRecurring = Boolean(planCode);

    const currentPeriodEnd = isRecurring
      ? // For recurring: we usually rely on webhook to set true period end.
        // If payload provides something, prefer it; else set a short future placeholder.
        safeDate(data?.subscription?.next_payment_date) ||
        safeDate(data?.next_payment_date) ||
        addDays(paidAt, DEFAULT_PRO_PERIOD_DAYS)
      : // For one-time: simple 30-day access window (adjustable by env)
        addDays(paidAt, DEFAULT_PRO_PERIOD_DAYS);

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

    return NextResponse.json({ ok: true, status: "success" }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to verify transaction." },
      { status: 500 }
    );
  }
}
