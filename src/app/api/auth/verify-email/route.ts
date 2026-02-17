import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/token";

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...(extra || {}) }, { status });
}

async function verifyToken(rawToken: string) {
  const token = String(rawToken || "").trim();
  if (!token) return { res: jsonError("Missing token.", 400, { code: "TOKEN_MISSING" }) };

  const tokenHash = sha256(token);

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!record) {
    return { res: jsonError("Invalid or expired token.", 400, { code: "TOKEN_INVALID" }) };
  }

  // Fetch user email for nicer UX (masking/assistance)
  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (!user) {
    // cleanup
    await prisma.emailVerificationToken.delete({ where: { id: record.id } }).catch(() => {});
    return { res: jsonError("Account not found.", 404, { code: "USER_NOT_FOUND" }) };
  }

  if (record.expiresAt <= new Date()) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } }).catch(() => {});
    return {
      res: jsonError("Token expired. Please request a new verification email.", 400, {
        code: "TOKEN_EXPIRED",
        email: user.email, // allows UI to offer resend without guessing
      }),
    };
  }

  // Already verified? Treat as success (nice UX)
  if (user.emailVerifiedAt) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } }).catch(() => {});
    return { res: NextResponse.json({ success: true, alreadyVerified: true }, { status: 200 }) };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  await prisma.emailVerificationToken.delete({ where: { id: record.id } });

  return { res: NextResponse.json({ success: true }, { status: 200 }) };
}

// POST: { token }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return (await verifyToken(body?.token)).res;
}

// GET: ?token=...
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  return (await verifyToken(token)).res;
}
