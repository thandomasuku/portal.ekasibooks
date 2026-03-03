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
  return typeof v === "string" ? v.trim() : String(v ?? "").trim();
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function paystackGet<T>(path: string): Promise<PaystackResponse<T>> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
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

async function paystackManageLink(subscriptionCode: string): Promise<string> {
  const res = await paystackGet<{ link?: string; url?: string }>(
    `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`
  );

  const url = safeTrim((res as any)?.data?.link || (res as any)?.data?.url);
  if (!url) throw new Error("Paystack response missing manage link URL.");
  return url;
}

function pickPrimarySubscription(list: PaystackSubscription[]): PaystackSubscription | null {
  if (!Array.isArray(list) || list.length === 0) return null;

  // Prefer active
  const active = list.find((s) => lower(s?.status) === "active");
  if (active) return active;

  // Fallbacks that are still “manageable”
  const fallbacks = new Set(["trialing", "non-renewing", "paused", "attention"]);
  const fb = list.find((s) => fallbacks.has(lower(s?.status)));
  return fb ?? list[0] ?? null;
}

function isManageableStatus(status: unknown) {
  const s = lower(status);
  if (s === "active") return true;
  const fallbacks = new Set(["trialing", "non-renewing", "paused", "attention"]);
  return fallbacks.has(s);
}

export async function GET(req: NextRequest) {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY env var." }, { status: 500 });
    }

    // 1) Auth (cookie-based session)
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

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
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 3) Load local subscription (optional hints)
    const localSub = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        subscriptionCode: true,
        customerCode: true,
        status: true,
        planCode: true,
        currentPeriodEnd: true,
      },
    });

    const localStatus = lower(localSub?.status);
    // If locally canceled, don't pretend “manage” will help — user must resubscribe
    if (localStatus === "canceled" || localStatus === "cancelled" || localStatus === "inactive") {
      return NextResponse.json(
        { error: "Subscription is not active. Subscribe again to manage billing." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 4) Always fetch Paystack customer + subscriptions (authoritative)
    const custResp = await paystackGet<PaystackCustomer>(`/customer/${encodeURIComponent(email)}`);
    const customer = custResp.data;

    if (!customer?.id || !customer?.customer_code) {
      return NextResponse.json(
        { error: "Paystack customer lookup returned no customer record." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const customerCode = safeTrim(customer.customer_code);

    const subsResp = await paystackGet<PaystackSubscription[]>(
      `/subscription?customer=${encodeURIComponent(String(customer.id))}`
    );

    const list = Array.isArray(subsResp.data) ? subsResp.data : [];
    const primary = pickPrimarySubscription(list);

    if (!primary?.subscription_code) {
      return NextResponse.json(
        { error: "No active subscription found for this account." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const primaryCode = safeTrim(primary.subscription_code);
    const primaryPlanCode = safeTrim(primary?.plan?.plan_code) || (localSub?.planCode ?? "");
    const primaryPeriodEnd = safeDate(primary?.next_payment_date);

    // 5) Backfill DB with the primary subscription (do NOT guess enum status)
    await prisma.subscription
      .upsert({
        where: { userId },
        create: {
          userId,
          customerCode,
          subscriptionCode: primaryCode,
          ...(primaryPlanCode ? { planCode: primaryPlanCode } : {}),
          ...(primaryPeriodEnd ? { currentPeriodEnd: primaryPeriodEnd } : {}),
        },
        update: {
          customerCode,
          subscriptionCode: primaryCode,
          ...(primaryPlanCode ? { planCode: primaryPlanCode } : {}),
          ...(primaryPeriodEnd ? { currentPeriodEnd: primaryPeriodEnd } : {}),
        },
      })
      .catch(() => null);

    // 6) Generate manage link for primary subscription
    const url = await paystackManageLink(primaryCode);

    /**
     * 7) ALSO return extra manage links (up to 3) if multiple subscriptions exist.
     * This helps plan-changes where users accidentally end up with 2 subs and need to cancel the old one.
     */
    const manageable = list
      .filter((s) => s?.subscription_code && isManageableStatus(s?.status))
      .slice(0, 3);

    const extra = await Promise.all(
      manageable
        .map(async (s) => {
          const code = safeTrim(s.subscription_code);
          if (!code) return null;
          try {
            const link = await paystackManageLink(code);
            return {
              subscriptionCode: code,
              status: safeTrim(s.status) || "unknown",
              planCode: safeTrim(s?.plan?.plan_code) || null,
              nextPaymentDate: s?.next_payment_date ?? null,
              url: link,
            };
          } catch {
            // If a specific link fails, just omit it.
            return null;
          }
        })
        .filter(Boolean) as any
    );

    return NextResponse.json(
      {
        url, // primary (active) manage link
        customerCode,
        subscriptionCode: primaryCode,
        planCode: primaryPlanCode || null,
        nextPaymentDate: primary?.next_payment_date ?? null,
        extraManageLinks: extra, // optional helpers for multi-subscription cleanup
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate manage link." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}