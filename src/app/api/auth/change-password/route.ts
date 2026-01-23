import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

export async function POST(req: NextRequest) {
  try {
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { userId } = await verifySession(token);

    const body = await req.json().catch(() => null);
    const currentPassword = body?.currentPassword?.toString() ?? "";
    const newPassword = body?.newPassword?.toString() ?? "";

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current and new password are required." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      // adjust field name if your schema differs (passwordHash vs password)
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "Password login is not enabled for this account." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const nextHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: nextHash },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to change password." },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
