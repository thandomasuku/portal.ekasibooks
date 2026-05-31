import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { getAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ROLE_VALUES = new Set(["user", "admin"]);
const ACCOUNT_ACTIONS = new Set(["updateAccount", "deactivate", "reactivate", "resetPassword"]);

function cleanNullable(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanRole(value: unknown) {
  return String(value ?? "user").trim().toLowerCase();
}

function cleanAction(value: unknown) {
  const action = String(value ?? "updateAccount").trim();
  return ACCOUNT_ACTIONS.has(action) ? action : "";
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
  const action = cleanAction(input.action);

  if (!action) {
    return NextResponse.json({ error: "Invalid account action" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      isActive: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "deactivate") {
    if (id === admin.id) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 400 },
      );
    }

    const now = new Date();
    const reason = cleanNullable(input.deactivatedReason, 240);

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          deactivatedAt: now,
          deactivatedReason: reason,
        },
        select: {
          id: true,
          email: true,
          role: true,
          fullName: true,
          companyName: true,
          phone: true,
          isActive: true,
          deactivatedAt: true,
          deactivatedReason: true,
          updatedAt: true,
        },
      }),
      prisma.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);

    return NextResponse.json({ user: updated });
  }

  if (action === "reactivate") {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedReason: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        companyName: true,
        phone: true,
        isActive: true,
        deactivatedAt: true,
        deactivatedReason: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ user: updated });
  }

  if (action === "resetPassword") {
    if (id === admin.id) {
      return NextResponse.json(
        { error: "Use Profile & security to change your own password." },
        { status: 400 },
      );
    }

    const newPassword = String(input.newPassword ?? "");

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: "Temporary password must be at least 8 characters." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash },
        select: {
          id: true,
          email: true,
          role: true,
          fullName: true,
          companyName: true,
          phone: true,
          isActive: true,
          deactivatedAt: true,
          deactivatedReason: true,
          updatedAt: true,
        },
      }),
      prisma.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);

    return NextResponse.json({ user: updated });
  }

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
      isActive: true,
      deactivatedAt: true,
      deactivatedReason: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}
