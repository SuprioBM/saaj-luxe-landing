import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { findProduct, inr } from "@/data/catalog";
import { ordersStore, type Order } from "@/lib/orders";

const TITLE = "Order Confirmed — SAAJ";
const DESCRIPTION = "Your SAAJ order has been received and is being prepared.";

export const Route = createFileRoute("/order/$id")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setOrder(ordersStore.find(id));
    setReady(true);
  }, [id]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">Order {id}</h1>
          <span className="h-px flex-1 bg-saaj-line" />
        </div>

        {!ready ? null : !order ? (
          <div className="mt-16">
            <p className="font-display text-3xl font-light">We couldn't find that order.</p>
            <Link to="/shop" className="rule-link mt-8">
              Back to the collection
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        ) : (
          <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_340px]">
            <div>
              <p className="font-display text-4xl font-light leading-[1.1] md:text-5xl">
                Thank you, {order.customer.name.split(" ")[0]}.
                <span className="block italic text-saaj-champagne">Your pieces are reserved.</span>
              </p>
              <p className="mt-6 max-w-md text-xs leading-relaxed text-muted-foreground">
                A confirmation has been sent to {order.customer.email}. Every SAAJ order is
                hand-checked and packed before dispatch — expect a tracking note within 48 hours.
              </p>

              <ul className="mt-12 flex flex-col gap-px bg-saaj-line">
                {order.lines.map((line) => {
                  const product = findProduct(line.slug);
                  if (!product) return null;
                  return (
                    <li key={`${line.slug}-${line.size}`} className="flex gap-5 bg-background py-5">
                      <img
                        src={product.img}
                        alt={product.name}
                        loading="lazy"
                        className="h-24 w-20 shrink-0 object-cover"
                      />
                      <div className="flex flex-1 flex-col justify-center">
                        <span className="text-xs">{product.name}</span>
                        <span className="mt-2 text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
                          Size {line.size} — Qty {line.qty}
                        </span>
                      </div>
                      <span className="self-center text-xs text-saaj-champagne">
                        {inr(product.price * line.qty)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside className="h-fit border border-saaj-line p-6">
              <h2 className="eyebrow">Delivery</h2>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {order.customer.address}, {order.customer.city}
                <br />
                {order.customer.state} {order.customer.pincode}
              </p>
              <span className="mt-6 block h-px w-full bg-saaj-line" />
              <dl className="mt-6 flex flex-col gap-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{inr(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{order.shipping === 0 ? "Complimentary" : inr(order.shipping)}</dd>
                </div>
              </dl>
              <span className="mt-6 block h-px w-full bg-saaj-line" />
              <div className="mt-6 flex items-baseline justify-between">
                <span className="eyebrow">Paid</span>
                <span className="text-sm text-saaj-champagne">{inr(order.total)}</span>
              </div>
              <Link to="/shop" className="rule-link mt-8">
                Continue shopping
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
