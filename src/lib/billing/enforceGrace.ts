import { prisma } from "@/lib/db";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE = "https://api.paystack.co";

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function lower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function safeTrim(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function isPaidTier(tier: unknown) {
  return tier === "starter" || tier === "growth" || tier === "pro";
}

function mergeFeatures(prev: unknown, patch: Record<string, any>) {
  const base = isPlainObject(prev) ? prev : {};
  return { ...base, ...patch };
}

function pickActiveSubscription(list: any[], preferredCode?: string | null) {
  if (!Array.isArray(list) || list.length === 0) return null;

  const preferred = safeTrim(preferredCode);
  if (preferred) {
    const exact = list.find((s) => safeTrim(s?.subscription_code) === preferred);
    if (exact) return exact;
  }

  const active = list.find((s) => lower(s?.status) === "active");
  if (active) return active;

  return list[0] ?? null;
}

async function paystackFetch(path: string, init?: RequestInit) {
  if (!PAYSTACK_SECRET) {
    throw new Error("Missing PAYSTACK_SECRET_KEY env var.");
  }

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack error: ${JSON.stringify(json)}`);
  }

  return json.data;
}

async function discoverPaystackSubscription(opts: {
  email: string | null;
  customerCode: string | null;
  subscriptionCode: string | null;
}) {
  const email = safeTrim(opts.email).toLowerCase();
  let customerCode = safeTrim(opts.customerCode);
  let subscriptionCode = safeTrim(opts.subscriptionCode);
  let subscription: any = null;

  if (!customerCode && email) {
    const customer = await paystackFetch(`/customer/${encodeURIComponent(email)}`);
    customerCode = safeTrim(customer?.customer_code);
  }

  if (customerCode) {
    const subscriptions = await paystackFetch(
      `/subscription?customer=${encodeURIComponent(customerCode)}`
    );

    subscription = pickActiveSubscription(subscriptions, subscriptionCode);
  }

  if (!subscription && subscriptionCode) {
    subscription = await paystackFetch(`/subscription/${encodeURIComponent(subscriptionCode)}`);
  }

  if (!subscription) return null;

  return {
    customerCode,
    subscriptionCode: safeTrim(subscription.subscription_code) || subscriptionCode,
    emailToken: safeTrim(subscription.email_token),
    status: safeTrim(subscription.status),
    planCode: safeTrim(subscription.plan?.plan_code) || safeTrim(subscription.plan_code),
  };
}

async function disablePaystackSubscription(opts: {
  email: string | null;
  customerCode: string | null;
  subscriptionCode: string | null;
}) {
  const discovered = await discoverPaystackSubscription(opts);

  if (!discovered?.subscriptionCode) {
    return { ok: true as const, skipped: true as const, reason: "no_paystack_subscription" as const };
  }

  if (lower(discovered.status) !== "active") {
    return {
      ok: true as const,
      skipped: true as const,
      reason: "subscription_not_active" as const,
      subscriptionCode: discovered.subscriptionCode,
      status: discovered.status,
    };
  }

  if (!discovered.emailToken) {
    throw new Error(
      `Cannot disable Paystack subscription ${discovered.subscriptionCode}: missing email_token.`
    );
  }

  await paystackFetch("/subscription/disable", {
    method: "POST",
    body: JSON.stringify({
      code: discovered.subscriptionCode,
      token: discovered.emailToken,
    }),
  });

  return {
    ok: true as const,
    skipped: false as const,
    reason: "disabled" as const,
    subscriptionCode: discovered.subscriptionCode,
    customerCode: discovered.customerCode,
    planCode: discovered.planCode,
  };
}

/**
 * If a paid user is in GRACE and graceUntil is in the past, disable/cancel the
 * active Paystack subscription first, then downgrade to FREE.
 *
 * Important product rule:
 * Local FREE must never mean "still billable in Paystack".
 */
export async function enforceGraceExpiry(userId: string) {
  const [user, ent, sub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
    prisma.entitlement.findUnique({
      where: { userId },
      select: { tier: true, status: true, features: true },
    }),
    prisma.subscription.findUnique({
      where: { userId },
      select: {
        status: true,
        customerCode: true,
        subscriptionCode: true,
        planCode: true,
      },
    }),
  ]);

  if (!ent) return { changed: false, reason: "no_entitlement" as const };
  if (ent.status === "blocked") return { changed: false, reason: "blocked" as const };
  if (!isPaidTier(ent.tier) || ent.status !== "grace") {
    return { changed: false, reason: "not_in_grace" as const };
  }

  const graceUntilRaw = isPlainObject(ent.features)
    ? (ent.features as Record<string, unknown>)["graceUntil"]
    : undefined;

  const graceUntil = parseIsoDate(graceUntilRaw);
  if (!graceUntil) {
    return { changed: false, reason: "missing_graceUntil" as const };
  }

  const now = new Date();
  if (graceUntil.getTime() > now.getTime()) {
    return { changed: false, reason: "grace_still_valid" as const };
  }

  try {
    const disableResult = await disablePaystackSubscription({
      email: user?.email ?? null,
      customerCode: sub?.customerCode ?? null,
      subscriptionCode: sub?.subscriptionCode ?? null,
    });

    if (!disableResult.skipped) {
      console.info("[enforceGraceExpiry] disabled Paystack subscription before downgrade", {
        userId,
        email: user?.email ?? null,
        subscriptionCode: disableResult.subscriptionCode,
        customerCode: disableResult.customerCode,
        planCode: disableResult.planCode,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    const nextFeatures = mergeFeatures(ent.features, {
      readOnly: true,
      graceUntil: graceUntil.toISOString(),
      cancellationFailedAt: now.toISOString(),
      cancellationFailureReason: message,
      downgradeBlockedReason: "paystack_disable_failed",
    });

    await prisma.entitlement.update({
      where: { userId },
      data: {
        status: "grace" as any,
        features: nextFeatures as any,
      },
    });

    await prisma.subscription
      .update({
        where: { userId },
        data: { status: "past_due" as any },
      })
      .catch(() => null);

    console.error("[enforceGraceExpiry] Paystack disable failed; kept entitlement in grace", {
      userId,
      email: user?.email ?? null,
      customerCode: sub?.customerCode ?? null,
      subscriptionCode: sub?.subscriptionCode ?? null,
      error: message,
    });

    return {
      changed: false,
      reason: "paystack_disable_failed" as const,
      error: message,
      at: now.toISOString(),
    };
  }

  const nextFeatures = isPlainObject(ent.features) ? { ...(ent.features as any) } : {};
  delete nextFeatures.graceUntil;
  delete nextFeatures.graceReason;
  delete nextFeatures.graceSetAt;
  delete nextFeatures.cancellationFailedAt;
  delete nextFeatures.cancellationFailureReason;
  delete nextFeatures.downgradeBlockedReason;

  nextFeatures.downgradedAt = now.toISOString();
  nextFeatures.downgradeReason = "grace_expired";
  nextFeatures.readOnly = false;
  nextFeatures.limits = { companies: 1 };
  nextFeatures.tier = "free";

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
      data: {
        status: "canceled" as any,
        canceledAt: now,
      },
    })
    .catch(() => null);

  return { changed: true, reason: "grace_expired" as const, at: now.toISOString() };
}
