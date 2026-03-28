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
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      userId,
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  return company;
}

export async function GET(req: NextRequest) {
  const session = await requireUser(req);

  if (!session?.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const companyId = String(
    req.nextUrl.searchParams.get("companyId") ?? ""
  ).trim();

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

  const since = req.nextUrl.searchParams.get("since");
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") || 50);
  const limit = Math.max(1, Math.min(limitRaw || 50, 250));

  const where: any = {
    userId: session.userId,
    companyId,
  };

  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      where.updatedAt = {
        gt: sinceDate,
      };
    }
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  return NextResponse.json({ success: true, customers });
}

export async function POST(req: NextRequest) {
  console.log("[API customers POST] cookie:", req.headers.get("cookie"));
  const session = await requireUser(req);

  if (!session?.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();

  const companyId = String(body?.companyId ?? "").trim();
  const id = String(body?.id ?? "").trim();
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

  const updatedAt =
    body?.updatedAt && !Number.isNaN(new Date(body.updatedAt).getTime())
      ? new Date(body.updatedAt)
      : new Date();

  const deletedAt =
    body?.deletedAt && !Number.isNaN(new Date(body.deletedAt).getTime())
      ? new Date(body.deletedAt)
      : null;

  const existing = await prisma.customer.findFirst({
    where: {
      id,
      userId: session.userId,
      companyId,
    },
  });

  if (existing) {
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
    status: body?.status ?? "active", // 🔥 ADD THIS
    updatedAt,
    deletedAt,
  },
});

    return NextResponse.json({ success: true, customer });
  }

 const customer = await prisma.customer.create({
  data: {
    id,
    userId: session.userId,
    companyId,
    name,
    email: body?.email ?? null,
    phone: body?.phone ?? null,
    address: body?.address ?? null,
    city: body?.city ?? null,
    companyRegNo: body?.companyRegNo ?? null,
    vatNumber: body?.vatNumber ?? null,
    status: body?.status ?? "active", // 🔥 ADD THIS
    updatedAt,
    deletedAt,
  },
});

  return NextResponse.json({ success: true, customer });
}