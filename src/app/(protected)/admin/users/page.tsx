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
      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
      : tone === "warn"
        ? "border-amber-300 bg-amber-100 text-amber-900"
        : "border-slate-300 bg-slate-100 text-slate-800";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${classes}`}>{text}</span>;
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
    <section className="rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.10)] ring-1 ring-white sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0f766e]">Admin</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Users</h2>
          <p className="mt-1 text-sm font-medium text-slate-700">
            Read-only overview of portal users, subscriptions and desktop activity.
          </p>
        </div>

        <form className="flex w-full gap-2 md:w-auto" action="/admin/users">
          <input
            className="min-w-0 flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm outline-none placeholder:text-slate-500 focus:border-[#14b8a6] focus:bg-white focus:ring-2 focus:ring-teal-100 md:w-80"
            name="q"
            placeholder="Search email, name or company"
            defaultValue={q}
          />
          <button
            className="rounded-full bg-[#1F3147] px-5 py-2 text-sm font-black text-white shadow-[0_12px_24px_rgba(31,49,71,0.18)] transition hover:-translate-y-[1px] hover:bg-[#2b405c]"
            type="submit"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-300 shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-slate-300 bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 font-black">User</th>
              <th className="px-4 py-3 font-black">Role</th>
              <th className="px-4 py-3 font-black">Verified</th>
              <th className="px-4 py-3 font-black">Entitlement</th>
              <th className="px-4 py-3 font-black">Subscription</th>
              <th className="px-4 py-3 font-black">Desktop</th>
              <th className="px-4 py-3 font-black">Last login</th>
              <th className="px-4 py-3 font-black">Companies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300 bg-white">
            {users.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm font-semibold text-slate-700" colSpan={8}>
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="transition hover:bg-teal-50/70">
                  <td className="px-4 py-3">
                    <Link className="font-black text-[#0f766e] hover:text-[#115e59]" href={`/admin/users/${user.id}`}>
                      {user.fullName || user.email}
                    </Link>
                    <div className="text-xs font-medium text-slate-600">{user.email}</div>
                    {user.companyName ? <div className="text-xs font-medium text-slate-500">{user.companyName}</div> : null}
                  </td>
                  <td className="px-4 py-3">{badge(user.role || "user", user.role === "admin" ? "good" : "muted")}</td>
                  <td className="px-4 py-3">{user.emailVerifiedAt ? badge("verified", "good") : badge("unverified", "warn")}</td>
                  <td className="px-4 py-3">
                    <div className="font-black uppercase text-slate-900">{user.entitlement?.tier ?? "free"}</div>
                    <div className="text-xs font-medium text-slate-600">{user.entitlement?.status ?? "active"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-800">{user.subscription?.status ?? "—"}</div>
                    <div className="text-xs font-medium text-slate-600">{fmtDate(user.subscription?.currentPeriodEnd)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-800">{user.lastDesktopVersion ?? "—"}</div>
                    <div className="text-xs font-medium text-slate-600">
                      {[user.lastDesktopPlatform, user.lastDesktopArch].filter(Boolean).join(" ") || "—"}
                    </div>
                    <div className="text-xs font-medium text-slate-600">{fmtDate(user.lastDesktopSeenAt)}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{fmtDate(user.lastLoginAt)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{user._count.companies}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
