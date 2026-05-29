import Link from "next/link";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmtDate(value?: Date | string | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA");
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function badge(text: string, tone: "good" | "warn" | "muted" = "muted") {
  const classes =
    tone === "good"
      ? "border-teal-200/30 bg-teal-300/15 text-teal-50"
      : tone === "warn"
        ? "border-amber-200/35 bg-amber-300/15 text-amber-50"
        : "border-white/15 bg-white/10 text-white/78";

  return (
    <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-black", classes)}>
      {text}
    </span>
  );
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
    <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.94),rgba(16,116,115,0.78))] p-5 text-white shadow-[0_24px_70px_rgba(7,53,64,0.22)] ring-1 ring-white/10 sm:p-6">
      <div className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-[5rem] bg-[#062f3a]/70 blur-sm" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-[5rem] bg-white/10 blur-sm" />

      <div className="relative">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/35 bg-teal-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-teal-50 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#14b8a6] shadow-[0_0_0_4px_rgba(20,184,166,0.16)]" />
              Admin
            </div>

            <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Users</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-white/72">
              Read-only overview of portal users, subscriptions and desktop activity.
            </p>
          </div>

          <form className="flex w-full gap-2 md:w-auto" action="/admin/users">
            <input
              className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-white/95 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm outline-none placeholder:text-slate-500 focus:border-teal-200 focus:bg-white focus:ring-4 focus:ring-teal-200/20 md:w-80"
              name="q"
              placeholder="Search email, name or company"
              defaultValue={q}
            />
            <button
              className="rounded-2xl bg-[#0b1220] px-5 py-2.5 text-sm font-black text-white shadow-[0_14px_30px_rgba(11,18,32,0.28)] transition hover:-translate-y-[1px] hover:bg-[#111827]"
              type="submit"
            >
              Search
            </button>
          </form>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/15 bg-[#073540]/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/10 text-xs uppercase tracking-[0.16em] text-white/68">
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
              <tbody className="divide-y divide-white/10">
                {users.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm font-bold text-white/70" colSpan={8}>
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="transition hover:bg-white/8">
                      <td className="px-4 py-3">
                        <Link className="font-black text-white hover:text-teal-100" href={`/admin/users/${user.id}`}>
                          {user.fullName || user.email}
                        </Link>
                        <div className="mt-0.5 text-xs font-semibold text-white/55">{user.email}</div>
                        {user.companyName ? (
                          <div className="mt-0.5 text-xs font-semibold text-white/45">{user.companyName}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{badge(user.role || "user", user.role === "admin" ? "good" : "muted")}</td>
                      <td className="px-4 py-3">
                        {user.emailVerifiedAt ? badge("verified", "good") : badge("unverified", "warn")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-black uppercase text-white">{user.entitlement?.tier ?? "free"}</div>
                        <div className="text-xs font-semibold text-white/55">{user.entitlement?.status ?? "active"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-white/78">{user.subscription?.status ?? "—"}</div>
                        <div className="text-xs font-semibold text-white/50">
                          {fmtDate(user.subscription?.currentPeriodEnd)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-white/78">{user.lastDesktopVersion ?? "—"}</div>
                        <div className="text-xs font-semibold text-white/50">
                          {[user.lastDesktopPlatform, user.lastDesktopArch].filter(Boolean).join(" ") || "—"}
                        </div>
                        <div className="text-xs font-semibold text-white/50">{fmtDate(user.lastDesktopSeenAt)}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-white/78">{fmtDate(user.lastLoginAt)}</td>
                      <td className="px-4 py-3 font-bold text-white/78">{user._count.companies}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
