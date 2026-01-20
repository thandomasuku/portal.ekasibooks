import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  let dbOk = false;
  try {
    // Cheap check; will throw if DATABASE_URL is missing/invalid
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    ok: true,
    service: "ekasi-portal",
    dbOk,
  });
}
