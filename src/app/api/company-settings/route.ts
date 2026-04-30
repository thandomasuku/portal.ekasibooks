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
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: noStoreHeaders() }
  );
}

function toNullableString(value: unknown, max = 1000): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function toDecimalOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
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

async function requireOwnedCompany(userId: string, companyId: string) {
  return prisma.company.findFirst({
    where: {
      id: companyId,
      userId,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, name: true },
  });
}

function mapSettingsForResponse(row: {
  id: string;
  userId: string;
  companyId: string;
  companyName: string | null;
  tradingName: string | null;
  registrationNo: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  currency: string | null;
  vatRateDefault: any;
  quotePrefix: string | null;
  invoicePrefix: string | null;
  quoteTerms: string | null;
  invoiceTerms: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankBranchCode: string | null;
  bankAccountType: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  raw: any;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    companyName: row.companyName,
    tradingName: row.tradingName,
    registrationNo: row.registrationNo,
    vatNumber: row.vatNumber,
    email: row.email,
    phone: row.phone,
    website: row.website,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    country: row.country,
    currency: row.currency,
    vatRateDefault:
      row.vatRateDefault == null ? null : Number(row.vatRateDefault),
    quotePrefix: row.quotePrefix,
    invoicePrefix: row.invoicePrefix,
    quoteTerms: row.quoteTerms,
    invoiceTerms: row.invoiceTerms,
    bankName: row.bankName,
    bankAccountName: row.bankAccountName,
    bankAccountNo: row.bankAccountNo,
    bankBranchCode: row.bankBranchCode,
    bankAccountType: row.bankAccountType,
    logoUrl: row.logoUrl,
    accentColor: row.accentColor,
    raw: row.raw,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const companySettingsSelect = {
  id: true,
  userId: true,
  companyId: true,
  companyName: true,
  tradingName: true,
  registrationNo: true,
  vatNumber: true,
  email: true,
  phone: true,
  website: true,
  addressLine1: true,
  addressLine2: true,
  suburb: true,
  city: true,
  province: true,
  postalCode: true,
  country: true,
  currency: true,
  vatRateDefault: true,
  quotePrefix: true,
  invoicePrefix: true,
  quoteTerms: true,
  invoiceTerms: true,
  bankName: true,
  bankAccountName: true,
  bankAccountNo: true,
  bankBranchCode: true,
  bankAccountType: true,
  logoUrl: true,
  accentColor: true,
  raw: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function loadCurrentSettingsForConflict(companyId: string) {
  const current = await prisma.companySettings.findUnique({
    where: { companyId },
    select: companySettingsSelect,
  });

  return current ? mapSettingsForResponse(current) : null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const companyId = String(req.nextUrl.searchParams.get("companyId") ?? "").trim();

    if (!companyId) {
      return jsonError("companyId is required.", 400);
    }

    const company = await requireOwnedCompany(auth.userId, companyId);
    if (!company) {
      return jsonError("Company not found or access denied.", 403);
    }

    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: {
        id: true,
        userId: true,
        companyId: true,
        companyName: true,
        tradingName: true,
        registrationNo: true,
        vatNumber: true,
        email: true,
        phone: true,
        website: true,
        addressLine1: true,
        addressLine2: true,
        suburb: true,
        city: true,
        province: true,
        postalCode: true,
        country: true,
        currency: true,
        vatRateDefault: true,
        quotePrefix: true,
        invoicePrefix: true,
        quoteTerms: true,
        invoiceTerms: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNo: true,
        bankBranchCode: true,
        bankAccountType: true,
        logoUrl: true,
        accentColor: true,
        raw: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        settings: settings ? mapSettingsForResponse(settings) : null,
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/company-settings][GET] failed:", err);
    return jsonError("Failed to load company settings.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => ({}));

    const companyId = String(body?.companyId ?? "").trim();
    if (!companyId) {
      return jsonError("companyId is required.", 400);
    }

    const company = await requireOwnedCompany(auth.userId, companyId);
    if (!company) {
      return jsonError("Company not found or access denied.", 403);
    }

    const data = {
      companyName: toNullableString(body?.companyName, 200),
      tradingName: toNullableString(body?.tradingName, 200),
      registrationNo: toNullableString(body?.registrationNo, 100),
      vatNumber: toNullableString(body?.vatNumber, 100),
      email: toNullableString(body?.email, 200),
      phone: toNullableString(body?.phone, 100),
      website: toNullableString(body?.website, 300),

      addressLine1: toNullableString(body?.addressLine1, 300),
      addressLine2: toNullableString(body?.addressLine2, 300),
      suburb: toNullableString(body?.suburb, 150),
      city: toNullableString(body?.city, 150),
      province: toNullableString(body?.province, 150),
      postalCode: toNullableString(body?.postalCode, 50),
      country: toNullableString(body?.country, 150),

      currency: toNullableString(body?.currency, 20) ?? "ZAR",
      vatRateDefault: toDecimalOrNull(body?.vatRateDefault),

      quotePrefix: toNullableString(body?.quotePrefix, 50),
      invoicePrefix: toNullableString(body?.invoicePrefix, 50),
      quoteTerms: toNullableString(body?.quoteTerms, 8000),
      invoiceTerms: toNullableString(body?.invoiceTerms, 8000),

      bankName: toNullableString(body?.bankName, 150),
      bankAccountName: toNullableString(body?.bankAccountName, 200),
      bankAccountNo: toNullableString(body?.bankAccountNo, 100),
      bankBranchCode: toNullableString(body?.bankBranchCode, 50),
      bankAccountType: toNullableString(body?.bankAccountType, 100),

      logoUrl: toNullableString(body?.logoUrl, 1000),
      accentColor: toNullableString(body?.accentColor, 50),

      raw: body?.raw ?? null,
    };

    const incomingUpdatedAt = parseDateValue(body?.updatedAt);
    const baseRemoteUpdatedAt = parseDateValue(body?.baseRemoteUpdatedAt ?? body?.lastKnownRemoteUpdatedAt);
    const forceConflictResolution = toBooleanFlag(body?.forceConflictResolution);

    const existing = await prisma.companySettings.findUnique({
      where: { companyId },
      select: {
        id: true,
        updatedAt: true,
      },
    });

    if (existing) {
      if (!forceConflictResolution && baseRemoteUpdatedAt && existing.updatedAt > baseRemoteUpdatedAt) {
        const current = await loadCurrentSettingsForConflict(companyId);

        return NextResponse.json(
          {
            success: false,
            conflict: true,
            entityType: "company-settings",
            entityId: companyId,
            serverRecord: current,
            serverUpdatedAt: existing.updatedAt,
            message: "These company settings were changed in the cloud after this device last synced.",
          },
          { status: 409, headers: noStoreHeaders() }
        );
      }

      if (!forceConflictResolution && incomingUpdatedAt && existing.updatedAt > incomingUpdatedAt) {
        const current = await loadCurrentSettingsForConflict(companyId);

        return NextResponse.json(
          {
            success: true,
            settings: current,
            ignored: true,
            reason: "Incoming company settings are older than cloud copy.",
          },
          { status: 200, headers: noStoreHeaders() }
        );
      }
    }

    const settings = existing
      ? await prisma.companySettings.update({
          where: { companyId },
          data,
          select: {
            id: true,
            userId: true,
            companyId: true,
            companyName: true,
            tradingName: true,
            registrationNo: true,
            vatNumber: true,
            email: true,
            phone: true,
            website: true,
            addressLine1: true,
            addressLine2: true,
            suburb: true,
            city: true,
            province: true,
            postalCode: true,
            country: true,
            currency: true,
            vatRateDefault: true,
            quotePrefix: true,
            invoicePrefix: true,
            quoteTerms: true,
            invoiceTerms: true,
            bankName: true,
            bankAccountName: true,
            bankAccountNo: true,
            bankBranchCode: true,
            bankAccountType: true,
            logoUrl: true,
            accentColor: true,
            raw: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : await prisma.companySettings.create({
          data: {
            userId: auth.userId,
            companyId,
            ...data,
          },
          select: {
            id: true,
            userId: true,
            companyId: true,
            companyName: true,
            tradingName: true,
            registrationNo: true,
            vatNumber: true,
            email: true,
            phone: true,
            website: true,
            addressLine1: true,
            addressLine2: true,
            suburb: true,
            city: true,
            province: true,
            postalCode: true,
            country: true,
            currency: true,
            vatRateDefault: true,
            quotePrefix: true,
            invoicePrefix: true,
            quoteTerms: true,
            invoiceTerms: true,
            bankName: true,
            bankAccountName: true,
            bankAccountNo: true,
            bankBranchCode: true,
            bankAccountType: true,
            logoUrl: true,
            accentColor: true,
            raw: true,
            createdAt: true,
            updatedAt: true,
          },
        });

    return NextResponse.json(
      {
        success: true,
        settings: mapSettingsForResponse(settings),
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    console.error("[api/company-settings][POST] failed:", err);
    return jsonError(err?.message || "Failed to save company settings.", 500);
  }
}