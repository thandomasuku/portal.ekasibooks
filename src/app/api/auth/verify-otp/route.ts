import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { buildSessionCookie, signSession } from "@/lib/auth";

const SESSION_DAYS = 7;

// Brute-force protection (cookie-based)
const ATTEMPT_COOKIE = "ekb_otp_attempts";
const ATTEMPT_WINDOW_SECONDS = 10 * 60; // 10 minutes
const MAX_ATTEMPTS = 5;

function parseAttemptsCookie(raw?: string | null) {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return {
      email: typeof obj.email === "string" ? obj.email : "",
      n: typeof obj.n === "number" ? obj.n : 0,
      ts: typeof obj.ts === "number" ? obj.ts : 0,
    };
  } catch {
    return null;
  }
}

function attemptsCookieValue(email: string, n: number) {
  return JSON.stringify({ email, n, ts: Date.now() });
}

function setAttemptsCookie(res: NextResponse, email: string, n: number) {
  const isProd = process.env.NODE_ENV === "production";
  res.headers.append(
    "set-cookie",
    `${ATTEMPT_COOKIE}=${encodeURIComponent(attemptsCookieValue(email, n))}; Path=/; Max-Age=${ATTEMPT_WINDOW_SECONDS}; HttpOnly; SameSite=Lax${
      isProd ? "; Secure" : ""
    }`
  );
}

function clearAttemptsCookie(res: NextResponse) {
  const isProd = process.env.NODE_ENV === "production";
  res.headers.append(
    "set-cookie",
    `${ATTEMPT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // Accept common client payload shapes
    const rawEmail = body?.email ?? body?.user?.email ?? body?.identifier ?? "";
    const rawCode = body?.code ?? body?.otp ?? body?.otpCode ?? body?.passcode ?? "";
    const remember = Boolean(body?.remember);

    const e = String(rawEmail || "").trim().toLowerCase();
    const c = String(rawCode || "").trim();

    if (!e || !e.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (!c || c.length < 4) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // ---- Attempt lockout (cookie-based) ----
    const attempts = parseAttemptsCookie(req.cookies.get(ATTEMPT_COOKIE)?.value ?? null);
    const nowMs = Date.now();

    if (attempts && attempts.email === e && attempts.ts && nowMs - attempts.ts < ATTEMPT_WINDOW_SECONDS * 1000) {
      if (attempts.n >= MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: "Too many attempts. Please request a new code and try again shortly." },
          { status: 429 }
        );
      }
    }

    const now = new Date();

    // Match an unused, unexpired OTP
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
      // Slight delay slows brute forcing (without breaking UX)
      await new Promise((r) => setTimeout(r, 350));

      const res = NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });

      const prevN =
        attempts && attempts.email === e && nowMs - attempts.ts < ATTEMPT_WINDOW_SECONDS * 1000 ? attempts.n : 0;

      setAttemptsCookie(res, e, prevN + 1);
      return res;
    }

    // Mark OTP used
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: now },
    });

    const user = await prisma.user.upsert({
      where: { email: e },
      update: {},
      create: { email: e },
    });

    const maxAgeSeconds = (remember ? SESSION_DAYS : 1) * 24 * 60 * 60;
    const token = await signSession({ sub: user.id, email: user.email }, maxAgeSeconds);

    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
    res.headers.append("set-cookie", buildSessionCookie(token, maxAgeSeconds));

    // ✅ success clears attempt counter
    clearAttemptsCookie(res);

    return res;
  } catch (err: any) {
    console.error("[auth/verify-otp]", err?.message || err);
    return NextResponse.json({ error: "OTP verification failed" }, { status: 500 });
  }
}
