// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { buildSessionCookie, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getClientMeta(req: NextRequest) {
  const userAgent = req.headers.get("user-agent") || "";

  // If x-forwarded-for contains a list, take the first IP
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip =
    (xff.split(",")[0] || "").trim() ||
    (req.headers.get("x-real-ip") || "").trim() ||
    "";

  return { userAgent, ip };
}

/**
 * ✅ Enforce "1 active session per account":
 * revoke ALL existing active sessions for this user, then create a fresh one.
 * (Done in a transaction to avoid races.)
 */
async function createSingleActiveSession(userId: string, meta: { userAgent: string; ip: string }) {
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    // revoke all active sessions
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });

    // create the new single active session
    const session = await tx.session.create({
      data: {
        userId,
        userAgent: meta.userAgent,
        ip: String(meta.ip || "").slice(0, 190),
        createdAt: now,
        lastSeenAt: now,
        revokedAt: null,
      },
      select: { id: true },
    });

    return session;
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return jsonError("Email and password are required.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true },
    });

    if (!user || !user.passwordHash) {
      return jsonError("Invalid email or password.", 401);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return jsonError("Invalid email or password.", 401);

    // 🚫 Block login until email is verified
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Please verify your email before logging in.",
          code: "EMAIL_NOT_VERIFIED",
        },
        { status: 403 }
      );
    }

    // ✅ Enforce 1 session/account in portal (last login wins)
    const meta = getClientMeta(req);
    const session = await createSingleActiveSession(user.id, meta);

    const token = await signSession(user.id, session.id);

    // update last login (best-effort)
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {});

    const res = NextResponse.json({ success: true }, { status: 200 });
    res.cookies.set(buildSessionCookie(token));
    return res;
  } catch (err) {
    console.error("Login failed:", err);
    return jsonError("Login failed. Please try again.", 500);
  }
}
