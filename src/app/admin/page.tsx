import Link from "next/link";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-ZA").format(n);
}

function fmtDate(value?: Date | string | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA");
}

export default async function AdminPage() {
  const [totalUsers, verifiedUsers, activeSubscriptions, desktopSeen, usersByTier, latestUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.user.count({ where: { lastDesktopSeenAt: { not: null } } }),
    prisma.entitlement.groupBy({
      by: ["tier"],
      _count: { _all: true },
      orderBy: { tier: "asc" },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        email: true,
        fullName: true,
        companyName: true,
        createdAt: true,
        lastDesktopSeenAt: true,
        lastDesktopVersion: true,
        entitlement: { select: { tier: true, status: true } },
        subscription: { select: { status: true, currentPeriodEnd: true } },
      },
    }),
  ]);

  const cards = [
    { label: "Total users", value: fmtNumber(totalUsers), hint: "Registered portal accounts" },
    { label: "Verified users", value: fmtNumber(verifiedUsers), hint: "Email verified accounts" },
    { label: "Active subscriptions", value: fmtNumber(activeSubscriptions), hint: "Billing status active" },
    { label: "Desktop users seen", value: fmtNumber(desktopSeen), hint: "Users with desktop activity" },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 shadow-xl shadow-slate-950/20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
            <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
            <p className="mt-1 text-sm text-slate-400">{card.hint}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-white">Users by tier</h2>
            <Link className="text-sm font-semibold text-cyan-200 hover:text-cyan-100" href="/admin/users">View users</Link>
          </div>
          <div className="mt-4 grid gap-3">
            {usersByTier.length === 0 ? (
              <p className="text-sm text-slate-400">No entitlement rows yet.</p>
            ) : (
              usersByTier.map((row) => (
                <div key={String(row.tier)} className="flex items-center justify-between rounded-2xl bg-slate-950/45 px-4 py-3">
                  <span className="text-sm font-semibold uppercase text-slate-200">{String(row.tier)}</span>
                  <span className="rounded-full bg-cyan-400/15 px-3 py-1 text-sm font-bold text-cyan-100">{row._count._all}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-white">Newest users</h2>
            <Link className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-200" href="/admin/users">
              Open users
            </Link>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.06] text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Desktop</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {latestUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.04]">
                    <td className="px-4 py-3">
                      <Link className="font-semibold text-white hover:text-cyan-100" href={`/admin/users/${user.id}`}>
                        {user.fullName || user.email}
                      </Link>
                      <div className="text-xs text-slate-400">{user.email}</div>
                    </td>
                    <td className="px-4 py-3 uppercase text-slate-200">{user.entitlement?.tier ?? "free"}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {user.lastDesktopVersion ? `${user.lastDesktopVersion}` : "—"}
                      <div className="text-xs text-slate-500">{fmtDate(user.lastDesktopSeenAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{fmtDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
