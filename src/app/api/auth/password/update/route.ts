import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

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

    const body = await req.json().catch(() => ({} as any));
    const otpCode = String(body?.otpCode ?? body?.code ?? "").trim();
    const newPassword = String(body?.newPassword ?? "").trim();

    if (!otpCode || otpCode.length < 4) {
      return NextResponse.json(
        { error: "OTP code is required." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user?.email) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404, headers: noStoreHeaders() }
      );
    }

    // Optional safety: prevent "change" to the same password
    if (user.passwordHash) {
      const same = await bcrypt.compare(newPassword, user.passwordHash);
      if (same) {
        return NextResponse.json(
          { error: "New password must be different from your current password." },
          { status: 400, headers: noStoreHeaders() }
        );
      }
    }

    const now = new Date();

    // Verify an unused, unexpired OTP for this session user's email
    const otp = await prisma.otpCode.findFirst({
      where: {
        email: user.email.toLowerCase(),
        code: otpCode,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (!otp) {
      // small delay to slow guessing
      await new Promise((r) => setTimeout(r, 250));
      return NextResponse.json(
        { error: "Invalid or expired OTP." },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const hash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction(async (tx) => {
      await tx.otpCode.update({
        where: { id: otp.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hash },
      });
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    console.error("[auth/password/update]", err?.message || err);
    return NextResponse.json(
      { error: "Failed to update password." },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
