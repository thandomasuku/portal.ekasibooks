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

  const xff = req.headers.get("x-forwarded-for") || "";
  const ip =
    (xff.split(",")[0] || "").trim() ||
    (req.headers.get("x-real-ip") || "").trim() ||
    "";

  return { userAgent, ip };
}

// ✅ Enforce max active sessions per account.
// This should be called BEFORE creating the new session.
// Example: max = 2 means revoke enough old sessions so the new login becomes the 2nd active session.
async function enforceMaxSessions(userId: string, max = 1) {
  const safeMax = Math.max(1, Math.floor(max));

  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: [{ lastSeenAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (sessions.length < safeMax) return;

  const toRevokeCount = sessions.length - (safeMax - 1);
  const toRevoke = sessions.slice(0, Math.max(0, toRevokeCount));

  if (toRevoke.length) {
    await prisma.session.updateMany({
      where: { id: { in: toRevoke.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return null;
}

async function getMaxActiveSessions(userId: string) {
  const entitlement = await prisma.entitlement.findUnique({
    where: { userId },
    select: {
      tier: true,
      status: true,
      features: true,
    },
  });

  const tier = String(entitlement?.tier || "starter").toLowerCase().trim();
  const status = String(entitlement?.status || "active").toLowerCase().trim();

  if (status === "blocked" || status === "none") {
    return 1;
  }

  const features = isPlainObject(entitlement?.features)
    ? entitlement.features
    : {};

  const featureLimit = toPositiveInteger(features.maxActiveSessions);

  if (featureLimit) {
    return featureLimit;
  }

  if (tier === "pro") return 4;
  if (tier === "growth") return 2;

  return 1;
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

    // ✅ Fix: Prisma types allow userId to be null, guard it
    if (!otp.userId) {
      return jsonError("Invalid OTP record.", 400);
    }

    // Load user (OTP login is ONLY for existing users)
    const user = await prisma.user.findUnique({
      where: { id: otp.userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user) {
      return jsonError("Account not found. Please register first.", 404);
    }

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

    // ✅ Mark OTP used ONLY after we know the user exists & is allowed to login
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    // ✅ OTP login must respect the same plan-based session limit as normal login.
    // Previously this was hardcoded to 1, which could revoke valid Growth/Pro sessions.
    const maxActiveSessions = await getMaxActiveSessions(user.id);
    await enforceMaxSessions(user.id, maxActiveSessions);

    const meta = getClientMeta(req);
    const now = new Date();

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        userAgent: meta.userAgent,
        ip: String(meta.ip || "").slice(0, 190),
        createdAt: now,
        lastSeenAt: now,
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
      {
        success: true,
        user: { id: user.id, email: user.email },
        maxActiveSessions,
      },
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