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

function toRequiredString(value: unknown, field: string, max = 1000): string {
  const s = String(value ?? "").trim();
  if (!s) {
    throw new Error(`${field} is required.`);
  }
  return s.slice(0, max);
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

function extractMaxCompanies(
  tier: string,
  features: Record<string, unknown>
): number {
  const raw = features["maxCompanies"];

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }

  if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  if (tier === "pro") return 5;
  if (tier === "growth") return 3;
  return 1;
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

async function getEntitlementContext(userId: string) {
  const entitlement = await prisma.entitlement.findUnique({
    where: { userId },
    select: {
      tier: true,
      status: true,
      features: true,
    },
  });

  const tier = String(entitlement?.tier ?? "free").toLowerCase().trim();
  const status = String(entitlement?.status ?? "active").toLowerCase().trim();
  const features = isPlainObject(entitlement?.features) ? entitlement!.features as Record<string, unknown> : {};

  const cloudSyncOverride = toBooleanOverride(features["cloudSync"]);
  const cloudSyncComputed = tier === "growth" || tier === "pro";

  const cloudSync =
    status === "blocked" || status === "none"
      ? false
      : cloudSyncOverride ?? cloudSyncComputed;

  const maxCompanies = extractMaxCompanies(tier, features);

  return {
    tier,
    status,
    features,
    cloudSync,
    maxCompanies,
  };
}

function mapCompanyForResponse(row: {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const entitlement = await getEntitlementContext(auth.userId);

    const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "1";
    const onlyActive = req.nextUrl.searchParams.get("onlyActive") !== "0";

    const where: any = {
      userId: auth.userId,
    };

    if (!includeDeleted) {
      where.deletedAt = null;
    }

    if (onlyActive) {
      where.isActive = true;
    }

    const rows = await prisma.company.findMany({
      where,
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "asc" },
      ],
      select: {
        id: true,
        name: true,
        isActive: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        companies: rows.map(mapCompanyForResponse),
        maxCompanies: entitlement.maxCompanies,
        cloudSync: entitlement.cloudSync,
        tier: entitlement.tier,
        status: entitlement.status,
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/companies][GET] failed:", err);
    return jsonError("Failed to load companies.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const entitlement = await getEntitlementContext(auth.userId);

    const body = await req.json().catch(() => ({}));

    const id = toRequiredString(body?.id, "Company id", 191);
    const name = toRequiredString(body?.name, "Company name", 200);

    const requestedIsDefault =
      typeof body?.isDefault === "boolean" ? body.isDefault : false;

    const existing = await prisma.company.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      const company = await prisma.company.update({
        where: { id },
        data: {
          name,
          isActive: body?.isActive === undefined ? true : Boolean(body.isActive),
          isDefault: requestedIsDefault,
          deletedAt: body?.deletedAt ? new Date(body.deletedAt) : null,
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (requestedIsDefault) {
        await prisma.company.updateMany({
          where: {
            userId: auth.userId,
            id: { not: company.id },
            deletedAt: null,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return NextResponse.json(
        {
          success: true,
          company: mapCompanyForResponse(company),
          maxCompanies: entitlement.maxCompanies,
        },
        { status: 200, headers: noStoreHeaders() }
      );
    }

    const activeCount = await prisma.company.count({
      where: {
        userId: auth.userId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (activeCount >= entitlement.maxCompanies) {
      return jsonError(
        `Company limit reached for your plan. Maximum allowed: ${entitlement.maxCompanies}.`,
        403
      );
    }

    const hasDefault = await prisma.company.findFirst({
      where: {
        userId: auth.userId,
        deletedAt: null,
        isDefault: true,
      },
      select: { id: true },
    });

    const company = await prisma.company.create({
      data: {
        id,
        userId: auth.userId,
        name,
        isActive: body?.isActive === undefined ? true : Boolean(body.isActive),
        isDefault: hasDefault ? requestedIsDefault : true,
        deletedAt: body?.deletedAt ? new Date(body.deletedAt) : null,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (company.isDefault) {
      await prisma.company.updateMany({
        where: {
          userId: auth.userId,
          id: { not: company.id },
          deletedAt: null,
        },
        data: {
          isDefault: false,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        company: mapCompanyForResponse(company),
        maxCompanies: entitlement.maxCompanies,
      },
      { status: 201, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    console.error("[api/companies][POST] failed:", err);
    return jsonError(err?.message || "Failed to save company.", 500);
  }
}