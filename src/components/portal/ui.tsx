"use client";

import React from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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
      ? "bg-gradient-to-br from-white via-white to-[#215D63]/[0.06]"
      : tone === "soft"
      ? "bg-white/80"
      : "bg-white";

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-3xl p-6",
        "shadow-[0_18px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200",
        "backdrop-blur",
        toneBg,
        className
      )}
    >
      <div className="pointer-events-none absolute -top-28 -right-28 h-72 w-72 rounded-full bg-[#215D63]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-slate-900/5 blur-3xl" />
      <div className="relative">{children}</div>
    </div>
  );
}

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
    <div className="rounded-3xl bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] ring-1 ring-slate-200 transition hover:-translate-y-[1px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{value}</div>
          {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
        </div>

        {icon ? (
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900/5 ring-1 ring-slate-200 text-slate-700">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 break-all">{value}</div>
    </div>
  );
}

export function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 break-all">{value}</div>
    </div>
  );
}

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
    <span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1", cls)}>
      {children}
    </span>
  );
}
