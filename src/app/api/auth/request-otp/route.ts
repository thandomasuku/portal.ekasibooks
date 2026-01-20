import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

function randomCode() {
  // 6-digit numeric
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({}));
    const e = String(email || "").trim().toLowerCase();
    if (!e || !e.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const code = randomCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Create user record if it doesn't exist yet
    const user = await prisma.user.upsert({
      where: { email: e },
      update: {},
      create: { email: e },
    });

    await prisma.otpCode.create({
      data: {
        email: e,
        code,
        expiresAt,
        userId: user.id,
      },
    });

    const isProd = process.env.NODE_ENV === "production";

    // TODO: integrate actual SMS/email delivery.
    // For now: in dev, return the code to unblock testing.
    return NextResponse.json({ ok: true, ...(isProd ? {} : { devCode: code }) });
  } catch (err: any) {
    console.error("[auth/request-otp]", err?.message || err);
    return NextResponse.json({ error: "OTP request failed" }, { status: 500 });
  }
}
