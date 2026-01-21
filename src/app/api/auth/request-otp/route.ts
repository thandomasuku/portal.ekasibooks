import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/db";

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({}));
    const e = String(email || "").trim().toLowerCase();

    if (!e || !e.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const now = new Date();

    // ✅ Cooldown: prevent spamming resend (checks latest OTP createdAt)
    const latest = await prisma.otpCode.findFirst({
      where: { email: e },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (latest?.createdAt) {
      const secondsSince = Math.floor((now.getTime() - latest.createdAt.getTime()) / 1000);
      if (secondsSince < RESEND_COOLDOWN_SECONDS) {
        return NextResponse.json(
          { error: `Please wait ${RESEND_COOLDOWN_SECONDS - secondsSince}s before requesting another code.` },
          { status: 429 }
        );
      }
    }

    // Create user record if it doesn't exist yet
    const user = await prisma.user.upsert({
      where: { email: e },
      update: {},
      create: { email: e },
      select: { id: true, email: true },
    });

    // ✅ Cleanup: remove any previous unused OTPs for this email (avoid “wrong code”)
    await prisma.otpCode.deleteMany({
      where: {
        email: e,
        usedAt: null,
      },
    });

    const code = randomCode();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    await prisma.otpCode.create({
      data: {
        email: e,
        code,
        expiresAt,
        userId: user.id,
      },
    });

    const isProd = process.env.NODE_ENV === "production";

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
      console.error("[auth/request-otp] Missing SMTP env vars");
      if (isProd) {
        return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, devCode: code });
    }

    const portNum = Number(SMTP_PORT);
    const secure = portNum === 465;

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: portNum,
      secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    await transporter.verify();
    console.log("[auth/request-otp] SMTP verify OK", { host: SMTP_HOST, port: portNum, secure });

    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to: e,
      subject: "Your eKasiBooks login code",
      text: `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      html: `
        <p>Your eKasiBooks verification code:</p>
        <h2 style="letter-spacing:2px">${code}</h2>
        <p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>
      `,
    });

    console.log("[auth/request-otp] sendMail result", {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: (info as any).response,
    });

    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      return NextResponse.json(
        { error: `Email rejected by SMTP server: ${info.rejected.join(", ")}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, ...(isProd ? {} : { devCode: code }) });
  } catch (err: any) {
    console.error("[auth/request-otp]", err);
    return NextResponse.json({ error: err?.message || "OTP request failed" }, { status: 500 });
  }
}
