import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { buildSessionCookie, signSession } from "@/lib/auth";

const SESSION_DAYS = 7;

export async function POST(req: NextRequest) {
  try {
    const { email, code, remember } = await req.json().catch(() => ({}));
    const e = String(email || "").trim().toLowerCase();
    const c = String(code || "").trim();

    if (!e || !e.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (!c || c.length < 4) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const now = new Date();
    const otp = await prisma.otpCode.findFirst({
      where: {
        email: e,
        code: c,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: now } });

    const user = await prisma.user.upsert({
      where: { email: e },
      update: {},
      create: { email: e },
    });

    const maxAgeSeconds = (remember ? SESSION_DAYS : 1) * 24 * 60 * 60;
    const token = await signSession({ sub: user.id, email: user.email }, maxAgeSeconds);

    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
    res.headers.append("set-cookie", buildSessionCookie(token, maxAgeSeconds));
    return res;
  } catch (err: any) {
    console.error("[auth/verify-otp]", err?.message || err);
    return NextResponse.json({ error: "OTP verification failed" }, { status: 500 });
  }
}
