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

// ✅ Grace period (failed payment -> grace -> downgrade later)
const PRO_GRACE_DAYS = Number(process.env.PRO_GRACE_DAYS || "7");

// Plan codes & amounts (lowest denomination) for validation
const LEGACY_PLAN_CODE = process.env.PAYSTACK_PLAN_CODE || "";
const PLAN_CODE_MONTHLY =
  process.env.PAYSTACK_PLAN_CODE_MONTHLY || process.env.PAYSTACK_PLAN_CODE || "";
const PLAN_CODE_ANNUAL = process.env.PAYSTACK_PLAN_CODE_ANNUAL || "";

const AMOUNT_KOBO_MONTHLY = Number(
  process.env.PAYSTACK_AMOUNT_KOBO_MONTHLY || process.env.PAYSTACK_AMOUNT_KOBO || "19900"
);
const AMOUNT_KOBO_ANNUAL = Number(process.env.PAYSTACK_AMOUNT_KOBO_ANNUAL || "214900");

// Fallback amounts: Monthly R199 -> 19900, Annual R2149 -> 214900
const FALLBACK_MONTHLY_AMOUNT = 19900;
const FALLBACK_ANNUAL_AMOUNT = 214900;

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

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function expectedAmountKobo(cycle: "monthly" | "annual") {
  const monthly = AMOUNT_KOBO_MONTHLY > 0 ? AMOUNT_KOBO_MONTHLY : FALLBACK_MONTHLY_AMOUNT;
  const annual = AMOUNT_KOBO_ANNUAL > 0 ? AMOUNT_KOBO_ANNUAL : FALLBACK_ANNUAL_AMOUNT;
  return cycle === "annual" ? annual : monthly;
}

function inferCycle(planCode?: string | null, amountKobo?: number | null): "monthly" | "annual" {
  const pc = safeTrim(planCode);

  if (pc && PLAN_CODE_ANNUAL && pc === PLAN_CODE_ANNUAL) return "annual";
  if (pc && PLAN_CODE_MONTHLY && pc === PLAN_CODE_MONTHLY) return "monthly";

  if (typeof amountKobo === "number" && amountKobo > 0) {
    if (AMOUNT_KOBO_ANNUAL > 0 && amountKobo === AMOUNT_KOBO_ANNUAL) return "annual";
    if (AMOUNT_KOBO_MONTHLY > 0 && amountKobo === AMOUNT_KOBO_MONTHLY) return "monthly";
    if (amountKobo === FALLBACK_ANNUAL_AMOUNT) return "annual";
    if (amountKobo === FALLBACK_MONTHLY_AMOUNT) return "monthly";
  }

  return "monthly";
}

