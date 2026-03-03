import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Plan = "FREE" | "STARTER" | "GROWTH" | "PRO";

type Tier = "none" | "free" | "starter" | "growth" | "pro";
type EntStatus = "none" | "active" | "grace" | "blocked";
type BillingCycle = "monthly" | "annual";

type BillingEntitlementResponse = {
  // legacy fields your UI already uses
  plan: Plan | string;
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;

  // ✅ new fields (safe additions — won’t break older clients)
  tier: Tier; // "free" | "starter" | "growth" | "pro"
  interval: BillingCycle | null; // inferred from planCode if possible
  amount: number | null; // Rands (e.g. 199, 4309)
  planCode: string | null; // subscription plan code (useful for debugging)

  features: {
    readOnly: boolean;
    limits: {
      invoice: number;
      quote: number;
      purchase_order: number;
      companies: number;
    };
  };
};

function normalizeStatus(raw?: string | null) {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return "unknown";
  return s;
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function stripGraceFields(prev: unknown) {
  const base = isPlainObject(prev) ? { ...(prev as Record<string, any>) } : {};
  delete base.graceUntil;
  delete base.graceReason;
  delete base.graceSetAt;
  base.downgradedAt = new Date().toISOString();
  base.downgradeReason = "grace_expired";
  return base;
}

const GRACE_DAYS = 7;
const MS_DAY = 24 * 60 * 60 * 1000;

function tierToPlan(tier: Tier): Plan {
  if (tier === "pro") return "PRO";
  if (tier === "growth") return "GROWTH";
  if (tier === "starter") return "STARTER";
  return "FREE";
}

function isPaidTier(tier: Tier) {
  return tier === "starter" || tier === "growth" || tier === "pro";
}

function normalizeTier(raw: unknown): Tier {
  const t = String(raw ?? "").toLowerCase().trim();
  if (t === "pro") return "pro";
  if (t === "growth") return "growth";
  if (t === "starter") return "starter";
  if (t === "free") return "free";
  if (t === "none") return "none";
  return "free";
}

function normalizeEntStatus(raw: unknown): EntStatus {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "active") return "active";
  if (s === "grace") return "grace";
  if (s === "blocked") return "blocked";
  if (s === "none") return "none";
  return "active";
}

/* =========================================================
   ✅ Pricing + plan-code inference (matches subscribe route)
   ========================================================= */

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

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function inferIntervalFromPlanCode(tier: Tier, planCode: string | null): BillingCycle | null {
  const pc = safeTrim(planCode);
  if (!pc) return null;

  if (tier === "starter") {
    if (PLAN_CODES.starter.annual && pc === PLAN_CODES.starter.annual) return "annual";
    if (PLAN_CODES.starter.monthly && pc === PLAN_CODES.starter.monthly) return "monthly";
  }
  if (tier === "growth") {
    if (PLAN_CODES.growth.annual && pc === PLAN_CODES.growth.annual) return "annual";
    if (PLAN_CODES.growth.monthly && pc === PLAN_CODES.growth.monthly) return "monthly";
  }
  if (tier === "pro") {
    if (PLAN_CODES.pro.annual && pc === PLAN_CODES.pro.annual) return "annual";
    if (PLAN_CODES.pro.monthly && pc === PLAN_CODES.pro.monthly) return "monthly";
  }

  return null;
}

function amountRandFor(tier: Tier, interval: BillingCycle | null): number | null {
  if (!isPaidTier(tier)) return null;
  const cyc = interval ?? "monthly"; // if unknown, default display (UI-only)
  const kobo =
    tier === "starter"
      ? AMOUNTS_KOBO.starter[cyc]
      : tier === "growth"
      ? AMOUNTS_KOBO.growth[cyc]
      : AMOUNTS_KOBO.pro[cyc];

  // convert to rands (19900 -> 199)
  return Math.round((kobo || 0) / 100);
}

