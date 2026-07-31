import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { AccountShell } from "@/components/AccountShell";
import { inr } from "@/data/catalog";
import { useAuth } from "@/lib/auth";
import { useMyOrders } from "@/lib/queries";
import { SignedOut } from "@/routes/_authenticated/account.index";

const TITLE = "Order History — SAAJ";
const DESCRIPTION = "Every SAAJ order you've placed, with status and delivery detail.";

export const Route = createFileRoute("/_authenticated/account/orders")({
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
  component: AccountOrders,
});

const STEPS = ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"] as const;

function AccountOrders() {
  const user = useAuth();
  const { data: orders = [], isLoading } = useMyOrders(user?.email);

  if (!user) return <SignedOut />;

  return (
    <AccountShell title="Order history.">
      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="saaj-skeleton h-28 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div>
          <p className="font-display text-2xl font-light">Nothing here yet.</p>
          <Link to="/shop" className="rule-link mt-6">
            Explore the collection
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </Link>
        </div>
      ) : (
        <div className="space-y-px bg-saaj-line">
          {orders.map((o) => {
            const step = STEPS.indexOf(o.status as (typeof STEPS)[number]);
            return (
              <article key={o.id} className="bg-background p-6 md:p-8">
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <p className="font-display text-2xl font-light">{o.reference}</p>
                    <p className="mt-2 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                      {new Date(o.placedAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {o.paymentMethod.toUpperCase()}
                    </p>
                  </div>
                  <p className="text-sm">{inr(o.total)}</p>
                </div>

                {o.status === "CANCELLED" ? (
                  <p className="mt-6 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    CANCELLED
                  </p>
                ) : (
                  <div className="mt-8 flex gap-1">
                    {STEPS.map((s, i) => (
                      <div key={s} className="flex-1">
                        <div
                          className={`h-px ${i <= step ? "bg-saaj-champagne" : "bg-saaj-line"}`}
                        />
                        <p
                          className={`mt-3 text-[0.5rem] tracking-[0.22em] ${
                            i <= step ? "text-saaj-champagne" : "text-muted-foreground"
                          }`}
                        >
                          {s}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <ul className="mt-8 space-y-4">
                  {o.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-4">
                      {it.image ? (
                        <img
                          src={it.image}
                          alt={it.name}
                          className="h-16 w-14 object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{it.name}</p>
                        <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                          {it.size} · QTY {it.qty}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">{inr(it.unitPrice * it.qty)}</p>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/order/$id"
                  params={{ id: o.reference }}
                  className="rule-link mt-8"
                >
                  View confirmation
                  <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </AccountShell>
  );
}
