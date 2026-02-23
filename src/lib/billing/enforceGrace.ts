import { prisma } from "@/lib/db";

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * If user is PRO in GRACE and graceUntil is in the past,
 * downgrade to FREE and clear grace fields.
 *
 * Returns an object describing what happened (useful for debugging).
 */
export async function enforceGraceExpiry(userId: string) {
  const ent = await prisma.entitlement.findUnique({
    where: { userId },
    select: { tier: true, status: true, features: true },
  });

  if (!ent) return { changed: false, reason: "no_entitlement" as const };
  if (ent.status === "blocked") return { changed: false, reason: "blocked" as const };
  if (ent.tier !== "pro" || ent.status !== "grace") {
    return { changed: false, reason: "not_in_grace" as const };
  }

  const graceUntilRaw = isPlainObject(ent.features)
    ? (ent.features as Record<string, unknown>)["graceUntil"]
    : undefined;

  const graceUntil = parseIsoDate(graceUntilRaw);
  if (!graceUntil) {
    // If graceUntil is missing/invalid, be conservative:
    // keep grace, don’t downgrade.
    return { changed: false, reason: "missing_graceUntil" as const };
  }

  const now = new Date();
  if (graceUntil.getTime() > now.getTime()) {
    return { changed: false, reason: "grace_still_valid" as const };
  }

  // Grace expired -> downgrade
  const nextFeatures = isPlainObject(ent.features) ? { ...(ent.features as any) } : {};
  delete nextFeatures.graceUntil;
  delete nextFeatures.graceReason;
  delete nextFeatures.graceSetAt;
  nextFeatures.downgradedAt = now.toISOString();
  nextFeatures.downgradeReason = "grace_expired";

  await prisma.entitlement.update({
    where: { userId },
    data: {
      tier: "free" as any,
      status: "active" as any,
      features: nextFeatures as any,
    },
  });

  // Optional: mark subscription as past_due (helps UI)
  await prisma.subscription
    .update({
      where: { userId },
      data: { status: "past_due" as any },
    })
    .catch(() => null);

  return { changed: true, reason: "grace_expired" as const, at: now.toISOString() };
}