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
    <pre className="max-h-80 overflow-auto rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-xs leading-relaxed text-slate-200">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-950/35 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value || "—"}</div>
    </div>
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
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link className="text-sm font-semibold text-cyan-200 hover:text-cyan-100" href="/admin/users">← Back to users</Link>
          <h2 className="mt-2 text-2xl font-black text-white">{user.fullName || user.email}</h2>
          <p className="text-sm text-slate-400">{user.email}</p>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 lg:col-span-2">
          <h3 className="text-lg font-black text-white">Profile</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Role" value={user.role} />
            <InfoRow label="Company" value={user.companyName} />
            <InfoRow label="Phone" value={user.phone} />
            <InfoRow label="Email verified" value={fmtDate(user.emailVerifiedAt)} />
            <InfoRow label="Created" value={fmtDate(user.createdAt)} />
            <InfoRow label="Last login" value={fmtDate(user.lastLoginAt)} />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
          <h3 className="text-lg font-black text-white">Desktop</h3>
          <div className="mt-4 grid gap-3">
            <InfoRow label="Version" value={user.lastDesktopVersion} />
            <InfoRow label="Platform" value={[user.lastDesktopPlatform, user.lastDesktopArch].filter(Boolean).join(" ")} />
            <InfoRow label="Last desktop seen" value={fmtDate(user.lastDesktopSeenAt)} />
            <InfoRow label="Last entitlement check" value={fmtDate(user.lastEntitlementCheckAt)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
          <h3 className="text-lg font-black text-white">Entitlement</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Tier" value={user.entitlement?.tier ?? "free"} />
            <InfoRow label="Status" value={user.entitlement?.status ?? "active"} />
          </div>
          <div className="mt-4">
            <JsonBlock value={user.entitlement?.features} />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
          <h3 className="text-lg font-black text-white">Subscription</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Status" value={user.subscription?.status ?? "—"} />
            <InfoRow label="Provider" value={user.subscription?.provider ?? "—"} />
            <InfoRow label="Plan code" value={user.subscription?.planCode ?? "—"} />
            <InfoRow label="Current period end" value={fmtDate(user.subscription?.currentPeriodEnd)} />
            <InfoRow label="Customer code" value={user.subscription?.customerCode ?? "—"} />
            <InfoRow label="Subscription code" value={user.subscription?.subscriptionCode ?? "—"} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
          <h3 className="text-lg font-black text-white">Usage snapshot</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoRow label="Companies" value={user._count.companies} />
            <InfoRow label="Sessions" value={user._count.sessions} />
            <InfoRow label="Customers" value={user._count.customers} />
            <InfoRow label="Quotes" value={user._count.quotes} />
            <InfoRow label="Invoices" value={user._count.invoices} />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
          <h3 className="text-lg font-black text-white">Recent sessions</h3>
          <div className="mt-4 grid gap-3">
            {user.sessions.length === 0 ? (
              <p className="text-sm text-slate-400">No sessions found.</p>
            ) : (
              user.sessions.map((session) => (
                <div key={session.id} className="rounded-2xl bg-slate-950/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-100">{session.revokedAt ? "Revoked" : "Active"}</span>
                    <span className="text-xs text-slate-500">{fmtDate(session.lastSeenAt)}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">{session.userAgent || "Unknown device"}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-5">
        <h3 className="text-lg font-black text-white">Companies</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {user.companies.length === 0 ? (
            <p className="text-sm text-slate-400">No companies found.</p>
          ) : (
            user.companies.map((company) => (
              <div key={company.id} className="rounded-2xl bg-slate-950/35 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-100">{company.name}</span>
                  <span className="text-xs text-slate-500">{company.isDefault ? "Default" : company.isActive ? "Active" : "Inactive"}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">Updated {fmtDate(company.updatedAt)}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
