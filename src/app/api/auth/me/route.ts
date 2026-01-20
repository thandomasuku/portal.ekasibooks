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
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    // Minimal, stable response shape
    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      { status: 200, headers: noStoreHeaders() }
    );
  } catch {
    // Any failure = unauthenticated
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: noStoreHeaders() }
    );
  }
}
