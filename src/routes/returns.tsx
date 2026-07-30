import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/PolicyPage";

const TITLE = "Returns & Exchanges — SAAJ";
const DESCRIPTION =
  "SAAJ 14-day returns, free size exchanges on shirts, and how to start a return.";

export const Route = createFileRoute("/returns")({
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
      eyebrow="Returns"
      title="Fourteen days,"
      accent="no interrogation."
      intro="If a piece isn't right, send it back. We only ask that it comes home unworn and in its original packaging."
      sections={[
        {
          heading: "Window",
          body: [
            "You have 14 days from delivery to request a return or exchange. Items must be unworn, unaltered and returned with tags, pouch and box.",
          ],
        },
        {
          heading: "Size exchanges",
          body: [
            "First size exchange on shirts is free within India. We reserve your new size for seven days while the original is in transit.",
          ],
        },
        {
          heading: "Refunds",
          body: [
            "Once your parcel is inspected, refunds are issued to the original payment method within 5–7 working days. Shipping charges are non-refundable unless the piece arrived faulty.",
          ],
        },
        {
          heading: "Not returnable",
          body: [
            "Engraved or custom-sized jewellery, earrings for hygiene reasons, and pieces bought in a final-sale drop.",
          ],
        },
        {
          heading: "How to start",
          body: [
            "Email care@saaj.studio with your order number and the piece you'd like to return. We reply within one business day with a prepaid label where applicable.",
          ],
        },
      ]}
    />
  ),
});
