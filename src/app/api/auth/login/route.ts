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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toNumberOverride(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) {
      return Math.floor(n);
    }
  }

  return null;
}

async function getMaxActiveSessions(userId: string): Promise<number> {
  const ent = await prisma.entitlement.findUnique({
    where: { userId },
    select: {
      tier: true,
      status: true,
      features: true,
    },
  });

  const tier = String(ent?.tier ?? "free").toLowerCase().trim();
  const status = String(ent?.status ?? "active").toLowerCase().trim();

  const features = isPlainObject(ent?.features) ? ent.features : {};
  const override = toNumberOverride(features["maxActiveSessions"]);

  const tierDefault =
    tier === "pro" ? 4 :
    tier === "growth" ? 2 :
    1;

  const computed = override ?? tierDefault;

  // Safety: blocked/none should never get extra sessions.
  if (status === "blocked" || status === "none") {
    return 1;
  }

  return Math.max(1, computed);
}

/**
 * Enforce per-account active session limit:
 * create a new session, keep the newest N active sessions, revoke the rest.
 */
async function createLimitedActiveSession(
  userId: string,
  meta: { userAgent: string; ip: string },
  maxActiveSessions: number
) {
  const now = new Date();
  const keepCount = Math.max(1, maxActiveSessions);

  return await prisma.$transaction(async (tx) => {
    // Create the new session first
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

    // Fetch all active sessions for this user, newest first
    const activeSessions = await tx.session.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });

    // Keep the newest N sessions, revoke anything older
    const sessionsToRevoke = activeSessions.slice(keepCount).map((s) => s.id);

    if (sessionsToRevoke.length > 0) {
      await tx.session.updateMany({
        where: {
          id: { in: sessionsToRevoke },
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    }

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
    if (!ok) {
      return jsonError("Invalid email or password.", 401);
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

    const meta = getClientMeta(req);
    const maxActiveSessions = await getMaxActiveSessions(user.id);
    const session = await createLimitedActiveSession(user.id, meta, maxActiveSessions);

    const token = await signSession(user.id, session.id);

    // update last login (best-effort)
    prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => {});

    const res = NextResponse.json(
      {
        success: true,
        maxActiveSessions,
      },
      { status: 200 }
    );
    res.cookies.set(buildSessionCookie(token));
    return res;
  } catch (err) {
    console.error("Login failed:", err);
    return jsonError("Login failed. Please try again.", 500);
  }
}