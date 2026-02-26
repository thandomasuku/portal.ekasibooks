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
    let tier = (ent?.tier as "none" | "free" | "pro" | undefined) ?? "free";
    let entStatus =
      (ent?.status as "none" | "active" | "grace" | "blocked" | undefined) ??
      "active";

    // ✅ Prisma JsonValue-safe features handling
    const rawFeatures: unknown = ent?.features ?? null;
    let featuresObj: Record<string, any> | null = isPlainObject(rawFeatures)
      ? (rawFeatures as Record<string, any>)
      : null;

    // Subscription period end if known (nullable)
    const currentPeriodEndDate: Date | null = sub?.currentPeriodEnd ?? null;
    const currentPeriodEnd = currentPeriodEndDate
      ? currentPeriodEndDate.toISOString()
      : null;

    // ✅ Grace window (computed from subscription.currentPeriodEnd)
    // - If period ended and user is PRO, they enter grace for 7 days.
    // - Persist to entitlement so UI and desktop stay consistent.
    let graceUntil: string | null = null;

    if (tier === "pro" && currentPeriodEndDate) {
      const nowMs = Date.now();
      const cpeMs = currentPeriodEndDate.getTime();
      const graceEndMs = cpeMs + GRACE_DAYS * MS_DAY;

      // In grace window
      if (nowMs > cpeMs && nowMs <= graceEndMs) {
        graceUntil = new Date(graceEndMs).toISOString();

        // Ensure entitlement reflects grace (and store graceUntil once)
        if (entStatus !== "grace" || !featuresObj?.graceUntil) {
          const nextFeatures = isPlainObject(featuresObj) ? { ...featuresObj } : {};
          nextFeatures.graceUntil = graceUntil;
          nextFeatures.graceReason = "period_ended";
          nextFeatures.graceSetAt = new Date().toISOString();

          await prisma.entitlement
            .update({
              where: { userId },
              data: { status: "grace" as any, features: nextFeatures as any },
            })
            .catch(() => null);

          entStatus = "grace";
          featuresObj = nextFeatures;
        } else {
          // Keep response aligned even if we already had it stored
          entStatus = "grace";
        }
      }

      // Past grace window -> downgrade immediately (no waiting for anything else)
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

        // Optional: mark subscription as past_due (helps UI & debugging)
        await prisma.subscription
          .update({
            where: { userId },
            data: { status: "past_due" as any },
          })
          .catch(() => null);

        tier = "free";
        entStatus = "active";
        graceUntil = null;
        featuresObj = nextFeatures;
      }
    }

    // ✅ Back-compat: if entitlement was already grace, read stored graceUntil
    // (Only used if compute block above didn't set it, e.g. if sub.currentPeriodEnd is null)
    if (!graceUntil && entStatus === "grace") {
      const d = parseIsoDate(featuresObj?.["graceUntil"]);
      graceUntil = d ? d.toISOString() : null;
    }

    // ✅ Determine the effective status AFTER we may have changed entStatus above.
    // Subscription status is useful, but must not mask entitlement state (grace/blocked).
    let effectiveStatus = normalizeStatus(sub?.status ?? entStatus);
    if (entStatus === "grace") effectiveStatus = "grace";
    if (entStatus === "blocked") effectiveStatus = "blocked";

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

    const computedLimits = tier === "pro" ? defaultProLimits : defaultFreeLimits;

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
    };

    // ✅ Bug fix: readOnly must respect blocked. Grace stays PRO (not read-only).
    const isBlocked = entStatus === "blocked";
    const readOnly =
      isBlocked ||
      (tier !== "pro" &&
        (featuresObj?.["readOnly"] === true || featuresObj?.["readOnly"] === "true"));

    // Map tier -> UI plan string
    const plan: BillingEntitlementResponse["plan"] = tier === "pro" ? "PRO" : "FREE";

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