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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function AdminChip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] shadow-sm backdrop-blur",
        tone === "success"
          ? "border-teal-200/35 bg-teal-300/15 text-teal-50"
          : "border-white/20 bg-white/10 text-white/85",
      )}
    >
      {tone === "success" ? (
        <span className="h-2 w-2 rounded-full bg-[#14b8a6] shadow-[0_0_0_4px_rgba(20,184,166,0.16)]" />
      ) : null}
      {children}
    </span>
  );
}

function AdminMetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: string;
}) {
  return (
    <div className="rounded-3xl border border-white/15 bg-[#073540]/72 p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_44px_rgba(7,53,64,0.20)] ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-white/70">{label}</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-white">{value}</p>
          <p className="mt-1 text-sm font-bold text-white/68">{hint}</p>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-lg font-black text-white/85 shadow-sm">
          {icon}
        </span>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.88),rgba(16,116,115,0.74))] p-5 text-white shadow-[0_22px_60px_rgba(7,53,64,0.18)] ring-1 ring-white/10",
        className,
      )}
    >
      <div className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-[5rem] bg-[#062f3a]/65 blur-sm" />
      <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-[4rem] bg-white/10 blur-sm" />

      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-white/70">{description}</p>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </section>
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
    { label: "Total users", value: fmtNumber(totalUsers), hint: "Registered portal accounts", icon: "↗" },
    { label: "Verified users", value: fmtNumber(verifiedUsers), hint: "Email verified accounts", icon: "✓" },
    { label: "Active subscriptions", value: fmtNumber(activeSubscriptions), hint: "Billing status active", icon: "★" },
    { label: "Desktop users seen", value: fmtNumber(desktopSeen), hint: "Users with desktop activity", icon: "⌁" },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.94),rgba(16,116,115,0.78))] p-5 text-white shadow-[0_24px_70px_rgba(7,53,64,0.22)] ring-1 ring-white/10">
        <div className="pointer-events-none absolute -left-28 -top-36 h-96 w-96 rounded-[6rem] bg-[#062f3a]/70 blur-sm" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-[5rem] bg-white/10 blur-sm" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <AdminChip tone="success">Admin console</AdminChip>
              <AdminChip>{fmtNumber(totalUsers)} users</AdminChip>
              <AdminChip>{fmtNumber(activeSubscriptions)} active subscriptions</AdminChip>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-white/70">
              Quick operational snapshot for users, subscriptions, entitlements, and desktop activity.
            </p>
          </div>

          <Link
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-5 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
            href="/admin/users"
          >
            Open users
          </Link>
        </div>

        <div className="relative mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <AdminMetricCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <SectionCard
          title="Users by tier"
          description="Current entitlement distribution."
          action={
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
              href="/admin/users"
            >
              View users
            </Link>
          }
        >
          <div className="grid gap-3">
            {usersByTier.length === 0 ? (
              <p className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white/72">
                No entitlement rows yet.
              </p>
            ) : (
              usersByTier.map((row) => (
                <div
                  key={String(row.tier)}
                  className="flex items-center justify-between rounded-2xl border border-white/15 bg-[#073540]/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10"
                >
                  <span className="text-sm font-black uppercase tracking-[0.16em] text-white/78">{String(row.tier)}</span>
                  <span className="rounded-full border border-teal-200/25 bg-teal-300/15 px-3 py-1 text-sm font-black text-teal-50">
                    {row._count._all}
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Newest users"
          description="Recent portal registrations and desktop activity."
          action={
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
              href="/admin/users"
            >
              Open users
            </Link>
          }
        >
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#073540]/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/10 text-xs uppercase tracking-[0.16em] text-white/68">
                  <tr>
                    <th className="px-4 py-3 font-black">User</th>
                    <th className="px-4 py-3 font-black">Tier</th>
                    <th className="px-4 py-3 font-black">Desktop</th>
                    <th className="px-4 py-3 font-black">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {latestUsers.map((user) => (
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
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white/78">
                          {user.entitlement?.tier ?? "free"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-white/78">
                        {user.lastDesktopVersion ? `${user.lastDesktopVersion}` : "—"}
                        <div className="mt-0.5 text-xs font-semibold text-white/50">{fmtDate(user.lastDesktopSeenAt)}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-white/78">{fmtDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
