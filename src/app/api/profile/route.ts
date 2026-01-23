import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
  };
}

function cleanStr(v: any, max: number) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanPhone(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // light validation: keep digits, +, spaces, dashes
  const ok = /^[0-9+\-\s()]{6,30}$/.test(s);
  return ok ? s.slice(0, 30) : null;
}

export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get(getSessionCookieName())?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401, headers: noStoreHeaders() });
    }

    const { userId } = await verifySession(token);

    const body = await req.json().catch(() => ({} as any));

    const fullName = cleanStr(body?.fullName, 80);
    const companyName = cleanStr(body?.companyName, 120);
    const phone = cleanPhone(body?.phone);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { fullName, companyName, phone },
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

    return NextResponse.json({ ok: true, user }, { status: 200, headers: noStoreHeaders() });
  } catch (err: any) {
    console.error("[api/profile] error", err?.message || err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500, headers: noStoreHeaders() });
  }
}
