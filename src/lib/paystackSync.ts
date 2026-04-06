import { prisma } from "@/lib/prisma";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const BASE_URL = "https://api.paystack.co";

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

function pickSubscription(list: any[]) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const active = list.find((s) => lower(s?.status) === "active");
  if (active) return active;

  return list[0] ?? null;
}

export async function syncSubscriptionFromPaystack(userId: string) {
  // 🔥 FIX: get email from USER, not subscription
  const [user, sub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.subscription.findUnique({
      where: { userId },
    }),
  ]);

  const email = toLowerEmail(user?.email);
  if (!email) return null;

  let discoveredPeriodEnd: Date | null = sub?.currentPeriodEnd ?? null;
  let discoveredSubCode = sub?.subscriptionCode ?? null;
  let discoveredPlanCode = sub?.planCode ?? null;
  let discoveredCustomerCode = sub?.customerCode ?? null;
  let discoveredStatus = sub?.status ?? "active";

  try {
    // 1. Fetch customer
    const customer = await fetchJSON(
      `${BASE_URL}/customer/${encodeURIComponent(email)}`
    );

    discoveredCustomerCode = customer.customer_code;

    // 2. Fetch subscriptions
    const subs = await fetchJSON(
      `${BASE_URL}/subscription?customer=${customer.customer_code}`
    );

    const activeSub = pickSubscription(subs);

    if (activeSub) {
      discoveredSubCode = activeSub.subscription_code;
      discoveredPlanCode = activeSub.plan?.plan_code || activeSub.plan_code;
      discoveredStatus = activeSub.status || discoveredStatus;

      const nextPayment = safeDate(activeSub.next_payment_date);

      // 🔥 KEY FIX: update if DIFFERENT (not only greater)
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

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      provider: "paystack",
      status: discoveredStatus as any,
      customerCode: discoveredCustomerCode ?? undefined,
      subscriptionCode: discoveredSubCode ?? undefined,
      planCode: discoveredPlanCode ?? undefined,
      currentPeriodEnd: discoveredPeriodEnd ?? undefined,
    },
    update: {
      status: discoveredStatus as any,
      ...(discoveredCustomerCode ? { customerCode: discoveredCustomerCode } : {}),
      ...(discoveredSubCode ? { subscriptionCode: discoveredSubCode } : {}),
      ...(discoveredPlanCode ? { planCode: discoveredPlanCode } : {}),
      ...(discoveredPeriodEnd ? { currentPeriodEnd: discoveredPeriodEnd } : {}),
    },
  });

  return discoveredPeriodEnd;
}