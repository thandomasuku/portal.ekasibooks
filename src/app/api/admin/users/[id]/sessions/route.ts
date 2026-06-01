import { NextRequest, NextResponse } from "next/server";

import { getAdminUser } from "@/lib/admin";
import { decodeSession, getSessionCookieName } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getCurrentSessionId(req: NextRequest) {
  const token = req.cookies.get(getSessionCookieName())?.value;
  if (!token) return null;

  try {
    const decoded = await decodeSession(token);
    return decoded.sessionId || null;
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let action = "revokeActiveSessions";

  try {
    const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
    action = String(body?.action || action);
  } catch {
    action = "revokeActiveSessions";
  }

  if (action !== "revokeActiveSessions") {
    return NextResponse.json({ error: "Invalid session action" }, { status: 400 });
  }

  const currentSessionId = await getCurrentSessionId(req);
  const now = new Date();

  const result = await prisma.session.updateMany({
    where: {
      userId: id,
      revokedAt: null,
      ...(id === admin.id && currentSessionId ? { id: { not: currentSessionId } } : {}),
    },
    data: { revokedAt: now },
  });

  return NextResponse.json({ ok: true, revokedCount: result.count });
}
