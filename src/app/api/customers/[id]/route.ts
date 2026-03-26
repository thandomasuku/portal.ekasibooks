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

  const updatedAt =
    body?.updatedAt && !Number.isNaN(new Date(body.updatedAt).getTime())
      ? new Date(body.updatedAt)
      : new Date();

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
      updatedAt,
    },
  });

  return NextResponse.json({ success: true, customer });
}