export async function GET(req: NextRequest) {
  try {
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Pull both entitlement + subscription
    const [ent, sub] = await Promise.all([
      prisma.entitlement.findUnique({
        where: { userId },
        select: { tier: true, status: true, features: true, updatedAt: true },
      }),
      prisma.subscription.findUnique({
        where: { userId },
        select: { status: true, currentPeriodEnd: true, canceledAt: true, planCode: true },
      }),
    ]);

    // Use let so we can reflect state changes in the SAME response
    let tier = normalizeTier(ent?.tier);
    let entStatus = normalizeEntStatus(ent?.status);

    // ✅ Prisma JsonValue-safe features handling (single clean init)
    const rawFeatures: unknown = ent?.features ?? null;
    let featuresObj: Record<string, any> = isPlainObject(rawFeatures) ? { ...(rawFeatures as any) } : {};
    if (!isPlainObject(featuresObj.limits)) featuresObj.limits = {};

    // Subscription period end if known (nullable)
    const currentPeriodEndDate: Date | null = sub?.currentPeriodEnd ?? null;
    const currentPeriodEnd = currentPeriodEndDate ? currentPeriodEndDate.toISOString() : null;

    // ✅ Grace window (computed from subscription.currentPeriodEnd)
    let graceUntil: string | null = null;

    if (isPaidTier(tier) && currentPeriodEndDate) {
      const nowMs = Date.now();
      const cpeMs = currentPeriodEndDate.getTime();
      const graceEndMs = cpeMs + GRACE_DAYS * MS_DAY;

      // In grace window
      if (nowMs > cpeMs && nowMs <= graceEndMs) {
        graceUntil = new Date(graceEndMs).toISOString();

        if (entStatus !== "grace" || !featuresObj.graceUntil) {
          const nextFeatures = { ...featuresObj };
          nextFeatures.graceUntil = graceUntil;
          nextFeatures.graceReason = "period_ended";
          nextFeatures.graceSetAt = new Date().toISOString();
          if (!isPlainObject(nextFeatures.limits)) nextFeatures.limits = {};

          await prisma.entitlement
            .update({
              where: { userId },
              data: { status: "grace" as any, features: nextFeatures as any },
            })
            .catch(() => null);

          entStatus = "grace";
          featuresObj = nextFeatures;
        } else {
          entStatus = "grace";
        }
      }

      // Past grace window -> downgrade immediately
      if (nowMs > graceEndMs) {
        const nextFeatures = stripGraceFields(featuresObj);

        await prisma.entitlement.update({
          where: { userId },
          data: {
            tier: "free" as any,
            status: "active" as any,
            features: nextFeatures as any,
          },
        });

        await prisma.subscription
          .update({
            where: { userId },
            data: { status: "past_due" as any },
          })
          .catch(() => null);

        tier = "free";
        entStatus = "active";
        graceUntil = null;
        featuresObj = isPlainObject(nextFeatures) ? (nextFeatures as any) : {};
        if (!isPlainObject(featuresObj.limits)) featuresObj.limits = {};
      }
    }

    // ✅ Back-compat: if entitlement was already grace, read stored graceUntil
    if (!graceUntil && entStatus === "grace") {
      const d = parseIsoDate(featuresObj.graceUntil);
      graceUntil = d ? d.toISOString() : null;
    }

    // ✅ Determine the effective status AFTER we may have changed entStatus above.
    let effectiveStatus = normalizeStatus(sub?.status ?? entStatus);
    if (entStatus === "grace") effectiveStatus = "grace";
    if (entStatus === "blocked") effectiveStatus = "blocked";

    // Defaults
    const defaultFreeLimits = {
      invoice: 5,
      quote: 5,
      purchase_order: 5,
      companies: 1,
    };

    const defaultPaidLimitsByTier = {
      starter: { invoice: 999999, quote: 999999, purchase_order: 999999, companies: 1 },
      growth: { invoice: 999999, quote: 999999, purchase_order: 999999, companies: 3 },
      pro: { invoice: 999999, quote: 999999, purchase_order: 999999, companies: 5 },
    } as const;

    const computedLimits =
      tier === "starter" || tier === "growth" || tier === "pro"
        ? defaultPaidLimitsByTier[tier]
        : defaultFreeLimits;

    const limits = {
      invoice: typeof featuresObj?.limits?.invoice === "number" ? (featuresObj.limits.invoice as number) : computedLimits.invoice,
      quote: typeof featuresObj?.limits?.quote === "number" ? (featuresObj.limits.quote as number) : computedLimits.quote,
      purchase_order:
        typeof featuresObj?.limits?.purchase_order === "number"
          ? (featuresObj.limits.purchase_order as number)
          : computedLimits.purchase_order,
      companies:
        typeof featuresObj?.limits?.companies === "number"
          ? (featuresObj.limits.companies as number)
          : computedLimits.companies,
    };

    // ✅ readOnly must respect blocked.
    const isBlocked = entStatus === "blocked";
    const readOnly =
      isBlocked ||
      (!isPaidTier(tier) && (featuresObj?.readOnly === true || featuresObj?.readOnly === "true"));

    const plan: BillingEntitlementResponse["plan"] = tierToPlan(tier);

    // ✅ interval + amount for the portal UI
    const planCode = safeTrim(sub?.planCode) || null;
    const interval = isPaidTier(tier) ? inferIntervalFromPlanCode(tier, planCode) : null;
    const amount = isPaidTier(tier) ? amountRandFor(tier, interval) : null;

    const payload: BillingEntitlementResponse = {
      plan,
      tier,
      status: plan === "FREE" ? "free" : effectiveStatus || "active",
      currentPeriodEnd,
      graceUntil,
      interval,
      amount,
      planCode,
      features: {
        readOnly,
        limits,
      },
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
}