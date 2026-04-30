import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionCookieName, verifySession } from "@/lib/auth";

async function requireUser(req: NextRequest) {
  const token = req.cookies.get(getSessionCookieName())?.value?.trim();

  if (!token) {
    return null;
  }

  try {
    return await verifySession(token);
  } catch {
    return null;
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
    select: { id: true },
  });
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCloudNewerThanBase(
  cloudUpdatedAt: Date,
  baseRemoteUpdatedAt: Date | null
) {
  if (!baseRemoteUpdatedAt) {
    return false;
  }

  return cloudUpdatedAt.getTime() > baseRemoteUpdatedAt.getTime();
}

function customerConflictResponse(customer: any) {
  return NextResponse.json(
    {
      success: false,
      conflict: true,
      entityType: "customer",
      entityId: customer.id,
      serverRecord: customer,
      serverUpdatedAt: customer.updatedAt,
      message:
        "This customer was changed in the cloud after this device last synced.",
    },
    { status: 409 }
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  console.log("[API customers PUT] cookie:", req.headers.get("cookie"));
  const session = await requireUser(req);

  if (!session?.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const resolvedParams = await Promise.resolve(params);

  const companyId = String(body?.companyId ?? "").trim();
  const id = String(resolvedParams?.id ?? "").trim();
  const name = String(body?.name ?? "").trim();

  if (!companyId) {
    return NextResponse.json(
      { success: false, error: "companyId is required." },
      { status: 400 }
    );
  }

  const company = await requireOwnedCompany(session.userId, companyId);

  if (!company) {
    return NextResponse.json(
      { success: false, error: "Company not found or access denied." },
      { status: 403 }
    );
  }

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Customer id is required." },
      { status: 400 }
    );
  }

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Customer name is required." },
      { status: 400 }
    );
  }

  const existing = await prisma.customer.findFirst({
    where: {
      id,
      userId: session.userId,
      companyId,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  const updatedAt = parseOptionalDate(body?.updatedAt) ?? new Date();
  const deletedAt = parseOptionalDate(body?.deletedAt);
  const baseRemoteUpdatedAt = parseOptionalDate(body?.baseRemoteUpdatedAt);
  const forceConflictResolution = body?.forceConflictResolution === true;

  if (
    !forceConflictResolution &&
    isCloudNewerThanBase(existing.updatedAt, baseRemoteUpdatedAt)
  ) {
    return customerConflictResponse(existing);
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      name,
      email: body?.email ?? null,
      phone: body?.phone ?? null,
      address: body?.address ?? null,
      city: body?.city ?? null,
      companyRegNo: body?.companyRegNo ?? null,
      vatNumber: body?.vatNumber ?? null,
      status: body?.status ?? "active",
      updatedAt,
      deletedAt,
    },
  });

  return NextResponse.json({ success: true, customer });
}
