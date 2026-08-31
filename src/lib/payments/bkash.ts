/**
 * bKash integration — online payments, replacing PortPos.
 *
 * Uses bKash's "Tokenized Checkout (URL based)" API, v1.2.0-beta — the
 * current officially-supported redirect-based checkout product (mode
 * "0011"). Plain `fetch`, no SDK, mirroring the shape of the PortPos module
 * this replaces. Endpoint paths/payload shapes below were cross-checked
 * against a maintained open-source TypeScript client for this exact API
 * (https://github.com/ShejanMahamud/bkash-js) since bKash has no public
 * sandbox docs page — **double-check them against the Postman collection /
 * integration guide bKash gives you at merchant onboarding** before going
 * live; `statusCode "0000"` = success is the one bit every source agrees on.
 *
 * Flow: grant/refresh an id_token (cached in memory, best-effort — a cold
 * serverless instance just grants a fresh one) → create a payment
 * (returns `paymentID` + `bkashURL` to redirect the customer to) → the
 * customer pays in the bKash app/web flow → bKash redirects the browser
 * back to our bare callback URL with `?paymentID=&status=` appended →
 * we authoritatively resolve that payment via bKash's own query/execute
 * endpoints (never trusting `status` on its own) before ever marking an
 * order paid.
 *
 * Unlike PortPos's `ipn_url`/`redirect_url`, there is no separate
 * server-to-server callback in this API — bKash's query/execute endpoints
 * *are* the authoritative check, called directly by us. And unlike
 * PortPos's invoice id embedded in a return-URL query string, we don't
 * thread our own params through `callbackURL` at all: bKash's documented
 * behaviour is to simply append `paymentID`/`status`, and there's no
 * confirmed guarantee it merges correctly with a URL that already has a
 * `?query`. Instead the payment row itself (`payments.gateway_session_id`)
 * is the correlation key — see initBkashPayment / the callback route.
 */

const SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta/";
const LIVE_BASE = "https://tokenized.pay.bka.sh/v1.2.0-beta/";

function isSandbox(): boolean {
  return (process.env.BKASH_MODE ?? "sandbox") !== "live";
}

function apiBase(): string {
  const override = process.env.BKASH_BASE_URL?.trim();
  if (override) return override.endsWith("/") ? override : `${override}/`;
  return isSandbox() ? SANDBOX_BASE : LIVE_BASE;
}

function siteUrl(): string {
  // Same VITE_SITE_URL every other callback URL in this app is built from.
  return (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(
    /\/$/,
    "",
  );
}

type CredentialName = "BKASH_APP_KEY" | "BKASH_APP_SECRET" | "BKASH_USERNAME" | "BKASH_PASSWORD";

function requireCredential(name: CredentialName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      "Online payment is not configured yet. Please choose Cash on Delivery, or try again shortly.",
    );
  }
  return value;
}

/* ------------------------------------------------------------- tokens --- */

type TokenCache = { idToken: string; refreshToken: string; expiresAt: number };
let cachedToken: TokenCache | null = null;

type GrantResponse = {
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  statusCode?: string;
  statusMessage?: string;
};

async function postJson<T>(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Payment gateway is unavailable right now. Please try again shortly.");
  }
  const json = (await res.json().catch(() => null)) as T | null;
  if (!json) {
    throw new Error("Payment gateway is unavailable right now. Please try again shortly.");
  }
  return json;
}

