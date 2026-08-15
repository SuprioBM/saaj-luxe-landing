/**
 * SSLCommerz integration — the dominant Bangladesh payment aggregator
 * (cards, bKash, Nagad, Rocket, bank transfer behind one gateway session).
 * Plain `fetch` against their REST API; no SDK needed (Workers-compatible).
 *
 * Defaults to SSLCommerz's published sandbox demo store (`testbox`/`qwerty`)
 * so checkout is testable out of the box. Set SSLCOMMERZ_STORE_ID /
 * SSLCOMMERZ_STORE_PASSWORD / SSLCOMMERZ_SANDBOX=false for a real store.
 */

const SANDBOX_BASE = "https://sandbox.sslcommerz.com";
const LIVE_BASE = "https://securepay.sslcommerz.com";

function isSandbox(): boolean {
  return (process.env.SSLCOMMERZ_SANDBOX ?? "true") !== "false";
}
function storeId(): string {
  return process.env.SSLCOMMERZ_STORE_ID || "testbox";
}
function storePassword(): string {
  return process.env.SSLCOMMERZ_STORE_PASSWORD || "qwerty";
}
function baseUrl(): string {
  return isSandbox() ? SANDBOX_BASE : LIVE_BASE;
}
function siteUrl(): string {
  // Same VITE_SITE_URL the client uses for auth redirects — one variable,
  // read here via process.env since this file only ever runs server-side.
  return (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(
    /\/$/,
    "",
  );
}

export type CheckoutCustomer = { name: string; email: string; phone: string };
export type CheckoutAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export async function initSslCommerzSession(input: {
  orderId: string;
  reference: string;
  amount: number;
  customer: CheckoutCustomer;
  address: CheckoutAddress;
  /** Raw guest access token — embedded (query string, not a form field) in
   * the callback URLs so it survives the SSLCommerz round trip and the
   * webhook can carry it through to the final browser redirect. Omitted
   * for signed-in checkouts, which don't need one. */
  guestToken?: string;
}): Promise<{ gatewayUrl: string; sessionKey: string }> {
  const tokenQs = input.guestToken ? `?t=${encodeURIComponent(input.guestToken)}` : "";
  const params = new URLSearchParams({
    store_id: storeId(),
    store_passwd: storePassword(),
    total_amount: input.amount.toFixed(2),
    currency: "BDT",
    tran_id: input.reference,
    success_url: `${siteUrl()}/api/public/payments/sslcommerz/success${tokenQs}`,
    fail_url: `${siteUrl()}/api/public/payments/sslcommerz/fail${tokenQs}`,
    cancel_url: `${siteUrl()}/api/public/payments/sslcommerz/cancel${tokenQs}`,
    ipn_url: `${siteUrl()}/api/public/payments/sslcommerz/ipn`,
    cus_name: input.customer.name,
    cus_email: input.customer.email,
    cus_add1: input.address.line1,
    cus_add2: input.address.line2 ?? "",
    cus_city: input.address.city,
    cus_state: input.address.state,
    cus_postcode: input.address.pincode,
    cus_country: input.address.country === "BD" ? "Bangladesh" : input.address.country,
    cus_phone: input.customer.phone,
    shipping_method: "NO",
    num_of_item: "1",
    product_name: `SAAJ order ${input.reference}`,
    product_category: "Fashion",
    product_profile: "general",
    value_a: input.orderId,
  });

  const res = await fetch(`${baseUrl()}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error("Payment gateway is unavailable right now. Please try again shortly.");
  }

  const json = (await res.json()) as {
    status?: string;
    GatewayPageURL?: string;
    sessionkey?: string;
    failedreason?: string;
  };

  if (json.status !== "SUCCESS" || !json.GatewayPageURL) {
    throw new Error(json.failedreason || "Could not start the payment session.");
  }

  return { gatewayUrl: json.GatewayPageURL, sessionKey: json.sessionkey ?? "" };
}

/**
 * SSLCommerz doesn't sign IPN payloads (no HMAC) — the authoritative check
 * is calling this Order Validation API back with the val_id and comparing
 * the result. This is the equivalent of Stripe's webhook signature check.
 */
export async function validateSslCommerzTransaction(valId: string): Promise<{
  valid: boolean;
  tranId: string | null;
  amount: number | null;
  currency: string | null;
  raw: unknown;
}> {
  const params = new URLSearchParams({
    val_id: valId,
    store_id: storeId(),
    store_passwd: storePassword(),
    format: "json",
  });
  const res = await fetch(`${baseUrl()}/validator/api/validationserverAPI.php?${params.toString()}`);
  if (!res.ok) {
    return { valid: false, tranId: null, amount: null, currency: null, raw: null };
  }
  const json = (await res.json()) as {
    status?: string;
    tran_id?: string;
    amount?: string;
    currency?: string;
  };
  const valid = json.status === "VALID" || json.status === "VALIDATED";
  return {
    valid,
    tranId: json.tran_id ?? null,
    amount: json.amount ? Number(json.amount) : null,
    currency: json.currency ?? null,
    raw: json,
  };
}
