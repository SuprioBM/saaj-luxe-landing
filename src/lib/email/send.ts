/**
 * SAAJ-branded transactional emails. Table-based, inline-styled HTML (email
 * clients don't reliably support external/embedded CSS) on a light ground —
 * the site's true black theme is deliberately not replicated here, since
 * dark-background HTML email is unreliable across Gmail/Outlook dark-mode
 * auto-inversion. The champagne accent (#d4c5af, converted from the site's
 * oklch token) and the editorial, tracked-uppercase, hairline-rule language
 * carry the brand through instead.
 */

const CHAMPAGNE = "#b89a68"; // slightly deepened from the site token for AA contrast on white
const INK = "#111111";
const MUTED = "#6b6b6b";
const LINE = "#e6e2da";

const formatBDT = (n: number) => {
  const whole = Math.max(0, Math.round(n)).toString();
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `৳${grouped}`;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function emailShell(preheader: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SAAJ</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ee;font-family:Georgia,'Times New Roman',serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${LINE};">
          <tr>
            <td style="padding:40px 40px 24px;text-align:center;border-bottom:1px solid ${LINE};">
              <span style="font-family:Georgia,serif;font-size:24px;letter-spacing:10px;color:${INK};">SAAJ</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 40px;border-top:1px solid ${LINE};text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;color:${MUTED};text-transform:uppercase;">
                Made for the few — SAAJ
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function eyebrow(text: string): string {
  return `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2.5px;color:${CHAMPAGNE};text-transform:uppercase;">${escapeHtml(text)}</p>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr><td style="background:${INK};">
      <a href="${url}" style="display:block;padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2.5px;color:#ffffff;text-decoration:none;text-transform:uppercase;">${escapeHtml(label)} &rarr;</a>
    </td></tr>
  </table>`;
}

function itemsTable(items: { name: string; size: string; qty: number; unitPrice: number }[]): string {
  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${INK};">
          ${escapeHtml(it.name)}<br/>
          <span style="font-size:10px;letter-spacing:1.5px;color:${MUTED};text-transform:uppercase;">${escapeHtml(it.size)} &times; ${it.qty}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${INK};text-align:right;">
          ${formatBDT(it.unitPrice * it.qty)}
        </td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function totalsTable(subtotal: number, discount: number, shipping: number, total: number): string {
  const row = (label: string, value: string, accent = false) => `<tr>
    <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">${label}</td>
    <td style="padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${accent ? CHAMPAGNE : INK};text-align:right;">${value}</td>
  </tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
    ${row("Subtotal", formatBDT(subtotal))}
    ${discount > 0 ? row("Discount", `&minus;${formatBDT(discount)}`, true) : ""}
    ${row("Shipping", shipping === 0 ? "Complimentary" : formatBDT(shipping))}
    <tr><td colspan="2" style="padding-top:10px;border-top:1px solid ${LINE};"></td></tr>
    <tr>
      <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;color:${INK};text-transform:uppercase;">Total</td>
      <td style="padding:6px 0;font-family:Georgia,serif;font-size:16px;color:${CHAMPAGNE};text-align:right;">${formatBDT(total)}</td>
    </tr>
  </table>`;
}

export type EmailOrderItem = { name: string; size: string; qty: number; unitPrice: number };
export type EmailAddress = { line1: string; city: string; state: string; pincode: string };

export async function sendOrderConfirmationEmail(opts: {
  to: string;
  customerName: string;
  reference: string;
  items: EmailOrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  shippingAddress: EmailAddress;
  trackingUrl: string;
}): Promise<boolean> {
  const { sendMail } = await import("@/lib/email/mailer");
  const firstName = opts.customerName.trim().split(" ")[0] || "there";

  const html = emailShell(
    `Your SAAJ order ${opts.reference} is confirmed.`,
    `${eyebrow("Order Confirmed")}
     <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:${INK};">Thank you, ${escapeHtml(firstName)}.</h1>
     <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${MUTED};">
       Your pieces are reserved. Order <strong style="color:${INK};">${escapeHtml(opts.reference)}</strong> has been received and is being prepared — every SAAJ order is hand-checked before dispatch.
     </p>
     ${itemsTable(opts.items)}
     ${totalsTable(opts.subtotal, opts.discount, opts.shipping, opts.total)}
     <div style="margin-top:28px;">
       ${eyebrow("Delivering To")}
       <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${INK};">
         ${escapeHtml(opts.shippingAddress.line1)}<br/>
         ${escapeHtml(opts.shippingAddress.city)}, ${escapeHtml(opts.shippingAddress.state)} ${escapeHtml(opts.shippingAddress.pincode)}
       </p>
     </div>
     ${ctaButton("Track / Manage Order", opts.trackingUrl)}
     <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${MUTED};">
       Keep this email — the link above is how you'll track this order and manage it later.
     </p>`,
  );

  const text = `Thank you, ${firstName}.

Your SAAJ order ${opts.reference} has been received.

Total: ${formatBDT(opts.total)}

Track / manage your order: ${opts.trackingUrl}

Keep this email — the link above is how you'll track this order.`;

  return sendMail({ to: opts.to, subject: `Order confirmed — ${opts.reference} — SAAJ`, html, text });
}

export async function sendOrderCancelledEmail(opts: {
  to: string;
  customerName: string;
  reference: string;
  total: number;
  paymentCaptured: boolean;
  trackingUrl: string;
}): Promise<boolean> {
  const { sendMail } = await import("@/lib/email/mailer");
  const firstName = opts.customerName.trim().split(" ")[0] || "there";

  const html = emailShell(
    `Your SAAJ order ${opts.reference} has been cancelled.`,
    `${eyebrow("Order Cancelled")}
     <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:${INK};">Order ${escapeHtml(opts.reference)}.</h1>
     <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${MUTED};">
       This order has been cancelled as requested.
       ${
         opts.paymentCaptured
           ? "Your payment had already been captured — our team will process your refund manually and you'll be notified once it's complete."
           : "No payment was captured for this order."
       }
     </p>
     ${ctaButton("View Order", opts.trackingUrl)}`,
  );

  const text = `Order ${opts.reference} has been cancelled.

${opts.paymentCaptured ? "Your payment had already been captured — our team will process your refund manually." : "No payment was captured for this order."}

View order: ${opts.trackingUrl}`;

  return sendMail({ to: opts.to, subject: `Order cancelled — ${opts.reference} — SAAJ`, html, text });
}

export async function sendTrackingLinkEmail(opts: {
  to: string;
  reference: string;
  trackingUrl: string;
}): Promise<boolean> {
  const { sendMail } = await import("@/lib/email/mailer");

  const html = emailShell(
    `Your SAAJ order tracking link for ${opts.reference}.`,
    `${eyebrow("Order Tracking")}
     <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:${INK};">Here's your link.</h1>
     <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${MUTED};">
       You requested a fresh tracking link for order <strong style="color:${INK};">${escapeHtml(opts.reference)}</strong>. Use the button below to view its status and manage it.
     </p>
     ${ctaButton("Track / Manage Order", opts.trackingUrl)}
     <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${MUTED};">
       If you didn't request this, you can safely ignore this email — your order is unaffected.
     </p>`,
  );

  const text = `Here's your tracking link for order ${opts.reference}:

${opts.trackingUrl}

If you didn't request this, you can safely ignore this email.`;

  return sendMail({ to: opts.to, subject: `Your tracking link — ${opts.reference} — SAAJ`, html, text });
}
