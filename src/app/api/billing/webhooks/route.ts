import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Paystack signs webhooks with HMAC SHA-512 using your secret key.
// Header: x-paystack-signature
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

// For one-time upgrades (or when Paystack doesn't supply next payment date),
// we approximate a period end for UI + entitlement checks.
const DEFAULT_PRO_PERIOD_DAYS = Number(process.env.PRO_PERIOD_DAYS || "30");

function timingSafeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

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

async function resolveUserIdFromEvent(data: any): Promise<string | null> {
  // Preferred: metadata.userId (we set this during initialize)
  const metaUserId = data?.metadata?.userId;
  if (typeof metaUserId === "string" && metaUserId.length > 0) return metaUserId;

  // Fallback: email from customer
  const email =
    data?.customer?.email ||
    data?.customer?.customer_email ||
    data?.email ||
    null;

  const emailLc = toLowerEmail(email);
  if (!emailLc) return null;

  const user = await prisma.user.findUnique({
    where: { email: emailLc },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function setEntitlement(
  userId: string,
  tier: "none" | "free" | "pro",
  status: "none" | "active" | "grace" | "blocked",
  features?: unknown
) {
  await prisma.entitlement.upsert({
    where: { userId },
    create: {
      userId,
      tier: tier as any,
      status: status as any,
      features: features as any,
    },
    update: {
      tier: tier as any,
      status: status as any,
      features: features === undefined ? undefined : (features as any),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing PAYSTACK_SECRET_KEY env var." },
        { status: 500 }
      );
    }

    const signature = req.headers.get("x-paystack-signature") || "";
    if (!signature) {
      return NextResponse.json(
        { error: "Missing x-paystack-signature header." },
        { status: 400 }
      );
    }

    // ✅ Use raw body as-is (critical for signature verification)
    const rawBody = await req.text();

    const computed = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    const ok = timingSafeEqualHex(computed, signature);
    if (!ok) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    // Parse JSON after signature verified
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const eventType = String(event?.event || "");
    const data = event?.data || {};

    const reference: string | null = data?.reference || data?.trxref || null;
    const customerCode: string | null = data?.customer?.customer_code || null;

    // NOTE: Paystack subscription events usually put subscription info in `data`.
    const subscriptionCode: string | null =
      data?.subscription_code || data?.subscription?.subscription_code || null;

    const planCode: string | null =
      data?.plan?.plan_code || data?.plan_code || null;

    // Idempotency key:
    // Prefer Paystack-provided IDs if present, else hash the raw payload.
    const paystackDataId = data?.id ? String(data.id) : null;
    const eventId =
      (paystackDataId && eventType ? `${eventType}:${paystackDataId}` : null) ||
      (reference && eventType ? `${eventType}:${reference}` : null) ||
      sha256Hex(rawBody);

    // Record webhook event (idempotent)
    // If it already exists, we ACK immediately.
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "paystack",
          eventId,
          eventType,
          reference: reference ?? undefined,
          raw: event,
        },
      });
    } catch {
      // Likely unique constraint hit => already processed
      return NextResponse.json({ received: true, deduped: true }, { status: 200 });
    }

    // Resolve user
    const userId = await resolveUserIdFromEvent(data);

    // If we can't link the event to a user, we still ACK (webhook was valid),
    // but it won't affect entitlements.
    if (!userId) {
      return NextResponse.json({ received: true, userLinked: false }, { status: 200 });
    }

    // Useful timestamps
    const paidAt =
      safeDate(data?.paid_at) ||
      safeDate(data?.paidAt) ||
      safeDate(data?.created_at) ||
      new Date();

    // Best effort "next payment" / "period end"
    const nextPaymentDate =
      safeDate(data?.subscription?.next_payment_date) ||
      safeDate(data?.next_payment_date) ||
      null;

    const computedPeriodEnd = nextPaymentDate ?? addDays(paidAt, DEFAULT_PRO_PERIOD_DAYS);

    // === Event handling ===

    // 1) Payment success
    if (eventType === "charge.success") {
      const status = String(data?.status || "").toLowerCase();
      if (status === "success" && reference) {
        const amountKobo =
          typeof data?.amount === "number" ? data.amount : undefined;
        const currency =
          typeof data?.currency === "string" ? data.currency : undefined;

        await prisma.payment.upsert({
          where: { reference },
          create: {
            userId,
            provider: "paystack",
            reference,
            amountKobo: amountKobo ?? undefined,
            currency: currency ?? undefined,
            status: "success" as any,
            paidAt,
            raw: data,
          },
          update: {
            userId,
            status: "success" as any,
            paidAt,
            amountKobo: amountKobo ?? undefined,
            currency: currency ?? undefined,
            raw: data,
          },
        });

        // Keep subscription table updated (even if you're not using recurring plans,
        // this lets the UI show a "renews" date via our computedPeriodEnd).
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            provider: "paystack",
            status: (subscriptionCode ? "active" : "active") as any,
            customerCode: customerCode ?? undefined,
            subscriptionCode: subscriptionCode ?? undefined,
            planCode: planCode ?? undefined,
            currentPeriodEnd: computedPeriodEnd,
          },
          update: {
            status: "active" as any,
            customerCode: customerCode ?? undefined,
            subscriptionCode: subscriptionCode ?? undefined,
            planCode: planCode ?? undefined,
            currentPeriodEnd: computedPeriodEnd,
            canceledAt: null,
          },
        });

        // Grant PRO entitlement (clean replacement for your old hack)
        await setEntitlement(userId, "pro", "active");

        return NextResponse.json({ received: true }, { status: 200 });
      }

      // charge.success but no reference or not success -> ACK
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 2) Subscription lifecycle events
    if (
      eventType === "subscription.create" ||
      eventType === "subscription.enable" ||
      eventType === "subscription.disable"
    ) {
      // IMPORTANT: map to your enum values (inactive|active|canceled|past_due)
      const nextStatus =
        eventType === "subscription.disable" ? "canceled" : "active";

      const canceledAt = eventType === "subscription.disable" ? new Date() : null;

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          provider: "paystack",
          status: nextStatus as any,
          customerCode: customerCode ?? undefined,
          subscriptionCode: subscriptionCode ?? undefined,
          planCode: planCode ?? undefined,
          currentPeriodEnd: computedPeriodEnd,
          canceledAt: canceledAt ?? undefined,
        },
        update: {
          status: nextStatus as any,
          customerCode: customerCode ?? undefined,
          subscriptionCode: subscriptionCode ?? undefined,
          planCode: planCode ?? undefined,
          currentPeriodEnd: computedPeriodEnd,
          canceledAt: canceledAt ?? undefined,
        },
      });

      if (nextStatus === "active") {
        await setEntitlement(userId, "pro", "active");
      } else {
        // downgrade (you can switch this to "grace" if you want a buffer)
        await setEntitlement(userId, "free", "active");
      }

      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 3) Payment failure events (optional but nice)
    if (eventType === "charge.failed" && reference) {
      await prisma.payment.upsert({
        where: { reference },
        create: {
          userId,
          provider: "paystack",
          reference,
          status: "failed" as any,
          raw: data,
        },
        update: {
          userId,
          status: "failed" as any,
          raw: data,
        },
      });

      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Default: valid webhook, recorded, but no special handling yet
    return NextResponse.json({ received: true }, { status: 200 });
  } catch {
    // Returning 500 may trigger Paystack retries, which is useful if DB was down.
    return NextResponse.json({ error: "Webhook handler error." }, { status: 500 });
  }
}
