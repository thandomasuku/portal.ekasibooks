"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import {
  PremiumCard,
  KpiCard,
  DetailTile,
  MiniRow,
  Chip,
} from "@/components/portal/ui";

type LoadState = "loading" | "ready" | "unauth" | "error";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function DownloadsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = sp.get("next");
    return next && next.startsWith("/") ? next : "/downloads";
  }, [sp]);

  const [user, setUser] = useState<any>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string>("latest");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setState("loading");
      setError(null);

      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;

        if (!res.ok) {
          setUser(null);
          setState("unauth");
          return;
        }

        const data = await res.json().catch(() => null);
        if (cancelled) return;

        setUser(data);
        setState("ready");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Network error while checking session.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ redirect must happen in an effect (not during render)
  useEffect(() => {
    if (state === "unauth") {
      router.push(`/login?next=${encodeURIComponent(nextUrl)}`);
    }
  }, [state, router, nextUrl]);

  const latest = {
    name: "eKasiBooks Desktop (Windows)",
    version: "v1.0.0",
    releaseDate: null as string | null,
    size: "—",
    checksum: "—",
    channel: "Stable",
    highlights: [
      "Offline-first accounting experience",
      "Secure login with OTP option",
      "Branded invoices and customer management",
    ],
  };

  const changelog = [
    {
      id: "latest",
      version: "v1.0.0",
      date: "Coming soon",
      badge: "Latest",
      items: [
        "Initial public release for Windows",
        "OTP login option + password login",
        "Account portal integration for subscription management",
      ],
    },
    {
      id: "beta",
      version: "v0.9.0",
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
      version: "v0.8.0",
      date: "Internal alpha",
      badge: "Alpha",
      items: [
        "Core invoicing + customer management",
        "Basic settings & branding support",
        "Local data storage and backups groundwork",
      ],
    },
  ];

  const planName = String(user?.plan ?? "FREE").toUpperCase();
  const isPaid = planName !== "FREE";

  return (
    <PortalShell
      badge="Downloads"
      title="Desktop installers"
      subtitle="Download the eKasiBooks Desktop installer for Windows."
      backHref="/dashboard"
      backLabel="Back to overview"
      userEmail={user?.email ?? null}
      planName={planName}
      tipText="Tip: Installers will be signed — you’ll be able to verify integrity via checksum."
      footerRight={
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs text-slate-500">
            Desktop: Windows
          </span>
          <Chip>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Downloads
          </Chip>
        </div>
      }
    >
      {state === "loading" ? (
        <div className="space-y-6">
          <PremiumCard>
            <div className="h-5 w-64 rounded-lg bg-slate-200 animate-pulse" />
            <div className="mt-3 h-4 w-80 rounded-lg bg-slate-200 animate-pulse" />
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
              <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
              <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
              <div className="h-20 rounded-3xl bg-slate-200 animate-pulse" />
            </div>
          </PremiumCard>
        </div>
      ) : state === "error" ? (
        <PremiumCard>
          <h2 className="text-lg font-semibold text-slate-900">
            Session check failed
          </h2>
          <p className="mt-2 text-slate-600">
            {error ?? "Something went wrong. Please try again."}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => router.refresh()}
              className="rounded-2xl bg-[#215D63] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c4f54]"
            >
              Retry
            </button>
            <button
              onClick={() =>
                router.push(`/login?next=${encodeURIComponent(nextUrl)}`)
              }
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Go to login
            </button>
          </div>
        </PremiumCard>
      ) : state === "unauth" ? (
        <PremiumCard>
          <h2 className="text-lg font-semibold text-slate-900">
            Redirecting…
          </h2>
          <p className="mt-2 text-slate-600">
            Your session isn’t active. Taking you to login.
          </p>
        </PremiumCard>
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          <PremiumCard tone="brand">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <Chip tone={isPaid ? "success" : "neutral"}>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Access: {isPaid ? "Active subscription" : "FREE plan"}
                </Chip>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  {latest.name}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Latest stable release (installer download).
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  disabled
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#215D63] px-4 py-2.5 text-sm font-semibold text-white opacity-60"
                  title="Coming soon"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/15">
                    ⇩
                  </span>
                  Download (soon)
                </button>
                <button
                  disabled
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 opacity-60"
                  title="Coming soon"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-slate-900/5 ring-1 ring-slate-200">
                    ⋯
                  </span>
                  View all versions (soon)
                </button>
              </div>
            </div>
          </PremiumCard>

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Version" value={latest.version} icon="v" />
            <KpiCard
              label="Released"
              value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"}
              icon="⏱"
            />
            <KpiCard label="Platform" value="Windows 10/11" icon="⊞" />
            <KpiCard label="Channel" value={latest.channel} icon="★" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left */}
            <div className="lg:col-span-2 space-y-6">
              <PremiumCard>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Latest installer
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Download the newest stable version when it goes live.
                    </p>
                  </div>
                  <Chip tone="neutral">Coming soon</Chip>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <DetailTile label="Version" value={latest.version} />
                  <DetailTile
                    label="Released"
                    value={latest.releaseDate ? fmtDate(latest.releaseDate) : "—"}
                  />
                  <DetailTile label="Size" value={latest.size} />
                </div>

                <div className="mt-6 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Access:</span>{" "}
                    {isPaid
                      ? "You have an active subscription."
                      : "You are on the FREE plan."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    This portal manages your account and subscription. The
                    accounting work happens in the desktop app.
                  </p>
                </div>
              </PremiumCard>

              <PremiumCard>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Changelog
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Release notes and improvements over time.
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {changelog.length} entries
                  </span>
                </div>

                <div className="mt-6 space-y-3">
                  {changelog.map((c) => {
                    const open = openId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={cx(
                          "rounded-2xl border border-slate-200 bg-white",
                          open ? "shadow-sm" : ""
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? "" : c.id)}
                          className="flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {c.version}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {c.badge}
                              </span>
                              <span className="text-xs text-slate-500">
                                • {c.date}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {open ? "Hide details" : "View details"}
                            </div>
                          </div>

                          <span
                            className={cx(
                              "text-slate-500 transition-transform",
                              open ? "rotate-180" : ""
                            )}
                          >
                            ▼
                          </span>
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

            {/* Right (upgraded sidebar stack) */}
            <div className="space-y-6">
              <PremiumCard tone="soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      What’s included
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Highlights of the desktop experience.
                    </p>
                  </div>
                  <Chip tone="success">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Desktop
                  </Chip>
                </div>

                <ul className="mt-5 space-y-2 text-sm text-slate-700">
                  {latest.highlights.map((n) => (
                    <li key={n} className="flex items-start gap-2">
                      <span className="mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        ✓
                      </span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 rounded-2xl bg-[#215D63]/10 p-4 ring-1 ring-[#215D63]/20">
                  <p className="text-sm text-slate-800">
                    Pro tip: Once downloads are live, we can show “What’s new”
                    per version and prompt users to update.
                  </p>
                </div>
              </PremiumCard>

              <PremiumCard tone="soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Integrity & system info
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Verify the installer and check compatibility.
                    </p>
                  </div>
                  <Chip tone="success">Secure</Chip>
                </div>

                <div className="mt-5 space-y-3">
                  <MiniRow label="SHA-256 checksum" value={latest.checksum} />
                  <MiniRow label="Windows" value="10 / 11 (64-bit)" />
                  <MiniRow label="Recommended RAM" value="4GB+" />
                </div>

                <div className="mt-6 rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200">
                  <p className="text-sm text-slate-700">
                    When downloads go live, we’ll publish the checksum so users
                    can verify the file is authentic.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Installers will be signed for trust and easier Windows
                    SmartScreen handling.
                  </p>
                </div>
              </PremiumCard>

              <PremiumCard tone="soft">
                <h3 className="text-lg font-semibold text-slate-900">
                  Release channels
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Stable is recommended for most users.
                </p>

                <div className="mt-5 space-y-3">
                  <MiniRow label="Stable" value="Best for daily use" />
                  <MiniRow label="Beta" value="Early access (internal)" />
                  <MiniRow label="Alpha" value="Experimental (internal)" />
                </div>

                <button
                  disabled
                  className="mt-6 w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-900 opacity-60"
                  title="Coming soon"
                >
                  Join beta channel (soon)
                </button>
              </PremiumCard>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
