// src/app/api/billing/manage-link/route.ts
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE = "https://api.paystack.co";

type PaystackResponse<T> = {
  status: boolean;
  message?: string;
  data?: T;
};

type PaystackCustomer = {
  id: number;
  email: string;
  customer_code: string;
};

type PaystackSubscription = {
  id: number;
  status: string;
  subscription_code: string;
  next_payment_date?: string | null;

  // Paystack sometimes includes these, sometimes not
  customer?: {
    id: number;
    email: string;
    customer_code: string;
  };

  plan?: {
    plan_code: string;
  };
};

function lower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function safeTrim(v: unknown) {
  return String(v ?? "").trim();
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function paystackFetch<T>(url: string): Promise<PaystackResponse<T>> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as PaystackResponse<T> | null;

  if (!res.ok || !json?.status) {
    const msg =
      (json as any)?.message ||
      (json as any)?.error ||
      `Paystack request failed (${res.status}).`;
    throw new Error(msg);
  }

  return json;
}

function pickManageableSubscription(list: PaystackSubscription[]): PaystackSubscription | null {
  if (!Array.isArray(list) || list.length === 0) return null;

  // Prefer active
  const active = list.find((s) => lower(s?.status) === "active");
  if (active) return active;

  // Fallbacks that can still exist and be manageable
  const fallbacks = new Set(["trialing", "non-renewing", "paused", "attention"]);
  const fb = list.find((s) => fallbacks.has(lower(s?.status)));
  return fb ?? list[0] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing PAYSTACK_SECRET_KEY env var." },
        { status: 500 }
      );
    }

    // 1) Auth (cookie-based session)
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifySession(token);

    // 2) Need user's email to discover Paystack customer/subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const email = safeTrim(user?.email);
    if (!email) {
      return NextResponse.json(
        { error: "User email not found for this session." },
        { status: 500 }
      );
    }

    // 3) Load local subscription (unique by userId in your current code)
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        subscriptionCode: true,
        customerCode: true,
        status: true,
        planCode: true,
        currentPeriodEnd: true,
      },
    });

    let subscriptionCode = safeTrim(sub?.subscriptionCode);
    let customerCode = safeTrim(sub?.customerCode);
    const localStatus = sub?.status; // could be enum in Prisma, but treat as unknown/string-safe
    const localPlanCode = sub?.planCode ?? null;

    // 4) If subscriptionCode missing locally, discover from Paystack and backfill
    if (!subscriptionCode) {
      // 4.1) Fetch Paystack customer by email (authoritative for customer_code)
      const cust = await paystackFetch<PaystackCustomer>(
        `${PAYSTACK_BASE}/customer/${encodeURIComponent(email)}`
      );
      const customer = cust.data;

      if (!customer?.id || !customer?.customer_code) {
        return NextResponse.json(
          { error: "Paystack customer lookup returned no customer record." },
          { status: 404 }
        );
      }

      // Always take customerCode from customer lookup (subscription list may omit hydration)
      customerCode = safeTrim(customer.customer_code);

      // 4.2) List subscriptions for that customer (Paystack filter expects customer ID)
      const subs = await paystackFetch<PaystackSubscription[]>(
        `${PAYSTACK_BASE}/subscription?customer=${encodeURIComponent(String(customer.id))}`
      );

      const discovered = pickManageableSubscription(subs.data || []);
      const discoveredCode = safeTrim(discovered?.subscription_code);

      if (!discoveredCode) {
        return NextResponse.json(
          { error: "No active subscription found for this account." },
          { status: 409 }
        );
      }

      subscriptionCode = discoveredCode;

      const planCode = discovered?.plan?.plan_code ?? localPlanCode;

      // Map Paystack next_payment_date -> currentPeriodEnd when present
      const currentPeriodEnd = safeDate(discovered?.next_payment_date);

      // 4.3) Backfill into DB (create row if missing)
      // IMPORTANT: We do NOT write `status` here because your schema uses an enum and
      // we don't want to guess enum names/values in this file. Webhooks/verify can own status.
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          customerCode,
          subscriptionCode,
          ...(planCode ? { planCode } : {}),
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
        update: {
          customerCode,
          subscriptionCode,
          ...(planCode ? { planCode } : {}),
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      });
    }

    // 5) Still missing? then we can't manage billing
    if (!subscriptionCode) {
      return NextResponse.json(
        { error: "No active subscription found for this account." },
        { status: 409 }
      );
    }

    // Optional: block if already canceled (string-safe)
    const st = lower(localStatus);
    if (st === "canceled" || st === "cancelled" || st === "inactive") {
      return NextResponse.json(
        { error: "Subscription is not active. Upgrade again to manage billing." },
        { status: 409 }
      );
    }

    // 6) Ask Paystack for a manage link
    // Endpoint: GET /subscription/:code/manage/link
    const upstream = await fetch(
      `${PAYSTACK_BASE}/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const json = await upstream.json().catch(() => null);

    if (!upstream.ok || !json?.status) {
      const msg =
        json?.message ||
        json?.error ||
        `Paystack manage link failed (${upstream.status}).`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const url: string | undefined = json?.data?.link || json?.data?.url;

    if (!url) {
      return NextResponse.json(
        { error: "Paystack response missing manage link URL." },
        { status: 502 }
      );
    }

    return NextResponse.json({ url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate manage link." },
      { status: 500 }
    );
  }
}
