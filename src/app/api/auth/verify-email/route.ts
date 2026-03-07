import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/token";
import { buildSessionCookie, signSession } from "@/lib/auth";

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...(extra || {}) }, { status });
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

async function createSingleActiveSession(
  userId: string,
  meta: { userAgent: string; ip: string }
) {
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });

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

async function verifyToken(req: NextRequest, rawToken: string) {
  const token = String(rawToken || "").trim();
  if (!token) {
    return { res: jsonError("Missing token.", 400, { code: "TOKEN_MISSING" }) };
  }

  const tokenHash = sha256(token);

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!record) {
    return {
      res: jsonError("Invalid or expired token.", 400, { code: "TOKEN_INVALID" }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (!user) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } }).catch(() => {});
    return {
      res: jsonError("Account not found.", 404, { code: "USER_NOT_FOUND" }),
    };
  }

  if (record.expiresAt <= new Date()) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } }).catch(() => {});
    return {
      res: jsonError("Token expired. Please request a new verification email.", 400, {
        code: "TOKEN_EXPIRED",
        email: user.email,
      }),
    };
  }

  // Already verified? still auto-login for better UX
  if (user.emailVerifiedAt) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } }).catch(() => {});

    const meta = getClientMeta(req);
    const session = await createSingleActiveSession(user.id, meta);
    const signed = await signSession(user.id, session.id);

    const res = NextResponse.json(
      { success: true, alreadyVerified: true, redirectTo: "/billing" },
      { status: 200 }
    );
    res.cookies.set(buildSessionCookie(signed));
    return { res };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  await prisma.emailVerificationToken.delete({ where: { id: record.id } });

  const meta = getClientMeta(req);
  const session = await createSingleActiveSession(user.id, meta);
  const signed = await signSession(user.id, session.id);

  prisma.user
    .update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    .catch(() => {});

  const res = NextResponse.json(
    { success: true, redirectTo: "/billing" },
    { status: 200 }
  );
  res.cookies.set(buildSessionCookie(signed));
  return { res };
}

// POST: { token }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return (await verifyToken(req, body?.token)).res;
}

// GET: ?token=...
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  return (await verifyToken(req, token)).res;
}