import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Paystack signs webhooks with HMAC SHA-512 using your secret key.
// Header: x-paystack-signature
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

// For one-time upgrades (or when Paystack doesn't supply next payment date),
// we approximate a period end for UI + entitlement checks.
const DEFAULT_PERIOD_DAYS = Number(process.env.PRO_PERIOD_DAYS || "30");

// ✅ Grace period (failed payment -> grace -> downgrade later)
const GRACE_DAYS = Number(process.env.PRO_GRACE_DAYS || "7");

/**
 * ✅ NEW: Multi-plan mapping
 * We rely primarily on plan_code (best), and optionally validate amounts.
 */
type Tier = "none" | "free" | "starter" | "growth" | "pro";
type EntStatus = "none" | "active" | "grace" | "blocked";
type Cycle = "monthly" | "annual";

type PlanMeta = {
  tier: Exclude<Tier, "none" | "free">;
  cycle: Cycle;
  companies: number;
  amountKobo?: number; // optional strict validation
};

const PLAN_MAP: Record<string, PlanMeta> = {
  // Starter
  [String(
    process.env.PAYSTACK_PLAN_CODE_STARTER_MONTHLY ||
      process.env.PAYSTACK_STARTER_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "starter",
    cycle: "monthly",
    companies: 1,
    amountKobo: Number(
      process.env.PAYSTACK_AMOUNT_KOBO_STARTER_MONTHLY ||
        process.env.PAYSTACK_STARTER_MONTHLY_AMOUNT_KOBO ||
        "19900"
    ),
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_STARTER_ANNUAL ||
      process.env.PAYSTACK_STARTER_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "starter",
    cycle: "annual",
    companies: 1,
    amountKobo: Number(
      process.env.PAYSTACK_AMOUNT_KOBO_STARTER_ANNUAL ||
        process.env.PAYSTACK_STARTER_ANNUAL_AMOUNT_KOBO ||
        "214900"
    ),
  },

  // Growth
  [String(
    process.env.PAYSTACK_PLAN_CODE_GROWTH_MONTHLY ||
      process.env.PAYSTACK_GROWTH_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "growth",
    cycle: "monthly",
    companies: 3,
    amountKobo: Number(
      process.env.PAYSTACK_AMOUNT_KOBO_GROWTH_MONTHLY ||
        process.env.PAYSTACK_GROWTH_MONTHLY_AMOUNT_KOBO ||
        "39900"
    ),
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_GROWTH_ANNUAL ||
      process.env.PAYSTACK_GROWTH_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "growth",
    cycle: "annual",
    companies: 3,
    amountKobo: Number(
      process.env.PAYSTACK_AMOUNT_KOBO_GROWTH_ANNUAL ||
        process.env.PAYSTACK_GROWTH_ANNUAL_AMOUNT_KOBO ||
        "430900"
    ),
  },

  // Pro
  [String(
    process.env.PAYSTACK_PLAN_CODE_PRO_MONTHLY ||
      process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "pro",
    cycle: "monthly",
    companies: 5,
    amountKobo: Number(
      process.env.PAYSTACK_AMOUNT_KOBO_PRO_MONTHLY ||
        process.env.PAYSTACK_PRO_MONTHLY_AMOUNT_KOBO ||
        "59900"
    ),
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_PRO_ANNUAL ||
      process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "pro",
    cycle: "annual",
    companies: 5,
    amountKobo: Number(
      process.env.PAYSTACK_AMOUNT_KOBO_PRO_ANNUAL ||
        process.env.PAYSTACK_PRO_ANNUAL_AMOUNT_KOBO ||
        "646900"
    ),
  },
};

// Remove empty-key entries (in case env vars aren't set yet)
for (const k of Object.keys(PLAN_MAP)) {
  if (!k) delete PLAN_MAP[k];
}

// FREE limits (trial)
const FREE_LIMITS = {
  companies: 1,
  invoice: 5,
  quote: 5,
  purchase_order: 5,
};

// Paid limits
const PAID_LIMITS_UNLIMITED = {
  invoice: 999999,
  quote: 999999,
  purchase_order: 999999,
};

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

/**
 * ✅ Resolve our plan meta from plan_code (authoritative)
 */
function resolvePlanMeta(planCode: string | null): PlanMeta | null {
  const code = safeTrim(planCode);
  if (!code) return null;
  return PLAN_MAP[code] ?? null;
}

/**
 * ✅ Optional amount validation
 * If the plan meta has amountKobo, and event includes amount, we enforce match.
 */
function validatePlanPayment(opts: { planCode?: string | null; amountKobo?: number | null }) {
  const meta = resolvePlanMeta(opts.planCode ?? null);
  if (!meta) return { ok: false as const, reason: "unknown_plan" as const, meta: null as any };

  const amt = typeof opts.amountKobo === "number" ? opts.amountKobo : null;
  const expected = Number(meta.amountKobo || 0);

  if (amt != null && amt > 0 && expected > 0 && amt !== expected) {
    return { ok: false as const, reason: "amount_mismatch" as const, meta };
  }

  return { ok: true as const, meta };
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

async function setEntitlement(userId: string, tier: Tier, status: EntStatus, features?: unknown) {
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

async function putPaidOnGrace(userId: string, reason: string) {
  const ent = await prisma.entitlement.findUnique({
    where: { userId },
    select: { tier: true, status: true, features: true },
  });

  const tier = (ent?.tier as Tier) ?? "free";
  const status = (ent?.status as EntStatus) ?? "active";

  // Only paid tiers can enter grace. Don't override a blocked user.
  if (tier === "free" || tier === "none") return;
  if (status === "blocked") return;

  const now = new Date();

  // Prisma JsonValue-safe read
  const existingGraceUntil = isPlainObject(ent?.features)
    ? (ent!.features as Record<string, unknown>)["graceUntil"]
    : undefined;

  const graceUntil = computeGraceUntil(existingGraceUntil, now, GRACE_DAYS);

  const nextFeatures = mergeFeatures(ent?.features, {
    graceUntil,
    graceReason: reason,
    graceSetAt: now.toISOString(),
  });

  await setEntitlement(userId, tier, "grace", nextFeatures);
}

function buildPaidFeatures(tier: "starter" | "growth" | "pro", companies: number) {
  return {
    readOnly: false,
    limits: {
      ...PAID_LIMITS_UNLIMITED,
      companies,
    },
    tier,
  };
}

function buildFreeFeatures() {
  return {
    readOnly: false,
    limits: { ...FREE_LIMITS },
    tier: "free",
  };
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

    const computed = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");

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
      return NextResponse.json({ received: true, deduped: true }, { status: 200 });
    }

    // Resolve user
    const userId = await resolveUserIdFromEvent(data);

    // If we can't link the event to a user, we still ACK (webhook was valid)
    if (!userId) {
      return NextResponse.json({ received: true, userLinked: false }, { status: 200 });
    }

    // Useful timestamps
    const paidAt =
      safeDate(data?.paid_at) || safeDate(data?.paidAt) || safeDate(data?.created_at) || new Date();

    // Best effort "next payment" / "period end"
    const nextPaymentDate =
      safeDate(data?.subscription?.next_payment_date) || safeDate(data?.next_payment_date) || null;

    const computedPeriodEnd = nextPaymentDate ?? addDays(paidAt, DEFAULT_PERIOD_DAYS);

    // === Event handling ===

    // 1) Payment success
    if (eventType === "charge.success") {
      const status = String(data?.status || "").toLowerCase();
      if (status === "success" && reference) {
        const amountKobo = typeof data?.amount === "number" ? data.amount : undefined;
        const currency = typeof data?.currency === "string" ? data.currency : undefined;

        const validation = validatePlanPayment({
          planCode,
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

        // Only upgrade if payment matches one of OUR plan codes (and amount if supplied)
        if (validation.ok) {
          const meta = validation.meta;

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
              canceledAt: null,
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

          // ✅ Grant entitlement for the correct tier + limits
          await setEntitlement(
            userId,
            meta.tier,
            "active",
            buildPaidFeatures(meta.tier, meta.companies)
          );
        } else {
          // Payment succeeded, but doesn't match our plan codes/amounts.
          // We keep the payment record but do NOT upgrade access.
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
        // Subscription became active: upgrade only if plan code matches one of ours.
        const validation = validatePlanPayment({ planCode, amountKobo: null });
        if (validation.ok) {
          const meta = validation.meta;
          await setEntitlement(
            userId,
            meta.tier,
            "active",
            buildPaidFeatures(meta.tier, meta.companies)
          );
        }
      } else {
        // Subscription disabled/canceled => put paid tier on grace (do NOT downgrade immediately)
        await putPaidOnGrace(userId, "subscription_inactive");
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

      // Failed payment => put paid tier on grace
      await putPaidOnGrace(userId, "charge_failed");

      return NextResponse.json({ received: true }, { status: 200 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch {
    // Returning 500 may trigger Paystack retries, which is useful if DB was down.
    return NextResponse.json({ error: "Webhook handler error." }, { status: 500 });
  }
}