async function grantToken(): Promise<TokenCache> {
  const appKey = requireCredential("BKASH_APP_KEY");
  const appSecret = requireCredential("BKASH_APP_SECRET");
  const username = requireCredential("BKASH_USERNAME");
  const password = requireCredential("BKASH_PASSWORD");

  const json = await postJson<GrantResponse>(
    "tokenized/checkout/token/grant",
    { app_key: appKey, app_secret: appSecret },
    { username, password },
  );

  if (json.statusCode && json.statusCode !== "0000") {
    throw new Error(json.statusMessage || "Could not start the payment session.");
  }
  if (!json.id_token || !json.refresh_token) {
    throw new Error("Could not start the payment session.");
  }

  return {
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

async function refreshToken(refresh_token: string): Promise<TokenCache> {
  const appKey = requireCredential("BKASH_APP_KEY");
  const appSecret = requireCredential("BKASH_APP_SECRET");
  const username = requireCredential("BKASH_USERNAME");
  const password = requireCredential("BKASH_PASSWORD");

  const json = await postJson<GrantResponse>(
    "tokenized/checkout/token/refresh",
    { app_key: appKey, app_secret: appSecret, refresh_token },
    { username, password },
  );

  if (json.statusCode && json.statusCode !== "0000") {
    throw new Error(json.statusMessage || "Could not refresh the payment session.");
  }
  if (!json.id_token) {
    throw new Error("Could not refresh the payment session.");
  }

  return {
    idToken: json.id_token,
    refreshToken: json.refresh_token ?? refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

async function getIdToken(): Promise<string> {
  const now = Date.now();
  // 60s safety buffer before expiry.
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.idToken;
  }
  if (cachedToken?.refreshToken) {
    try {
      cachedToken = await refreshToken(cachedToken.refreshToken);
      return cachedToken.idToken;
    } catch {
      // Refresh token may itself have expired — fall through to a fresh grant.
    }
  }
  cachedToken = await grantToken();
  return cachedToken.idToken;
}

async function authedHeaders(): Promise<Record<string, string>> {
  const [idToken, appKey] = await Promise.all([
    getIdToken(),
    Promise.resolve(requireCredential("BKASH_APP_KEY")),
  ]);
  return { Authorization: idToken, "X-App-Key": appKey };
}

/* ----------------------------------------------------------- payments --- */

export type BkashCustomer = { name: string; email: string; phone: string };

type CreatePaymentResponse = {
  paymentID?: string;
  bkashURL?: string;
  statusCode?: string;
  statusMessage?: string;
};

export async function initBkashPayment(input: {
  reference: string;
  amount: number;
  customer: BkashCustomer;
}): Promise<{ paymentID: string; gatewayUrl: string }> {
  const headers = await authedHeaders();

  const json = await postJson<CreatePaymentResponse>(
    "tokenized/checkout/create",
    {
      mode: "0011",
      payerReference: input.customer.phone,
      callbackURL: `${siteUrl()}/api/public/payments/bkash/callback`,
      amount: input.amount.toFixed(2),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: input.reference,
    },
    headers,
  );

  if (json.statusCode !== "0000" || !json.paymentID || !json.bkashURL) {
    throw new Error(json.statusMessage || "Could not start the payment session.");
  }

  return { paymentID: json.paymentID, gatewayUrl: json.bkashURL };
}

type BkashTransactionResult = {
  statusCode?: string;
  transactionStatus?: string;
  paymentID?: string;
  trxID?: string;
  amount?: string;
  currency?: string;
  merchantInvoice?: string;
  merchantInvoiceNumber?: string;
};

async function queryBkashPayment(paymentID: string): Promise<BkashTransactionResult | null> {
  try {
    const headers = await authedHeaders();
    return await postJson<BkashTransactionResult>(
      "tokenized/checkout/payment/status",
      { paymentID },
      headers,
    );
  } catch {
    return null;
  }
}

async function executeBkashPayment(paymentID: string): Promise<BkashTransactionResult | null> {
  try {
    const headers = await authedHeaders();
    return await postJson<BkashTransactionResult>(
      "tokenized/checkout/execute",
      { paymentID },
      headers,
    );
  } catch {
    // Most commonly: this paymentID was already executed once (bKash allows
    // exactly one execute call per payment) — the query call below is what
    // recovers the authoritative status in that case, not this.
    return null;
  }
}

/**
 * Authoritatively resolve a bKash payment — never trusts the browser
 * callback's own `status` param for the *paid* decision, only for whether
 * it's worth calling bKash at all. Query-first, since a payment can only be
 * executed once: a refreshed/retried callback hit must not call execute
 * again on an already-completed payment (bKash rejects that outright), so
 * we check the current state before ever attempting to execute it.
 */
export async function validateBkashTransaction(
  paymentID: string,
  expectedAmount: number,
  expectedReference: string,
): Promise<{
  valid: boolean;
  amount: number | null;
  currency: string | null;
  trxId: string | null;
  raw: unknown;
}> {
  let result = await queryBkashPayment(paymentID);

  if (result?.transactionStatus !== "Completed") {
    const executed = await executeBkashPayment(paymentID);
    if (executed) {
      result = executed;
    } else {
      // Execute failed outright (e.g. "already executed" on a retried hit,
      // or a transient error) — re-query once more before giving up; if an
      // earlier request already completed it, this is what finds that out.
      result = (await queryBkashPayment(paymentID)) ?? result;
    }
  }

  const invoiceMatches = result?.merchantInvoice
    ? result.merchantInvoice === expectedReference
    : result?.merchantInvoiceNumber
      ? result.merchantInvoiceNumber === expectedReference
      : true;

  const valid = Boolean(
    result &&
    result.statusCode === "0000" &&
    result.transactionStatus === "Completed" &&
    result.paymentID === paymentID &&
    invoiceMatches &&
    result.amount !== undefined &&
    Math.abs(Number(result.amount) - expectedAmount) < 0.01,
  );

  return {
    valid,
    amount: result?.amount !== undefined ? Number(result.amount) : null,
    currency: result?.currency ?? null,
    trxId: result?.trxID ?? null,
    raw: result,
  };
}
