"use client";

import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PortalAlert,
  PortalButton,
  PortalSkeleton,
  PremiumCard,
  cx,
} from "@/components/portal/ui";
import { useSession } from "@/components/portal/session";

type LatestManifest = {
  name?: string;
  version?: string;
  channel?: string;
  releaseDate?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
  url?: string;
  highlights?: string[];
};

// matches /api/entitlement response shape (at least the fields we use)
type Entitlement = {
  plan?: "FREE" | "STARTER" | "GROWTH" | "PRO" | string;
  status?: string;
  currentPeriodEnd?: string | null;
  graceUntil?: string | null;
  features?: {
    readOnly?: boolean;
    limits?: {
      invoice?: number;
      quote?: number;
      purchase_order?: number;
      companies?: number;
    };
  };
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function normalizePlan(plan?: string | null) {
  return String(plan ?? "FREE").toUpperCase();
}

function safeCopy(text: string) {
  try {
    if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    // ignore
  }
  document.body.removeChild(ta);
  return Promise.resolve();
}

function formatBytes(bytes?: number | null) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const dp = i === 0 ? 0 : i === 1 ? 0 : 1; // KB no decimals, MB/GB 1 decimal
  return `${v.toFixed(dp)} ${units[i]}`;
}

function DownloadChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200/45 bg-emerald-400/16 text-emerald-50 ring-emerald-100/18"
      : tone === "brand"
        ? "border-amber-200/45 bg-amber-300/16 text-amber-50 ring-amber-100/18"
        : "border-white/24 bg-white/12 text-teal-50 ring-white/12";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold leading-none shadow-sm ring-1 backdrop-blur",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

const DOWNLOAD_PILL_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-teal-200/35 bg-teal-50/90 px-4 py-2 text-sm font-black text-teal-900 shadow-sm ring-1 ring-white/20 transition hover:-translate-y-[1px] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed disabled:opacity-60";

