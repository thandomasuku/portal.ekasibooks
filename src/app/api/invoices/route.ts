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

function parseDateValue(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;

    const numeric = Number(raw);
    const d = Number.isFinite(numeric) && /^\d+$/.test(raw) ? new Date(numeric) : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function toBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
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

  return { ok: true as const };
}

async function requireOwnedCompany(userId: string, companyId: string) {
  return prisma.company.findFirst({
    where: {
      id: companyId,
      userId,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true },
  });
}

function mapInvoiceForResponse(row: {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string;
  customerAddress: string | null;
  issueDate: string;
  dueDate: string | null;
  paidDate: string | null;
  reference: string | null;
  publicComments: string | null;
  internalNotes: string | null;
  currency: string;
  status: string;
  vatRate: any;
  subtotal: any;
  vat: any;
  total: any;
  balance: any;
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
    dueDate: row.dueDate,
    paidDate: row.paidDate,
    reference: row.reference,
    publicComments: row.publicComments,
    internalNotes: row.internalNotes,
    currency: row.currency,
    status: row.status,
    vatRate: Number(row.vatRate),
    subtotal: Number(row.subtotal),
    vat: Number(row.vat),
    total: Number(row.total),
    balance: row.balance == null ? null : Number(row.balance),
    data: row.data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

async function loadCurrentInvoiceForConflict(id: string) {
  const current = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      number: true,
      customerId: true,
      customerName: true,
      customerAddress: true,
      issueDate: true,
      dueDate: true,
      paidDate: true,
      reference: true,
      publicComments: true,
      internalNotes: true,
      currency: true,
      status: true,
      vatRate: true,
      subtotal: true,
      vat: true,
      total: true,
      balance: true,
      data: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });

  return mapInvoiceForResponse(current);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const syncGate = await requireCloudSyncEnabled(auth.userId);
    if (!syncGate.ok) return syncGate.response;

    const url = new URL(req.url);
    const companyId = String(url.searchParams.get("companyId") ?? "").trim();

    if (!companyId) {
      return jsonError("companyId is required.", 400);
    }

    const company = await requireOwnedCompany(auth.userId, companyId);
    if (!company) {
      return jsonError("Company not found or access denied.", 403);
    }

    const since = parseDateParam(url.searchParams.get("since"));
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const includeDeleted = url.searchParams.get("includeDeleted") === "1";
    const limitRaw = Number(url.searchParams.get("limit") || "500");
    const limit = Math.max(1, Math.min(limitRaw, 1000));

    const andFilters: any[] = [{ userId: auth.userId }, { companyId }];

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

    const rows = await prisma.invoice.findMany({
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
        dueDate: true,
        paidDate: true,
        reference: true,
        publicComments: true,
        internalNotes: true,
        currency: true,
        status: true,
        vatRate: true,
        subtotal: true,
        vat: true,
        total: true,
        balance: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    const nextCursor =
      rows.length === limit
        ? encodeCursor(rows[rows.length - 1]!.updatedAt, rows[rows.length - 1]!.id)
        : null;

    return NextResponse.json(
      {
        success: true,
        invoices: rows.map(mapInvoiceForResponse),
        nextCursor,
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/invoices][GET] failed:", err);
    return jsonError("Failed to load invoices.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const syncGate = await requireCloudSyncEnabled(auth.userId);
    if (!syncGate.ok) return syncGate.response;

    const body = await req.json().catch(() => ({}));

    const companyId = toRequiredString(body?.companyId, "companyId", 191);

    const company = await requireOwnedCompany(auth.userId, companyId);
    if (!company) {
      return jsonError("Company not found or access denied.", 403);
    }

    const id = toRequiredString(body?.id, "Invoice id", 191);
    const number = toRequiredString(body?.number, "Invoice number", 100);
    const customerName = toRequiredString(body?.customerName, "Customer name", 200);
    const issueDate = toRequiredString(body?.issueDate, "Issue date", 30);

    const incomingUpdatedAt = parseDateValue(body?.updatedAt);
    const baseRemoteUpdatedAt = parseDateValue(body?.baseRemoteUpdatedAt ?? body?.lastKnownRemoteUpdatedAt);
    const forceConflictResolution = toBooleanFlag(body?.forceConflictResolution);

    const existing = await prisma.invoice.findFirst({
      where: {
        id,
        userId: auth.userId,
        companyId,
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    if (existing) {
      if (!forceConflictResolution && baseRemoteUpdatedAt && existing.updatedAt > baseRemoteUpdatedAt) {
        const current = await loadCurrentInvoiceForConflict(id);

        return NextResponse.json(
          {
            success: false,
            conflict: true,
            entityType: "invoice",
            entityId: id,
            serverRecord: current,
            serverUpdatedAt: current.updatedAt,
            message: "This invoice was changed in the cloud after this device last synced.",
          },
          { status: 409, headers: noStoreHeaders() }
        );
      }

      if (!forceConflictResolution && incomingUpdatedAt && existing.updatedAt > incomingUpdatedAt) {
        const current = await loadCurrentInvoiceForConflict(id);

        return NextResponse.json(
          {
            success: true,
            invoice: current,
            ignored: true,
            reason: "Incoming invoice is older than cloud copy.",
          },
          { status: 200, headers: noStoreHeaders() }
        );
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          number,
          customerId: toNullableString(body?.customerId, 191),
          customerName,
          customerAddress: toNullableString(body?.customerAddress, 500),
          issueDate,
          dueDate: toNullableString(body?.dueDate, 30),
          paidDate: toNullableString(body?.paidDate, 30),
          reference: toNullableString(body?.reference, 200),
          publicComments: toNullableString(body?.publicComments, 4000),
          internalNotes: toNullableString(body?.internalNotes, 4000),
          currency: toNullableString(body?.currency, 10) ?? "ZAR",
          status: toNullableString(body?.status, 50) ?? "draft",
          vatRate: toDecimalNumber(body?.vatRate, 0),
          subtotal: toDecimalNumber(body?.subtotal, 0),
          vat: toDecimalNumber(body?.vat, 0),
          total: toDecimalNumber(body?.total, 0),
          balance:
            body?.balance === undefined || body?.balance === null || body?.balance === ""
              ? null
              : toDecimalNumber(body?.balance, 0),
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
          dueDate: true,
          paidDate: true,
          reference: true,
          publicComments: true,
          internalNotes: true,
          currency: true,
          status: true,
          vatRate: true,
          subtotal: true,
          vat: true,
          total: true,
          balance: true,
          data: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      return NextResponse.json(
        {
          success: true,
          invoice: mapInvoiceForResponse(updated),
        },
        { status: 200, headers: noStoreHeaders() }
      );
    }

    const created = await prisma.invoice.create({
      data: {
        id,
        userId: auth.userId,
        companyId,
        number,
        customerId: toNullableString(body?.customerId, 191),
        customerName,
        customerAddress: toNullableString(body?.customerAddress, 500),
        issueDate,
        dueDate: toNullableString(body?.dueDate, 30),
        paidDate: toNullableString(body?.paidDate, 30),
        reference: toNullableString(body?.reference, 200),
        publicComments: toNullableString(body?.publicComments, 4000),
        internalNotes: toNullableString(body?.internalNotes, 4000),
        currency: toNullableString(body?.currency, 10) ?? "ZAR",
        status: toNullableString(body?.status, 50) ?? "draft",
        vatRate: toDecimalNumber(body?.vatRate, 0),
        subtotal: toDecimalNumber(body?.subtotal, 0),
        vat: toDecimalNumber(body?.vat, 0),
        total: toDecimalNumber(body?.total, 0),
        balance:
          body?.balance === undefined || body?.balance === null || body?.balance === ""
            ? null
            : toDecimalNumber(body?.balance, 0),
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
        dueDate: true,
        paidDate: true,
        reference: true,
        publicComments: true,
        internalNotes: true,
        currency: true,
        status: true,
        vatRate: true,
        subtotal: true,
        vat: true,
        total: true,
        balance: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        invoice: mapInvoiceForResponse(created),
      },
      { status: 201, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    console.error("[api/invoices][POST] failed:", err);
    return jsonError(err?.message || "Failed to save invoice.", 500);
  }
}
