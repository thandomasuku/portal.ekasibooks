import { prisma } from "@/lib/prisma";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const BASE_URL = "https://api.paystack.co";

type PaidTier = "starter" | "growth" | "pro";
type Cycle = "monthly" | "annual";

type PlanMeta = {
  tier: PaidTier;
  cycle: Cycle;
  companies: number;
};

const PLAN_MAP: Record<string, PlanMeta> = {
  [String(
    process.env.PAYSTACK_PLAN_CODE_STARTER_MONTHLY ||
      process.env.PAYSTACK_STARTER_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "starter",
    cycle: "monthly",
    companies: 1,
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_STARTER_ANNUAL ||
      process.env.PAYSTACK_STARTER_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "starter",
    cycle: "annual",
    companies: 1,
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_GROWTH_MONTHLY ||
      process.env.PAYSTACK_GROWTH_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "growth",
    cycle: "monthly",
    companies: 3,
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_GROWTH_ANNUAL ||
      process.env.PAYSTACK_GROWTH_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "growth",
    cycle: "annual",
    companies: 3,
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_PRO_MONTHLY ||
      process.env.PAYSTACK_PRO_MONTHLY_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "pro",
    cycle: "monthly",
    companies: 5,
  },

  [String(
    process.env.PAYSTACK_PLAN_CODE_PRO_ANNUAL ||
      process.env.PAYSTACK_PRO_ANNUAL_PLAN_CODE ||
      ""
  ).trim()]: {
    tier: "pro",
    cycle: "annual",
    companies: 5,
  },
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
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
    },
    cache: "no-store",
  });

  const json = await res.json();
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

function normalizeSubscriptionStatus(status: unknown) {
  const s = lower(status);

  if (s === "active" || s === "success" || s === "trialing" || s === "non-renewing") {
    return "active";
  }

  if (s === "cancelled" || s === "canceled" || s === "disabled") {
    return "canceled";
  }

  if (s === "past_due" || s === "attention" || s === "unpaid" || s === "failed") {
    return "past_due";
  }

  return "inactive";
}

function isActivePaystackStatus(status: unknown) {
  const s = lower(status);
  return s === "active" || s === "success" || s === "trialing" || s === "non-renewing";
}

function resolvePlanMeta(planCode: unknown): PlanMeta | null {
  const code = safeTrim(planCode);
  if (!code) return null;
  return PLAN_MAP[code] ?? null;
}

function buildPaidFeatures(tier: PaidTier, companies: number) {
  return {
    readOnly: false,
    limits: {
      ...PAID_LIMITS_UNLIMITED,
      companies,
    },
    tier,
  };
}

function pickSubscription(list: any[]) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const active = list.find((s) => isActivePaystackStatus(s?.status));
  if (active) return active;

  return list[0] ?? null;
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
  let discoveredRawStatus: unknown = sub?.status ?? "active";

  try {
    const customer = await fetchJSON(
      `${BASE_URL}/customer/${encodeURIComponent(email)}`
    );

    discoveredCustomerCode = customer.customer_code;

    const subs = await fetchJSON(
      `${BASE_URL}/subscription?customer=${customer.customer_code}`
    );

    const paystackSub = pickSubscription(subs);

    if (paystackSub) {
      discoveredSubCode = paystackSub.subscription_code;
      discoveredPlanCode = paystackSub.plan?.plan_code || paystackSub.plan_code || discoveredPlanCode;
      discoveredRawStatus = paystackSub.status || discoveredRawStatus;

      const nextPayment = safeDate(paystackSub.next_payment_date);

      if (
        nextPayment &&
        (!discoveredPeriodEnd ||
          nextPayment.getTime() !== discoveredPeriodEnd.getTime())
      ) {
        discoveredPeriodEnd = nextPayment;
      }
    }
  } catch (err) {
    console.error("Paystack sync failed:", err);
    return null;
  }

  if (!discoveredSubCode && !discoveredCustomerCode) return null;

  const normalizedStatus = normalizeSubscriptionStatus(discoveredRawStatus);
  const planMeta = resolvePlanMeta(discoveredPlanCode);

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
    },
    update: {
      status: normalizedStatus as any,
      ...(discoveredCustomerCode ? { customerCode: discoveredCustomerCode } : {}),
      ...(discoveredSubCode ? { subscriptionCode: discoveredSubCode } : {}),
      ...(discoveredPlanCode ? { planCode: discoveredPlanCode } : {}),
      ...(discoveredPeriodEnd ? { currentPeriodEnd: discoveredPeriodEnd } : {}),
    },
  });

  /**
   * Critical repair path:
   * A successful/active Paystack subscription must restore paid access even if the
   * local entitlement was previously downgraded to FREE after grace expiry.
   */
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
  }

  return discoveredPeriodEnd;
}
