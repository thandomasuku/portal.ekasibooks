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

export async function GET(req: NextRequest) {
  try {
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStoreHeaders() });
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStoreHeaders() });
    }

    const tier = (ent?.tier as "none" | "free" | "pro" | undefined) ?? "free";
    const entStatus = (ent?.status as "none" | "active" | "grace" | "blocked" | undefined) ?? "active";

    const plan = tier === "pro" ? "PRO" : "FREE";
    const status = normalizeStatus(sub?.status ?? entStatus);
    const currentPeriodEnd = sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null;
    const graceUntil =
      entStatus === "grace" && ent?.updatedAt
        ? new Date(ent.updatedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const defaultFreeLimits = { invoice: 5, quote: 5, purchase_order: 5 };
    const defaultProLimits = { invoice: 999999, quote: 999999, purchase_order: 999999 };
    const rawFeatures: any = ent?.features ?? null;
    const computedLimits = tier === "pro" ? defaultProLimits : defaultFreeLimits;

    const limits = {
      invoice: typeof rawFeatures?.limits?.invoice === "number" ? rawFeatures.limits.invoice : computedLimits.invoice,
      quote: typeof rawFeatures?.limits?.quote === "number" ? rawFeatures.limits.quote : computedLimits.quote,
      purchase_order:
        typeof rawFeatures?.limits?.purchase_order === "number"
          ? rawFeatures.limits.purchase_order
          : computedLimits.purchase_order,
    };

    const readOnly =
      tier !== "pro" &&
      (rawFeatures?.readOnly === true || rawFeatures?.readOnly === "true" || false);

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStoreHeaders() });
  }
}
