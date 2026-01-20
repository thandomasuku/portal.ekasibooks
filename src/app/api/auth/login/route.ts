import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { buildSessionCookie, signSession } from "@/lib/auth";

const SESSION_DAYS = 7;

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const remember = Boolean(body?.remember);

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email" },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (!password) {
      // Keep message simple; UI can show "password required"
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });

    // IMPORTANT: do not reveal which part failed (email vs password)
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    // Session duration:
    // - remember=false => 1 day (reduces risk if device is shared)
    // - remember=true  => SESSION_DAYS
    const maxAgeSeconds = (remember ? SESSION_DAYS : 1) * 24 * 60 * 60;

    // Rotate session on every login
    const token = await signSession({ sub: user.id, email: user.email }, maxAgeSeconds);

    const res = NextResponse.json(
      { ok: true, user: { id: user.id, email: user.email } },
      { status: 200, headers: noStoreHeaders() }
    );

    // HttpOnly + SameSite + Secure(in prod) handled inside buildSessionCookie
    res.headers.append("set-cookie", buildSessionCookie(token, maxAgeSeconds));

    return res;
  } catch (err: any) {
    console.error("[auth/login] error", err?.message || err);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
