import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    email: "",
    tier: "pro",
    days: 30,
    reason: "Tester access",
    apply: false,
    revoke: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--email") args.email = String(argv[++i] || "").trim();
    else if (arg === "--tier") args.tier = String(argv[++i] || "pro").trim().toLowerCase();
    else if (arg === "--days") args.days = Number(argv[++i] || 30);
    else if (arg === "--reason") args.reason = String(argv[++i] || "Tester access").trim();
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--revoke") args.revoke = true;
  }

  return args;
}

function featuresForTier(tier) {
  if (tier === "pro") {
    return {
      readOnly: false,
      cloudSync: true,
      storesync: true,
      maxActiveSessions: 4,
      limits: {
        companies: 5,
        invoices: null,
        quotes: null,
        purchaseOrders: null,
      },
      manualOverride: true,
    };
  }

  if (tier === "growth") {
    return {
      readOnly: false,
      cloudSync: true,
      storesync: true,
      maxActiveSessions: 2,
      limits: {
        companies: 3,
        invoices: null,
        quotes: null,
        purchaseOrders: null,
      },
      manualOverride: true,
    };
  }

  if (tier === "starter") {
    return {
      readOnly: false,
      cloudSync: false,
      storesync: false,
      maxActiveSessions: 1,
      limits: {
        companies: 1,
        invoices: null,
        quotes: null,
        purchaseOrders: null,
      },
      manualOverride: true,
    };
  }

  return {
    readOnly: false,
    cloudSync: false,
    storesync: false,
    maxActiveSessions: 1,
    limits: {
      companies: 1,
      invoices: 5,
      quotes: 5,
      purchaseOrders: 5,
    },
    manualOverride: true,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    throw new Error("Missing --email tester@example.com");
  }

  const allowedTiers = new Set(["free", "starter", "growth", "pro"]);
  if (!allowedTiers.has(args.tier)) {
    throw new Error(`Invalid --tier ${args.tier}. Use free, starter, growth, or pro.`);
  }

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: args.email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      companyName: true,
    },
  });

  if (!user) {
    throw new Error(`No user found for email: ${args.email}`);
  }

  const now = new Date();
  const overrideUntil = new Date(now.getTime() + args.days * 24 * 60 * 60 * 1000);

  if (args.revoke) {
    console.log("Revoke tester entitlement:");
    console.log({
      user,
      targetTier: "free",
      apply: args.apply,
      reason: args.reason,
    });

    if (!args.apply) {
      console.log("\nDRY RUN ONLY. Add --apply to write changes.");
      return;
    }

    const entitlement = await prisma.entitlement.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tier: "free",
        status: "active",
        features: {
          ...featuresForTier("free"),
          manualOverride: false,
          manualOverrideReason: args.reason,
          manualOverrideRevokedAt: now.toISOString(),
        },
      },
      update: {
        tier: "free",
        status: "active",
        features: {
          ...featuresForTier("free"),
          manualOverride: false,
          manualOverrideReason: args.reason,
          manualOverrideRevokedAt: now.toISOString(),
        },
      },
    });

    console.log("Revoked. Updated entitlement:");
    console.log(entitlement);
    return;
  }

  const features = {
    ...featuresForTier(args.tier),
    manualOverride: true,
    manualOverrideReason: args.reason,
    manualOverrideUntil: overrideUntil.toISOString(),
    manualOverrideGrantedAt: now.toISOString(),
  };

  console.log("Grant tester entitlement:");
  console.log({
    user,
    tier: args.tier,
    status: "active",
    features,
    apply: args.apply,
  });

  if (!args.apply) {
    console.log("\nDRY RUN ONLY. Add --apply to write changes.");
    return;
  }

  const entitlement = await prisma.entitlement.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      tier: args.tier,
      status: "active",
      features,
    },
    update: {
      tier: args.tier,
      status: "active",
      features,
    },
  });

  console.log("Done. Updated entitlement:");
  console.log(entitlement);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });