import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "ekasi_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing AUTH_SECRET");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string;
  email: string;
};

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export async function signSession(payload: SessionPayload, maxAgeSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSeconds)
    .sign(getSecret());
}

export async function verifySession(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  const sub = payload.sub;
  const email = (payload as any).email;
  if (!sub || typeof sub !== "string" || !email || typeof email !== "string") {
    throw new Error("Invalid session");
  }
  return { userId: sub, email };
}

export function buildSessionCookie(token: string, maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProd) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildLogoutCookie() {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isProd) parts.push("Secure");
  return parts.join("; ");
}
