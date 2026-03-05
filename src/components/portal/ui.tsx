"use client";

import React from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * NOTE:
 * We avoid `overflow-hidden` on the *content* layer to prevent clipping inner card shadows.
 * All “premium FX” (sheen / blobs) live in an absolute overlay that can be safely clipped.
 */

/* =========================
   PremiumCard (Token-driven + premium polish)
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
  const borderColor = tone === "default" ? "var(--border-soft)" : "var(--border)";

  const background =
    tone === "brand"
      ? "linear-gradient(135deg, var(--card), var(--card), color-mix(in srgb, var(--primary) 7%, white))"
      : tone === "soft"
      ? "linear-gradient(180deg, var(--card), color-mix(in srgb, var(--surface) 55%, white))"
      : "var(--card)";

  return (
    <div
      className={cx(
        "relative rounded-2xl ring-1",
        "transition-all duration-300 will-change-transform",
        "hover:-translate-y-[2px]",
        className
      )}
      style={{
        borderColor,
        background,
        boxShadow: "var(--shadow-sm)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-lg)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
        (e.currentTarget as HTMLDivElement).style.borderColor = borderColor;
      }}
    >
      {/* FX layer (clipped safely) */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
        {/* Sheen */}
        <div
          className="absolute -inset-10 opacity-0 transition-opacity duration-300"
          style={{
            transform: "rotate(10deg) translateX(-30%)",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent)",
          }}
        />
        {/* Ambient blobs */}
        <div
          className="absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}
        />
        <div
          className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full blur-3xl"
          style={{ background: "rgba(15,23,42,0.05)" }}
        />

        {/* Inner highlights */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            boxShadow: "var(--inner-highlight), inset 0 0 0 1px rgba(15,23,42,0.02)",
          }}
        />
      </div>

      {/* Content layer (NOT clipped) */}
      <div className="relative p-4">{children}</div>

      {/* Hover triggers for sheen */}
      <style jsx global>{`
        .portal-card-sheen:hover > .pointer-events-none > div:first-child {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

/* =========================
   KPI CARD (Token-driven + premium hover)
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
        "relative rounded-2xl p-4 ring-1",
        "transition-all duration-300 will-change-transform",
        "hover:-translate-y-[2px]"
      )}
      style={{
        background: "var(--card)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-md)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-soft)";
      }}
    >
      {/* FX (clipped) */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
        <div
          className="absolute -top-20 -right-20 h-40 w-40 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)" }}
        />
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(15,23,42,0.02)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
          <div className="mt-1.5 text-sm font-semibold text-[color:var(--foreground)] break-all">{value}</div>
          {hint ? <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div> : null}
        </div>

        {icon ? (
          <div
            className="grid h-9 w-9 place-items-center rounded-xl ring-1 text-sm transition-transform duration-300"
            style={{
              background: "color-mix(in srgb, var(--surface-2) 70%, white)",
              borderColor: "var(--border-soft)",
              color: "color-mix(in srgb, var(--foreground) 75%, transparent)",
              boxShadow: "var(--inner-highlight)",
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
   DETAIL TILE (Token-driven + micro-hover)
   ========================= */
export function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cx(
        "relative rounded-xl px-3 py-2.5 ring-1",
        "transition-all duration-300 will-change-transform",
        "hover:-translate-y-[1px]"
      )}
      style={{
        background: "color-mix(in srgb, var(--surface-2) 70%, white)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--inner-highlight)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-soft)";
      }}
    >
      <div className="text-[11px] font-medium text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[color:var(--foreground)] break-all">{value}</div>
    </div>
  );
}

/* =========================
   MINI ROW (Token-driven + micro-hover)
   ========================= */
export function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cx(
        "flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 ring-1",
        "transition-all duration-300",
        "hover:-translate-y-[1px]"
      )}
      style={{
        background: "var(--card)",
        borderColor: "var(--border-soft)",
        boxShadow: "var(--inner-highlight)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-soft)";
      }}
    >
      <div className="text-sm text-[color:var(--muted)]">{label}</div>
      <div className="text-sm font-semibold text-[color:var(--foreground)] break-all">{value}</div>
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
          background: "rgba(16, 185, 129, 0.12)",
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
        "inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
        "transition-transform duration-300",
        "hover:-translate-y-[1px]"
      )}
      style={style}
    >
      {children}
    </span>
  );
}