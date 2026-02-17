import { NextRequest, NextResponse } from "next/server";
import nodemailer, { Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

// ---- SMTP transporter (pooled + cached) ----
type SmtpEnv = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
};

function getSmtpEnv(): SmtpEnv | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) return null;

  const port = Number(SMTP_PORT);
  return {
    host: SMTP_HOST,
    port,
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: MAIL_FROM,
    secure: port === 465,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __ekasiOtpMailer: Transporter | undefined;
  // eslint-disable-next-line no-var
  var __ekasiOtpMailerKey: string | undefined;
}

function buildTransporter(env: SmtpEnv): Transporter {
  return nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.pass },

    pool: true,
    maxConnections: 2,
    maxMessages: 100,

    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,

    tls: { servername: env.host },
  });
}

function getTransporter(env: SmtpEnv): Transporter {
  const key = `${env.host}:${env.port}:${env.user}:${env.secure ? "s" : "p"}`;

  if (!globalThis.__ekasiOtpMailer || globalThis.__ekasiOtpMailerKey !== key) {
    globalThis.__ekasiOtpMailer = buildTransporter(env);
    globalThis.__ekasiOtpMailerKey = key;
  }
  return globalThis.__ekasiOtpMailer!;
}

function resetTransporter() {
  try {
    (globalThis.__ekasiOtpMailer as any)?.close?.();
  } catch {}
  globalThis.__ekasiOtpMailer = undefined;
  globalThis.__ekasiOtpMailerKey = undefined;
}

async function resolveTargetEmail(req: NextRequest): Promise<{ email: string; mode: "PUBLIC" | "SESSION" }> {
  const body = await req.json().catch(() => ({} as any));

  // If client supplies email, we treat it as public/login request.
  const rawEmail = body?.email ?? body?.user?.email ?? body?.identifier ?? "";
  const e = String(rawEmail || "").trim().toLowerCase();

  if (e) return { email: e, mode: "PUBLIC" };

  // Otherwise: must be authenticated and we derive email from session.
  const cookieName = getSessionCookieName();
  const token = req.cookies.get(cookieName)?.value;
  if (!token) throw new Error("UNAUTH");

  const { userId } = await verifySession(token);

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const se = String(u?.email || "").trim().toLowerCase();
  if (!se || !se.includes("@")) throw new Error("NO_EMAIL");

  return { email: se, mode: "SESSION" };
}

export async function POST(req: NextRequest) {
  try {
    // We accept "purpose" to customize copy (e.g. PASSWORD_UPDATE),
    // but we do NOT trust it for security decisions — only for messaging.
    const bodyPeek = await req.clone().json().catch(() => ({} as any));
    const purpose = String(bodyPeek?.purpose ?? "").toUpperCase();

    // Resolve email either from body or from session
    let resolved: { email: string; mode: "PUBLIC" | "SESSION" };
    try {
      resolved = await resolveTargetEmail(req);
    } catch (e: any) {
      if (e?.message === "UNAUTH") {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: noStoreHeaders() });
      }
      return NextResponse.json({ error: "Unable to resolve email for OTP" }, { status: 400, headers: noStoreHeaders() });
    }

    const e = resolved.email;

    if (!e || !e.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400, headers: noStoreHeaders() });
    }

    const now = new Date();

    // 🚫 Public OTP login is only for existing, email-verified accounts.
    // (OTP can still be used for password update when already authenticated.)
    if (resolved.mode === "PUBLIC") {
      const u = await prisma.user.findUnique({
        where: { email: e },
        select: { id: true, emailVerifiedAt: true },
      });

      if (!u) {
        return NextResponse.json(
          { error: "Account not found. Please register first." },
          { status: 404, headers: noStoreHeaders() }
        );
      }

      if (!u.emailVerifiedAt) {
        return NextResponse.json(
          { error: "Please verify your email before using OTP login.", code: "EMAIL_NOT_VERIFIED" },
          { status: 403, headers: noStoreHeaders() }
        );
      }
    }

    // Cooldown check
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
          { status: 429, headers: noStoreHeaders() }
        );
      }
    }

    const code = randomCode();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

    // Transaction: clear old unused, create OTP
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { email: e },
        select: { id: true },
      });

      if (!u) {
        // In PUBLIC mode we already returned above; in SESSION mode, this would be unusual.
        throw new Error("ACCOUNT_NOT_FOUND");
      }

      await tx.otpCode.deleteMany({ where: { email: e, usedAt: null } });

      await tx.otpCode.create({
        data: { email: e, code, expiresAt, userId: u.id },
      });
    });

    const isProd = process.env.NODE_ENV === "production";
    const env = getSmtpEnv();

    if (!env) {
      console.error("[auth/request-otp] Missing SMTP env vars");
      if (isProd) return NextResponse.json({ error: "Email service not configured" }, { status: 500, headers: noStoreHeaders() });
      return NextResponse.json({ ok: true, devCode: code }, { status: 200, headers: noStoreHeaders() });
    }

    // Slightly different wording for password update vs login
    const isPasswordUpdate = purpose === "PASSWORD_UPDATE" || resolved.mode === "SESSION";

    const subject = isPasswordUpdate ? "Your eKasiBooks password update code" : "Your eKasiBooks login code";
    const text = isPasswordUpdate
      ? `Your code to update your eKasiBooks password is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`
      : `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`;

    const html = isPasswordUpdate
      ? `
        <p>Use this code to update your eKasiBooks password:</p>
        <h2 style="letter-spacing:2px">${code}</h2>
        <p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>
        <p style="color:#64748b;font-size:12px">If you didn’t request this, you can ignore this email.</p>
      `
      : `
        <p>Your eKasiBooks verification code:</p>
        <h2 style="letter-spacing:2px">${code}</h2>
        <p>This code expires in ${OTP_TTL_MINUTES} minutes.</p>
      `;

    const transporter = getTransporter(env);

    try {
      const t0 = Date.now();
      const info = await transporter.sendMail({
        from: env.from,
        to: e,
        subject,
        text,
        html,
      });
      const ms = Date.now() - t0;

      console.log("🔐 [OTP] sendMail ms:", ms);
      console.log("🔐 [OTP] messageId:", info.messageId);
      console.log("🔐 [OTP] response:", info.response);

      if (Array.isArray(info.rejected) && info.rejected.length > 0) {
        return NextResponse.json(
          { error: `Email rejected by SMTP server: ${info.rejected.join(", ")}` },
          { status: 502, headers: noStoreHeaders() }
        );
      }
    } catch (err: any) {
      console.warn("[auth/request-otp] sendMail failed, retrying once:", err?.message || err);
      resetTransporter();

      const retryTransporter = getTransporter(env);
      const info = await retryTransporter.sendMail({
        from: env.from,
        to: e,
        subject,
        text,
        html,
      });

      if (Array.isArray(info.rejected) && info.rejected.length > 0) {
        return NextResponse.json(
          { error: `Email rejected by SMTP server: ${info.rejected.join(", ")}` },
          { status: 502, headers: noStoreHeaders() }
        );
      }
    }

    // In prod: never return code. In dev: ok to return devCode
    return NextResponse.json(
      { ok: true, ...(isProd ? {} : { devCode: code }) },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch (err: any) {
    console.error("[auth/request-otp]", err);
    return NextResponse.json({ error: err?.message || "OTP request failed" }, { status: 500, headers: noStoreHeaders() });
  }
}
