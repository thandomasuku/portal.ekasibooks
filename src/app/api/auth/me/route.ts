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

function displayNameFromEmail(email?: string | null) {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  if (!local) return null;

  // make it look decent: "syrus.mokoena" -> "Syrus Mokoena"
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
        { authenticated: false },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        fullName: true,
        companyName: true,
        phone: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const displayName = displayNameFromEmail(user.email);

    // ✅ Backwards compatible + flat convenience fields
    return NextResponse.json(
      {
        authenticated: true,

        // email verification
        emailVerified: Boolean(user.emailVerifiedAt),
        emailVerifiedAt: user.emailVerifiedAt,

        // flat fields (easy for UI)
        id: user.id,
        email: user.email,
        displayName,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,

        // ✅ profile fields (flat)
        fullName: user.fullName,
        companyName: user.companyName,
        phone: user.phone,

        // keep existing nested shape too
        user: {
          id: user.id,
          email: user.email,
          displayName,
          emailVerified: Boolean(user.emailVerifiedAt),
          emailVerifiedAt: user.emailVerifiedAt,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,

          // ✅ profile fields (nested)
          fullName: user.fullName,
          companyName: user.companyName,
          phone: user.phone,
        },
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: noStoreHeaders() }
    );
  }
}
