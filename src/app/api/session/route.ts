import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SessionPayload = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string | null;
    lastLoginAt: string | null;
    fullName: string | null;
    companyName: string | null;
    phone: string | null;
  };
  entitlement: {
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
};

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

function displayNameFromEmail(email?: string | null) {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  if (!local) return null;

  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

export async function GET(req: NextRequest) {
  try {
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { userId } = await verifySession(token);

    const [user, ent, sub] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          createdAt: true,
          lastLoginAt: true,
          fullName: true,
          companyName: true,
          phone: true,
        },
      }),
      prisma.entitlement.findUnique({
        where: { userId },
        select: { tier: true, status: true, features: true, updatedAt: true },
      }),
      prisma.subscription.findUnique({
        where: { userId },
        select: { status: true, currentPeriodEnd: true, canceledAt: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    // Use let so we can reflect a lazy downgrade within the SAME response
    let tier = (ent?.tier as "none" | "free" | "pro" | undefined) ?? "free";
    let entStatus =
      (ent?.status as "none" | "active" | "grace" | "blocked" | undefined) ?? "active";

    // ✅ Prisma JsonValue-safe features handling
    const rawFeatures: unknown = ent?.features ?? null;
    let featuresObj: Record<string, any> | null = isPlainObject(rawFeatures)
      ? (rawFeatures as Record<string, any>)
      : null;

    // Prefer subscription status if present, else entitlement status
    const status = normalizeStatus(sub?.status ?? entStatus);
    const currentPeriodEnd = sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null;

    // ✅ Real grace window: stored in entitlement.features.graceUntil
    let graceUntil: string | null = null;
    if (entStatus === "grace") {
      const d = parseIsoDate(featuresObj?.["graceUntil"]);
      graceUntil = d ? d.toISOString() : null;
    }

    // ✅ Enforce grace expiry (lazy downgrade):
    // If grace ended, downgrade to FREE immediately.
    if (entStatus === "grace" && graceUntil) {
      const graceDate = new Date(graceUntil);
      if (!Number.isNaN(graceDate.getTime()) && Date.now() > graceDate.getTime()) {
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

        // reflect downgrade in response
        tier = "free";
        entStatus = "active";
        graceUntil = null;
        featuresObj = nextFeatures;
      }
    }

    const defaultFreeLimits = { invoice: 5, quote: 5, purchase_order: 5 };
    const defaultProLimits = { invoice: 999999, quote: 999999, purchase_order: 999999 };
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

    const plan = tier === "pro" ? "PRO" : "FREE";

    const payload: SessionPayload = {
      user: {
        id: user.id,
        email: user.email,
        displayName: displayNameFromEmail(user.email),
        createdAt: user.createdAt ? user.createdAt.toISOString() : null,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        fullName: user.fullName ?? null,
        companyName: user.companyName ?? null,
        phone: user.phone ?? null,
      },
      entitlement: {
        plan,
        status: plan === "FREE" ? "free" : status || "active",
        currentPeriodEnd,
        graceUntil,
        features: {
          readOnly,
          limits,
        },
      },
    };

    return NextResponse.json(payload, { status: 200, headers: noStoreHeaders() });
  } catch {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders() }
    );
  }
}