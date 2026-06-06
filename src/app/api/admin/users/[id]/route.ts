import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ROLE_VALUES = new Set(["user", "admin"]);
const ACCOUNT_ACTIONS = new Set([
  "updateAccount",
  "deactivate",
  "reactivate",
  "resetPassword",
  "setSubscriptionTier",
]);

function cleanNullable(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanRole(value: unknown) {
  return String(value ?? "user")
    .trim()
    .toLowerCase();
}

function cleanAction(value: unknown) {
  const action = String(value ?? "updateAccount").trim();
  return ACCOUNT_ACTIONS.has(action) ? action : "";
}

const SUBSCRIPTION_TIERS = new Set(["free", "starter", "growth", "pro"]);

type SubscriptionTier = "free" | "starter" | "growth" | "pro";

type AdminSubscriptionStatus = "active" | "past_due" | "canceled";

const ADMIN_SUBSCRIPTION_STATUSES = new Set(["active", "past_due", "canceled"]);

function cleanSubscriptionTier(value: unknown): SubscriptionTier | "" {
  const tier = String(value ?? "")
    .trim()
    .toLowerCase();
  return SUBSCRIPTION_TIERS.has(tier) ? (tier as SubscriptionTier) : "";
}

function cleanSubscriptionStatus(value: unknown): AdminSubscriptionStatus {
  const status = String(value ?? "active")
    .trim()
    .toLowerCase();
  return ADMIN_SUBSCRIPTION_STATUSES.has(status)
    ? (status as AdminSubscriptionStatus)
    : "active";
}

function parsePeriodEnd(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const d = dateOnly ? new Date(`${text}T23:59:59.999Z`) : new Date(text);

  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function paidCompanies(tier: SubscriptionTier) {
  if (tier === "pro") return 5;
  if (tier === "growth") return 3;
  return 1;
}

function buildTierFeatures(opts: {
  tier: SubscriptionTier;
  status: AdminSubscriptionStatus;
  periodEnd: Date | null;
  reason: string | null;
  adminId: string;
}) {
  const now = new Date().toISOString();
  const { tier, status, periodEnd, reason, adminId } = opts;
  const paid = tier === "starter" || tier === "growth" || tier === "pro";
  const companies = paidCompanies(tier);

  const features: Record<string, unknown> = {
    readOnly: status === "past_due",
    cloudSync: tier === "growth" || tier === "pro",
    storesync: tier === "growth" || tier === "pro",
    maxActiveSessions: tier === "pro" ? 4 : tier === "growth" ? 2 : 1,
    limits: paid
      ? {
          companies,
          invoice: 999999,
          quote: 999999,
          purchase_order: 999999,
        }
      : {
          companies: 1,
          invoice: 5,
          quote: 5,
          purchase_order: 5,
        },
    manualOverride: paid && status === "active",
    manualOverrideGrantedAt: now,
    manualOverrideGrantedBy: adminId,
    manualOverrideSource: "admin_subscription_override",
    adminUpdatedAt: now,
  };

  if (periodEnd) {
    features.manualOverrideUntil = periodEnd.toISOString();
    features.currentPeriodEnd = periodEnd.toISOString();
  }

  if (reason) features.manualOverrideReason = reason;

  if (!paid || status !== "active") {
    features.manualOverride = false;
    features.manualOverrideRevokedAt = now;
  }

  if (status === "past_due" && periodEnd) {
    features.graceUntil = periodEnd.toISOString();
  }

  return features;
}

function entitlementStatusFor(
  tier: SubscriptionTier,
  status: AdminSubscriptionStatus,
) {
  if (status === "past_due") return "grace";
  if (tier === "free" || status === "canceled") return "active";
  return "active";
}

function subscriptionPlanCodeFor(tier: SubscriptionTier) {
  return tier === "free" ? null : `admin_override:${tier}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;
  const action = cleanAction(input.action);

  if (!action) {
    return NextResponse.json(
      { error: "Invalid account action" },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      isActive: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "deactivate") {
    if (id === admin.id) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 400 },
      );
    }

    const now = new Date();
    const reason = cleanNullable(input.deactivatedReason, 240);

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          deactivatedAt: now,
          deactivatedReason: reason,
        },
        select: {
          id: true,
          email: true,
          role: true,
          fullName: true,
          companyName: true,
          phone: true,
          isActive: true,
          deactivatedAt: true,
          deactivatedReason: true,
          updatedAt: true,
        },
      }),
      prisma.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);

    return NextResponse.json({ user: updated });
  }

  if (action === "reactivate") {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedReason: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        companyName: true,
        phone: true,
        isActive: true,
        deactivatedAt: true,
        deactivatedReason: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ user: updated });
  }

  if (action === "setSubscriptionTier") {
    const tier = cleanSubscriptionTier(input.tier);

    if (!tier) {
      return NextResponse.json(
        { error: "Invalid subscription tier." },
        { status: 400 },
      );
    }

    const reason = cleanNullable(input.reason, 240);
    const requestedStatus = cleanSubscriptionStatus(input.subscriptionStatus);
    const periodEnd = parsePeriodEnd(input.currentPeriodEnd);
    const isPaidTier =
      tier === "starter" || tier === "growth" || tier === "pro";
    const subscriptionStatus: AdminSubscriptionStatus =
      tier === "free" ? "canceled" : requestedStatus;

    if (isPaidTier && subscriptionStatus === "active" && !periodEnd) {
      return NextResponse.json(
        { error: "Choose an override end date for paid/admin access." },
        { status: 400 },
      );
    }

    if (
      periodEnd &&
      periodEnd.getTime() <= Date.now() &&
      isPaidTier &&
      subscriptionStatus === "active"
    ) {
      return NextResponse.json(
        { error: "Override end date must be in the future." },
        { status: 400 },
      );
    }

    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId: id },
      select: {
        provider: true,
        status: true,
        customerCode: true,
        subscriptionCode: true,
      },
    });

    if (
      tier === "free" &&
      existingSubscription?.provider === "paystack" &&
      existingSubscription.status === "active" &&
      (existingSubscription.customerCode ||
        existingSubscription.subscriptionCode)
    ) {
      return NextResponse.json(
        {
          error:
            "This user still has an active Paystack subscription. Cancel or disable billing before setting them to Free.",
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const entitlementStatus = entitlementStatusFor(tier, subscriptionStatus);
    const features = buildTierFeatures({
      tier,
      status: subscriptionStatus,
      periodEnd,
      reason,
      adminId: admin.id,
    });

    const [subscription, entitlement] = await prisma.$transaction([
      prisma.subscription.upsert({
        where: { userId: id },
        create: {
          userId: id,
          provider: existingSubscription?.provider ?? "admin",
          status: subscriptionStatus as any,
          planCode: subscriptionPlanCodeFor(tier),
          currentPeriodEnd: periodEnd,
          canceledAt: subscriptionStatus === "canceled" ? now : null,
        },
        update: {
          status: subscriptionStatus as any,
          planCode: subscriptionPlanCodeFor(tier),
          currentPeriodEnd: periodEnd,
          canceledAt: subscriptionStatus === "canceled" ? now : null,
        },
        select: {
          id: true,
          userId: true,
          provider: true,
          status: true,
          planCode: true,
          currentPeriodEnd: true,
          canceledAt: true,
          updatedAt: true,
        },
      }),
      prisma.entitlement.upsert({
        where: { userId: id },
        create: {
          userId: id,
          tier: tier as any,
          status: entitlementStatus as any,
          features: features as any,
        },
        update: {
          tier: tier as any,
          status: entitlementStatus as any,
          features: features as any,
        },
        select: {
          id: true,
          userId: true,
          tier: true,
          status: true,
          features: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({ subscription, entitlement });
  }

  if (action === "resetPassword") {
    if (id === admin.id) {
      return NextResponse.json(
        { error: "Use Profile & security to change your own password." },
        { status: 400 },
      );
    }

    const newPassword = String(input.newPassword ?? "");

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Temporary password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash },
        select: {
          id: true,
          email: true,
          role: true,
          fullName: true,
          companyName: true,
          phone: true,
          isActive: true,
          deactivatedAt: true,
          deactivatedReason: true,
          updatedAt: true,
        },
      }),
      prisma.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);

    return NextResponse.json({ user: updated });
  }

  const role = cleanRole(input.role);

  if (!ROLE_VALUES.has(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (id === admin.id && role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin role." },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      fullName: cleanNullable(input.fullName, 100),
      companyName: cleanNullable(input.companyName, 140),
      phone: cleanNullable(input.phone, 40),
      role,
    },
    select: {
      id: true,
      email: true,
      role: true,
      fullName: true,
      companyName: true,
      phone: true,
      isActive: true,
      deactivatedAt: true,
      deactivatedReason: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}
