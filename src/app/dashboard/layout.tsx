import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getSessionCookieName, verifySession } from "@/lib/auth";

// Ensure auth is checked on every request.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieName = getSessionCookieName();
  const token = (await cookies()).get(cookieName)?.value;

  if (!token) {
    redirect("/login?next=/dashboard");
  }

  try {
    const { userId } = await verifySession(token);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      redirect("/login?next=/dashboard");
    }
  } catch {
    redirect("/login?next=/dashboard");
  }

  return <>{children}</>;
}
