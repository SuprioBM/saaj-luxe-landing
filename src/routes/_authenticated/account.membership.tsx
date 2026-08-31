import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Gift, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountShell } from "@/components/AccountShell";
import { formatBDT } from "@/data/catalog";
import { useAuth } from "@/lib/auth";
import { cancelMembership, joinMembership } from "@/lib/membership.functions";
import { useMembership, useRewards } from "@/lib/membership";
import { SignedOut } from "@/routes/_authenticated/account.index";

const TITLE = "SAAJ Club — Your Membership";
const DESCRIPTION = "Manage your SAAJ Club membership, benefits and reward points.";

export const Route = createFileRoute("/_authenticated/account/membership")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MembershipPage,
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

const REWARD_LABEL: Record<string, string> = {
  EARNED: "Purchase",
  REDEEMED: "Redeemed",
  ADJUSTED: "Adjustment",
  EXPIRED: "Expired",
  REVERSED: "Reversal",
  BONUS: "Bonus",
};

function MembershipPage() {
  const user = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const membership = useMembership();
  const rewards = useRewards();
  const [busy, setBusy] = useState<null | "join" | "cancel">(null);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [showJoin, setShowJoin] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!user) return <SignedOut />;

  const { config } = membership;
  const cancelledButActive =
    membership.isMember && Boolean(membership.cancelledAt) && !membership.autoRenew;

  const doJoin = async () => {
    if (phone.trim().length < 7) {
      toast.error("Add a phone number for your bKash payment.");
      return;
    }
    setBusy("join");
    try {
      const result = await joinMembership({
        data: {
          tier: "CLUB",
          customer: { name: user.name, email: user.email, phone: phone.trim() },
        },
      });
      window.location.href = result.gatewayUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start your membership.");
      setBusy(null);
    }
  };

  const doCancel = async () => {
    setBusy("cancel");
    try {
      const result = await cancelMembership({ data: { immediate: false } });
      toast.success(
        `Auto-renewal is off. Your benefits stay active until ${fmtDate(result.currentPeriodEnd)}.`,
      );
      setConfirmCancel(false);
      await qc.invalidateQueries({ queryKey: ["membership"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel your membership.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AccountShell title={membership.isMember ? "SAAJ Club" : "SAAJ Club — for the few."}>
      {membership.isLoading ? (
        <div className="saaj-skeleton h-64" />
      ) : membership.isMember ? (
        <div className="space-y-16">
          {/* Status */}
          <div className="border border-saaj-champagne/30 p-6 sm:p-8">
            <p className="text-[0.625rem] tracking-[0.3em] text-saaj-champagne">✦ SAAJ CLUB</p>
            <p className="mt-3 font-display text-3xl font-light">
              {cancelledButActive
                ? `Active until ${fmtDate(membership.currentPeriodEnd)}`
                : "Active member"}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatBDT(membership.price ?? config.monthlyPrice)} / month
              {cancelledButActive
                ? " · auto-renewal off"
                : ` · membership ends ${fmtDate(membership.currentPeriodEnd)}`}
            </p>
            {cancelledButActive ? (
              <p className="mt-4 max-w-md text-[0.6875rem] leading-relaxed text-muted-foreground">
                Your SAAJ Club benefits remain active until the end of your current membership
                period. Renew any time to keep them.
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {!cancelledButActive ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                >
                  CANCEL MEMBERSHIP
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowJoin(true)}
                  className="border border-saaj-champagne px-6 py-3 text-[0.625rem] tracking-[0.24em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
                >
                  RENEW FOR {formatBDT(config.monthlyPrice)}/MONTH
                </button>
              )}
              {!cancelledButActive ? (
                <button
                  type="button"
                  onClick={() => setShowJoin(true)}
                  className="border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
                >
                  RENEW EARLY
                </button>
              ) : null}
            </div>
          </div>

          {/* Benefits */}
          <div>
            <div className="flex items-center gap-5">
              <h2 className="eyebrow">Your benefits</h2>
              <span className="h-px flex-1 bg-saaj-line" />
            </div>
            <div className="mt-8 grid grid-cols-1 gap-px bg-saaj-line sm:grid-cols-2">
              {membership.benefits.map((b) => (
                <div key={b.key} className="flex items-start gap-3 bg-background p-5">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-saaj-champagne"
                    strokeWidth={1.25}
                  />
                  <div>
                    <p className="text-xs">{b.label}</p>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                      {b.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-6">
              <Link to="/shop" search={{ club: "exclusive" }} className="rule-link">
                Browse exclusive products
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
              <Link to="/club" className="rule-link">
                View membership benefits
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </div>
          </div>

          {/* Rewards */}
          <div>
            <div className="flex items-center gap-5">
              <h2 className="eyebrow flex items-center gap-2">
                <Gift className="h-3.5 w-3.5" strokeWidth={1.25} />
                Reward points
              </h2>
              <span className="h-px flex-1 bg-saaj-line" />
            </div>
            <p className="mt-8 font-display text-5xl font-light">
              {rewards.balance}
              <span className="ml-3 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                POINTS
              </span>
            </p>
            {rewards.entries.length === 0 ? (
              <p className="mt-6 text-xs text-muted-foreground">
                Earn {config.pointsPer100Bdt} point for every {formatBDT(100)} of eligible spend.
              </p>
            ) : (
              <ul className="mt-8 divide-y divide-saaj-line border-y border-saaj-line">
                {rewards.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-6 py-4">
                    <div>
                      <p className="text-xs">{REWARD_LABEL[e.kind] ?? e.kind}</p>
                      <p className="mt-1 text-[0.625rem] tracking-[0.14em] text-muted-foreground">
                        {e.reason ?? ""} · {new Date(e.createdAt).toLocaleDateString("en-GB")}
                      </p>
                    </div>
                    <p
                      className={`text-sm ${e.points >= 0 ? "text-saaj-champagne" : "text-muted-foreground"}`}
                    >
                      {e.points >= 0 ? "+" : ""}
                      {e.points}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        /* Not a member */
        <div className="max-w-lg">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {membership.status === "EXPIRED"
              ? "Your SAAJ Club membership has expired."
              : "More access. Better prices. First in line."}
          </p>
          <ul className="mt-8 space-y-3">
            {membership.benefits.length
              ? membership.benefits.map((b) => (
                  <li key={b.key} className="flex items-center gap-3 text-xs">
                    <Check className="h-3.5 w-3.5 text-saaj-champagne" strokeWidth={1.25} />
                    {b.label}
                  </li>
                ))
              : null}
          </ul>
          <p className="mt-8 font-display text-2xl font-light text-saaj-champagne">
            {formatBDT(config.monthlyPrice)} / month
          </p>
          <button
            type="button"
            onClick={() => setShowJoin(true)}
            className="mt-6 inline-flex items-center gap-3 border border-saaj-champagne px-10 py-4 text-[0.625rem] tracking-[0.28em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
          >
            {membership.status === "EXPIRED" ? "REJOIN THE CLUB" : "JOIN SAAJ CLUB"}
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/club" })}
            className="rule-link ml-4 mt-6 inline-flex"
          >
            Learn more
          </button>
        </div>
      )}

      {showJoin ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-5"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => busy !== "join" && setShowJoin(false)}
          />
          <div className="relative w-full max-w-md border border-saaj-line bg-background p-8">
            <p className="text-[0.625rem] tracking-[0.3em] text-saaj-champagne">✦ SAAJ CLUB</p>
            <p className="mt-4 font-display text-2xl font-light">
              {formatBDT(config.monthlyPrice)} / month
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              You'll pay with bKash. Membership activates the moment we verify the payment — never
              before.
            </p>
            <label className="mt-6 block">
              <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                PHONE (FOR BKASH)
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+8801…"
                className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
              />
            </label>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowJoin(false)}
                disabled={busy === "join"}
                className="flex-1 border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
              >
                NOT NOW
              </button>
              <button
                type="button"
                onClick={() => void doJoin()}
                disabled={busy === "join"}
                className="flex flex-1 items-center justify-center gap-2 border border-saaj-champagne px-6 py-3 text-[0.625rem] tracking-[0.24em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background disabled:opacity-40"
              >
                {busy === "join" ? (
                  <>
                    REDIRECTING
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.25} />
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" strokeWidth={1.25} />
                    PAY WITH BKASH
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmCancel ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-5"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => busy !== "cancel" && setConfirmCancel(false)}
          />
          <div className="relative w-full max-w-md border border-saaj-line bg-background p-8">
            <p className="eyebrow">Cancel SAAJ Club?</p>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Auto-renewal will be turned off. Your benefits stay active until{" "}
              {fmtDate(membership.currentPeriodEnd)}, then your membership expires. You won't be
              charged again.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                disabled={busy === "cancel"}
                className="flex-1 border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
              >
                KEEP MEMBERSHIP
              </button>
              <button
                type="button"
                onClick={() => void doCancel()}
                disabled={busy === "cancel"}
                className="flex-1 border border-destructive px-6 py-3 text-[0.625rem] tracking-[0.24em] text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
              >
                {busy === "cancel" ? "CANCELLING" : "CONFIRM CANCELLATION"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AccountShell>
  );
}
