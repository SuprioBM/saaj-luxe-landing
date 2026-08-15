import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/PolicyPage";

const TITLE = "Terms of Service — SAAJ";
const DESCRIPTION = "The terms that govern purchases from SAAJ and use of this website.";

export const Route = createFileRoute("/terms")({
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
      eyebrow="Terms"
      title="The short"
      accent="version."
      intro="By ordering from SAAJ or using this site, you agree to the following. We have kept it as plain as the law allows."
      sections={[
        {
          heading: "Orders",
          body: [
            "An order is an offer to buy. It is accepted when we confirm dispatch. If a piece sells out between your order and our confirmation, we cancel and refund in full.",
          ],
        },
        {
          heading: "Pricing",
          body: [
            "Prices are in Bangladeshi Taka (৳) and include applicable taxes unless stated. We may correct obvious pricing errors before dispatch and will always tell you first.",
          ],
        },
        {
          heading: "Product representation",
          body: [
            "Sterling silver and natural fibres vary slightly piece to piece. Screen colour and finish may differ marginally from what arrives; this is not a fault.",
          ],
        },
        {
          heading: "Intellectual property",
          body: [
            "All imagery, copy, designs and the SAAJ name belong to SAAJ. Reuse for commercial purposes requires written permission.",
          ],
        },
        {
          heading: "Liability",
          body: [
            "Our liability for any order is limited to the amount paid for that order. Nothing here limits rights you have under applicable consumer law.",
          ],
        },
        {
          heading: "Contact",
          body: ["Questions about these terms: care@saaj.studio."],
        },
      ]}
    />
  ),
});
