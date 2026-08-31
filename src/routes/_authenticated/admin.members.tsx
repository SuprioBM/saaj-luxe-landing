import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { formatBDT } from "@/data/catalog";
import {
  adminAdjustRewardPoints,
  adminGetClubConfig,
  adminGetMemberDetail,
  adminListMembers,
  adminSetMembership,
  adminUpdateClubConfig,
  type AdminMember,
} from "@/lib/admin/members.functions";

const TITLE = "SAAJ Club — Atelier Desk";
const DESCRIPTION = "Members, reward balances and SAAJ Club configuration.";

export const Route = createFileRoute("/_authenticated/admin/members")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminMembers,
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

function AdminMembers() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["admin", "members"],
    queryFn: () => adminListMembers(),
  });

  const rows = members.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase()),
  );

  const activeCount = members.filter(
    (m) =>
      m.status === "ACTIVE" &&
      m.currentPeriodEnd &&
      new Date(m.currentPeriodEnd).getTime() > Date.now(),
  ).length;

  return (
    <AdminShell title="SAAJ Club" subtitle="The few.">
      <div className="grid gap-px bg-saaj-line sm:grid-cols-3">
        <Metric label="Active members" value={String(activeCount)} />
        <Metric label="Total records" value={String(members.length)} />
        <Metric
          label="Points in circulation"
          value={String(members.reduce((s, m) => s + Math.max(0, m.rewardBalance), 0))}
        />
      </div>

      <ClubConfigPanel />

      <div className="mt-16 flex items-center gap-5">
        <h2 className="eyebrow">Members</h2>
        <span className="h-px flex-1 bg-saaj-line" />
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email"
        className="mt-6 w-full max-w-sm border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne"
      />

      {isLoading ? (
        <div className="mt-10 space-y-px">
          {[0, 1, 2].map((i) => (
            <div key={i} className="saaj-skeleton h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-12 text-xs text-muted-foreground">No members yet.</p>
      ) : (
        <div className="mt-10 space-y-px bg-saaj-line">
          {rows.map((m) => (
            <div key={m.userId} className="bg-background">
              <button
                type="button"
                onClick={() => setSelected(selected === m.userId ? null : m.userId)}
                className="flex w-full items-center gap-5 p-5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{m.name}</p>
                  <p className="mt-1 truncate text-[0.625rem] tracking-[0.18em] text-muted-foreground">
                    {m.email}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[0.625rem] tracking-[0.2em] ${
                    m.status === "ACTIVE" ? "text-saaj-champagne" : "text-muted-foreground"
                  }`}
                >
                  {m.status}
                </span>
                <span className="hidden w-32 shrink-0 text-right text-[0.625rem] tracking-[0.18em] text-muted-foreground sm:block">
                  {m.cancelledAt && m.status === "ACTIVE" ? "ENDS " : "TILL "}
                  {fmtDate(m.currentPeriodEnd)}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-saaj-champagne">
                  {m.rewardBalance} pts
                </span>
              </button>
              {selected === m.userId ? (
                <MemberDetail
                  userId={m.userId}
                  base={m}
                  onChanged={() => {
                    void qc.invalidateQueries({ queryKey: ["admin", "members"] });
                    void qc.invalidateQueries({ queryKey: ["admin", "member", m.userId] });
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-8">
      <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
        {label.toUpperCase()}
      </p>
      <p className="mt-6 font-display text-3xl font-light">{value}</p>
    </div>
  );
}

const REWARD_LABEL: Record<string, string> = {
  EARNED: "Purchase",
  REDEEMED: "Redeemed",
  ADJUSTED: "Adjustment",
  EXPIRED: "Expired",
  REVERSED: "Reversal",
  BONUS: "Bonus",
};

function MemberDetail({
  userId,
  base,
  onChanged,
}: {
  userId: string;
  base: AdminMember;
  onChanged: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "member", userId],
    queryFn: () => adminGetMemberDetail({ data: { userId } }),
  });

  const [status, setStatus] = useState<"ACTIVE" | "EXPIRED" | "CANCELLED">(
    base.status === "ACTIVE" ? "ACTIVE" : "EXPIRED",
  );
  const [periodEnd, setPeriodEnd] = useState(
    base.currentPeriodEnd ? base.currentPeriodEnd.slice(0, 10) : "",
  );
  const [reason, setReason] = useState("");
  const [points, setPoints] = useState(0);
  const [pointsReason, setPointsReason] = useState("");
  const [busy, setBusy] = useState(false);

  const saveStatus = async () => {
    if (reason.trim().length < 3) return toast.error("Enter a reason for the audit log.");
    setBusy(true);
    try {
      await adminSetMembership({
        data: {
          userId,
          status,
          periodEnd:
            status === "ACTIVE" && periodEnd
              ? new Date(`${periodEnd}T23:59:59`).toISOString()
              : null,
          reason: reason.trim(),
        },
      });
      toast.success("Membership updated.");
      setReason("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update membership.");
    } finally {
      setBusy(false);
    }
  };

  const savePoints = async () => {
    if (points === 0) return toast.error("Enter a non-zero adjustment.");
    if (pointsReason.trim().length < 3) return toast.error("Enter a reason for the audit log.");
    setBusy(true);
    try {
      const res = await adminAdjustRewardPoints({
        data: { userId, points, reason: pointsReason.trim() },
      });
      toast.success(`Balance is now ${res.balance} points.`);
      setPoints(0);
      setPointsReason("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not adjust points.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-saaj-line bg-saaj-panel/40 px-5 py-8">
      {isLoading || !data ? (
        <div className="saaj-skeleton h-40" />
      ) : (
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Manual membership control */}
          <div>
            <p className="eyebrow">Manual membership change</p>
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
              Authorised changes only. Every change is written to the audit log with your reason.
            </p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                  STATUS
                </span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne [&>option]:bg-background"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="CANCELLED">Cancelled (immediate)</option>
                  <option value="EXPIRED">Expired</option>
                </select>
              </label>
              {status === "ACTIVE" ? (
                <label className="block">
                  <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    PERIOD END
                  </span>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne [color-scheme:dark]"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                  REASON
                </span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. comp'd for a fulfilment error"
                  className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveStatus()}
                className="border border-foreground px-6 py-2.5 text-[0.625rem] tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
              >
                APPLY CHANGE
              </button>
            </div>

            <div className="mt-8 border-t border-saaj-line pt-6">
              <p className="eyebrow">Adjust reward points</p>
              <div className="mt-4 flex flex-wrap items-end gap-4">
                <label className="block">
                  <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    POINTS (± )
                  </span>
                  <input
                    type="number"
                    value={points}
                    onChange={(e) => setPoints(Math.trunc(Number(e.target.value) || 0))}
                    className="mt-2 w-28 border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
                  />
                </label>
                <input
                  value={pointsReason}
                  onChange={(e) => setPointsReason(e.target.value)}
                  placeholder="Reason (audited)"
                  className="min-w-[12rem] flex-1 border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void savePoints()}
                  className="border border-saaj-line px-6 py-2.5 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
                >
                  ADJUST
                </button>
              </div>
              <p className="mt-3 text-xs text-saaj-champagne">
                Current balance: {data.rewardBalance} points
              </p>
            </div>
          </div>

          {/* History */}
          <div>
            <p className="eyebrow">Membership periods</p>
            {data.memberships.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No membership on record.</p>
            ) : (
              <ul className="mt-3 divide-y divide-saaj-line border-y border-saaj-line text-xs">
                {data.memberships.map((m) => (
                  <li key={m.id} className="flex justify-between py-3">
                    <span>
                      {m.status} · {formatBDT(m.price)}
                    </span>
                    <span className="text-muted-foreground">
                      {fmtDate(m.currentPeriodStart)} → {fmtDate(m.currentPeriodEnd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="eyebrow mt-8">Membership payments</p>
            {data.membershipOrders.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">None.</p>
            ) : (
              <ul className="mt-3 divide-y divide-saaj-line border-y border-saaj-line text-xs">
                {data.membershipOrders.map((o) => (
                  <li key={o.reference} className="flex justify-between py-3">
                    <span>{o.reference}</span>
                    <span className="text-muted-foreground">
                      {formatBDT(o.total)} · {o.paymentStatus ?? o.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="eyebrow mt-8">Reward ledger</p>
            {data.ledger.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Empty.</p>
            ) : (
              <ul className="mt-3 max-h-64 divide-y divide-saaj-line overflow-y-auto border-y border-saaj-line text-xs">
                {data.ledger.map((e) => (
                  <li key={e.id} className="flex justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="block">{REWARD_LABEL[e.kind] ?? e.kind}</span>
                      <span className="block text-[0.625rem] text-muted-foreground">
                        {e.reason ?? ""} · {new Date(e.createdAt).toLocaleDateString("en-GB")}
                      </span>
                    </span>
                    <span
                      className={e.points >= 0 ? "text-saaj-champagne" : "text-muted-foreground"}
                    >
                      {e.points >= 0 ? "+" : ""}
                      {e.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ClubConfigPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "club-config"],
    queryFn: () => adminGetClubConfig(),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    monthlyPrice: number;
    memberDiscountPercent: number;
    pointsPer100Bdt: number;
    birthdayRewardPoints: number;
    gracePeriodDays: number;
    rewardPointsEnabled: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    if (!data) return;
    setForm({
      monthlyPrice: data.monthlyPrice,
      memberDiscountPercent: data.memberDiscountPercent,
      pointsPer100Bdt: data.pointsPer100Bdt,
      birthdayRewardPoints: data.birthdayRewardPoints,
      gracePeriodDays: data.gracePeriodDays,
      rewardPointsEnabled: data.rewardPointsEnabled,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await adminUpdateClubConfig({ data: form });
      toast.success("SAAJ Club settings updated.");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["admin", "club-config"] });
      void qc.invalidateQueries({ queryKey: ["membership"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 border border-saaj-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Club settings</p>
          {data ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {formatBDT(data.monthlyPrice)}/month · {data.memberDiscountPercent}% member discount ·{" "}
              {data.pointsPer100Bdt} pt / {formatBDT(100)} · {data.birthdayRewardPoints} birthday
              pts · {data.gracePeriodDays}d grace · rewards{" "}
              {data.rewardPointsEnabled ? "on" : "off"}
            </p>
          ) : (
            <p className="mt-3 saaj-skeleton h-4 w-64" />
          )}
        </div>
        <button
          type="button"
          onClick={open ? () => setOpen(false) : start}
          className="border border-saaj-line px-6 py-2.5 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
        >
          {open ? "CLOSE" : "EDIT"}
        </button>
      </div>

      {open && form ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <NumField
            label="Monthly price (৳)"
            value={form.monthlyPrice}
            onChange={(v) => setForm({ ...form, monthlyPrice: v })}
          />
          <NumField
            label="Member discount (%)"
            value={form.memberDiscountPercent}
            onChange={(v) => setForm({ ...form, memberDiscountPercent: v })}
          />
          <NumField
            label="Points per ৳100"
            value={form.pointsPer100Bdt}
            onChange={(v) => setForm({ ...form, pointsPer100Bdt: v })}
          />
          <NumField
            label="Birthday reward (pts)"
            value={form.birthdayRewardPoints}
            onChange={(v) => setForm({ ...form, birthdayRewardPoints: Math.trunc(v) })}
          />
          <NumField
            label="Grace period (days)"
            value={form.gracePeriodDays}
            onChange={(v) => setForm({ ...form, gracePeriodDays: Math.trunc(v) })}
          />
          <label className="flex items-center gap-3 self-end pb-2 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
            <input
              type="checkbox"
              checked={form.rewardPointsEnabled}
              onChange={(e) => setForm({ ...form, rewardPointsEnabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-white"
            />
            REWARD POINTS ENABLED
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="border border-foreground px-8 py-2.5 text-[0.625rem] tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40 sm:col-span-2 lg:col-span-1"
          >
            {busy ? "SAVING" : "SAVE SETTINGS"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
        {label.toUpperCase()}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
      />
    </label>
  );
}
