"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type EditableAdminUser = {
  id: string;
  fullName: string | null;
  companyName: string | null;
  phone: string | null;
  role: string | null;
  isActive: boolean;
  deactivatedAt: string | Date | null;
  deactivatedReason: string | null;
};

type SaveState =
  | { type: "idle"; message: "" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type AccountConfirmState = {
  action: "deactivate" | "reactivate";
  reason: string;
};

const INPUT_CLASS =
  "w-full rounded-2xl border border-white/15 bg-white/95 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm outline-none placeholder:text-slate-500 focus:border-teal-200 focus:bg-white focus:ring-4 focus:ring-teal-200/20";

const LABEL_CLASS = "text-xs font-black uppercase tracking-[0.16em] text-white/55";

const SAVE_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-black shadow-sm ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed";

const SAVE_BUTTON_ACTIVE_CLASS =
  "border-teal-200/35 bg-teal-50/90 text-teal-900 ring-white/20 hover:-translate-y-[1px] hover:bg-white";

const SAVE_BUTTON_DISABLED_CLASS =
  "border-white/10 bg-white/14 text-white/45 ring-white/10";

const SOFT_ACTION_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-teal-200/35 bg-teal-50/90 px-4 py-2 text-sm font-black text-teal-900 shadow-sm ring-1 ring-white/20 transition hover:-translate-y-[1px] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed disabled:opacity-60";

const DANGER_ACTION_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-red-200/35 bg-red-300/15 px-4 py-2 text-sm font-black text-red-50 shadow-sm ring-1 ring-white/10 transition hover:-translate-y-[1px] hover:bg-red-300/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/50 disabled:cursor-not-allowed disabled:opacity-60";

function cleanInitial(value?: string | null) {
  return String(value ?? "").trim();
}

export default function AdminUserAccountEditor({ user }: { user: EditableAdminUser }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialForm = useMemo(
    () => ({
      fullName: cleanInitial(user.fullName),
      companyName: cleanInitial(user.companyName),
      phone: cleanInitial(user.phone),
      role: cleanInitial(user.role || "user").toLowerCase(),
    }),
    [user.companyName, user.fullName, user.phone, user.role],
  );

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState<SaveState>({ type: "idle", message: "" });
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountActionState, setAccountActionState] = useState<SaveState>({ type: "idle", message: "" });
  const [confirmAction, setConfirmAction] = useState<AccountConfirmState | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setState({ type: "idle", message: "" });
    }
  }, [initialForm, open]);

  const hasChanges =
    form.fullName !== initialForm.fullName ||
    form.companyName !== initialForm.companyName ||
    form.phone !== initialForm.phone ||
    form.role !== initialForm.role;

  function refreshPage() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function saveAccount() {
    setState({ type: "idle", message: "" });

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateAccount",
          fullName: form.fullName,
          companyName: form.companyName,
          phone: form.phone,
          role: form.role,
        }),
      });

      const payload = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        setState({
          type: "error",
          message: payload?.error || "Could not update this user account.",
        });
        return;
      }

      setState({ type: "success", message: "User account updated." });
      refreshPage();

      window.setTimeout(() => {
        setOpen(false);
      }, 700);
    } catch {
      setState({
        type: "error",
        message: "Network error. Please try again.",
      });
    }
  }

  async function updateAccountStatus(action: "deactivate" | "reactivate", reason?: string | null) {
    setAccountActionState({ type: "idle", message: "" });
    setAccountActionLoading(true);

    const isDeactivate = action === "deactivate";

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          deactivatedReason: isDeactivate ? (reason?.trim() || null) : null,
        }),
      });

      const payload = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        setAccountActionState({
          type: "error",
          message: payload?.error || "Could not update account status.",
        });
        return;
      }

      setAccountActionState({
        type: "success",
        message: isDeactivate ? "User account deactivated." : "User account reactivated.",
      });

      setConfirmAction(null);
      refreshPage();
    } catch {
      setAccountActionState({
        type: "error",
        message: "Network error. Please try again.",
      });
    } finally {
      setAccountActionLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={SOFT_ACTION_BUTTON}
      >
        Edit account
      </button>

      <button
        type="button"
        onClick={() =>
          setConfirmAction({
            action: user.isActive ? "deactivate" : "reactivate",
            reason: "",
          })
        }
        disabled={accountActionLoading}
        className={user.isActive ? DANGER_ACTION_BUTTON : SOFT_ACTION_BUTTON}
      >
        {accountActionLoading
          ? "Updating..."
          : user.isActive
            ? "Deactivate"
            : "Reactivate"}
      </button>

      {accountActionState.type !== "idle" ? (
        <span
          className={
            accountActionState.type === "success"
              ? "rounded-2xl border border-teal-200/25 bg-teal-300/15 px-3 py-2 text-xs font-bold text-teal-50"
              : "rounded-2xl border border-red-200/25 bg-red-300/15 px-3 py-2 text-xs font-bold text-red-50"
          }
        >
          {accountActionState.message}
        </span>
      ) : null}

      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.96),rgba(16,116,115,0.86))] text-white shadow-[0_24px_90px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div
                    className={
                      confirmAction.action === "deactivate"
                        ? "inline-flex items-center gap-2 rounded-full border border-red-200/35 bg-red-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-red-50"
                        : "inline-flex items-center gap-2 rounded-full border border-teal-200/35 bg-teal-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-teal-50"
                    }
                  >
                    {confirmAction.action === "deactivate" ? "Confirm deactivation" : "Confirm reactivation"}
                  </div>

                  <h3 className="mt-3 text-xl font-black tracking-tight text-white">
                    {confirmAction.action === "deactivate"
                      ? "Deactivate this user?"
                      : "Reactivate this user?"}
                  </h3>

                  <p className="mt-1 text-sm font-semibold leading-6 text-white/65">
                    {confirmAction.action === "deactivate"
                      ? "The account will be blocked from the portal and all active sessions will be revoked."
                      : "The account will be allowed to sign in again."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="grid h-9 w-9 place-items-center rounded-2xl border border-white/12 bg-white/8 text-base font-black text-white/60 transition hover:bg-white/14 hover:text-white/85"
                  aria-label="Close confirmation"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-2xl border border-white/15 bg-[#073540]/70 px-4 py-3 ring-1 ring-white/10">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-white/55">User</div>
                <div className="mt-1 break-words text-sm font-bold text-white">
                  {user.fullName || user.companyName || user.id}
                </div>
              </div>

              {confirmAction.action === "deactivate" ? (
                <label className="space-y-2">
                  <span className={LABEL_CLASS}>Reason optional</span>
                  <textarea
                    value={confirmAction.reason}
                    onChange={(e) =>
                      setConfirmAction((prev) =>
                        prev ? { ...prev, reason: e.target.value } : prev,
                      )
                    }
                    className={`${INPUT_CLASS} min-h-24 resize-none`}
                    maxLength={240}
                    placeholder="Reason for deactivation"
                  />
                </label>
              ) : null}

              {accountActionState.type === "error" ? (
                <div className="rounded-2xl border border-red-200/25 bg-red-300/15 px-4 py-3 text-sm font-bold text-red-50">
                  {accountActionState.message}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={accountActionLoading}
                onClick={() => updateAccountStatus(confirmAction.action, confirmAction.reason)}
                className={
                  confirmAction.action === "deactivate"
                    ? DANGER_ACTION_BUTTON
                    : SOFT_ACTION_BUTTON
                }
              >
                {accountActionLoading
                  ? "Updating..."
                  : confirmAction.action === "deactivate"
                    ? "Deactivate user"
                    : "Reactivate user"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/15 bg-[linear-gradient(135deg,rgba(7,53,64,0.96),rgba(16,116,115,0.86))] text-white shadow-[0_24px_90px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
            <div className="border-b border-white/10 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-teal-200/35 bg-teal-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-teal-50">
                    Account editor
                  </div>
                  <h3 className="mt-3 text-xl font-black tracking-tight text-white">Edit user account</h3>
                  <p className="mt-1 text-sm font-semibold text-white/65">
                    Update normal profile details and admin role.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-2xl border border-white/12 bg-white/8 text-base font-black text-white/60 transition hover:bg-white/14 hover:text-white/85"
                  aria-label="Close account editor"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              {state.type !== "idle" ? (
                <div
                  className={
                    state.type === "success"
                      ? "rounded-2xl border border-teal-200/25 bg-teal-300/15 px-4 py-3 text-sm font-bold text-teal-50"
                      : "rounded-2xl border border-red-200/25 bg-red-300/15 px-4 py-3 text-sm font-bold text-red-50"
                  }
                >
                  {state.message}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className={LABEL_CLASS}>Full name</span>
                  <input
                    value={form.fullName}
                    onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    className={INPUT_CLASS}
                    maxLength={100}
                    placeholder="Full name"
                  />
                </label>

                <label className="space-y-2">
                  <span className={LABEL_CLASS}>Company</span>
                  <input
                    value={form.companyName}
                    onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))}
                    className={INPUT_CLASS}
                    maxLength={140}
                    placeholder="Company name"
                  />
                </label>

                <label className="space-y-2">
                  <span className={LABEL_CLASS}>Phone</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className={INPUT_CLASS}
                    maxLength={40}
                    placeholder="Phone number"
                  />
                </label>

                <label className="space-y-2">
                  <span className={LABEL_CLASS}>Role</span>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                    className={INPUT_CLASS}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/7 px-4 py-3 text-xs font-semibold leading-5 text-white/58 ring-1 ring-white/8">
                Email, billing, entitlement and subscription values are handled separately.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-[1px] hover:bg-white/92"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAccount}
                disabled={!hasChanges || isPending || state.type === "success"}
                className={[
                  SAVE_BUTTON_CLASS,
                  hasChanges && !isPending && state.type !== "success"
                    ? SAVE_BUTTON_ACTIVE_CLASS
                    : SAVE_BUTTON_DISABLED_CLASS,
                ].join(" ")}
              >
                {isPending ? "Saving..." : state.type === "success" ? "Saved" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
