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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-2xl border border-slate-700 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100 shadow-inner">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wide text-slate-600">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-slate-950">{value || "—"}</div>
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
      className={`rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.10)] ring-1 ring-white ${className}`}
    >
      <h3 className="text-xl font-black tracking-tight text-slate-950">{title}</h3>
      {children}
    </section>
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
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-300 bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.10)] ring-1 ring-white md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-black text-[#0f766e] shadow-sm transition hover:-translate-y-[1px] hover:border-[#14b8a6] hover:bg-teal-50 hover:text-[#115e59]"
            href="/admin/users"
          >
            ← Back to users
          </Link>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{user.fullName || user.email}</h2>
          <p className="mt-1 text-sm font-medium text-slate-700">{user.email}</p>
        </div>

        <div className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-600">User ID</div>
          <div className="mt-1 max-w-[280px] truncate font-bold text-slate-950">{user.id}</div>
        </div>
      </div>

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
              <p className="text-sm font-semibold text-slate-700">No sessions found.</p>
            ) : (
              user.sessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-black text-slate-950">{session.revokedAt ? "Revoked" : "Active"}</span>
                    <span className="text-xs font-semibold text-slate-600">{fmtDate(session.lastSeenAt)}</span>
                  </div>
                  <div className="mt-1 truncate text-xs font-medium text-slate-600">{session.userAgent || "Unknown device"}</div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>

      <Panel title="Companies">
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {user.companies.length === 0 ? (
            <p className="text-sm font-semibold text-slate-700">No companies found.</p>
          ) : (
            user.companies.map((company) => (
              <div key={company.id} className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black text-slate-950">{company.name}</span>
                  <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-black text-slate-800">
                    {company.isDefault ? "Default" : company.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-1 text-xs font-medium text-slate-600">Updated {fmtDate(company.updatedAt)}</div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
