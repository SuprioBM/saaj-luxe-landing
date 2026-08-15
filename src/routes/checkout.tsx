import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatBDT } from "@/data/catalog";
import { useAuth } from "@/lib/auth";
import { useCart, getGuestCartForCheckout } from "@/lib/cart";
import { initiateCheckout } from "@/lib/checkout.functions";
import { previewCoupon } from "@/lib/coupons.functions";
import { listAddresses } from "@/lib/addresses.functions";
import { estimateShipping, SHIPPING_THRESHOLD_BDT } from "@/lib/pricing";

const TITLE = "Checkout — SAAJ";
const DESCRIPTION = "Complete your SAAJ order: delivery details, coupon and review.";

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

const STEPS = ["Details", "Coupon", "Review"] as const;

type FormState = {
  name: string;
  email: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
};

const FIELDS: { key: keyof FormState; label: string; type?: string; half?: boolean }[] = [
  { key: "name", label: "Full name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel", half: true },
  { key: "pincode", label: "Post code", half: true },
  { key: "line1", label: "Address" },
  { key: "city", label: "City", half: true },
  { key: "state", label: "District", half: true },
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
  const user = useAuth();
  const { lines, isLoading: cartLoading } = useCart();
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<{ valid: boolean; discount: number; message: string } | null>(
    null,
  );
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    line1: "",
    city: "",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    if (user) {
      setForm((f) => ({ ...f, name: f.name || user.name, email: f.email || user.email, phone: f.phone || user.phone || "" }));
    }
  }, [user]);

  const addressesQuery = useQuery({
    queryKey: ["addresses", user?.id],
    queryFn: () => listAddresses(),
    enabled: Boolean(user),
  });

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = couponResult?.valid ? couponResult.discount : 0;
  const afterDiscount = Math.max(0, subtotal - discount);
  const shipping = estimateShipping(afterDiscount);
  const total = afterDiscount + shipping;

  const set = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const detailsValid =
    form.name.trim().length > 1 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    form.phone.trim().length >= 7 &&
    form.line1.trim().length > 4 &&
    form.city.trim().length > 1 &&
    form.state.trim().length > 1 &&
    form.pincode.trim().length >= 3;

  const applyAddress = (a: { name: string; phone: string; line1: string; city: string; state: string; pincode: string }) => {
    setForm((f) => ({ ...f, name: a.name, phone: a.phone, line1: a.line1, city: a.city, state: a.state, pincode: a.pincode }));
  };

  const checkCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponResult(null);
      return;
    }
    setCheckingCoupon(true);
    try {
      const result = await previewCoupon({
        data: { code: couponCode.trim(), guestItems: user ? undefined : getGuestCartForCheckout() },
      });
      setCouponResult(result);
      if (!result.valid) toast.error(result.message);
      else toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check that coupon.");
    } finally {
      setCheckingCoupon(false);
    }
  };

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const result = await initiateCheckout({
        data: {
          customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
          shippingAddress: {
            line1: form.line1.trim(),
            city: form.city.trim(),
            state: form.state.trim(),
            pincode: form.pincode.trim(),
            country: "BD",
          },
          couponCode: couponResult?.valid ? couponCode.trim() : undefined,
          guestItems: user ? undefined : getGuestCartForCheckout(),
        },
      });
      // Fallback only — the guest access token normally reaches the order
      // page via the gateway's redirect URL itself (embedded at session
      // init, preserved through the SSLCommerz round trip). This covers the
      // rare case that query string is dropped somewhere along the way.
      if (typeof window !== "undefined" && result.guestToken) {
        window.sessionStorage.setItem(`saaj.guest_token.${result.reference}`, result.guestToken);
      }
      window.location.href = result.gatewayUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't place your order. Please try again.");
      setPlacing(false);
    }
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

        {cartLoading ? (
          <div className="mt-16 saaj-skeleton h-40" />
        ) : lines.length === 0 ? (
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
                  <div>
                    {user && addressesQuery.data && addressesQuery.data.length > 0 ? (
                      <div className="mb-8 flex flex-wrap gap-3">
                        {addressesQuery.data.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => applyAddress(a)}
                            className="border border-saaj-line px-4 py-2 text-[0.625rem] tracking-[0.2em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
                          >
                            {a.label.toUpperCase()} — {a.city}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                      {FIELDS.map((f) => (
                        <div key={f.key} className={f.half ? "sm:col-span-1" : "sm:col-span-2"}>
                          <Field
                            label={f.label}
                            type={f.type}
                            value={form[f.key]}
                            onChange={(v) => set(f.key, v)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="max-w-md">
                    <p className="eyebrow mb-4">Have a coupon?</p>
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <Field label="Coupon code" value={couponCode} onChange={setCouponCode} />
                      </div>
                      <button
                        type="button"
                        disabled={checkingCoupon}
                        onClick={() => void checkCoupon()}
                        className="mb-1 border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
                      >
                        {checkingCoupon ? "CHECKING" : "APPLY"}
                      </button>
                    </div>
                    {couponResult ? (
                      <p className={`mt-4 text-xs ${couponResult.valid ? "text-saaj-champagne" : "text-destructive"}`}>
                        {couponResult.message}
                      </p>
                    ) : (
                      <p className="mt-4 text-xs text-muted-foreground">Optional — leave blank to skip.</p>
                    )}
                    <p className="mt-6 text-xs text-muted-foreground">
                      Payment method (card, bKash, Nagad, Rocket or bank transfer) is chosen on the next,
                      secure SSLCommerz screen.
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <div className="flex flex-col gap-8">
                    <div>
                      <h2 className="eyebrow">Delivering to</h2>
                      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                        {form.name}
                        <br />
                        {form.line1}, {form.city}, {form.state} {form.pincode}
                        <br />
                        {form.phone} — {form.email}
                      </p>
                    </div>
                    <ul className="flex flex-col gap-px bg-saaj-line">
                      {lines.map((line) => (
                        <li
                          key={line.variantId}
                          className="flex items-center justify-between gap-4 bg-background py-4"
                        >
                          <span className="text-xs">
                            {line.name}
                            <span className="ml-3 text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
                              {line.size} × {line.qty}
                            </span>
                          </span>
                          <span className="text-xs text-saaj-champagne">
                            {formatBDT(line.unitPrice * line.qty)}
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
                  disabled={(step === 0 && !detailsValid) || placing}
                  onClick={() => (step === 2 ? void placeOrder() : setStep((s) => s + 1))}
                  className="flex items-center gap-4 border border-saaj-line px-8 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-30 disabled:hover:border-saaj-line disabled:hover:text-foreground"
                >
                  {placing ? (
                    <>
                      Redirecting to payment
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.25} />
                    </>
                  ) : step === 2 ? (
                    <>
                      Pay now
                      <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                    </>
                  )}
                </button>
              </div>
            </div>

            <aside className="h-fit border border-saaj-line p-6">
              <h2 className="eyebrow">Summary</h2>
              <dl className="mt-6 flex flex-col gap-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatBDT(subtotal)}</dd>
                </div>
                {discount > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd className="text-saaj-champagne">−{formatBDT(discount)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{shipping === 0 ? "Complimentary" : formatBDT(shipping)}</dd>
                </div>
              </dl>
              <span className="mt-6 block h-px w-full bg-saaj-line" />
              <div className="mt-6 flex items-baseline justify-between">
                <span className="eyebrow">Total</span>
                <span className="text-sm text-saaj-champagne">{formatBDT(total)}</span>
              </div>
              <p className="mt-6 text-[0.625rem] leading-relaxed tracking-[0.14em] text-muted-foreground">
                COMPLIMENTARY SHIPPING ON ORDERS OVER {formatBDT(SHIPPING_THRESHOLD_BDT)}
              </p>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
