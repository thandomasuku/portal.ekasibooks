import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionCookieName, verifySession } from "@/lib/auth";
import { SessionProvider } from "@/components/portal/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieName = getSessionCookieName();

  // ✅ Next 15/16: cookies() is async-typed
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;

  if (!token) {
    redirect("/login");
  }

  try {
    await verifySession(token);
  } catch {
    redirect("/login");
  }

  return <SessionProvider>{children}</SessionProvider>;
}
