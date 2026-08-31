import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatBDT } from "@/data/catalog";
import { useAuth } from "@/lib/auth";
import { joinMembership } from "@/lib/membership.functions";
import { useMembership, useMembershipConfig } from "@/lib/membership";

const TITLE = "SAAJ Club — For the Few";
const DESCRIPTION =
  "SAAJ Club: member pricing, exclusive drops, early access, member-only sales, reward points and a birthday reward. ৳50 / month.";

export const Route = createFileRoute("/club")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ClubPage,
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "";

function ClubPage() {
  const user = useAuth();
  const navigate = useNavigate();
  const config = useMembershipConfig();
  const membership = useMembership();
  const [joining, setJoining] = useState(false);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [confirming, setConfirming] = useState(false);

  const priceLine = `${formatBDT(config.monthlyPrice)} / month`;

  const BENEFITS: { title: string; copy: string }[] = [
    {
      title: `${config.memberDiscountPercent}% Member Pricing`,
      copy: "On eligible pieces, every order.",
    },
    { title: "Exclusive Drops", copy: "Pieces only members can buy." },
    { title: "Early Access", copy: "See new drops before everyone else." },
    { title: "Member-Only Sales", copy: "Private offers, members first." },
    {
      title: "Reward Points",
      copy: `Earn ${config.pointsPer100Bdt} point for every ${formatBDT(100)} you spend.`,
    },
    { title: "Birthday Reward", copy: `${config.birthdayRewardPoints} points from SAAJ, on us.` },
  ];

  const startJoin = async () => {
    if (!user) {
      void navigate({ to: "/auth", search: { redirect: "/club" } });
      return;
    }
    setConfirming(true);
  };

  const submitJoin = async () => {
    if (!user) return;
    if (phone.trim().length < 7) {
      toast.error("Add a phone number for your bKash payment.");
      return;
    }
    setJoining(true);
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
      setJoining(false);
    }
  };

  const isCancelledButActive =
    membership.isMember && Boolean(membership.cancelledAt) && !membership.autoRenew;
  const isExpired = !membership.isMember && membership.status === "EXPIRED";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="border-b border-saaj-line px-5 py-24 md:px-8 md:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[0.625rem] tracking-[0.4em] text-saaj-champagne">✦ SAAJ CLUB</p>
            <h1 className="mt-8 font-display text-6xl font-light leading-[0.95] md:text-8xl">
              For the few.
            </h1>
            <p className="mx-auto mt-8 max-w-md text-xs leading-relaxed tracking-[0.06em] text-muted-foreground">
              More access. Better prices. First in line. Not everyone needs access — those who do,
              get the whole of SAAJ, a layer deeper.
            </p>

            {membership.isMember ? (
              <div className="mt-12">
                <p className="text-[0.625rem] tracking-[0.3em] text-saaj-champagne">
                  {isCancelledButActive
                    ? `ACTIVE UNTIL ${fmtDate(membership.currentPeriodEnd).toUpperCase()}`
                    : "ACTIVE MEMBER"}
                </p>
                {isCancelledButActive ? (
                  <p className="mt-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground">
                    AUTO-RENEWAL OFF
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Membership ends {fmtDate(membership.currentPeriodEnd)}
                  </p>
                )}
                <Link
                  to="/account/membership"
                  className="mx-auto mt-8 inline-flex items-center gap-3 border border-saaj-champagne px-10 py-4 text-[0.625rem] tracking-[0.28em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
                >
                  MANAGE MEMBERSHIP
                  <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                </Link>
              </div>
            ) : (
              <div className="mt-12">
                <p className="font-display text-3xl font-light text-saaj-champagne">{priceLine}</p>
                {isExpired ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Your membership has expired. Rejoin any time.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void startJoin()}
                  disabled={joining}
                  className="mx-auto mt-8 inline-flex items-center gap-3 border border-saaj-champagne px-12 py-4 text-[0.625rem] tracking-[0.3em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background disabled:opacity-40"
                >
                  {isExpired ? "REJOIN THE CLUB" : "JOIN THE CLUB"}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                </button>
                {!user ? (
                  <p className="mt-4 text-[0.625rem] tracking-[0.2em] text-muted-foreground">
                    LOGIN OR CREATE AN ACCOUNT TO JOIN
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {/* Benefits */}
        <section className="grid grid-cols-1 gap-px bg-saaj-line sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="bg-background px-8 py-12">
              <Check className="h-4 w-4 text-saaj-champagne" strokeWidth={1.25} />
              <h2 className="mt-6 font-display text-2xl font-light">{b.title}</h2>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{b.copy}</p>
            </div>
          ))}
        </section>

        {/* Closing */}
        <section className="border-t border-saaj-line px-5 py-24 md:px-8 md:py-32">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-display text-4xl font-light italic text-saaj-champagne md:text-5xl">
              More access.
              <br />
              Better prices.
              <br />
              First in line.
            </p>
            <p className="mt-8 text-xs tracking-[0.2em] text-muted-foreground">
              {priceLine.toUpperCase()} · CANCEL ANY TIME · BENEFITS RUN TO YOUR PERIOD END
            </p>
            {!membership.isMember ? (
              <button
                type="button"
                onClick={() => void startJoin()}
                disabled={joining}
                className="mx-auto mt-10 inline-flex items-center gap-3 border border-saaj-line px-12 py-4 text-[0.625rem] tracking-[0.3em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
              >
                {isExpired ? "REJOIN THE CLUB" : "JOIN THE CLUB"}
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </button>
            ) : null}
          </div>
        </section>
      </main>
      <SiteFooter />

      {confirming && user ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-5"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !joining && setConfirming(false)}
          />
          <div className="relative w-full max-w-md border border-saaj-line bg-background p-8">
            <p className="text-[0.625rem] tracking-[0.3em] text-saaj-champagne">✦ SAAJ CLUB</p>
            <p className="mt-4 font-display text-2xl font-light">Join for {priceLine}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              You'll be taken to bKash to pay {formatBDT(config.monthlyPrice)}. Your membership
              activates the moment we've verified the payment.
            </p>

            <div className="mt-6 space-y-4">
              <div className="text-xs">
                <span className="text-muted-foreground">Account</span>
                <p className="mt-1">
                  {user.name} · {user.email}
                </p>
              </div>
              <label className="block">
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
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={joining}
                className="flex-1 border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
              >
                NOT NOW
              </button>
              <button
                type="button"
                onClick={() => void submitJoin()}
                disabled={joining}
                className="flex flex-1 items-center justify-center gap-2 border border-saaj-champagne px-6 py-3 text-[0.625rem] tracking-[0.24em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background disabled:opacity-40"
              >
                {joining ? (
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
    </div>
  );
}
