"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Tier = "free" | "starter" | "growth" | "pro";
type SubscriptionStatus = "active" | "past_due" | "canceled";

type SaveState =
  | { type: "idle"; message: "" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type Props = {
  userId: string;
  currentTier: string | null;
  currentStatus: string | null;
  subscriptionStatus: string | null;
  subscriptionProvider: string | null;
  currentPeriodEnd: string | Date | null;
  manualOverrideUntil: string | null;
  manualOverrideReason: string | null;
  hasPaystackBilling: boolean;
};

const TIERS: Array<{ value: Tier; label: string; description: string }> = [
  { value: "free", label: "Free", description: "Free access limits." },
  {
    value: "starter",
    label: "Starter",
    description: "Starter subscription access.",
  },
  {
    value: "growth",
    label: "Growth",
    description: "Growth subscription access.",
  },
  {
    value: "pro",
    label: "Pro",
    description: "Pro access, also used for beta testers.",
  },
];

const STATUSES: Array<{ value: SubscriptionStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due / grace" },
  { value: "canceled", label: "Canceled" },
];

const BUTTON_BASE =
  "rounded-2xl border px-4 py-3 text-left shadow-sm ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed disabled:opacity-60";

function normalizeTier(value: string | null): Tier {
  const tier = String(value ?? "free").toLowerCase();
  if (tier === "starter" || tier === "growth" || tier === "pro") return tier;
  return "free";
}

function normalizeStatus(value: string | null): SubscriptionStatus {
  const status = String(value ?? "active").toLowerCase();
  if (status === "past_due" || status === "canceled") return status;
  return "active";
}

function toDateInput(value: string | Date | null) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function isFutureDate(value: string) {
  if (!value) return false;
  const d = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

export default function AdminSubscriptionTierEditor({
  userId,
  currentTier,
  currentStatus,
  subscriptionStatus,
  subscriptionProvider,
  currentPeriodEnd,
  manualOverrideUntil,
  manualOverrideReason,
  hasPaystackBilling,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialTier = useMemo(() => normalizeTier(currentTier), [currentTier]);
  const initialStatus = useMemo(
    () => normalizeStatus(subscriptionStatus || currentStatus),
    [currentStatus, subscriptionStatus],
  );
  const initialPeriodEnd = useMemo(
    () => toDateInput(manualOverrideUntil || currentPeriodEnd),
    [currentPeriodEnd, manualOverrideUntil],
  );

  const [selectedTier, setSelectedTier] = useState<Tier>(initialTier);
  const [selectedStatus, setSelectedStatus] =
    useState<SubscriptionStatus>(initialStatus);
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd);
  const [reason, setReason] = useState(manualOverrideReason ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [state, setState] = useState<SaveState>({ type: "idle", message: "" });

  const isPaidTier =
    selectedTier === "starter" ||
    selectedTier === "growth" ||
    selectedTier === "pro";
  const effectiveStatus = selectedTier === "free" ? "canceled" : selectedStatus;
  const needsFutureDate = isPaidTier && effectiveStatus === "active";
  const hasValidPeriodEnd = !needsFutureDate || isFutureDate(periodEnd);
  const hasChanges =
    selectedTier !== initialTier ||
    effectiveStatus !== initialStatus ||
    periodEnd !== initialPeriodEnd ||
    reason.trim() !== String(manualOverrideReason ?? "").trim();
  const isSettingFreeWithActivePaystack =
    selectedTier === "free" &&
    hasPaystackBilling &&
    String(subscriptionStatus ?? "").toLowerCase() === "active" &&
    String(subscriptionProvider ?? "").toLowerCase() === "paystack";

  function refreshPage() {
    startTransition(() => router.refresh());
  }

  async function saveTier() {
    setState({ type: "idle", message: "" });

    if (isSettingFreeWithActivePaystack) {
      setState({
        type: "error",
        message:
          "This user still has active Paystack billing. Cancel/disable billing before setting them to Free.",
      });
      return;
    }

    if (!hasValidPeriodEnd) {
      setState({
        type: "error",
        message: "Choose a future override end date for active paid access.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setSubscriptionTier",
          tier: selectedTier,
          subscriptionStatus: effectiveStatus,
          currentPeriodEnd: periodEnd || null,
          reason: reason.trim() || null,
        }),
      });

      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!res.ok) {
        setState({
          type: "error",
          message:
            payload?.error ||
            "Could not update this user's subscription access.",
        });
        return;
      }

      setState({ type: "success", message: "Subscription override updated." });
      refreshPage();
    } catch {
      setState({ type: "error", message: "Network error. Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-3xl border border-white/15 bg-[#052a35]/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white/75">
            Admin subscription override
          </h4>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-white/58">
            Change the local subscription tier and period end. While the
            override is active, Paystack sync will not downgrade this access.
          </p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white/70">
          {currentStatus || "active"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((tier) => {
          const selected = selectedTier === tier.value;
          return (
            <button
              key={tier.value}
              type="button"
              onClick={() => {
                setSelectedTier(tier.value);
                if (tier.value === "free") setSelectedStatus("canceled");
                else if (selectedStatus === "canceled")
                  setSelectedStatus("active");
              }}
              className={`${BUTTON_BASE} ${
                selected
                  ? "border-teal-200/45 bg-teal-50 text-teal-950 ring-teal-200/25"
                  : "border-white/15 bg-white/10 text-white ring-white/10 hover:bg-white/15"
              }`}
            >
              <span className="block text-sm font-black">{tier.label}</span>
              <span
                className={
                  selected
                    ? "mt-1 block text-xs font-bold text-teal-900/70"
                    : "mt-1 block text-xs font-bold text-white/50"
                }
              >
                {tier.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-white/55">
            Subscription status
          </span>
          <select
            value={effectiveStatus}
            onChange={(event) =>
              setSelectedStatus(event.target.value as SubscriptionStatus)
            }
            disabled={selectedTier === "free"}
            className="mt-2 w-full rounded-2xl border border-white/15 bg-white/95 px-4 py-3 text-sm font-bold text-slate-950 shadow-sm outline-none focus:border-teal-200 focus:bg-white focus:ring-4 focus:ring-teal-200/20 disabled:opacity-70"
          >
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-white/55">
            Override until / period end
          </span>
          <input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/15 bg-white/95 px-4 py-3 text-sm font-bold text-slate-950 shadow-sm outline-none focus:border-teal-200 focus:bg-white focus:ring-4 focus:ring-teal-200/20"
          />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-white/55">
          Reason / note
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={240}
          placeholder="Example: Beta tester access"
          className="mt-2 w-full resize-none rounded-2xl border border-white/15 bg-white/95 px-4 py-3 text-sm font-bold text-slate-950 shadow-sm outline-none placeholder:text-slate-500 focus:border-teal-200 focus:bg-white focus:ring-4 focus:ring-teal-200/20"
        />
      </label>

      {isSettingFreeWithActivePaystack ? (
        <div className="mt-3 rounded-2xl border border-amber-200/30 bg-amber-300/12 px-4 py-3 text-sm font-bold leading-6 text-amber-50">
          This user has active Paystack billing. Do not set Free here until the
          recurring Paystack subscription is cancelled/disabled.
        </div>
      ) : null}

      {!hasValidPeriodEnd ? (
        <div className="mt-3 rounded-2xl border border-amber-200/30 bg-amber-300/12 px-4 py-3 text-sm font-bold leading-6 text-amber-50">
          Active paid overrides need a future period end date.
        </div>
      ) : null}

      {state.message ? (
        <div
          className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-bold ${
            state.type === "success"
              ? "border-teal-200/30 bg-teal-300/12 text-teal-50"
              : "border-red-200/30 bg-red-300/12 text-red-50"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold leading-5 text-white/45">
          Beta testers should be set to Pro with a period end date and reason.
          This does not create a Paystack charge.
        </p>
        <button
          type="button"
          onClick={saveTier}
          disabled={
            !hasChanges ||
            !hasValidPeriodEnd ||
            isSaving ||
            isPending ||
            isSettingFreeWithActivePaystack
          }
          className="inline-flex items-center justify-center rounded-2xl border border-teal-200/35 bg-teal-50/90 px-4 py-2 text-sm font-black text-teal-900 shadow-sm ring-1 ring-white/20 transition hover:-translate-y-[1px] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200/60 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isSaving || isPending ? "Saving…" : "Save subscription override"}
        </button>
      </div>
    </div>
  );
}
