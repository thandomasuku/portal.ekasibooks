import Link from "next/link";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmtDate(value?: Date | string | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA");
}

function badge(text: string, tone: "good" | "warn" | "muted" = "muted") {
  const classes =
    tone === "good"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/10 text-slate-200";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>{text}</span>;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const q = String(sp.q ?? "").trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      role: true,
      fullName: true,
      companyName: true,
      emailVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,
      lastDesktopSeenAt: true,
      lastDesktopVersion: true,
      lastDesktopPlatform: true,
      lastDesktopArch: true,
      entitlement: { select: { tier: true, status: true } },
      subscription: { select: { status: true, currentPeriodEnd: true } },
      _count: { select: { sessions: true, companies: true } },
    },
  });

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-slate-950/20">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Admin</p>
          <h2 className="mt-2 text-2xl font-black text-white">Users</h2>
          <p className="mt-1 text-sm text-slate-400">Read-only overview of portal users, subscriptions and desktop activity.</p>
        </div>

        <form className="flex w-full gap-2 md:w-auto" action="/admin/users">
          <input
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-slate-950/50 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500 md:w-80"
            name="q"
            placeholder="Search email, name or company"
            defaultValue={q}
          />
          <button className="rounded-full bg-cyan-300 px-5 py-2 text-sm font-black text-slate-950 hover:bg-cyan-200" type="submit">
            Search
          </button>
        </form>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-white/[0.06] text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Entitlement</th>
              <th className="px-4 py-3">Subscription</th>
              <th className="px-4 py-3">Desktop</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Companies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400" colSpan={8}>No users found.</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.04]">
                  <td className="px-4 py-3">
                    <Link className="font-semibold text-white hover:text-cyan-100" href={`/admin/users/${user.id}`}>
                      {user.fullName || user.email}
                    </Link>
                    <div className="text-xs text-slate-400">{user.email}</div>
                    {user.companyName ? <div className="text-xs text-slate-500">{user.companyName}</div> : null}
                  </td>
                  <td className="px-4 py-3">{badge(user.role || "user", user.role === "admin" ? "good" : "muted")}</td>
                  <td className="px-4 py-3">{user.emailVerifiedAt ? badge("verified", "good") : badge("unverified", "warn")}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold uppercase text-slate-200">{user.entitlement?.tier ?? "free"}</div>
                    <div className="text-xs text-slate-500">{user.entitlement?.status ?? "active"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{user.subscription?.status ?? "—"}</div>
                    <div className="text-xs text-slate-500">{fmtDate(user.subscription?.currentPeriodEnd)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{user.lastDesktopVersion ?? "—"}</div>
                    <div className="text-xs text-slate-500">
                      {[user.lastDesktopPlatform, user.lastDesktopArch].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="text-xs text-slate-500">{fmtDate(user.lastDesktopSeenAt)}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{fmtDate(user.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-slate-300">{user._count.companies}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
