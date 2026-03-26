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
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      isDefault: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const { id } = await ctx.params;

    const company = await requireOwnedCompany(auth.userId, id);

    if (!company || company.deletedAt) {
      return jsonError("Company not found.", 404);
    }

    return NextResponse.json(
      {
        success: true,
        company: mapCompanyForResponse(company),
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/companies/:id][GET] failed:", err);
    return jsonError("Failed to load company.", 500);
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const existing = await requireOwnedCompany(auth.userId, id);

    if (!existing || existing.deletedAt) {
      return jsonError("Company not found.", 404);
    }

    const nextName = toNullableString(body?.name, 200);
    const nextIsActive =
      body?.isActive === undefined ? existing.isActive : Boolean(body.isActive);
    const requestedIsDefault =
      body?.isDefault === undefined ? existing.isDefault : Boolean(body.isDefault);

    if (!nextName) {
      return jsonError("Company name is required.", 400);
    }

    if (!nextIsActive) {
      const activeCount = await prisma.company.count({
        where: {
          userId: auth.userId,
          deletedAt: null,
          isActive: true,
        },
      });

      if (activeCount <= 1 && existing.isActive) {
        return jsonError("You cannot deactivate your last active company.", 400);
      }
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        name: nextName,
        isActive: nextIsActive,
        isDefault: requestedIsDefault,
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
          id: { not: updated.id },
          deletedAt: null,
        },
        data: {
          isDefault: false,
        },
      });
    }

    if (!updated.isActive && updated.isDefault) {
      const replacement = await prisma.company.findFirst({
        where: {
          userId: auth.userId,
          id: { not: updated.id },
          deletedAt: null,
          isActive: true,
        },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true },
      });

      if (replacement) {
        await prisma.company.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });

        await prisma.company.update({
          where: { id: updated.id },
          data: { isDefault: false },
        });
      }
    }

    const finalCompany = await prisma.company.findUniqueOrThrow({
      where: { id },
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
        company: mapCompanyForResponse(finalCompany),
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    console.error("[api/companies/:id][PUT] failed:", err);
    return jsonError(err?.message || "Failed to update company.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuthedUser(req);
    if ("error" in auth) return auth.error;

    const { id } = await ctx.params;

    const existing = await requireOwnedCompany(auth.userId, id);

    if (!existing || existing.deletedAt) {
      return jsonError("Company not found.", 404);
    }

    const activeCount = await prisma.company.count({
      where: {
        userId: auth.userId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (activeCount <= 1 && existing.isActive) {
      return jsonError("You cannot delete your last active company.", 400);
    }

    const deleted = await prisma.company.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        isDefault: false,
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

    if (existing.isDefault) {
      const replacement = await prisma.company.findFirst({
        where: {
          userId: auth.userId,
          id: { not: deleted.id },
          deletedAt: null,
          isActive: true,
        },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true },
      });

      if (replacement) {
        await prisma.company.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        company: mapCompanyForResponse(deleted),
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err) {
    console.error("[api/companies/:id][DELETE] failed:", err);
    return jsonError("Failed to delete company.", 500);
  }
}