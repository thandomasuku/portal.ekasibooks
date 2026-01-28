// src/app/api/auth/verify-otp/route.ts
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { buildSessionCookie, signSession } from "@/lib/auth";

const SESSION_DAYS = 7;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getClientMeta(req: NextRequest) {
  const userAgent = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  return { userAgent, ip };
}

// ✅ 1 active session per account (revoke older before creating new)
async function enforceMaxSessions(userId: string, max = 1) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: [{ lastSeenAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (sessions.length < max) return;

  const toRevokeCount = sessions.length - (max - 1);
  const toRevoke = sessions.slice(0, Math.max(0, toRevokeCount));

  if (toRevoke.length) {
    await prisma.session.updateMany({
      where: { id: { in: toRevoke.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();

    // ✅ Backward compatible: accept `code` or `otp`
    const rawCode = body?.code ?? body?.otp ?? "";
    const code = String(rawCode).trim();

    const remember = Boolean(body?.remember);

    if (!email || !email.includes("@")) {
      return jsonError("Invalid email.", 400);
    }

    if (!code) {
      return jsonError("OTP code is required.", 400);
    }

    // Optional: enforce format (6 digits). If you sometimes use alphanumeric OTP, remove this.
    if (!/^\d{6}$/.test(code)) {
      return jsonError("OTP must be a 6-digit code.", 400);
    }

    // Find OTP (unused + not expired)
    const otp = await prisma.otpCode.findFirst({
      where: {
        email,
        code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    });

    if (!otp) {
      return jsonError("Invalid or expired OTP code.", 401);
    }

    // Mark OTP used (best practice to prevent replay)
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    // Load or create user (depends on how you flow OTP)
    let user = otp.userId
      ? await prisma.user.findUnique({
          where: { id: otp.userId },
          select: { id: true, email: true },
        })
      : await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true },
        });

    if (!user) {
      user = await prisma.user.create({
        data: { email },
        select: { id: true, email: true },
      });
    }

    // ✅ Enforce single active session then create a new session for this login
    await enforceMaxSessions(user.id, 1);

    const meta = getClientMeta(req);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        userAgent: meta.userAgent,
        ip: String(meta.ip || "").slice(0, 190),
        createdAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      select: { id: true },
    });

    const token = await signSession(user.id, session.id);

    // Cookie maxAge: 1 day vs 7 days (remember)
    const maxAgeSeconds = (remember ? SESSION_DAYS : 1) * 24 * 60 * 60;

    // Update last login (best-effort)
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {});

    const res = NextResponse.json(
      { success: true, user: { id: user.id, email: user.email } },
      { status: 200 }
    );

    const cookie = buildSessionCookie(token);
    res.cookies.set({ ...cookie, maxAge: maxAgeSeconds });

    return res;
  } catch (err) {
    console.error("[auth/verify-otp] error", err);
    return jsonError("OTP verification failed. Please try again.", 500);
  }
}