function Stagger({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  return (
    <div
      className={cx("ek-enter", className)}
      style={{ animationDelay: `${Math.max(0, delayMs)}ms` }}
    >
      {children}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PremiumCard tone="glass" className="relative overflow-hidden p-5 text-white sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-36 w-56 rotate-12 rounded-[2.5rem] bg-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/50 to-transparent"
      />

      <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-black tracking-tight text-white">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/76">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
      <div className="relative">{children}</div>
    </PremiumCard>
  );
}

function DownloadMetricCard({
  label,
  value,
  helper,
  icon,
  surface = "glass",
}: {
  label: string;
  value: string;
  helper?: string;
  icon: string;
  surface?: "glass" | "solid";
}) {
  return (
    <div
      className={cx(
        "group border shadow-[0_14px_40px_rgba(0,0,0,0.12)] ring-1 backdrop-blur transition duration-300 hover:-translate-y-[2px] hover:shadow-[0_20px_55px_rgba(0,0,0,0.16)]",
        surface === "solid"
          ? "rounded-2xl border-white/18 bg-[#0d4f58]/92 p-3 ring-white/12 hover:bg-[#115f68]"
          : "rounded-3xl border-white/16 bg-slate-950/18 p-4 ring-white/10 hover:bg-white/16",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cx(
              "font-black uppercase text-teal-50/86",
              surface === "solid" ? "text-[10px] tracking-[0.16em]" : "text-[11px] tracking-[0.18em]",
            )}
          >
            {label}
          </div>
          <div className={cx("mt-2 truncate font-black text-white", surface === "solid" ? "text-sm" : "text-base")}>
            {value}
          </div>
        </div>
        <div
          className={cx(
            "grid shrink-0 place-items-center bg-white/12 text-teal-50 shadow-sm ring-1 ring-white/15 transition group-hover:bg-white/18",
            surface === "solid" ? "h-8 w-8 rounded-xl text-xs" : "h-10 w-10 rounded-2xl text-sm",
          )}
        >
          {icon}
        </div>
      </div>
      {helper ? (
        <div className={cx("truncate font-medium text-white/76", surface === "solid" ? "mt-1.5 text-[11px]" : "mt-2 text-xs")}>
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function DownloadInfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/16 bg-slate-950/18 p-4 shadow-[0_12px_34px_rgba(0,0,0,0.12)] ring-1 ring-white/10 backdrop-blur">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-teal-50/86">
        {label}
      </div>
      <div className="mt-2 truncate text-base font-black text-white">{value}</div>
    </div>
  );
}

function DownloadMiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-3xl border border-white/14 bg-white/10 px-4 py-3 ring-1 ring-white/10">
      <span className="text-xs font-bold text-white/68">{label}</span>
      <span className="max-w-[62%] truncate text-right text-sm font-black text-white">
        {value}
      </span>
    </div>
  );
}


export default function DownloadsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // ✅ Session context provides state/error/refresh
  const { state, error, refresh } = useSession();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/downloads";
  }, [sp]);

  const [openId, setOpenId] = useState<string>("latest");
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  // ✅ Entitlement state (single source of truth: /api/entitlement)
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [entError, setEntError] = useState<string | null>(null);
  const [entLoading, setEntLoading] = useState<boolean>(true);

  const fetchEntitlement = useCallback(async () => {
    setEntLoading(true);
    setEntError(null);

    try {
      const res = await fetch(`/api/entitlement?ts=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (res.status === 401 || res.status === 403) {
        setEnt(null);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `Entitlement failed (${res.status})`);
      }

      setEnt((data ?? null) as Entitlement);
    } catch (e: any) {
      setEnt(null);
      setEntError(e?.message || "Failed to load entitlement.");
    } finally {
      setEntLoading(false);
    }
  }, []);

  // ✅ Fetch entitlement once the session is ready
  useEffect(() => {
    if (state !== "ready") return;
    void fetchEntitlement();
  }, [state, fetchEntitlement]);

  // ✅ Manifest state (wired to /api/desktop/latest)
  const [manifest, setManifest] = useState<LatestManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifestLoading, setManifestLoading] = useState<boolean>(true);

  const fallbackDownloadUrl =
    (process.env.NEXT_PUBLIC_DESKTOP_WIN_LATEST_URL ?? "").trim() ||
    "https://ekasibooks.co.za/downloads/desktop/eKasiBooks-Setup.exe";

  // ✅ Fetch manifest once when page mounts
  useEffect(() => {
    let alive = true;

    async function load() {
      setManifestLoading(true);
      setManifestError(null);

      try {
        const res = await fetch("/api/desktop/latest", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as LatestManifest & { error?: string };

        if (!res.ok) {
          throw new Error(data?.error || `Failed to load latest manifest (${res.status})`);
        }

        if (!alive) return;

        setManifest({
          name: data?.name ?? "eKasiBooks Desktop (Windows)",
          version: data?.version ?? "—",
          channel: data?.channel ?? "Stable",
          releaseDate: data?.releaseDate ?? null,
          sizeBytes: typeof data?.sizeBytes === "number" ? data.sizeBytes : null,
          sha256: data?.sha256 ?? null,
          url: (data?.url ?? "").trim() || fallbackDownloadUrl,
          highlights: Array.isArray(data?.highlights) ? data.highlights : [],
        });
      } catch (e: any) {
        if (!alive) return;
        setManifest(null);
        setManifestError(e?.message || "Failed to load latest manifest");
      } finally {
        if (!alive) return;
        setManifestLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [fallbackDownloadUrl]);

  const planName = normalizePlan(ent?.plan ?? "FREE");
  const isPaid = planName !== "FREE";

  const latest = useMemo(() => {
    const m = manifest ?? {};
    return {
      name: m.name ?? "eKasiBooks Desktop (Windows)",
      version: m.version ?? "—",
      releaseDate: m.releaseDate ?? null,
      size: formatBytes(m.sizeBytes ?? null),
      checksum: (m.sha256 ?? "—").trim() || "—",
      channel: m.channel ?? "Stable",
      url: (m.url ?? "").trim() || fallbackDownloadUrl,
      highlights:
        Array.isArray(m.highlights) && m.highlights.length > 0
          ? m.highlights
          : ["Offline-first accounting experience", "Secure login with OTP option", "Branded invoices and customer management"],
    };
  }, [manifest, fallbackDownloadUrl]);

  const changelog = [
    {
      id: "latest",
      version: latest.version || "Latest",
      date: latest.releaseDate ? fmtDate(latest.releaseDate) : "Latest release",
      badge: "Latest",
      items: latest.highlights,
    },
    {
      id: "beta",
      version: "Beta",
      date: "Internal beta",
      badge: "Beta",
      items: [
        "Performance improvements for invoice lists",
        "Improved PDF export formatting",
        "Stability fixes and installer refinements",
      ],
    },
    {
      id: "alpha",
      version: "Alpha",
      date: "Internal alpha",
      badge: "Alpha",
      items: ["Core invoicing + customer management", "Basic settings & branding support", "Local data storage and backups groundwork"],
    },
  ];

  function onDownload() {
    window.open(latest.url, "_blank", "noopener,noreferrer");
  }

  async function onCopyLink() {
    setCopyMsg(null);
    await safeCopy(latest.url);
    setCopyMsg("Copied");
    window.setTimeout(() => setCopyMsg(null), 1200);
  }

  return (
    <>
      {state === "loading" ? (
        <DownloadsSkeleton />
      ) : state === "error" ? (
        <SectionCard
          title="Session check failed"
          subtitle={error ?? "Something went wrong. Please try again."}
          action={<DownloadChip tone="brand">Session</DownloadChip>}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <PortalButton onClick={() => refresh()} type="button">
              Retry
            </PortalButton>
            <PortalButton onClick={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)} variant="secondary" type="button">
              Go to login
            </PortalButton>
          </div>
        </SectionCard>
      ) : state === "unauth" ? (
        <SectionCard
          title="Redirecting…"
          subtitle="Your session isn’t active. Taking you to login."
        >
          <div />
        </SectionCard>
      ) : (
        <div className="space-y-5">
          {entLoading ? (
            <PortalAlert tone="info">Loading your entitlement and plan access…</PortalAlert>
          ) : null}
          {entError ? (
            <PortalAlert tone="warning" title="Couldn’t load entitlement">
              {entError}
            </PortalAlert>
          ) : null}

          {manifestLoading ? (
            <PortalAlert tone="info">Loading the latest desktop build information…</PortalAlert>
          ) : null}
          {manifestError ? (
            <PortalAlert tone="warning" title="Using fallback download details">
              Couldn’t load the latest manifest. {manifestError}
            </PortalAlert>
          ) : null}

          <Stagger>
            <PremiumCard tone="glass" className="relative overflow-hidden p-5 text-white sm:p-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-28 -top-32 h-72 w-72 rounded-full bg-slate-950/32"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 top-4 h-40 w-64 rotate-12 rounded-[2.5rem] bg-white/10"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/60 to-transparent"
              />

              <div className="relative">
                <div className="flex flex-wrap items-center gap-2">
                  <DownloadChip tone={isPaid ? "success" : "neutral"}>
                    <span className={cx("h-1.5 w-1.5 rounded-full", isPaid ? "bg-emerald-400" : "bg-slate-300")} />
                    {isPaid ? "Subscription active" : "FREE plan"}
                  </DownloadChip>
                  <DownloadChip>{latest.channel} channel</DownloadChip>
                  <DownloadChip>Windows installer</DownloadChip>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-teal-100/85">
                      Desktop download
                    </p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                      Download eKasiBooks Desktop
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/76">
                      Install the latest Windows desktop app. Billing and entitlement stay in the portal;
                      day-to-day accounting work happens in eKasiBooks Desktop.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
                    <button onClick={onDownload} type="button" className={DOWNLOAD_PILL_BUTTON}>
                      Download installer
                    </button>

                    <button onClick={onCopyLink} type="button" className={DOWNLOAD_PILL_BUTTON}>
                      {copyMsg ?? "Copy download link"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <DownloadMetricCard label="Version" value={latest.version} helper="Current build" icon="v" />
                  <DownloadMetricCard label="Released" value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"} helper="Latest release" icon="⏱" />
                  <DownloadMetricCard label="Size" value={latest.size} helper="Installer package" icon="⬇" />
                  <DownloadMetricCard label="System" value="Windows 10 / 11" helper="64-bit installer" icon="★" />
                </div>
              </div>
            </PremiumCard>
          </Stagger>

          <Stagger delayMs={70}>
            <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DownloadMetricCard surface="solid" label="Current version" value={latest.version} helper="Desktop app" icon="v" />
              <DownloadMetricCard surface="solid" label="Release date" value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"} helper="Published build" icon="⏱" />
              <DownloadMetricCard surface="solid" label="File size" value={latest.size} helper="Download size" icon="⬇" />
              <DownloadMetricCard surface="solid" label="Channel" value={latest.channel} helper="Recommended track" icon="★" />
            </div>
          </Stagger>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Stagger delayMs={120}>
                <SectionCard
                  title="Latest installer"
                  subtitle="Version details, compatibility and desktop access."
                  action={<DownloadChip tone="success">Live</DownloadChip>}
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <DownloadInfoTile label="Version" value={latest.version} />
                    <DownloadInfoTile label="Released" value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"} />
                    <DownloadInfoTile label="Size" value={latest.size} />
                  </div>

                  <div className="mt-4 rounded-3xl border border-white/14 bg-white/10 p-4 ring-1 ring-white/10">
                    <p className="text-sm font-semibold text-white">
                      <span className="text-teal-50/88">Access:</span>{" "}
                      {isPaid ? "You have an active subscription." : "You’re on the FREE plan."}
                    </p>
                    <p className="mt-1 text-xs leading-6 text-white/68">
                      This page always points users to the current Windows installer. Future version history can be added here
                      without changing the main portal flow.
                    </p>
                  </div>
                </SectionCard>
              </Stagger>

              <Stagger delayMs={170}>
                <SectionCard
                  title="Changelog"
                  subtitle="Release notes and improvements."
                  action={<span className="text-xs font-bold text-white/70">{changelog.length} entries</span>}
                >
                  <div className="space-y-3">
                    {changelog.map((c) => {
                      const isOpen = openId === c.id;
                      return (
                        <div
                          key={c.id}
                          className="overflow-hidden rounded-3xl border border-white/14 bg-slate-950/18 ring-1 ring-white/10"
                        >
                          <button
                            type="button"
                            onClick={() => setOpenId(isOpen ? "" : c.id)}
                            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/10"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-white">{c.version}</p>
                                <DownloadChip tone={c.id === "latest" ? "success" : "neutral"}>{c.badge}</DownloadChip>
                              </div>
                              <p className="mt-1 text-xs font-medium text-white/64">{c.date}</p>
                            </div>
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-black text-white ring-1 ring-white/12">
                              {isOpen ? "−" : "+"}
                            </span>
                          </button>

                          {isOpen ? (
                            <div className="border-t border-white/12 px-4 py-4">
                              <ul className="space-y-2 text-sm leading-6 text-white/76">
                                {c.items.map((i) => (
                                  <li key={i} className="flex gap-2">
                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" />
                                    <span>{i}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </Stagger>
            </div>

            <div className="space-y-5">
              <Stagger delayMs={220}>
                <SectionCard
                  title="What’s included"
                  subtitle="Desktop highlights."
                  action={
                    <DownloadChip tone="success">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Desktop
                    </DownloadChip>
                  }
                >
                  <ul className="space-y-2 text-sm text-white/78">
                    {latest.highlights.map((n) => (
                      <li key={n} className="flex items-start gap-2">
                        <span className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/18 text-xs font-bold text-emerald-50 ring-1 ring-emerald-200/18">
                          ✓
                        </span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              </Stagger>

              <Stagger delayMs={270}>
                <SectionCard
                  title="Integrity & system info"
                  subtitle="Compatibility details."
                  action={<DownloadChip tone="success">Secure</DownloadChip>}
                >
                  <div className="space-y-3">
                    <DownloadMiniRow label="SHA-256 checksum" value={latest.checksum} />
                    <DownloadMiniRow label="Windows" value="10 / 11 (64-bit)" />
                    <DownloadMiniRow label="Recommended RAM" value="4GB+" />
                  </div>
                </SectionCard>
              </Stagger>

              <Stagger delayMs={320}>
                <SectionCard
                  title="Release channels"
                  subtitle="Stable is recommended for most users."
                >
                  <div className="space-y-3">
                    <DownloadMiniRow label="Stable" value="Best for daily use" />
                    <DownloadMiniRow label="Beta" value="Early access (internal)" />
                    <DownloadMiniRow label="Alpha" value="Experimental (internal)" />
                  </div>

                  <PortalButton disabled variant="secondary" className="mt-5 w-full opacity-70" title="Coming soon" type="button">
                    Join beta channel soon
                  </PortalButton>
                </SectionCard>
              </Stagger>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DownloadsSkeleton() {
  return (
    <div className="space-y-5">
      <PremiumCard tone="glass" className="relative overflow-hidden p-5 text-white sm:p-6">
        <PortalSkeleton className="h-5 w-64 bg-white/20" />
        <PortalSkeleton className="mt-3 h-4 w-80 max-w-full bg-white/20" />
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PortalSkeleton className="h-20 rounded-3xl bg-white/20" />
          <PortalSkeleton className="h-20 rounded-3xl bg-white/20" />
          <PortalSkeleton className="h-20 rounded-3xl bg-white/20" />
          <PortalSkeleton className="h-20 rounded-3xl bg-white/20" />
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <PremiumCard tone="glass" className="p-5 text-white sm:p-6 lg:col-span-2">
          <PortalSkeleton className="h-5 w-44 bg-white/20" />
          <PortalSkeleton className="mt-3 h-4 w-72 max-w-full bg-white/20" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PortalSkeleton className="h-20 rounded-3xl bg-white/20" />
            <PortalSkeleton className="h-20 rounded-3xl bg-white/20" />
            <PortalSkeleton className="h-20 rounded-3xl bg-white/20" />
          </div>
        </PremiumCard>

        <PremiumCard tone="glass" className="p-5 text-white sm:p-6">
          <PortalSkeleton className="h-5 w-40 bg-white/20" />
          <PortalSkeleton className="mt-3 h-4 w-56 max-w-full bg-white/20" />
          <div className="mt-5 space-y-3">
            <PortalSkeleton className="h-11 rounded-2xl bg-white/20" />
            <PortalSkeleton className="h-11 rounded-2xl bg-white/20" />
            <PortalSkeleton className="h-11 rounded-2xl bg-white/20" />
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}

