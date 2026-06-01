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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const admin = await getAdminUser();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, sessionId } = await params;

  if (!id || !sessionId) {
    return NextResponse.json({ error: "Missing session details" }, { status: 400 });
  }

  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId: id },
    select: { id: true, userId: true, revokedAt: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.revokedAt) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  const currentSessionId = await getCurrentSessionId(req);

  if (id === admin.id && sessionId === currentSessionId) {
    return NextResponse.json(
      { error: "You cannot revoke the session you are currently using." },
      { status: 400 },
    );
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
