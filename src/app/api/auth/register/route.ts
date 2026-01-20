import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { buildSessionCookie, signSession } from "@/lib/auth";

const SESSION_DAYS = 7;

export async function POST(req: NextRequest) {
  try {
    const { email, password, remember } = await req.json().catch(() => ({}));

    const e = String(email || "").trim().toLowerCase();
    const pw = String(password || "");

    if (!e || !e.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (pw.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: e } });
    if (existing) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(pw, 12);
    const user = await prisma.user.create({ data: { email: e, passwordHash } });

    const maxAgeSeconds = (remember ? SESSION_DAYS : 1) * 24 * 60 * 60;
    const token = await signSession({ sub: user.id, email: user.email }, maxAgeSeconds);

    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
    res.headers.append("set-cookie", buildSessionCookie(token, maxAgeSeconds));
    return res;
  } catch (err: any) {
    console.error("[auth/register] error", err?.message || err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
