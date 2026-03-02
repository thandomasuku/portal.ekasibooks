import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Plan = "FREE" | "STARTER" | "GROWTH" | "PRO";

type Tier = "none" | "free" | "starter" | "growth" | "pro";
type EntStatus = "none" | "active" | "grace" | "blocked";

type BillingEntitlementResponse = {
  plan: Plan | string;
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
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
        select: { status: true, currentPeriodEnd: true, canceledAt: true },
      }),
    ]);

    // Use let so we can reflect state changes in the SAME response
    let tier = normalizeTier(ent?.tier);
    let entStatus = normalizeEntStatus(ent?.status);

    // ✅ Prisma JsonValue-safe features handling
    const rawFeatures: unknown = ent?.features ?? null;
let featuresObj: Record<string, any> = isPlainObject(rawFeatures)
  ? (rawFeatures as Record<string, any>)
  : {};

// Ensure nested shape exists (prevents future null/undefined issues)
if (!isPlainObject(featuresObj.limits)) featuresObj.limits = {};

    // Ensure nested shape exists (so reads like featuresObj.limits.companies don't explode)
    if (!featuresObj) featuresObj = {};
    if (!isPlainObject(featuresObj["limits"])) featuresObj["limits"] = {};

    // Subscription period end if known (nullable)
    const currentPeriodEndDate: Date | null = sub?.currentPeriodEnd ?? null;
    const currentPeriodEnd = currentPeriodEndDate
      ? currentPeriodEndDate.toISOString()
      : null;

    // ✅ Grace window (computed from subscription.currentPeriodEnd)
    // - If period ended and user is on a PAID tier, they enter grace for 7 days.
    // - Persist to entitlement so UI and desktop stay consistent.
    let graceUntil: string | null = null;

    if (isPaidTier(tier) && currentPeriodEndDate) {
      const nowMs = Date.now();
      const cpeMs = currentPeriodEndDate.getTime();
      const graceEndMs = cpeMs + GRACE_DAYS * MS_DAY;

      // In grace window
      if (nowMs > cpeMs && nowMs <= graceEndMs) {
        graceUntil = new Date(graceEndMs).toISOString();

        // Ensure entitlement reflects grace (and store graceUntil once)
        if (entStatus !== "grace" || !featuresObj?.["graceUntil"]) {
          const nextFeatures = isPlainObject(featuresObj) ? { ...featuresObj } : {};
          nextFeatures.graceUntil = graceUntil;
          nextFeatures.graceReason = "period_ended";
          nextFeatures.graceSetAt = new Date().toISOString();

          // keep limits object present
          if (!isPlainObject(nextFeatures["limits"])) nextFeatures["limits"] = {};

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
        if (!isPlainObject(featuresObj["limits"])) featuresObj["limits"] = {};
      }
    }

    // ✅ Back-compat: if entitlement was already grace, read stored graceUntil
    if (!graceUntil && entStatus === "grace") {
      const d = parseIsoDate(featuresObj?.["graceUntil"]);
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

    const defaultPaidLimitsByTier: Record<
      Exclude<Tier, "none" | "free">,
      typeof defaultFreeLimits
    > = {
      starter: { invoice: 999999, quote: 999999, purchase_order: 999999, companies: 1 },
      growth: { invoice: 999999, quote: 999999, purchase_order: 999999, companies: 3 },
      pro: { invoice: 999999, quote: 999999, purchase_order: 999999, companies: 5 },
    };

    const computedLimits =
      tier === "starter" || tier === "growth" || tier === "pro"
        ? defaultPaidLimitsByTier[tier]
        : defaultFreeLimits;

    const limits = {
      invoice:
        typeof featuresObj?.["limits"]?.invoice === "number"
          ? (featuresObj["limits"].invoice as number)
          : computedLimits.invoice,
      quote:
        typeof featuresObj?.["limits"]?.quote === "number"
          ? (featuresObj["limits"].quote as number)
          : computedLimits.quote,
      purchase_order:
        typeof featuresObj?.["limits"]?.purchase_order === "number"
          ? (featuresObj["limits"].purchase_order as number)
          : computedLimits.purchase_order,
      companies:
        typeof featuresObj?.["limits"]?.companies === "number"
          ? (featuresObj["limits"].companies as number)
          : computedLimits.companies,
    };

    // ✅ readOnly must respect blocked.
    const isBlocked = entStatus === "blocked";
    const readOnly =
      isBlocked ||
      (!isPaidTier(tier) &&
        (featuresObj?.["readOnly"] === true || featuresObj?.["readOnly"] === "true"));

    const plan: BillingEntitlementResponse["plan"] = tierToPlan(tier);

    const payload: BillingEntitlementResponse = {
      plan,
      status: plan === "FREE" ? "free" : effectiveStatus || "active",
      currentPeriodEnd,
      graceUntil,
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