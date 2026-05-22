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
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              Admin
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Operations console</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Manage portal users, subscriptions, entitlement visibility and desktop activity.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Signed in as <span className="text-slate-800">{admin.fullName || admin.email}</span>
            </p>
          </div>

          <nav className="flex flex-wrap gap-2 text-sm">
            <Link
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
              href="/admin"
            >
              Overview
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 shadow-sm transition hover:-translate-y-[1px] hover:bg-slate-50"
              href="/admin/users"
            >
              Users
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-full bg-[#1F3147] px-4 py-2 font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:bg-[#2b405c]"
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
