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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-slate-950/40 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">eKasiBooks Admin</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white">Operations console</h1>
              <p className="mt-1 text-sm text-slate-300">Signed in as {admin.fullName || admin.email}</p>
            </div>

            <nav className="flex flex-wrap gap-2 text-sm">
              <Link className="rounded-full border border-white/10 bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/15" href="/admin">
                Overview
              </Link>
              <Link className="rounded-full border border-white/10 bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/15" href="/admin/users">
                Users
              </Link>
              <Link className="rounded-full border border-white/10 bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/15" href="/dashboard">
                Portal
              </Link>
            </nav>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
