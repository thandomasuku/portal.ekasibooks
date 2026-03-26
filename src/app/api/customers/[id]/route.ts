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

  const id = String(resolvedParams?.id ?? "").trim();
  const name = String(body?.name ?? "").trim();

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