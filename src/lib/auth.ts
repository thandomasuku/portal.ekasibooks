// src/lib/auth.ts
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "ekasi_session";

// 30 days default (same vibe as you already have)
const SESSION_TTL_DAYS = 30;

type SessionJwtPayload = {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET (or NEXTAUTH_SECRET) env var");
  }
  return new TextEncoder().encode(secret);
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function buildSessionCookie(token: string) {
  // keep your cookie behavior: httpOnly, secure in prod, sameSite lax
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
  };
}

export async function signSession(userId: string, sessionId: string) {
  const secret = getJwtSecret();

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * SESSION_TTL_DAYS;

  return await new SignJWT({ userId, sessionId } satisfies Omit<
    SessionJwtPayload,
    "iat" | "exp"
  >)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret);
}

async function verifyJwtOnly(token: string): Promise<SessionJwtPayload> {
  const secret = getJwtSecret();
  const { payload } = await jwtVerify(token, secret);

  const userId = String((payload as any)?.userId || "").trim();
  const sessionId = String((payload as any)?.sessionId || "").trim();

  if (!userId || !sessionId) {
    throw new Error("Invalid session token payload");
  }

  // iat/exp are validated by jwtVerify already, but keep shape consistent
  return {
    userId,
    sessionId,
    iat: Number((payload as any)?.iat ?? 0) || 0,
    exp: Number((payload as any)?.exp ?? 0) || 0,
  };
}

/**
 * ✅ Portal enforcement hook:
 * - verify JWT
 * - check session exists + not revoked
 * - touch lastSeenAt
 */
export async function verifySession(token: string) {
  const decoded = await verifyJwtOnly(token);

  const session = await prisma.session.findUnique({
    where: { id: decoded.sessionId },
    select: { id: true, userId: true, revokedAt: true },
  });

  if (!session) throw new Error("Session not found");
  if (session.revokedAt) throw new Error("Session revoked");
  if (session.userId !== decoded.userId) throw new Error("Session mismatch");

  // touch (best-effort)
  prisma.session
    .update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  return { userId: decoded.userId, sessionId: decoded.sessionId };
}

/**
 * For logout: we want to extract sessionId even if DB check fails
 * (e.g. session already revoked/deleted).
 */
export async function decodeSession(token: string) {
  return await verifyJwtOnly(token);
}
