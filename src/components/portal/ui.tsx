"use client";

import React from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* =========================
   PremiumCard (GLOBAL SCALE DOWN)
   ========================= */
export function PremiumCard({
  children,
  className = "",
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "brand" | "soft";
}) {
  const toneBg =
    tone === "brand"
      ? "bg-gradient-to-br from-white via-white to-[#215D63]/[0.05]"
      : tone === "soft"
      ? "bg-white/85"
      : "bg-white";

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl p-4",
        "shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200",
        toneBg,
        className
      )}
    >
      {/* softer ambient blobs */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[#215D63]/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-slate-900/4 blur-3xl" />

      <div className="relative">{children}</div>
    </div>
  );
}

/* =========================
   KPI CARD (LESS CHUNKY)
   ========================= */
export function KpiCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-200 transition hover:-translate-y-[1px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="mt-1.5 text-sm font-semibold text-slate-900 break-all">
            {value}
          </div>
          {hint ? (
            <div className="mt-1 text-xs text-slate-500">{hint}</div>
          ) : null}
        </div>

        {icon ? (
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900/5 ring-1 ring-slate-200 text-slate-700 text-sm">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* =========================
   DETAIL TILE (TIGHTER)
   ========================= */
export function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 break-all">
        {value}
      </div>
    </div>
  );
}

/* =========================
   MINI ROW (COMPACT LIST ITEM)
   ========================= */
export function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 break-all">
        {value}
      </div>
    </div>
  );
}

/* =========================
   CHIP (ALREADY FINE, SLIGHT TWEAK)
   ========================= */
export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success";
}) {
  const cls =
    tone === "brand"
      ? "bg-[#215D63]/10 text-slate-800 ring-[#215D63]/20"
      : tone === "success"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : "bg-slate-900/5 text-slate-700 ring-slate-200";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
        cls
      )}
    >
      {children}
    </span>
  );
}
