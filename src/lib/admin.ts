import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSessionCookieName, verifySession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
};

export async function getAdminUser(): Promise<AdminUser | null> {
  const jar = await cookies();
  const token = jar.get(getSessionCookieName())?.value;

  if (!token) return null;

  try {
    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) return null;
    if (!user.isActive) return null;
    if (String(user.role || "user").toLowerCase() !== "admin") return null;

    return user;
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminUser> {
  const jar = await cookies();
  const token = jar.get(getSessionCookieName())?.value;

  if (!token) {
    redirect("/login?next=/admin");
  }

  const admin = await getAdminUser();

  if (!admin) {
    notFound();
  }

  return admin;
}
