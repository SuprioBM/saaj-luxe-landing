import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/PolicyPage";

const TITLE = "Privacy Policy — SAAJ";
const DESCRIPTION = "How SAAJ collects, uses and protects your personal information.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: () => (
    <PolicyPage
      eyebrow="Privacy"
      title="Your data,"
      accent="handled quietly."
      intro="We collect the minimum needed to take an order, deliver it and answer you afterwards. Nothing more, and nothing sold on."
      sections={[
        {
          heading: "What we collect",
          body: [
            "Name, email, phone, delivery address and order history. If you contact us, we keep that correspondence so we can pick up where we left off.",
            "Your bag, saved pieces and recently viewed items are stored locally in your browser, not on our servers.",
          ],
        },
        {
          heading: "Payments",
          body: [
            "Card and UPI details are handled by our payment processor and are never stored on SAAJ systems.",
          ],
        },
        {
          heading: "How we use it",
          body: [
            "To fulfil orders, provide client care, prevent fraud and — only if you opt in — send occasional drop announcements. Every email has a one-click unsubscribe.",
          ],
        },
        {
          heading: "Sharing",
          body: [
            "We share only what a courier or payment processor needs to complete your order. We do not sell or rent personal data to anyone.",
          ],
        },
        {
          heading: "Your rights",
          body: [
            "Write to care@saaj.studio to access, correct or delete your data. We action requests within 30 days.",
          ],
        },
      ]}
    />
  ),
});
