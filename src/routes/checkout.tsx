import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { findProduct, inr } from "@/data/catalog";
import { cart, useCart } from "@/lib/cart";
import { ordersStore, type OrderCustomer } from "@/lib/orders";

const TITLE = "Checkout — SAAJ";
const DESCRIPTION = "Complete your SAAJ order: delivery details, payment method and review.";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

const STEPS = ["Details", "Payment", "Review"] as const;

const FIELDS: { key: keyof OrderCustomer; label: string; type?: string; half?: boolean }[] = [
  { key: "name", label: "Full name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel", half: true },
  { key: "pincode", label: "PIN code", half: true },
  { key: "address", label: "Address" },
  { key: "city", label: "City", half: true },
  { key: "state", label: "State", half: true },
];

const METHODS: { id: OrderCustomer["method"]; label: string; note: string }[] = [
  { id: "card", label: "Card", note: "Visa, Mastercard, Amex — encrypted at checkout" },
  { id: "upi", label: "UPI", note: "Pay from any UPI app on delivery of the payment request" },
  { id: "cod", label: "Cash on delivery", note: "Available on orders under ₹10,000" },
];

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="eyebrow block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-3 w-full border-b border-saaj-line bg-transparent pb-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne"
      />
    </label>
  );
}

function CheckoutPage() {
  const lines = useCart();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OrderCustomer>({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    method: "card",
  });

  const rows = lines
    .map((line) => ({ line, product: findProduct(line.slug) }))
    .filter((r): r is { line: (typeof lines)[number]; product: NonNullable<ReturnType<typeof findProduct>> } =>
      Boolean(r.product),
    );

  const subtotal = rows.reduce((s, r) => s + r.product.price * r.line.qty, 0);
  const shipping = subtotal === 0 || subtotal >= 4999 ? 0 : 149;
  const total = subtotal + shipping;

  const set = (key: keyof OrderCustomer, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const detailsValid =
    form.name.trim().length > 1 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    form.phone.trim().length >= 8 &&
    form.address.trim().length > 4 &&
    form.city.trim().length > 1 &&
    form.state.trim().length > 1 &&
    /^\d{4,8}$/.test(form.pincode.trim());

  const placeOrder = () => {
    const order = ordersStore.place({ lines, subtotal, shipping, total, customer: form });
    cart.clear();
    toast.success("Order placed", { description: order.id });
    navigate({ to: "/order/$id", params: { id: order.id } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">Checkout</h1>
          <span className="h-px flex-1 bg-saaj-line" />
          <Link to="/cart" className="text-[0.625rem] tracking-[0.22em] text-muted-foreground hover:text-saaj-champagne">
            BACK TO BAG
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="mt-16 flex flex-col items-start">
            <p className="font-display text-3xl font-light">Nothing to check out.</p>
            <Link to="/shop" className="rule-link mt-8">
              Explore the collection
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_340px]">
            <div>
              <ol className="flex items-center gap-6">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <span
                      className={`text-[0.625rem] tracking-[0.24em] ${
                        i === step
                          ? "text-saaj-champagne"
                          : i < step
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")} {s.toUpperCase()}
                    </span>
                    {i < STEPS.length - 1 && <span className="h-px w-8 bg-saaj-line" />}
                  </li>
                ))}
              </ol>

              <div className="mt-10 border-t border-saaj-line pt-10">
                {step === 0 && (
                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                    {FIELDS.map((f) => (
                      <div key={f.key} className={f.half ? "sm:col-span-1" : "sm:col-span-2"}>
                        <Field
                          label={f.label}
                          type={f.type}
                          value={form[f.key] as string}
                          onChange={(v) => set(f.key, v)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {step === 1 && (
                  <div className="flex flex-col gap-px bg-saaj-line">
                    {METHODS.map((m) => {
                      const active = form.method === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => set("method", m.id)}
                          className={`flex items-start gap-4 bg-background p-5 text-left transition-colors ${
                            active ? "text-saaj-champagne" : "hover:text-saaj-champagne"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${
                              active ? "border-saaj-champagne" : "border-saaj-line"
                            }`}
                          >
                            {active && <Check className="h-3 w-3" strokeWidth={1.5} />}
                          </span>
                          <span>
                            <span className="block text-xs uppercase tracking-[0.22em]">
                              {m.label}
                            </span>
                            <span className="mt-2 block text-[0.6875rem] leading-relaxed text-muted-foreground">
                              {m.note}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col gap-8">
                    <div>
                      <h2 className="eyebrow">Delivering to</h2>
                      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                        {form.name}
                        <br />
                        {form.address}, {form.city}, {form.state} {form.pincode}
                        <br />
                        {form.phone} — {form.email}
                      </p>
                    </div>
                    <div>
                      <h2 className="eyebrow">Payment</h2>
                      <p className="mt-4 text-xs text-muted-foreground">
                        {METHODS.find((m) => m.id === form.method)?.label}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-px bg-saaj-line">
                      {rows.map(({ line, product }) => (
                        <li
                          key={`${line.slug}-${line.size}`}
                          className="flex items-center justify-between gap-4 bg-background py-4"
                        >
                          <span className="text-xs">
                            {product.name}
                            <span className="ml-3 text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
                              {line.size} × {line.qty}
                            </span>
                          </span>
                          <span className="text-xs text-saaj-champagne">
                            {inr(product.price * line.qty)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-10 flex items-center justify-between gap-6">
                <button
                  type="button"
                  disabled={step === 0}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="text-[0.625rem] uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:text-saaj-champagne disabled:opacity-30"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={step === 0 && !detailsValid}
                  onClick={() => (step === 2 ? placeOrder() : setStep((s) => s + 1))}
                  className="flex items-center gap-4 border border-saaj-line px-8 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-30 disabled:hover:border-saaj-line disabled:hover:text-foreground"
                >
                  {step === 2 ? "Place order" : "Continue"}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                </button>
              </div>
            </div>

            <aside className="h-fit border border-saaj-line p-6">
              <h2 className="eyebrow">Summary</h2>
              <dl className="mt-6 flex flex-col gap-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{inr(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{shipping === 0 ? "Complimentary" : inr(shipping)}</dd>
                </div>
              </dl>
              <span className="mt-6 block h-px w-full bg-saaj-line" />
              <div className="mt-6 flex items-baseline justify-between">
                <span className="eyebrow">Total</span>
                <span className="text-sm text-saaj-champagne">{inr(total)}</span>
              </div>
              <p className="mt-6 text-[0.625rem] leading-relaxed tracking-[0.14em] text-muted-foreground">
                COMPLIMENTARY SHIPPING ON ORDERS OVER ₹4,999
              </p>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
