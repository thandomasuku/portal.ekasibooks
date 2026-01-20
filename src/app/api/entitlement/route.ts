import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type BillingEntitlementResponse = {
  plan: "FREE" | "PRO" | string;
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  features: {
    readOnly: boolean;
    limits: {
      invoice: number;
      quote: number;
      purchase_order: number;
    };
  };
};

function normalizeStatus(raw?: string | null) {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return "unknown";
  return s;
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

    // Pull both entitlement + subscription (subscription gives you period end when you start tracking it)
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

    const tier = (ent?.tier as "none" | "free" | "pro" | undefined) ?? "free";
    const entStatus = (ent?.status as "none" | "active" | "grace" | "blocked" | undefined) ?? "active";

    // Map tier -> UI plan string
    const plan: BillingEntitlementResponse["plan"] = tier === "pro" ? "PRO" : "FREE";

    // Prefer subscription status if present, else entitlement status
    const status = normalizeStatus(sub?.status ?? entStatus);

    // Subscription period end if known (nullable)
    const currentPeriodEnd = sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null;

    // Optional grace window:
    // If entitlement is in grace, we expose updatedAt+7 days as a simple graceUntil,
    // but you can replace this later with a real graceUntil column.
    const graceUntil =
      entStatus === "grace" && ent?.updatedAt
        ? new Date(ent.updatedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

    // Default limits (FREE)
    const defaultFreeLimits = {
      invoice: 5,
      quote: 5,
      purchase_order: 5,
    };

    // Default limits (PRO)
    const defaultProLimits = {
      invoice: 999999,
      quote: 999999,
      purchase_order: 999999,
    };

    // You can override these via ent.features JSON later.
    // We support either:
    // features: { readOnly: boolean, limits: {...} }
    // or partials.
    const rawFeatures: any = ent?.features ?? null;

    const computedLimits =
      tier === "pro" ? defaultProLimits : defaultFreeLimits;

    const limits = {
      invoice:
        typeof rawFeatures?.limits?.invoice === "number"
          ? rawFeatures.limits.invoice
          : computedLimits.invoice,
      quote:
        typeof rawFeatures?.limits?.quote === "number"
          ? rawFeatures.limits.quote
          : computedLimits.quote,
      purchase_order:
        typeof rawFeatures?.limits?.purchase_order === "number"
          ? rawFeatures.limits.purchase_order
          : computedLimits.purchase_order,
    };

    const readOnly =
      tier !== "pro" &&
      (rawFeatures?.readOnly === true ||
        rawFeatures?.readOnly === "true" ||
        false);

    const payload: BillingEntitlementResponse = {
      plan,
      status: plan === "FREE" ? "free" : status || "active",
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
