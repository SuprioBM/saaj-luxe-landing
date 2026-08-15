import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/PolicyPage";

const TITLE = "Shipping — SAAJ";
const DESCRIPTION =
  "SAAJ shipping timelines, complimentary delivery over ৳5,000, and worldwide dispatch details.";

export const Route = createFileRoute("/shipping")({
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
      eyebrow="Shipping"
      title="Packed by hand,"
      accent="tracked end to end."
      intro="Every order is checked, polished and boxed before it leaves the atelier. Here is exactly what to expect once you place it."
      sections={[
        {
          heading: "Dispatch",
          body: [
            "Orders are dispatched within 48 working hours. Jewellery that needs re-sizing or engraving adds two to three days; we email you if that applies.",
          ],
        },
        {
          heading: "Bangladesh delivery",
          body: [
            "Dhaka metro: 1–3 working days. Rest of Bangladesh: 3–6 working days.",
            "Complimentary shipping on all orders over ৳5,000. Below that, a flat ৳120 applies at checkout.",
          ],
        },
        {
          heading: "Worldwide",
          body: [
            "We ship to most countries via tracked express, typically 6–12 working days.",
            "International duties and import taxes are payable by the recipient and are not included at checkout.",
          ],
        },
        {
          heading: "Tracking",
          body: [
            "A tracking link is emailed the moment your parcel is scanned. If it hasn't moved in 72 hours, write to care@saaj.studio and we will chase it for you.",
          ],
        },
      ]}
    />
  ),
});
