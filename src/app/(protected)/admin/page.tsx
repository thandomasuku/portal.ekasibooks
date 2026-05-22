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

function AdminCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.10)] ring-1 ring-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-medium text-slate-700">{hint}</p>
        </div>
        <span className="mt-1 h-3 w-3 rounded-full bg-[#14b8a6] shadow-[0_0_0_6px_rgba(20,184,166,0.12)]" />
      </div>
    </div>
  );
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
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <AdminCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.10)] ring-1 ring-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Users by tier</h2>
              <p className="mt-1 text-sm font-medium text-slate-700">Current entitlement distribution.</p>
            </div>
            <Link
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-black text-[#0f766e] shadow-sm transition hover:-translate-y-[1px] hover:border-[#14b8a6] hover:bg-teal-50 hover:text-[#115e59]"
              href="/admin/users"
            >
              View users
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {usersByTier.length === 0 ? (
              <p className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                No entitlement rows yet.
              </p>
            ) : (
              usersByTier.map((row) => (
                <div
                  key={String(row.tier)}
                  className="flex items-center justify-between rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 shadow-sm"
                >
                  <span className="text-sm font-black uppercase tracking-wide text-slate-800">{String(row.tier)}</span>
                  <span className="rounded-full bg-teal-200 px-3 py-1 text-sm font-black text-teal-950 ring-1 ring-teal-300">
                    {row._count._all}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.10)] ring-1 ring-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Newest users</h2>
              <p className="mt-1 text-sm font-medium text-slate-700">Recent portal registrations and desktop activity.</p>
            </div>
            <Link
              className="inline-flex items-center justify-center rounded-full bg-[#1F3147] px-4 py-2 text-sm font-black text-white shadow-[0_12px_24px_rgba(31,49,71,0.22)] transition hover:-translate-y-[1px] hover:bg-[#2b405c]"
              href="/admin/users"
            >
              Open users
            </Link>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-300 shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-300 bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-black">User</th>
                  <th className="px-4 py-3 font-black">Tier</th>
                  <th className="px-4 py-3 font-black">Desktop</th>
                  <th className="px-4 py-3 font-black">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 bg-white">
                {latestUsers.map((user) => (
                  <tr key={user.id} className="transition hover:bg-teal-50/70">
                    <td className="px-4 py-3">
                      <Link className="font-black text-[#0f766e] hover:text-[#115e59]" href={`/admin/users/${user.id}`}>
                        {user.fullName || user.email}
                      </Link>
                      <div className="text-xs font-medium text-slate-600">{user.email}</div>
                    </td>
                    <td className="px-4 py-3 font-bold uppercase text-slate-800">{user.entitlement?.tier ?? "free"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {user.lastDesktopVersion ? `${user.lastDesktopVersion}` : "—"}
                      <div className="text-xs font-medium text-slate-600">{fmtDate(user.lastDesktopSeenAt)}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{fmtDate(user.createdAt)}</td>
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
