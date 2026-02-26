import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SessionPayload = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string | null;
    lastLoginAt: string | null;
    fullName: string | null;
    companyName: string | null;
    phone: string | null;
  };
};

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

function displayNameFromEmail(email?: string | null) {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  if (!local) return null;

  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function GET(req: NextRequest) {
  try {
    const cookieName = getSessionCookieName();
    const token = req.cookies.get(cookieName)?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        lastLoginAt: true,
        fullName: true,
        companyName: true,
        phone: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const payload: SessionPayload = {
      user: {
        id: user.id,
        email: user.email,
        displayName: displayNameFromEmail(user.email),
        createdAt: user.createdAt ? user.createdAt.toISOString() : null,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        fullName: user.fullName ?? null,
        companyName: user.companyName ?? null,
        phone: user.phone ?? null,
      },
    };

    return NextResponse.json(payload, { status: 200, headers: noStoreHeaders() });
  } catch {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStoreHeaders() }
    );
  }
}