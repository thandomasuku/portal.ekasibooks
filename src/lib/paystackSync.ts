import { prisma } from "@/lib/prisma";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const BASE_URL = "https://api.paystack.co";

type Tier = "starter" | "growth" | "pro";

type PlanMeta = {
  tier: Tier;
  companies: number;
};

const PLAN_MAP: Record<string, PlanMeta> = {
  [String(
    process.env.PAYSTACK_PLAN_CODE_STARTER_MONTHLY ||
      process.env.PAYSTACK_STARTER_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: { tier: "starter", companies: 1 },

  [String(
    process.env.PAYSTACK_PLAN_CODE_STARTER_ANNUAL ||
      process.env.PAYSTACK_STARTER_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: { tier: "starter", companies: 1 },

  [String(
    process.env.PAYSTACK_PLAN_CODE_GROWTH_MONTHLY ||
      process.env.PAYSTACK_GROWTH_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: { tier: "growth", companies: 3 },

  [String(
    process.env.PAYSTACK_PLAN_CODE_GROWTH_ANNUAL ||
      process.env.PAYSTACK_GROWTH_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: { tier: "growth", companies: 3 },

  [String(
    process.env.PAYSTACK_PLAN_CODE_PRO_MONTHLY ||
      process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: { tier: "pro", companies: 5 },

  [String(
    process.env.PAYSTACK_PLAN_CODE_PRO_ANNUAL ||
      process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: { tier: "pro", companies: 5 },
};

for (const k of Object.keys(PLAN_MAP)) {
  if (!k) delete PLAN_MAP[k];
}

const PAID_LIMITS_UNLIMITED = {
  invoice: 999999,
  quote: 999999,
  purchase_order: 999999,
};

async function fetchJSON(url: string) {
  if (!PAYSTACK_SECRET) throw new Error("Missing PAYSTACK_SECRET_KEY env var.");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack error: ${JSON.stringify(json)}`);
  }

  return json.data;
}

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function toLowerEmail(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function safeDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function lower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function resolvePlanMeta(planCode: unknown): PlanMeta | null {
  const code = safeTrim(planCode);
  if (!code) return null;
  return PLAN_MAP[code] ?? null;
}

function normalizeSubscriptionStatus(v: unknown) {
  const status = lower(v);

  if (status === "active") return "active";
  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "disabled" ||
    status === "non-renewing" ||
    status === "complete"
  ) {
    return "canceled";
  }

  if (
    status === "past_due" ||
    status === "past-due" ||
    status === "attention" ||
    status === "failed"
  ) {
    return "past_due";
  }

  return "past_due";
}

function isActivePaystackStatus(v: unknown) {
  return lower(v) === "active";
}

function pickSubscription(list: any[], preferredCode?: string | null) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const preferred = safeTrim(preferredCode);
  if (preferred) {
    const exact = list.find((s) => safeTrim(s?.subscription_code) === preferred);
    if (exact) return exact;
  }

  const active = list.find((s) => isActivePaystackStatus(s?.status));
  if (active) return active;

  return list[0] ?? null;
}

function buildPaidFeatures(tier: Tier, companies: number) {
  return {
    readOnly: false,
    cloudSync: tier === "growth" || tier === "pro",
    storeSync: tier === "pro",
    maxActiveSessions: tier === "pro" ? 4 : tier === "growth" ? 2 : 1,
    limits: {
      ...PAID_LIMITS_UNLIMITED,
      companies,
    },
    tier,
    restoredAt: new Date().toISOString(),
    restoreReason: "paystack_active_subscription",
  };
}

function knownPlanCodes() {
  return Object.keys(PLAN_MAP).filter(Boolean);
}

export async function syncSubscriptionFromPaystack(userId: string) {
  const [user, sub, ent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.subscription.findUnique({
      where: { userId },
    }),
    prisma.entitlement.findUnique({
      where: { userId },
      select: { status: true },
    }),
  ]);

  const email = toLowerEmail(user?.email);
  if (!email) return null;

  let discoveredPeriodEnd: Date | null = sub?.currentPeriodEnd ?? null;
  let discoveredSubCode = sub?.subscriptionCode ?? null;
  let discoveredPlanCode = sub?.planCode ?? null;
  let discoveredCustomerCode = sub?.customerCode ?? null;
  let discoveredRawStatus: string | null = sub?.status ?? "active";

  try {
    const customer = await fetchJSON(`${BASE_URL}/customer/${encodeURIComponent(email)}`);

    discoveredCustomerCode = safeTrim(customer?.customer_code) || discoveredCustomerCode;

    const subs = await fetchJSON(
      `${BASE_URL}/subscription?customer=${encodeURIComponent(discoveredCustomerCode || email)}`
    );

    const activeSub = pickSubscription(subs, discoveredSubCode);

    if (activeSub) {
      discoveredSubCode = safeTrim(activeSub.subscription_code) || discoveredSubCode;
      discoveredPlanCode =
        safeTrim(activeSub.plan?.plan_code) ||
        safeTrim(activeSub.plan_code) ||
        discoveredPlanCode;

      discoveredRawStatus = safeTrim(activeSub.status) || discoveredRawStatus;

      const nextPayment = safeDate(activeSub.next_payment_date);

      if (
        nextPayment &&
        (!discoveredPeriodEnd || nextPayment.getTime() !== discoveredPeriodEnd.getTime())
      ) {
        discoveredPeriodEnd = nextPayment;
      }
    }
  } catch (err) {
    console.error("[paystackSync] failed", {
      userId,
      email,
      localCustomerCode: sub?.customerCode ?? null,
      localSubscriptionCode: sub?.subscriptionCode ?? null,
      localPlanCode: sub?.planCode ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!discoveredSubCode && !discoveredCustomerCode) return null;

  const normalizedStatus = normalizeSubscriptionStatus(discoveredRawStatus);

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      provider: "paystack",
      status: normalizedStatus as any,
      customerCode: discoveredCustomerCode ?? undefined,
      subscriptionCode: discoveredSubCode ?? undefined,
      planCode: discoveredPlanCode ?? undefined,
      currentPeriodEnd: discoveredPeriodEnd ?? undefined,
      canceledAt: normalizedStatus === "canceled" ? new Date() : undefined,
    },
    update: {
      status: normalizedStatus as any,
      ...(discoveredCustomerCode ? { customerCode: discoveredCustomerCode } : {}),
      ...(discoveredSubCode ? { subscriptionCode: discoveredSubCode } : {}),
      ...(discoveredPlanCode ? { planCode: discoveredPlanCode } : {}),
      ...(discoveredPeriodEnd ? { currentPeriodEnd: discoveredPeriodEnd } : {}),
      ...(normalizedStatus === "active" ? { canceledAt: null } : {}),
      ...(normalizedStatus === "canceled" ? { canceledAt: new Date() } : {}),
    },
  });

  const planMeta = resolvePlanMeta(discoveredPlanCode);

  if (!planMeta && isActivePaystackStatus(discoveredRawStatus)) {
    console.warn("[paystackSync] active subscription has unknown plan code", {
      userId,
      email,
      customerCode: discoveredCustomerCode,
      subscriptionCode: discoveredSubCode,
      paystackPlanCode: discoveredPlanCode,
      knownPlanCodes: knownPlanCodes(),
    });
  }

  if (planMeta && isActivePaystackStatus(discoveredRawStatus) && ent?.status !== "blocked") {
    await prisma.entitlement.upsert({
      where: { userId },
      create: {
        userId,
        tier: planMeta.tier as any,
        status: "active" as any,
        features: buildPaidFeatures(planMeta.tier, planMeta.companies) as any,
      },
      update: {
        tier: planMeta.tier as any,
        status: "active" as any,
        features: buildPaidFeatures(planMeta.tier, planMeta.companies) as any,
      },
    });

    console.info("[paystackSync] entitlement repaired from active subscription", {
      userId,
      email,
      tier: planMeta.tier,
      customerCode: discoveredCustomerCode,
      subscriptionCode: discoveredSubCode,
      planCode: discoveredPlanCode,
      currentPeriodEnd: discoveredPeriodEnd?.toISOString() ?? null,
    });
  }

  return discoveredPeriodEnd;
}
