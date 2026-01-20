import { PrismaClient } from "@prisma/client";

// Avoid exhausting connections during Next dev hot reload
const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;