function validatePaymentSignals(opts: { planCode?: string | null; amountKobo?: number | null }) {
  const planCode = safeTrim(opts.planCode);
  const amountKobo = typeof opts.amountKobo === "number" ? opts.amountKobo : null;

  const allowedPlans = new Set(
    [PLAN_CODE_MONTHLY, PLAN_CODE_ANNUAL, LEGACY_PLAN_CODE].map(safeTrim).filter(Boolean)
  );

  if (planCode) {
    if (allowedPlans.size > 0 && !allowedPlans.has(planCode)) {
      return { ok: false as const, reason: "unknown_plan" as const, cycle: null as any };
    }

    const cycle = inferCycle(planCode, amountKobo);
    const expected = expectedAmountKobo(cycle);

    if (amountKobo != null && amountKobo > 0 && amountKobo !== expected) {
      return { ok: false as const, reason: "amount_mismatch" as const, cycle };
    }

    return { ok: true as const, cycle };
  }

  if (amountKobo != null && amountKobo > 0) {
    const monthlyExpected = expectedAmountKobo("monthly");
    const annualExpected = expectedAmountKobo("annual");
    if (amountKobo === monthlyExpected) return { ok: true as const, cycle: "monthly" as const };
    if (amountKobo === annualExpected) return { ok: true as const, cycle: "annual" as const };
  }

  return { ok: false as const, reason: "unrecognized_payment" as const, cycle: null as any };
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergeFeatures(prev: unknown, patch: Record<string, any>) {
  const base = isPlainObject(prev) ? prev : {};
  return { ...base, ...patch };
}

function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeGraceUntil(existingGraceUntil: unknown, now: Date, days: number): string {
  const candidate = addDays(now, days);
  const existing = parseIsoDate(existingGraceUntil);
  // Keep whichever is later (never shorten an existing grace window)
  const winner = existing && existing.getTime() > candidate.getTime() ? existing : candidate;
  return winner.toISOString();
}

function extractReference(data: any): string | null {
  return data?.reference || data?.trxref || data?.data?.reference || null;
}

function extractPlanCodeFromEvent(data: any): string | null {
  const candidates = [
    data?.plan?.plan_code,
    data?.plan_code,
    data?.subscription?.plan?.plan_code,
    data?.subscription?.plan_code,
    data?.authorization?.plan,
    data?.metadata?.selectedPlanCode,
    data?.metadata?.selected_plan_code,
    data?.metadata?.planCode,
    data?.metadata?.plan,
  ];

  for (const c of candidates) {
    const v = safeTrim(c);
    if (v) return v;
  }
  return null;
}

async function resolveUserIdFromEvent(data: any): Promise<string | null> {
  // Preferred: metadata.userId (we set this during initialize)
  const metaUserId = data?.metadata?.userId;
  if (typeof metaUserId === "string" && metaUserId.length > 0) return metaUserId;

  // Fallback: email from customer
  const email = data?.customer?.email || data?.customer?.customer_email || data?.email || null;

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

async function putProOnGrace(userId: string, reason: string) {
  const ent = await prisma.entitlement.findUnique({
    where: { userId },
    select: { tier: true, status: true, features: true },
  });

  const tier = (ent?.tier as any) ?? "free";
  const status = (ent?.status as any) ?? "active";

  // Only PRO can enter grace. Don't override a blocked user.
  if (tier !== "pro") return;
  if (status === "blocked") return;

  const now = new Date();

  // ✅ Prisma JsonValue-safe read (no `.graceUntil` property access)
  const existingGraceUntil = isPlainObject(ent?.features)
    ? (ent!.features as Record<string, unknown>)["graceUntil"]
    : undefined;

  const graceUntil = computeGraceUntil(existingGraceUntil, now, PRO_GRACE_DAYS);

  const nextFeatures = mergeFeatures(ent?.features, {
    graceUntil,
    graceReason: reason,
    graceSetAt: now.toISOString(),
  });

  await setEntitlement(userId, "pro", "grace", nextFeatures);
}

export async function POST(req: NextRequest) {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY env var." }, { status: 500 });
    }

    const signature = req.headers.get("x-paystack-signature") || "";
    if (!signature) {
      return NextResponse.json({ error: "Missing x-paystack-signature header." }, { status: 400 });
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

    const reference: string | null = extractReference(data);
    const customerCode: string | null = data?.customer?.customer_code || null;

    // NOTE: Paystack subscription events usually put subscription info in `data`.
    const subscriptionCode: string | null =
      data?.subscription_code || data?.subscription?.subscription_code || null;

    const planCode: string | null = extractPlanCodeFromEvent(data);

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
      safeDate(data?.paid_at) || safeDate(data?.paidAt) || safeDate(data?.created_at) || new Date();

    // Best effort "next payment" / "period end"
    const nextPaymentDate =
      safeDate(data?.subscription?.next_payment_date) || safeDate(data?.next_payment_date) || null;

    const computedPeriodEnd = nextPaymentDate ?? addDays(paidAt, DEFAULT_PRO_PERIOD_DAYS);

    // === Event handling ===

    // 1) Payment success
    if (eventType === "charge.success") {
      const status = String(data?.status || "").toLowerCase();
      if (status === "success" && reference) {
        const amountKobo = typeof data?.amount === "number" ? data.amount : undefined;
        const currency = typeof data?.currency === "string" ? data.currency : undefined;

        const validation = validatePaymentSignals({
          planCode: planCode,
          amountKobo: amountKobo ?? null,
        });

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

        // Only upgrade if payment is for OUR plan/amount
        if (validation.ok) {
          await prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              provider: "paystack",
              status: "active" as any,
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

          // Grant PRO entitlement (clears grace by forcing active)
          await setEntitlement(userId, "pro", "active");
        } else {
          // Payment succeeded, but it doesn't match our plan codes/amounts.
          // Keep a record of the payment but do NOT upgrade access.
        }

        return NextResponse.json({ received: true }, { status: 200 });
      }

      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 2) Subscription lifecycle events
    if (
      eventType === "subscription.create" ||
      eventType === "subscription.enable" ||
      eventType === "subscription.disable"
    ) {
      const nextStatus = eventType === "subscription.disable" ? "canceled" : "active";
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
        // Subscription became active: only upgrade if plan code is one of ours.
        const validation = validatePaymentSignals({ planCode, amountKobo: null });
        if (validation.ok) {
          await setEntitlement(userId, "pro", "active");
        }
      } else {
        // ✅ Subscription disabled/canceled => put PRO on grace (do NOT downgrade immediately)
        await putProOnGrace(userId, "subscription_inactive");
      }

      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 3) Payment failure events
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

      // ✅ Failed payment => put PRO on grace for 7 days
      await putProOnGrace(userId, "charge_failed");

      return NextResponse.json({ received: true }, { status: 200 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch {
    // Returning 500 may trigger Paystack retries, which is useful if DB was down.
    return NextResponse.json({ error: "Webhook handler error." }, { status: 500 });
  }
}