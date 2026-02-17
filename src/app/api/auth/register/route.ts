// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/token";
// NOTE: Registration does NOT create a login session.
// Users must verify email before they can log in.

// Email verification config
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const EMAIL_VERIFY_TTL_HOURS = Number(process.env.EMAIL_VERIFY_TTL_HOURS || "24");

// Optional email sender env (won’t break if missing)
// Support both EMAIL_FROM and MAIL_FROM (your OTP flow uses MAIL_FROM)
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.MAIL_FROM || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || "587");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function cleanBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

function getBaseUrl(req: NextRequest) {
  const base =
    APP_URL && APP_URL.trim() ? cleanBaseUrl(APP_URL.trim()) : req.nextUrl.origin;
  return base;
}

// (intentionally no session creation here)

function addHours(d: Date, hours: number) {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Optional SMTP email sender (only used if SMTP env vars exist).
 * Won't throw if not configured; returns {sent:false}.
 */
async function sendVerificationEmail(toEmail: string, verifyUrl: string) {
  const configured =
    EMAIL_FROM && SMTP_HOST && SMTP_USER && SMTP_PASS && Number.isFinite(SMTP_PORT);

  if (!configured) {
    return { sent: false as const, reason: "smtp_not_configured" as const };
  }

  // Lazy import so we don’t require nodemailer unless you actually configure SMTP
  const nodemailer = await import("nodemailer").catch(() => null);
  if (!nodemailer?.createTransport) {
    return { sent: false as const, reason: "nodemailer_missing" as const };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const subject = "Verify your email for eKasiBooks";
  const text = `Welcome to eKasiBooks!\n\nVerify your email by clicking:\n${verifyUrl}\n\nThis link expires in ${EMAIL_VERIFY_TTL_HOURS} hours.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p style="margin:0 0 12px">Welcome to eKasiBooks 👋</p>
      <p style="margin:0 0 18px">Click the button below to verify your email address:</p>
      <p style="margin:0 0 18px">
        <a href="${verifyUrl}" style="display:inline-block;background:#215D63;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700">
          Verify email
        </a>
      </p>
      <p style="margin:0;color:#475569;font-size:12px">This link expires in ${EMAIL_VERIFY_TTL_HOURS} hours.</p>
    </div>
  `;

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: toEmail,
    subject,
    text,
    html,
  });

  return { sent: true as const };
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json().catch(() => ({}));

    const e = String(email || "").trim().toLowerCase();
    const pw = String(password || "");

    if (!e || !e.includes("@")) {
      return jsonError("Invalid email", 400);
    }
    if (pw.length < 8) {
      return jsonError("Password must be at least 8 characters", 400);
    }

    const existing = await prisma.user.findUnique({ where: { email: e } });
    if (existing) {
      return jsonError("User already exists", 409);
    }

    const passwordHash = await bcrypt.hash(pw, 12);

    // 1) Create user
    const user = await prisma.user.create({
      data: {
        email: e,
        passwordHash,
        // If you added emailVerifiedAt, it will default null anyway.
        // emailVerifiedAt: null,
      },
      select: { id: true, email: true },
    });

    // 2) Create/replace email verification token
    const token = generateToken(32);
    const tokenHash = sha256(token);
    const expiresAt = addHours(new Date(), Math.max(1, EMAIL_VERIFY_TTL_HOURS));

    // If your model uses userId UNIQUE (one active token per user), upsert is ideal.
    // If your schema allows multiple tokens, switch this to create + cleanup old.
    await prisma.emailVerificationToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
      update: {
        tokenHash,
        expiresAt,
      },
    });

    const baseUrl = getBaseUrl(req);
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

    // 3) Try send email (optional)
    const emailSend = await sendVerificationEmail(user.email, verifyUrl).catch((err) => {
      console.warn("[auth/register] sendVerificationEmail failed:", err?.message || err);
      return { sent: false as const, reason: "send_failed" as const };
    });

    // 4) Response (no session cookie)
    const resBody: any = {
      success: true,
      user: { id: user.id, email: user.email },
      emailVerificationRequired: true,
      emailSent: emailSend.sent === true,
    };

    // Helpful for dev/testing (don’t leak in production)
    if (process.env.NODE_ENV !== "production" && emailSend.sent !== true) {
      resBody.dev_verifyUrl = verifyUrl;
    }

    return NextResponse.json(resBody, { status: 200 });
  } catch (err: any) {
    console.error("[auth/register] error", err?.message || err);
    return NextResponse.json({ success: false, error: "Registration failed" }, { status: 500 });
  }
}
