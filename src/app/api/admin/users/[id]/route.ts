import { NextRequest, NextResponse } from "next/server";

import { getAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ROLE_VALUES = new Set(["user", "admin"]);

function cleanNullable(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanRole(value: unknown) {
  return String(value ?? "user").trim().toLowerCase();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  const role = cleanRole(input.role);

  if (!ROLE_VALUES.has(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (id === admin.id && role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin role." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      fullName: cleanNullable(input.fullName, 100),
      companyName: cleanNullable(input.companyName, 140),
      phone: cleanNullable(input.phone, 40),
      role,
    },
    select: {
      id: true,
      email: true,
      role: true,
      fullName: true,
      companyName: true,
      phone: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}
