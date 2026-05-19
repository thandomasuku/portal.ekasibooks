"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import {
  Chip,
  DetailTile,
  KpiCard,
  MiniRow,
  PortalAlert,
  PortalButton,
  PortalSectionHeader,
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

export default function DownloadsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // ✅ Session context provides state/user/error/refresh
  const { state, user, error, refresh } = useSession();

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

  // ✅ Refresh button should refresh BOTH session + entitlement
  const onRefreshAll = useCallback(async () => {
    await refresh();
    if (state === "ready") {
      await fetchEntitlement();
    }
  }, [refresh, fetchEntitlement, state]);

  return (
    <PortalShell
      badge="Downloads"
      title="Desktop installers"
      subtitle="Download the latest eKasiBooks Desktop installer for Windows."
      backHref="/dashboard"
      backLabel="Back to overview"
      userEmail={user?.email ?? null}
      planName={planName}
      headerRight={
        state === "ready" ? (
          <PortalButton onClick={onRefreshAll} variant="secondary" type="button">
            Refresh
          </PortalButton>
        ) : null
      }
      footerRight={
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">Desktop: Windows</span>
          <Chip>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Downloads
          </Chip>
        </div>
      }
    >
      {state === "loading" ? (
        <DownloadsSkeleton />
      ) : state === "error" ? (
        <PremiumCard className="portal-card-premium">
          <PortalSectionHeader
            title="Session check failed"
            description={error ?? "Something went wrong. Please try again."}
          />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <PortalButton onClick={() => refresh()} type="button">
              Retry
            </PortalButton>
            <PortalButton onClick={() => router.push(`/login?next=${encodeURIComponent(nextUrl)}`)} variant="secondary" type="button">
              Go to login
            </PortalButton>
          </div>
        </PremiumCard>
      ) : state === "unauth" ? (
        <PremiumCard className="portal-card-premium">
          <PortalSectionHeader title="Redirecting…" description="Your session isn’t active. Taking you to login." />
        </PremiumCard>
      ) : (
        <div className="space-y-6">
          {/* Entitlement / manifest status strips */}
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

          {/* Compact download centre */}
          <PremiumCard className="portal-card-premium overflow-hidden p-0">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={isPaid ? "success" : "neutral"}>
                    <span className={cx("h-2 w-2 rounded-full", isPaid ? "bg-emerald-500" : "bg-slate-400")} />
                    {isPaid ? "Subscription active" : "FREE plan"}
                  </Chip>
                  <Chip>{latest.channel} channel</Chip>
                  <span className="text-xs font-semibold text-slate-500">Windows installer</span>
                </div>

                <div className="mt-4 max-w-3xl">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Download eKasiBooks Desktop</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Install the latest Windows desktop app. Your portal handles billing, entitlement and secure downloads;
                    your day-to-day accounting work happens in eKasiBooks Desktop.
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <DetailTile label="Version" value={latest.version} />
                  <DetailTile label="Released" value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"} />
                  <DetailTile label="Size" value={latest.size} />
                </div>
              </div>

              <div className="bg-[#1F3147] p-5 text-white sm:p-6">
                <div className="flex h-full flex-col justify-between gap-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Latest build</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{latest.version || "Latest version"}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">
                      Recommended for Windows 10/11 users. Keep the installer link handy for client machines.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={onDownload}
                      type="button"
                      className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#1F3147] shadow-sm transition hover:-translate-y-[1px] hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1F3147]"
                    >
                      Download installer
                    </button>

                    <PortalButton
                      onClick={onCopyLink}
                      variant="secondary"
                      type="button"
                      className="w-full justify-center border-white/15 bg-white/10 text-white hover:bg-white/15"
                    >
                      {copyMsg ?? "Copy download link"}
                    </PortalButton>

                    <p className="pt-1 text-center text-[11px] leading-relaxed text-white/55">
                      Stable channel · Windows 64-bit · Secure download
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </PremiumCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Current version" value={latest.version} icon="v" />
            <KpiCard label="Release date" value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"} icon="⏱" />
            <KpiCard label="File size" value={latest.size} icon="⬇" />
            <KpiCard label="Channel" value={latest.channel} icon="★" />
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left */}
            <div className="space-y-6 lg:col-span-2">
              <PremiumCard className="portal-card-premium">
                <PortalSectionHeader
                  title="Latest installer"
                  description="Version details, compatibility and desktop access."
                  action={<Chip tone="success">Live</Chip>}
                />

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <DetailTile label="Version" value={latest.version} />
                  <DetailTile label="Released" value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"} />
                  <DetailTile label="Size" value={latest.size} />
                </div>

                <div className="mt-5 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Access:</span>{" "}
                    {isPaid ? "You have an active subscription." : "You’re on the FREE plan."}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    This page always points users to the current Windows installer. Future version history can be added here
                    without changing the main portal flow.
                  </p>
                </div>
              </PremiumCard>

              <PremiumCard className="portal-card-premium">
                <PortalSectionHeader
                  title="Changelog"
                  description="Release notes and improvements."
                  action={<span className="text-xs text-slate-500">{changelog.length} entries</span>}
                />

                <div className="mt-5 space-y-2">
                  {changelog.map((c) => {
                    const open = openId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={cx(
                          "rounded-2xl border border-slate-200 bg-white transition-all",
                          open ? "shadow-[0_12px_34px_rgba(15,23,42,0.08)]" : "hover:bg-slate-50"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? "" : c.id)}
                          className="flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">{c.version}</span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {c.badge}
                              </span>
                              <span className="text-xs text-slate-500">• {c.date}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{open ? "Hide details" : "View details"}</div>
                          </div>

                          <span className={cx("text-slate-500 transition-transform", open ? "rotate-180" : "")}>▼</span>
                        </button>

                        {open ? (
                          <div className="px-4 pb-4">
                            <ul className="mt-1 space-y-2 text-sm text-slate-700">
                              {c.items.map((i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                                    ✓
                                  </span>
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
              </PremiumCard>
            </div>

            {/* Right */}
            <div className="space-y-6">
              <PremiumCard tone="soft" className="portal-card-premium">
                <PortalSectionHeader
                  title="What’s included"
                  description="Desktop highlights."
                  action={
                    <Chip tone="success">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Desktop
                    </Chip>
                  }
                />

                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {latest.highlights.map((n) => (
                    <li key={n} className="flex items-start gap-2">
                      <span className="mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        ✓
                      </span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              </PremiumCard>

              <PremiumCard tone="soft" className="portal-card-premium">
                <PortalSectionHeader
                  title="Integrity & system info"
                  description="Compatibility details."
                  action={<Chip tone="success">Secure</Chip>}
                />

                <div className="mt-4 space-y-3">
                  <MiniRow label="SHA-256 checksum" value={latest.checksum} />
                  <MiniRow label="Windows" value="10 / 11 (64-bit)" />
                  <MiniRow label="Recommended RAM" value="4GB+" />
                </div>
              </PremiumCard>

              <PremiumCard tone="soft" className="portal-card-premium">
                <PortalSectionHeader title="Release channels" description="Stable is recommended for most users." />

                <div className="mt-4 space-y-3">
                  <MiniRow label="Stable" value="Best for daily use" />
                  <MiniRow label="Beta" value="Early access (internal)" />
                  <MiniRow label="Alpha" value="Experimental (internal)" />
                </div>

                <PortalButton disabled variant="secondary" className="mt-5 w-full opacity-60" title="Coming soon" type="button">
                  Join beta channel soon
                </PortalButton>
              </PremiumCard>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

function DownloadsSkeleton() {
  return (
    <div className="space-y-6">
      <PremiumCard className="portal-card-premium">
        <PortalSkeleton className="h-5 w-64" />
        <PortalSkeleton className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
          <PortalSkeleton className="h-16 rounded-3xl" />
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PremiumCard className="portal-card-premium lg:col-span-2">
          <PortalSkeleton className="h-5 w-44" />
          <PortalSkeleton className="mt-3 h-4 w-72 max-w-full" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PortalSkeleton className="h-14 rounded-2xl" />
            <PortalSkeleton className="h-14 rounded-2xl" />
            <PortalSkeleton className="h-14 rounded-2xl" />
          </div>
        </PremiumCard>

        <PremiumCard className="portal-card-premium">
          <PortalSkeleton className="h-5 w-40" />
          <PortalSkeleton className="mt-3 h-4 w-56 max-w-full" />
          <div className="mt-5 space-y-2">
            <PortalSkeleton className="h-11 rounded-2xl" />
            <PortalSkeleton className="h-11 rounded-2xl" />
            <PortalSkeleton className="h-11 rounded-2xl" />
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}
