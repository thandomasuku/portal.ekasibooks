// src/lib/entitlements.ts
import type { EntitlementStatus, EntitlementTier } from "@prisma/client";

type RawFeatures = Record<string, any> | null | undefined;

export type ResolvedEntitlementFeatures = {
  readOnly: boolean;
  cloudSync: boolean;
  maxActiveSessions: number;
  limits: {
    companies: number;
  };
};

export type ResolvedEntitlementSnapshot = {
  tier: EntitlementTier | "none";
  status: EntitlementStatus | "none";
  features: ResolvedEntitlementFeatures;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n >= 0) {
      return Math.floor(n);
    }
  }
  return fallback;
}

export function resolveEntitlementSnapshot(input: {
  tier?: EntitlementTier | null;
  status?: EntitlementStatus | null;
  features?: RawFeatures;
}): ResolvedEntitlementSnapshot {
  const tier = input.tier ?? "none";
  const status = input.status ?? "none";

  const featureOverrides = asObject(input.features);
  const limitsOverrides = asObject(featureOverrides.limits);

  const tierDefaults: Record<
    ResolvedEntitlementSnapshot["tier"],
    ResolvedEntitlementFeatures
  > = {
    none: {
      readOnly: true,
      cloudSync: false,
      maxActiveSessions: 0,
      limits: { companies: 0 },
    },
    free: {
      readOnly: false,
      cloudSync: false,
      maxActiveSessions: 1,
      limits: { companies: 1 },
    },
    starter: {
      readOnly: false,
      cloudSync: false,
      maxActiveSessions: 1,
      limits: { companies: 1 },
    },
    growth: {
      readOnly: false,
      cloudSync: true,
      maxActiveSessions: 2,
      limits: { companies: 3 },
    },
    pro: {
      readOnly: false,
      cloudSync: true,
      maxActiveSessions: 4,
      limits: { companies: 5 },
    },
  };

  const base = tierDefaults[tier];

  const resolved: ResolvedEntitlementSnapshot = {
    tier,
    status,
    features: {
      readOnly: asBoolean(featureOverrides.readOnly, base.readOnly),
      cloudSync: asBoolean(featureOverrides.cloudSync, base.cloudSync),
      maxActiveSessions: asPositiveInt(
        featureOverrides.maxActiveSessions,
        base.maxActiveSessions
      ),
      limits: {
        companies: asPositiveInt(
          limitsOverrides.companies,
          base.limits.companies
        ),
      },
    },
  };

  // safety net: blocked users should effectively be read-only and not sync
  if (status === "blocked" || status === "none") {
    resolved.features.readOnly = true;
    resolved.features.cloudSync = false;
  }

  return resolved;
}