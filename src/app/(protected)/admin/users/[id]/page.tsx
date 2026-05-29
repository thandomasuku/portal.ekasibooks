import Link from "next/link";
import { notFound } from "next/navigation";

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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-2xl border border-white/15 bg-[#061f29]/88 p-4 text-xs leading-relaxed text-white/82 shadow-inner ring-1 ring-white/10">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-[#073540]/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10">
      <div className="text-xs font-black uppercase tracking-[0.16em] text-white/55">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-white">{value || "—"}</div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.90),rgba(16,116,115,0.74))] p-5 text-white shadow-[0_22px_60px_rgba(7,53,64,0.18)] ring-1 ring-white/10",
        className,
      )}
    >
      <div className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-[5rem] bg-[#062f3a]/65 blur-sm" />
      <div className="pointer-events-none absolute -right-20 -top-16 h-56 w-56 rounded-[4rem] bg-white/10 blur-sm" />

      <div className="relative">
        <h3 className="text-xl font-black tracking-tight text-white">{title}</h3>
        {children}
      </div>
    </section>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-black text-white/78">
      {children}
    </span>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      fullName: true,
      companyName: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      emailVerifiedAt: true,
      verifySentAt: true,
      lastDesktopSeenAt: true,
      lastEntitlementCheckAt: true,
      lastDesktopVersion: true,
      lastDesktopPlatform: true,
      lastDesktopArch: true,
      entitlement: true,
      subscription: true,
      sessions: {
        orderBy: { lastSeenAt: "desc" },
        take: 10,
        select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true, revokedAt: true },
      },
      companies: {
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, name: true, isActive: true, isDefault: true, createdAt: true, updatedAt: true, deletedAt: true },
      },
      _count: { select: { customers: true, quotes: true, invoices: true, companies: true, sessions: true } },
    },
  });

  if (!user) notFound();

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.94),rgba(16,116,115,0.78))] p-5 text-white shadow-[0_24px_70px_rgba(7,53,64,0.22)] ring-1 ring-white/10">
        <div className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-[5rem] bg-[#062f3a]/70 blur-sm" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-[5rem] bg-white/10 blur-sm" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex items-center rounded-2xl border border-white/15 bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
                href="/admin/users"
              >
                ← Back to users
              </Link>

              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/35 bg-teal-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-teal-50 shadow-sm backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-[#14b8a6] shadow-[0_0_0_4px_rgba(20,184,166,0.16)]" />
                User profile
              </div>
            </div>

            <h2 className="mt-4 break-words text-2xl font-black tracking-tight text-white md:text-3xl">
              {user.fullName || user.email}
            </h2>
            <p className="mt-1 break-words text-sm font-semibold text-white/65">{user.email}</p>
          </div>

          <div className="rounded-2xl border border-white/15 bg-[#073540]/70 px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-white/55">User ID</div>
            <div className="mt-1 max-w-[280px] truncate font-bold text-white">{user.id}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Profile" className="lg:col-span-2">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Role" value={user.role} />
            <InfoRow label="Company" value={user.companyName} />
            <InfoRow label="Phone" value={user.phone} />
            <InfoRow label="Email verified" value={fmtDate(user.emailVerifiedAt)} />
            <InfoRow label="Created" value={fmtDate(user.createdAt)} />
            <InfoRow label="Last login" value={fmtDate(user.lastLoginAt)} />
          </div>
        </Panel>

        <Panel title="Desktop">
          <div className="mt-4 grid gap-3">
            <InfoRow label="Version" value={user.lastDesktopVersion} />
            <InfoRow label="Platform" value={[user.lastDesktopPlatform, user.lastDesktopArch].filter(Boolean).join(" ")} />
            <InfoRow label="Last desktop seen" value={fmtDate(user.lastDesktopSeenAt)} />
            <InfoRow label="Last entitlement check" value={fmtDate(user.lastEntitlementCheckAt)} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Entitlement">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Tier" value={user.entitlement?.tier ?? "free"} />
            <InfoRow label="Status" value={user.entitlement?.status ?? "active"} />
          </div>
          <div className="mt-4">
            <JsonBlock value={user.entitlement?.features} />
          </div>
        </Panel>

        <Panel title="Subscription">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Status" value={user.subscription?.status ?? "—"} />
            <InfoRow label="Provider" value={user.subscription?.provider ?? "—"} />
            <InfoRow label="Plan code" value={user.subscription?.planCode ?? "—"} />
            <InfoRow label="Current period end" value={fmtDate(user.subscription?.currentPeriodEnd)} />
            <InfoRow label="Customer code" value={user.subscription?.customerCode ?? "—"} />
            <InfoRow label="Subscription code" value={user.subscription?.subscriptionCode ?? "—"} />
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Usage snapshot">
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Companies" value={user._count.companies} />
            <InfoRow label="Sessions" value={user._count.sessions} />
            <InfoRow label="Customers" value={user._count.customers} />
            <InfoRow label="Quotes" value={user._count.quotes} />
            <InfoRow label="Invoices" value={user._count.invoices} />
          </div>
        </Panel>

        <Panel title="Recent sessions">
          <div className="mt-4 grid gap-3">
            {user.sessions.length === 0 ? (
              <p className="text-sm font-semibold text-white/70">No sessions found.</p>
            ) : (
              user.sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-2xl border border-white/15 bg-[#073540]/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-white">{session.revokedAt ? "Revoked" : "Active"}</span>
                    <span className="text-xs font-semibold text-white/55">{fmtDate(session.lastSeenAt)}</span>
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-white/50">{session.userAgent || "Unknown device"}</div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      <Panel title="Companies">
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {user.companies.length === 0 ? (
            <p className="text-sm font-semibold text-white/70">No companies found.</p>
          ) : (
            user.companies.map((company) => (
              <div
                key={company.id}
                className="rounded-2xl border border-white/15 bg-[#073540]/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] ring-1 ring-white/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black text-white">{company.name}</span>
                  <StatusPill>{company.isDefault ? "Default" : company.isActive ? "Active" : "Inactive"}</StatusPill>
                </div>
                <div className="mt-1 text-xs font-semibold text-white/50">Updated {fmtDate(company.updatedAt)}</div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
