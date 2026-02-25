"use client";

import React from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* =========================
   PremiumCard (Token-driven)
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
      ? "bg-[color:var(--card)]"
      : tone === "soft"
      ? "bg-[color:var(--card)]"
      : "bg-[color:var(--card)]";

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-2xl p-4",
        "ring-1",
        "shadow-[var(--shadow-sm)]",
        toneBg,
        className
      )}
      style={{
        borderColor: tone === "default" ? "var(--border-soft)" : "var(--border)",
        background:
          tone === "brand"
            ? "linear-gradient(135deg, var(--card), var(--card), color-mix(in srgb, var(--primary) 7%, white))"
            : tone === "soft"
            ? "linear-gradient(180deg, var(--card), color-mix(in srgb, var(--surface) 55%, white))"
            : "var(--card)",
      }}
    >
      {/* subtle ambient blobs (brand + neutral), token-driven */}      
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl"
        style={{ background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full blur-3xl"
        style={{ background: "rgba(15,23,42,0.05)" }}
      />

      <div className="relative">{children}</div>
    </div>
  );
}

/* =========================
   KPI CARD (Token-driven, clean)
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
    <div
      className={cx(
        "rounded-2xl p-4 ring-1 transition",
        "hover:-translate-y-[1px]"
      )}
      style={{
        background: "var(--card)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            {label}
          </div>

          <div className="mt-1.5 text-sm font-semibold text-[color:var(--foreground)] break-all">
            {value}
          </div>

          {hint ? (
            <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div>
          ) : null}
        </div>

        {icon ? (
          <div
            className="grid h-9 w-9 place-items-center rounded-xl ring-1 text-sm"
            style={{
              background: "color-mix(in srgb, var(--surface-2) 70%, white)",
              borderColor: "var(--border-soft)",
              color: "color-mix(in srgb, var(--foreground) 75%, transparent)",
            }}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* =========================
   DETAIL TILE (Token-driven)
   ========================= */
export function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 ring-1"
      style={{
        background: "color-mix(in srgb, var(--surface-2) 70%, white)",
        borderColor: "var(--border-soft)",
      }}
    >
      <div className="text-[11px] font-medium text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[color:var(--foreground)] break-all">
        {value}
      </div>
    </div>
  );
}

/* =========================
   MINI ROW (Token-driven)
   ========================= */
export function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1"
      style={{
        background: "var(--card)",
        borderColor: "var(--border-soft)",
      }}
    >
      <div className="text-sm text-[color:var(--muted)]">{label}</div>
      <div className="text-sm font-semibold text-[color:var(--foreground)] break-all">
        {value}
      </div>
    </div>
  );
}

/* =========================
   CHIP (Token-driven)
   ========================= */
export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success";
}) {
  const style =
    tone === "brand"
      ? {
          background: "color-mix(in srgb, var(--primary) 12%, white)",
          color: "color-mix(in srgb, var(--foreground) 80%, transparent)",
          borderColor: "color-mix(in srgb, var(--primary) 22%, transparent)",
        }
      : tone === "success"
      ? {
          background: "rgba(16, 185, 129, 0.12)", // emerald tint, safe + subtle
          color: "rgb(6, 95, 70)",
          borderColor: "rgba(16, 185, 129, 0.22)",
        }
      : {
          background: "rgba(15, 23, 42, 0.05)",
          color: "color-mix(in srgb, var(--foreground) 75%, transparent)",
          borderColor: "var(--border-soft)",
        };

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1"
      )}
      style={style}
    >
      {children}
    </span>
  );
}