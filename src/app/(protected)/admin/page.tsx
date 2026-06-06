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
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.11em] shadow-sm backdrop-blur",
        tone === "success"
          ? "border-teal-200/35 bg-teal-300/15 text-teal-50"
          : "border-white/18 bg-white/10 text-white/82",
      )}
    >
      {tone === "success" ? (
        <span className="h-2 w-2 rounded-full bg-[#14b8a6] shadow-[0_0_0_4px_rgba(20,184,166,0.14)]" />
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
    <div className="rounded-2xl border border-white/14 bg-[#073540]/72 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_14px_34px_rgba(7,53,64,0.16)] ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/62">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}</p>
          <p className="mt-0.5 text-xs font-bold leading-5 text-white/60">{hint}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10 text-base font-black text-white/80 shadow-sm">
          {icon}
        </span>
      </div>
    </div>
  );
}

function AdminButton({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
      href={href}
    >
      {children}
    </Link>
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
        "relative overflow-hidden rounded-2xl border border-white/14 bg-[linear-gradient(135deg,rgba(7,53,64,0.90),rgba(16,116,115,0.74))] p-4 text-white shadow-[0_18px_46px_rgba(7,53,64,0.16)] ring-1 ring-white/10",
        className,
      )}
    >
      <div className="pointer-events-none absolute -left-20 -top-28 h-64 w-64 rounded-[4rem] bg-[#062f3a]/54 blur-sm" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-[4rem] bg-white/8 blur-sm" />

      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-white">{title}</h2>
            <p className="mt-1 text-sm font-semibold leading-5 text-white/66">{description}</p>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className="mt-4">{children}</div>
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
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-white/14 bg-[linear-gradient(135deg,rgba(7,53,64,0.94),rgba(16,116,115,0.76))] p-4 text-white shadow-[0_20px_54px_rgba(7,53,64,0.18)] ring-1 ring-white/10">
        <div className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-[5rem] bg-[#062f3a]/62 blur-sm" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-[5rem] bg-white/9 blur-sm" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <AdminChip tone="success">Admin console</AdminChip>
              <AdminChip>{fmtNumber(totalUsers)} users</AdminChip>
              <AdminChip>{fmtNumber(activeSubscriptions)} active subscriptions</AdminChip>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Operations snapshot</h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-white/68">
              Monitor users, subscriptions, entitlement state and desktop activity from one admin view.
            </p>
          </div>

          <AdminButton href="/admin/users">Open users</AdminButton>
        </div>

        <div className="relative mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <AdminMetricCard key={card.label} {...card} />
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.5fr)]">
        <SectionCard title="Users by tier" description="Current entitlement distribution." action={<AdminButton href="/admin/users">View users</AdminButton>}>
          <div className="grid gap-2.5">
            {usersByTier.length === 0 ? (
              <p className="rounded-xl border border-white/14 bg-white/10 px-3 py-2 text-sm font-bold text-white/70">
                No entitlement rows yet.
              </p>
            ) : (
              usersByTier.map((row) => (
                <div
                  key={String(row.tier)}
                  className="flex items-center justify-between rounded-xl border border-white/14 bg-[#073540]/68 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.09)] ring-1 ring-white/10"
                >
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-white/76">{String(row.tier)}</span>
                  <span className="rounded-full border border-teal-200/24 bg-teal-300/14 px-2.5 py-1 text-xs font-black text-teal-50">
                    {row._count._all}
                  </span>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Newest users" description="Recent portal registrations and desktop activity." action={<AdminButton href="/admin/users">Open users</AdminButton>}>
          <div className="overflow-hidden rounded-xl border border-white/14 bg-[#073540]/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.09)] ring-1 ring-white/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/10 text-[11px] uppercase tracking-[0.14em] text-white/62">
                  <tr>
                    <th className="px-3 py-2.5 font-black">User</th>
                    <th className="px-3 py-2.5 font-black">Tier</th>
                    <th className="px-3 py-2.5 font-black">Desktop</th>
                    <th className="px-3 py-2.5 font-black">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {latestUsers.map((user) => (
                    <tr key={user.id} className="transition hover:bg-white/8">
                      <td className="px-3 py-2.5 align-top">
                        <Link className="font-black text-teal-100 hover:text-white" href={`/admin/users/${user.id}`}>
                          {user.fullName || user.email}
                        </Link>
                        <div className="mt-0.5 max-w-[260px] truncate text-xs font-semibold text-white/55">{user.email}</div>
                        {user.companyName ? (
                          <div className="mt-0.5 max-w-[260px] truncate text-xs font-semibold text-white/45">{user.companyName}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="rounded-full border border-white/14 bg-white/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.10em] text-white/76">
                          {user.entitlement?.tier ?? "free"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top font-bold text-white/76">
                        {user.lastDesktopVersion ? `${user.lastDesktopVersion}` : "—"}
                        <div className="mt-0.5 text-xs font-semibold text-white/48">{fmtDate(user.lastDesktopSeenAt)}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top font-bold text-white/76">{fmtDate(user.createdAt)}</td>
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
