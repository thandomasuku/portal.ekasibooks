import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: noStoreHeaders() });
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNullableString(value: unknown, max = 1000): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function toDecimalNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toBooleanOverride(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.toLowerCase().trim();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

async function requireAuthedUser(req: NextRequest) {
  const token = req.cookies.get(getSessionCookieName())?.value;
  if (!token) {
    return { error: jsonError("Unauthenticated.", 401) as NextResponse };
  }

  try {
    const session = await verifySession(token);
    return { userId: session.userId };
  } catch {
    return { error: jsonError("Session expired. Please log in again.", 401) as NextResponse };
  }
}

async function requireCloudSyncEnabled(userId: string) {
  const entitlement = await prisma.entitlement.findUnique({
    where: { userId },
    select: {
      tier: true,
      status: true,
      features: true,
    },
  });

  if (!entitlement) {
    return {
      ok: false as const,
      response: jsonError("No entitlement found.", 403),
    };
  }

  const tier = String(entitlement.tier ?? "free").toLowerCase().trim();
  const status = String(entitlement.status ?? "active").toLowerCase().trim();

  const features = isPlainObject(entitlement.features) ? entitlement.features : {};
  const override = toBooleanOverride(features["cloudSync"]);
  const computed = tier === "growth" || tier === "pro";

  const cloudSync =
    status === "blocked" || status === "none"
      ? false
      : override ?? computed;

  if (!cloudSync) {
    return {
      ok: false as const,
      response: jsonError("Cloud sync is not available on your plan.", 403),
    };
  }

  return {
    ok: true as const,
  };
}

function mapQuoteForResponse(row: {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string;
  customerAddress: string | null;
  issueDate: string;
  expiryDate: string | null;
  dueDate: string | null;
  reference: string | null;
  publicComments: string | null;
  internalNotes: string | null;
  currency: string;
  status: string;
  vatRate: any;
  subtotal: any;
  vat: any;
  total: any;
  data: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customerId,
    customerName: row.customerName,
    customerAddress: row.customerAddress,
    issueDate: row.issueDate,
    expiryDate: row.expiryDate,
    dueDate: row.dueDate,
    reference: row.reference,
    publicComments: row.publicComments,
    internalNotes: row.internalNotes,
    currency: row.currency,
    status: row.status,
    vatRate: Number(row.vatRate),
    subtotal: Number(row.subtotal),
    vat: Number(row.vat),
    total: Number(row.total),
    data: row.data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const syncGate = await requireCloudSyncEnabled(auth.userId);
    if (!syncGate.ok) return syncGate.response;

    const { id } = await ctx.params;

    const row = await prisma.quote.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
      select: {
        id: true,
        number: true,
        customerId: true,
        customerName: true,
        customerAddress: true,
        issueDate: true,
        expiryDate: true,
        dueDate: true,
        reference: true,
        publicComments: true,
        internalNotes: true,
        currency: true,
        status: true,
        vatRate: true,
        subtotal: true,
        vat: true,
        total: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!row) {
      return jsonError("Quote not found.", 404);
    }

    return NextResponse.json(
      {
        success: true,
        quote: mapQuoteForResponse(row),
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/quotes/:id][GET] failed:", err);
    return jsonError("Failed to load quote.", 500);
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const syncGate = await requireCloudSyncEnabled(auth.userId);
    if (!syncGate.ok) return syncGate.response;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const existing = await prisma.quote.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      return jsonError("Quote not found.", 404);
    }

    const incomingUpdatedAt = parseDateParam(body?.updatedAt ?? null);

    if (incomingUpdatedAt && existing.updatedAt > incomingUpdatedAt) {
      const current = await prisma.quote.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          number: true,
          customerId: true,
          customerName: true,
          customerAddress: true,
          issueDate: true,
          expiryDate: true,
          dueDate: true,
          reference: true,
          publicComments: true,
          internalNotes: true,
          currency: true,
          status: true,
          vatRate: true,
          subtotal: true,
          vat: true,
          total: true,
          data: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      return NextResponse.json(
        {
          success: true,
          quote: mapQuoteForResponse(current),
          ignored: true,
          reason: "Incoming quote is older than cloud copy.",
        },
        { status: 200, headers: noStoreHeaders() }
      );
    }

    const updated = await prisma.quote.update({
      where: { id },
      data: {
        number: toNullableString(body?.number, 100) ?? undefined,
        customerId: body?.customerId === undefined ? undefined : toNullableString(body?.customerId, 191),
        customerName:
          body?.customerName === undefined
            ? undefined
            : toNullableString(body?.customerName, 200) ?? "Unknown customer",
        customerAddress:
          body?.customerAddress === undefined ? undefined : toNullableString(body?.customerAddress, 500),
        issueDate:
          body?.issueDate === undefined ? undefined : toNullableString(body?.issueDate, 30) ?? undefined,
        expiryDate: body?.expiryDate === undefined ? undefined : toNullableString(body?.expiryDate, 30),
        dueDate: body?.dueDate === undefined ? undefined : toNullableString(body?.dueDate, 30),
        reference: body?.reference === undefined ? undefined : toNullableString(body?.reference, 200),
        publicComments:
          body?.publicComments === undefined ? undefined : toNullableString(body?.publicComments, 4000),
        internalNotes:
          body?.internalNotes === undefined ? undefined : toNullableString(body?.internalNotes, 4000),
        currency: body?.currency === undefined ? undefined : toNullableString(body?.currency, 10) ?? "ZAR",
        status: body?.status === undefined ? undefined : toNullableString(body?.status, 50) ?? "draft",
        vatRate: body?.vatRate === undefined ? undefined : toDecimalNumber(body?.vatRate, 0),
        subtotal: body?.subtotal === undefined ? undefined : toDecimalNumber(body?.subtotal, 0),
        vat: body?.vat === undefined ? undefined : toDecimalNumber(body?.vat, 0),
        total: body?.total === undefined ? undefined : toDecimalNumber(body?.total, 0),
        data: body ?? undefined,
        deletedAt:
          body?.deletedAt === undefined
            ? undefined
            : body?.deletedAt
            ? new Date(body.deletedAt)
            : null,
      },
      select: {
        id: true,
        number: true,
        customerId: true,
        customerName: true,
        customerAddress: true,
        issueDate: true,
        expiryDate: true,
        dueDate: true,
        reference: true,
        publicComments: true,
        internalNotes: true,
        currency: true,
        status: true,
        vatRate: true,
        subtotal: true,
        vat: true,
        total: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        quote: mapQuoteForResponse(updated),
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/quotes/:id][PUT] failed:", err);
    return jsonError("Failed to update quote.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const syncGate = await requireCloudSyncEnabled(auth.userId);
    if (!syncGate.ok) return syncGate.response;

    const { id } = await ctx.params;

    const existing = await prisma.quote.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return jsonError("Quote not found.", 404);
    }

    const deleted = await prisma.quote.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
      select: {
        id: true,
        number: true,
        customerId: true,
        customerName: true,
        customerAddress: true,
        issueDate: true,
        expiryDate: true,
        dueDate: true,
        reference: true,
        publicComments: true,
        internalNotes: true,
        currency: true,
        status: true,
        vatRate: true,
        subtotal: true,
        vat: true,
        total: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        quote: mapQuoteForResponse(deleted),
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/quotes/:id][DELETE] failed:", err);
    return jsonError("Failed to delete quote.", 500);
  }
}