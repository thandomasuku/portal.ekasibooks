import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/token";

export const dynamic = "force-dynamic";

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const EMAIL_VERIFY_TTL_HOURS = Number(process.env.EMAIL_VERIFY_TTL_HOURS || "24");

// Accept either EMAIL_FROM or MAIL_FROM to match your other routes
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
  const base = APP_URL && APP_URL.trim() ? cleanBaseUrl(APP_URL.trim()) : req.nextUrl.origin;
  return base;
}

function addHours(d: Date, hours: number) {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

async function sendVerificationEmail(toEmail: string, verifyUrl: string) {
  const configured = EMAIL_FROM && SMTP_HOST && SMTP_USER && SMTP_PASS && Number.isFinite(SMTP_PORT);
  if (!configured) return { sent: false as const, reason: "smtp_not_configured" as const };

  const nodemailer = await import("nodemailer").catch(() => null);
  if (!nodemailer?.createTransport) return { sent: false as const, reason: "nodemailer_missing" as const };

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const subject = "Verify your email for eKasiBooks";
  const text = `Verify your email by clicking:\n${verifyUrl}\n\nThis link expires in ${EMAIL_VERIFY_TTL_HOURS} hours.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p style="margin:0 0 18px">Click the button below to verify your email address:</p>
      <p style="margin:0 0 18px">
        <a href="${verifyUrl}" style="display:inline-block;background:#215D63;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700">
          Verify email
        </a>
      </p>
      <p style="margin:0;color:#475569;font-size:12px">This link expires in ${EMAIL_VERIFY_TTL_HOURS} hours.</p>
    </div>
  `;

  await transporter.sendMail({ from: EMAIL_FROM, to: toEmail, subject, text, html });
  return { sent: true as const };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) return jsonError("Invalid email", 400);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user) return jsonError("Account not found. Please register first.", 404);

    if (user.emailVerifiedAt) {
      return NextResponse.json({ success: true, alreadyVerified: true }, { status: 200 });
    }

    const token = generateToken(32);
    const tokenHash = sha256(token);
    const expiresAt = addHours(new Date(), Math.max(1, EMAIL_VERIFY_TTL_HOURS));

    await prisma.emailVerificationToken.upsert({
      where: { userId: user.id },
      create: { userId: user.id, tokenHash, expiresAt },
      update: { tokenHash, expiresAt },
    });

    const baseUrl = getBaseUrl(req);
    const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

    const emailSend = await sendVerificationEmail(user.email, verifyUrl).catch((err) => {
      console.warn("[auth/resend-verification] sendVerificationEmail failed:", err?.message || err);
      return { sent: false as const, reason: "send_failed" as const };
    });

    const resBody: any = { success: true, emailSent: emailSend.sent === true };
    if (process.env.NODE_ENV !== "production" && emailSend.sent !== true) {
      resBody.dev_verifyUrl = verifyUrl;
    }

    return NextResponse.json(resBody, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Resend failed." },
      { status: 500 }
    );
  }
}
