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

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id }), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): { updatedAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      updatedAt?: string;
      id?: string;
    };
    const updatedAt = parseDateParam(raw?.updatedAt ?? null);
    const id = String(raw?.id ?? "").trim();
    if (!updatedAt || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function toNullableString(value: unknown, max = 1000): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function toRequiredString(value: unknown, field: string, max = 1000): string {
  const s = String(value ?? "").trim();
  if (!s) {
    throw new Error(`${field} is required.`);
  }
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

  const features =
    entitlement.features && typeof entitlement.features === "object"
      ? (entitlement.features as Record<string, unknown>)
      : {};

  // ✅ Same logic as entitlement route
  const override = features["cloudSync"];
  const computed = tier === "growth" || tier === "pro";

  const cloudSync =
    status === "blocked"
      ? false
      : typeof override === "boolean"
      ? override
      : computed;

  if (!cloudSync) {
    return {
      ok: false as const,
      response: jsonError("Cloud sync is not available on your plan.", 403),
    };
  }

  return { ok: true as const };
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

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const syncGate = await requireCloudSyncEnabled(auth.userId);
    if (!syncGate.ok) return syncGate.response;

    const url = new URL(req.url);
    const since = parseDateParam(url.searchParams.get("since"));
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";
    const limitRaw = Number(url.searchParams.get("limit") || "500");
    const limit = Math.max(1, Math.min(limitRaw, 1000));

    const andFilters: any[] = [{ userId: auth.userId }];

    if (since && cursor) {
      andFilters.push({
        OR: [
          { updatedAt: { gt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
        ],
      });
    } else if (since) {
      andFilters.push({ updatedAt: { gt: since } });
    } else if (cursor) {
      andFilters.push({
        OR: [
          { updatedAt: { gt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
        ],
      });
    }

    if (!includeDeleted) {
      andFilters.push({ deletedAt: null });
    }

    const rows = await prisma.quote.findMany({
      where: { AND: andFilters },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
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

    const nextCursor = rows.length === limit
      ? encodeCursor(rows[rows.length - 1]!.updatedAt, rows[rows.length - 1]!.id)
      : null;

    return NextResponse.json(
      {
        success: true,
        quotes: rows.map(mapQuoteForResponse),
        nextCursor,
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/quotes][GET] failed:", err);
    return jsonError("Failed to load quotes.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const syncGate = await requireCloudSyncEnabled(auth.userId);
    if (!syncGate.ok) return syncGate.response;

    const body = await req.json().catch(() => ({}));

    const id = toRequiredString(body?.id, "Quote id", 191);
    const number = toRequiredString(body?.number, "Quote number", 100);
    const customerName = toRequiredString(body?.customerName, "Customer name", 200);
    const issueDate = toRequiredString(body?.issueDate, "Issue date", 30);

    const incomingUpdatedAt = parseDateParam(body?.updatedAt ?? null);

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

    if (existing) {
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
          number,
          customerId: toNullableString(body?.customerId, 191),
          customerName,
          customerAddress: toNullableString(body?.customerAddress, 500),
          issueDate,
          expiryDate: toNullableString(body?.expiryDate, 30),
          dueDate: toNullableString(body?.dueDate, 30),
          reference: toNullableString(body?.reference, 200),
          publicComments: toNullableString(body?.publicComments, 4000),
          internalNotes: toNullableString(body?.internalNotes, 4000),
          currency: toNullableString(body?.currency, 10) ?? "ZAR",
          status: toNullableString(body?.status, 50) ?? "draft",
          vatRate: toDecimalNumber(body?.vatRate, 0),
          subtotal: toDecimalNumber(body?.subtotal, 0),
          vat: toDecimalNumber(body?.vat, 0),
          total: toDecimalNumber(body?.total, 0),
          data: body ?? null,
          deletedAt: body?.deletedAt ? new Date(body.deletedAt) : null,
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
    }

    const created = await prisma.quote.create({
      data: {
        id,
        userId: auth.userId,
        number,
        customerId: toNullableString(body?.customerId, 191),
        customerName,
        customerAddress: toNullableString(body?.customerAddress, 500),
        issueDate,
        expiryDate: toNullableString(body?.expiryDate, 30),
        dueDate: toNullableString(body?.dueDate, 30),
        reference: toNullableString(body?.reference, 200),
        publicComments: toNullableString(body?.publicComments, 4000),
        internalNotes: toNullableString(body?.internalNotes, 4000),
        currency: toNullableString(body?.currency, 10) ?? "ZAR",
        status: toNullableString(body?.status, 50) ?? "draft",
        vatRate: toDecimalNumber(body?.vatRate, 0),
        subtotal: toDecimalNumber(body?.subtotal, 0),
        vat: toDecimalNumber(body?.vat, 0),
        total: toDecimalNumber(body?.total, 0),
        data: body ?? null,
        deletedAt: body?.deletedAt ? new Date(body.deletedAt) : null,
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
        quote: mapQuoteForResponse(created),
      },
      { status: 201, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    console.error("[api/quotes][POST] failed:", err);
    return jsonError(err?.message || "Failed to save quote.", 500);
  }
}