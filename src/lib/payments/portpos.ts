/**
 * PortPos integration — online payments (cards, bKash/Nexus, net banking)
 * for SAAJ's small-capital launch stage: ৳0 setup, ৳0 monthly, per-txn fee
 * only. Plain `fetch` against their REST API; no SDK needed (Workers-
 * compatible), mirroring the shape of the old SSLCommerz module this
 * replaces.
 *
 * API surface confirmed against PortPos's public docs and the open-source
 * PortWallet PHP SDK (PortPos is PortWallet's current brand — same API
 * family): POST /payment/v2/invoice to create an invoice, GET
 * /payment/v2/invoice/ipn/{invoiceId}/{amount} to authoritatively verify a
 * transaction (the "amount" is a path parameter PortPos itself checks
 * against what was actually paid — this is the equivalent of SSLCommerz's
 * Order Validation API / a webhook signature check). Every request is
 * authenticated with a Bearer token built from the merchant's app key and
 * secret: `Bearer base64(appKey:md5(secret + unixTimestamp))`.
 *
 * There is no public PortPos sandbox demo store (unlike SSLCommerz's
 * `testbox`/`qwerty`) — PORTPOS_APP_KEY/PORTPOS_SECRET must be set to a
 * real (sandbox or live) merchant application's credentials for checkout to
 * work at all; see .env.example.
 */

const SANDBOX_API_BASE = "https://api-sandbox.portpos.com/payment/";
const LIVE_API_BASE = "https://api.portpos.com/payment/";
const SANDBOX_PAYMENT_BASE = "https://payment-sandbox.portpos.com/payment/";
const LIVE_PAYMENT_BASE = "https://payment.portpos.com/payment/";
const API_VERSION = "v2";

function isSandbox(): boolean {
  return (process.env.PORTPOS_MODE ?? "sandbox") !== "live";
}
function apiBase(): string {
  return isSandbox() ? SANDBOX_API_BASE : LIVE_API_BASE;
}
function paymentBase(): string {
  return isSandbox() ? SANDBOX_PAYMENT_BASE : LIVE_PAYMENT_BASE;
}
function siteUrl(): string {
  // Same VITE_SITE_URL every other callback URL in this app is built from.
  return (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(
    /\/$/,
    "",
  );
}

function requireCredential(name: "PORTPOS_APP_KEY" | "PORTPOS_SECRET"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error("Online payment is not configured yet. Please choose Cash on Delivery, or try again shortly.");
  }
  return value;
}

async function authHeader(): Promise<string> {
  const { createHash } = await import("node:crypto");
  const appKey = requireCredential("PORTPOS_APP_KEY");
  const secret = requireCredential("PORTPOS_SECRET");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hash = createHash("md5").update(secret + timestamp, "utf8").digest("hex");
  const token = Buffer.from(`${appKey}:${hash}`, "utf8").toString("base64");
  return `Bearer ${token}`;
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

export async function initPortPosInvoice(input: {
  orderId: string;
  reference: string;
  amount: number;
  customer: CheckoutCustomer;
  address: CheckoutAddress;
  /** Raw guest access token — embedded (query string) in the redirect/IPN
   * URLs so it survives the PortPos round trip, same technique the old
   * SSLCommerz integration used. Omitted for signed-in checkouts. */
  guestToken?: string;
}): Promise<{ invoiceId: string; gatewayUrl: string }> {
  const qs = new URLSearchParams({ ref: input.reference });
  if (input.guestToken) qs.set("t", input.guestToken);

  const billingCustomer = {
    name: input.customer.name,
    email: input.customer.email,
    phone: input.customer.phone,
    address: {
      street: input.address.line1,
      city: input.address.city,
      state: input.address.state,
      zipcode: input.address.pincode,
      country: input.address.country === "BD" ? "Bangladesh" : input.address.country,
    },
  };

  const body = {
    order: {
      amount: input.amount,
      currency: "BDT",
      redirect_url: `${siteUrl()}/api/public/payments/portpos/return?${qs.toString()}`,
      ipn_url: `${siteUrl()}/api/public/payments/portpos/ipn?${qs.toString()}`,
      reference: input.reference,
      validity: 3600,
    },
    product: {
      name: `SAAJ order ${input.reference}`,
      description: "SAAJ — editorial luxury shirts & jewellery",
    },
    billing: { customer: billingCustomer },
    shipping: { customer: billingCustomer },
  };

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${API_VERSION}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: await authHeader() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Payment gateway is unavailable right now. Please try again shortly.");
  }

  if (!res.ok) {
    throw new Error("Payment gateway is unavailable right now. Please try again shortly.");
  }

  const json = (await res.json().catch(() => null)) as {
    result?: string;
    data?: { invoice_id?: string };
    message?: string;
  } | null;

  const invoiceId = json?.data?.invoice_id;
  if (json?.result !== "success" || !invoiceId) {
    throw new Error(json?.message || "Could not start the payment session.");
  }

  return { invoiceId, gatewayUrl: `${paymentBase()}${invoiceId}` };
}

/**
 * PortPos doesn't sign its redirect/IPN callbacks — the authoritative check
 * is this GET call, with the amount WE expect (never anything from the
 * incoming request) as part of the URL. PortPos itself confirms whether
 * that invoice actually has a successful "purchase" transaction for that
 * exact amount.
 */
export async function validatePortPosTransaction(
  invoiceId: string,
  expectedAmount: number,
): Promise<{ valid: boolean; amount: number | null; currency: string | null; raw: unknown }> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase()}${API_VERSION}/invoice/ipn/${encodeURIComponent(invoiceId)}/${expectedAmount.toFixed(2)}`,
      { headers: { Authorization: await authHeader() } },
    );
  } catch {
    return { valid: false, amount: null, currency: null, raw: null };
  }

  if (!res.ok) {
    return { valid: false, amount: null, currency: null, raw: null };
  }

  const json = (await res.json().catch(() => null)) as {
    result?: string;
    data?: {
      status?: string;
      amount?: number | string;
      currency?: string;
      transactions?: { type?: string; status?: string }[];
    };
  } | null;

  const data = json?.data;
  const hasAcceptedPurchase = Boolean(
    data?.transactions?.some((t) => t.type === "purchase" && t.status === "ACCEPTED"),
  );
  const valid = json?.result === "success" && data?.status === "ACCEPTED" && hasAcceptedPurchase;

  return {
    valid: Boolean(valid),
    amount: data?.amount !== undefined ? Number(data.amount) : null,
    currency: data?.currency ?? null,
    raw: json,
  };
}
