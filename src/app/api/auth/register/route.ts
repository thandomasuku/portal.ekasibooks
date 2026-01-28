// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { buildSessionCookie, signSession } from "@/lib/auth";

const SESSION_DAYS = 7;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getClientMeta(req: NextRequest) {
  const userAgent = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "";
  return { userAgent, ip };
}

async function enforceMaxSessions(userId: string, max = 1) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: [{ lastSeenAt: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (sessions.length < max) return;

  // revoke oldest until there's room (keep newest max-1 before creating new)
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
    const { email, password, remember } = await req.json().catch(() => ({}));

    const e = String(email || "").trim().toLowerCase();
    const pw = String(password || "");

    if (!e || !e.includes("@")) {
      return jsonError("Invalid email", 400);
    }
    if (pw.length < 8) {
      return jsonError("Password must be at least 8 characters", 400);
    }

    const existing = await prisma.user.findUnique({ where: { email: e } });
    if (existing) {
      return jsonError("User already exists", 409);
    }

    const passwordHash = await bcrypt.hash(pw, 12);

    // Create user
    const user = await prisma.user.create({
      data: { email: e, passwordHash },
      select: { id: true, email: true },
    });

    // ✅ Enforce 1 active session per account (consistent with login route)
    await enforceMaxSessions(user.id, 1);

    // Create session row (auto-login after register)
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

    // Sign JWT with userId + sessionId (new auth model)
    const token = await signSession(user.id, session.id);

    // Cookie maxAge: 1 day vs 7 days (remember me)
    const maxAgeSeconds = (remember ? SESSION_DAYS : 1) * 24 * 60 * 60;

    const res = NextResponse.json(
      { success: true, user: { id: user.id, email: user.email } },
      { status: 200 }
    );

    // build default cookie then override maxAge if needed
    const cookie = buildSessionCookie(token);
    res.cookies.set({ ...cookie, maxAge: maxAgeSeconds });

    return res;
  } catch (err: any) {
    console.error("[auth/register] error", err?.message || err);
    return NextResponse.json({ success: false, error: "Registration failed" }, { status: 500 });
  }
}
