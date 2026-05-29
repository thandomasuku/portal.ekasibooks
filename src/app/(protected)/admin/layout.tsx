import Link from "next/link";

import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.94),rgba(16,116,115,0.78))] p-5 text-white shadow-[0_24px_70px_rgba(7,53,64,0.22)] ring-1 ring-white/10">
        <div className="pointer-events-none absolute -left-24 -top-32 h-80 w-80 rounded-[5rem] bg-[#062f3a]/70 blur-sm" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-[5rem] bg-white/10 blur-sm" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/35 bg-teal-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-teal-50 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-[#14b8a6] shadow-[0_0_0_4px_rgba(20,184,166,0.16)]" />
              Admin
            </div>

            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Operations console</h1>

            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-white/72">
              Manage portal users, subscriptions, entitlement visibility and desktop activity.
            </p>

            <p className="mt-2 text-xs font-bold text-white/55">
              Signed in as <span className="text-white/85">{admin.fullName || admin.email}</span>
            </p>
          </div>

          <nav className="flex flex-wrap gap-2 text-sm">
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-4 py-2 font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
              href="/admin"
            >
              Overview
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-4 py-2 font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
              href="/admin/users"
            >
              Users
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-[#0b1220] px-4 py-2 font-black text-white shadow-[0_14px_30px_rgba(11,18,32,0.28)] transition hover:-translate-y-[1px] hover:bg-[#111827]"
              href="/dashboard"
            >
              Portal
            </Link>
          </nav>
        </div>
      </section>

      {children}
    </div>
  );
}
