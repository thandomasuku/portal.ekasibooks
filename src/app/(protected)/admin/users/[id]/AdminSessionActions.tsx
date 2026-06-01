"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "revokeOne" | "revokeOthers";

type Props = {
  userId: string;
  mode: Mode;
  sessionId?: string;
  disabled?: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function AdminSessionActions({ userId, mode, sessionId, disabled = false }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = useMemo(() => {
    if (mode === "revokeOthers") {
      return {
        button: "Revoke active sessions",
        title: "Revoke active sessions?",
        body:
          "This will revoke the user’s active sessions. If this is your own account, your current browser session will be kept so you do not lock yourself out.",
        confirm: "Revoke sessions",
      };
    }

    return {
      button: "Revoke",
      title: "Revoke this session?",
      body: "This device will be forced to log in again. This is useful when an old browser or desktop app session is consuming an active session slot.",
      confirm: "Revoke session",
    };
  }, [mode]);

  async function revoke() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(
        mode === "revokeOne"
          ? `/api/admin/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId || "")}`
          : `/api/admin/users/${encodeURIComponent(userId)}/sessions`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: mode === "revokeOthers" ? JSON.stringify({ action: "revokeActiveSessions" }) : undefined,
        },
      );

      const data = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        throw new Error(data?.error || "Failed to revoke session.");
      }

      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy || (mode === "revokeOne" && !sessionId)}
        onClick={() => setConfirmOpen(true)}
        className={cx(
          "shrink-0 rounded-2xl border px-3 py-2 text-xs font-black shadow-sm transition",
          disabled
            ? "cursor-not-allowed border-white/10 bg-white/5 text-white/35"
            : "border-red-200/25 bg-red-300/10 text-red-50 hover:-translate-y-[1px] hover:bg-red-300/15",
        )}
      >
        {busy ? "Revoking…" : labels.button}
      </button>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-[#073540] p-5 text-white shadow-2xl ring-1 ring-white/10">
            <h3 className="text-lg font-black tracking-tight">{labels.title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/65">{labels.body}</p>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200/25 bg-red-300/10 px-4 py-3 text-sm font-bold text-red-50">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirmOpen(false);
                  setError(null);
                }}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white/80 transition hover:bg-white/15 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={revoke}
                className="rounded-2xl border border-red-200/25 bg-red-400/20 px-4 py-2 text-sm font-black text-red-50 transition hover:bg-red-400/25 disabled:opacity-60"
              >
                {busy ? "Revoking…" : labels.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
