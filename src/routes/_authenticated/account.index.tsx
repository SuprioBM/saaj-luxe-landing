import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, Heart, Package, User } from "lucide-react";

import { AccountShell } from "@/components/AccountShell";
import { formatBDT } from "@/data/catalog";
import { useAuth } from "@/lib/auth";
import { listMyNotifications, markNotificationRead } from "@/lib/notifications.functions";
import { listMyOrdersDetailed } from "@/lib/orders.functions";
import { useWishlist } from "@/lib/wishlist";

const TITLE = "Your Account — SAAJ";
const DESCRIPTION = "Your SAAJ orders, saved pieces and profile in one place.";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountOverview,
});

function AccountOverview() {
  const user = useAuth();
  const { data: orders = [] } = useQuery({
    queryKey: ["orders", "mine", user?.id],
    queryFn: () => listMyOrdersDetailed(),
    enabled: Boolean(user),
  });
  const saved = useWishlist();
  const spend = orders
    .filter((o) => ["paid", "shipped", "delivered"].includes(o.status))
    .reduce((s, o) => s + o.total, 0);

  if (!user) return <SignedOut />;

  return (
    <AccountShell title={`Good to see you, ${user.name.split(" ")[0]}.`}>
      <div className="grid gap-px bg-saaj-line sm:grid-cols-3">
        <Stat label="Orders" value={String(orders.length)} icon={Package} />
        <Stat label="Lifetime Spend" value={formatBDT(spend)} icon={User} />
        <Stat label="Saved Pieces" value={String(saved.length)} icon={Heart} />
      </div>

      <div className="mt-16 flex items-center gap-5">
        <h2 className="eyebrow">Recent Orders</h2>
        <span className="h-px flex-1 bg-saaj-line" />
        <Link to="/account/orders" className="rule-link">
          View all
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="mt-10">
          <p className="font-display text-2xl font-light">No orders yet.</p>
          <Link to="/shop" className="rule-link mt-6">
            Explore the collection
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-saaj-line border-y border-saaj-line">
          {orders.slice(0, 3).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-6 py-5">
              <div>
                <p className="text-sm">{o.reference}</p>
                <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                  {new Date(o.placedAt).toLocaleDateString("en-GB")} · {o.items.length} PIECE
                  {o.items.length === 1 ? "" : "S"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm">{formatBDT(o.total)}</p>
                <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-saaj-champagne">
                  {o.status.toUpperCase()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NotificationsPanel />
    </AccountShell>
  );
}

function NotificationsPanel() {
  const qc = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", "mine"],
    queryFn: () => listMyNotifications(),
  });

  if (notifications.length === 0) return null;

  const markRead = (id: string) => {
    void markNotificationRead({ data: { id } }).then(() =>
      qc.invalidateQueries({ queryKey: ["notifications", "mine"] }),
    );
  };

  return (
    <div className="mt-16">
      <div className="flex items-center gap-5">
        <h2 className="eyebrow flex items-center gap-2">
          <Bell className="h-3.5 w-3.5" strokeWidth={1.25} />
          Notifications
        </h2>
        <span className="h-px flex-1 bg-saaj-line" />
      </div>
      <ul className="mt-8 divide-y divide-saaj-line border-y border-saaj-line">
        {notifications.slice(0, 8).map((n) => (
          <li
            key={n.id}
            className={`flex items-start justify-between gap-6 py-4 ${n.readAt ? "" : "text-saaj-champagne"}`}
          >
            <div>
              <p className="text-xs">{n.title}</p>
              <p className="mt-1 text-[0.625rem] leading-relaxed text-muted-foreground">{n.body}</p>
            </div>
            {!n.readAt ? (
              <button
                type="button"
                onClick={() => markRead(n.id)}
                className="shrink-0 text-[0.5625rem] tracking-[0.2em] text-muted-foreground transition-colors hover:text-saaj-champagne"
              >
                MARK READ
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Package;
}) {
  return (
    <div className="bg-background p-8">
      <Icon className="h-4 w-4 text-saaj-champagne" strokeWidth={1.25} />
      <p className="mt-8 font-display text-3xl font-light">{value}</p>
      <p className="mt-2 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
        {label.toUpperCase()}
      </p>
    </div>
  );
}

export function SignedOut() {
  return (
    <AccountShell title="Sign in to continue.">
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
        Your orders, saved pieces and addresses live behind your SAAJ account.
      </p>
      <Link to="/auth" className="rule-link mt-8">
        Sign in or create an account
        <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
      </Link>
    </AccountShell>
  );
}
