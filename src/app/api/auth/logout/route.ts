// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decodeSession, getSessionCookieName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const cookieName = getSessionCookieName();
  const token = req.cookies.get(cookieName)?.value;

  // Always clear cookie
  const res = NextResponse.json({ success: true }, { status: 200 });
  res.cookies.set({
    name: cookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  if (!token) return res;

  try {
    const { sessionId } = await decodeSession(token);

    // best-effort revoke
    await prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch (err) {
    // ignore (token may be expired/revoked already)
    console.warn("Logout decode/revoke failed:", err);
  }

  return res;
}
