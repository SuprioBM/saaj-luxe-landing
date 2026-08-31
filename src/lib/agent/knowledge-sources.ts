/**
 * SAAJ static business knowledge — the single source list for the RAG layer.
 *
 * This is the authoritative copy of SAAJ's non-transactional knowledge
 * (policies, FAQ, brand, care, how SAAJ Club works). It mirrors the content
 * of the corresponding storefront pages; when a page changes, update it here
 * and re-run ingestion — `replace_knowledge_source` swaps every chunk for
 * that source, so nothing stale is left behind and re-running on unchanged
 * content is a no-op (content-hash dedupe).
 *
 * NEVER put dynamic/transactional data here (prices, stock, orders,
 * membership status, reward balances). Those come from backend tools.
 */

export type KnowledgeSection = { heading: string; body: string[] };

export type KnowledgeSource = {
  source: string; // stable slug
  pageTitle: string;
  pageUrl: string | null;
  lastUpdated: string; // ISO date
  sections: KnowledgeSection[];
};

const UPDATED = "2026-08-31";

export const KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    source: "shipping",
    pageTitle: "Shipping",
    pageUrl: "/shipping",
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "Dispatch",
        body: [
          "Orders are dispatched within 48 working hours. Jewellery that needs re-sizing or engraving adds two to three days; SAAJ emails the customer if that applies.",
        ],
      },
      {
        heading: "Bangladesh delivery",
        body: [
          "Dhaka metro: 1 to 3 working days. Rest of Bangladesh: 3 to 6 working days.",
          "Shipping is complimentary on all orders over 5,000 taka. Below that, a flat 120 taka shipping fee applies at checkout.",
        ],
      },
      {
        heading: "Worldwide shipping",
        body: [
          "SAAJ ships to most countries via tracked express, typically 6 to 12 working days.",
          "International duties and import taxes are payable by the recipient and are not included at checkout.",
        ],
      },
      {
        heading: "Tracking",
        body: [
          "A tracking link is emailed the moment the parcel is scanned. If it has not moved in 72 hours, the customer should email care@saaj.studio and SAAJ will chase it.",
        ],
      },
    ],
  },
  {
    source: "return-policy",
    pageTitle: "Returns & Exchanges Policy",
    pageUrl: "/returns",
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "Return window and eligibility",
        body: [
          "Customers have 14 days from delivery to request a return or exchange.",
          "Items must be unworn, unaltered and returned with tags, pouch and box.",
        ],
      },
      {
        heading: "Size exchanges",
        body: [
          "The first size exchange on shirts is free within Bangladesh.",
          "SAAJ reserves the customer's new size for seven days while the original is in transit.",
        ],
      },
      {
        heading: "Refunds",
        body: [
          "Once a returned parcel is inspected, refunds are issued to the original payment method within 5 to 7 working days.",
          "Shipping charges are non-refundable unless the piece arrived faulty.",
        ],
      },
      {
        heading: "Items that cannot be returned",
        body: [
          "Engraved or custom-sized jewellery, earrings (for hygiene reasons), and pieces bought in a final-sale drop are not returnable.",
        ],
      },
      {
        heading: "How to start a return",
        body: [
          "Email care@saaj.studio with the order number and the piece to be returned. SAAJ replies within one business day with a prepaid label where applicable.",
        ],
      },
    ],
  },
  {
    source: "terms",
    pageTitle: "Terms of Service",
    pageUrl: "/terms",
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "Orders",
        body: [
          "An order is an offer to buy. It is accepted when SAAJ confirms dispatch. If a piece sells out between the order and confirmation, SAAJ cancels and refunds in full.",
        ],
      },
      {
        heading: "Pricing",
        body: [
          "Prices are in Bangladeshi Taka and include applicable taxes unless stated. SAAJ may correct obvious pricing errors before dispatch and will always tell the customer first.",
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
          "All imagery, copy, designs and the SAAJ name belong to SAAJ. Commercial reuse requires written permission.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "SAAJ's liability for any order is limited to the amount paid for that order. Nothing limits rights the customer has under applicable consumer law.",
        ],
      },
    ],
  },
  {
    source: "privacy",
    pageTitle: "Privacy Policy",
    pageUrl: "/privacy",
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "What SAAJ collects",
        body: [
          "Name, email, phone, delivery address and order history. Contact correspondence is kept so SAAJ can pick up where it left off.",
          "For signed-in customers, the bag and saved pieces are stored on SAAJ servers so they follow the customer across devices. Recently viewed items stay local to the browser.",
        ],
      },
      {
        heading: "Payments and privacy",
        body: [
          "For online payment, bKash details are handled directly by bKash and are never stored on SAAJ systems.",
          "For Cash on Delivery, no payment details are collected online — payment is made directly to the courier on delivery.",
        ],
      },
      {
        heading: "How SAAJ uses data",
        body: [
          "To fulfil orders, provide client care, prevent fraud and — only with opt-in — send occasional drop announcements. Every email has one-click unsubscribe.",
        ],
      },
      {
        heading: "Data sharing and rights",
        body: [
          "SAAJ shares only what a courier or payment processor needs to complete an order, and does not sell or rent personal data.",
          "To access, correct or delete data, email care@saaj.studio. Requests are actioned within 30 days.",
        ],
      },
    ],
  },
  {
    source: "about",
    pageTitle: "About SAAJ",
    pageUrl: "/about",
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "Brand philosophy",
        body: [
          "SAAJ is a dark, editorial menswear house making shirts and sterling silver for people who dress with intent.",
          "SAAJ began with one shirt and one chain for a circle of people tired of loud logos: pieces heavy enough to feel, quiet enough to wear every day, dark enough to disappear into a room and still hold it.",
        ],
      },
      {
        heading: "How SAAJ makes things",
        body: [
          "Small runs — nothing is made in volume. When a piece sells out, it stays out until it earns a rerun.",
          "Honest material — solid 925 sterling silver, real linen, garment-dyed cotton. No plating, no filler.",
          "Finished by hand — every clasp, hem and face is checked by a person before it leaves Dhaka.",
        ],
      },
      {
        heading: "Where SAAJ is made",
        body: [
          "Shirts are cut and sewn in Bangladesh. Silver is hand-finished in Dhaka by a workshop SAAJ has worked with since the first run. The chain is short: designer to workshop to customer.",
        ],
      },
    ],
  },
  {
    source: "contact",
    pageTitle: "Contact & Client Care",
    pageUrl: "/contact",
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "How to reach SAAJ",
        body: [
          "Client care email: care@saaj.studio. SAAJ replies within one business day.",
          "WhatsApp: +880 1900-000000. Atelier: Gulshan, Dhaka — by appointment.",
          "Client care can help with sizing, orders, repairs and wholesale.",
        ],
      },
    ],
  },
  {
    source: "product-care",
    pageTitle: "Product Care",
    pageUrl: null,
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "Sterling silver care",
        body: [
          "SAAJ jewellery is solid 925 sterling silver. Silver naturally tarnishes with air and skin contact; this is normal and reversible.",
          "Wipe pieces with the supplied polishing cloth to bring back shine. Store in the pouch or box, away from humidity, when not worn.",
          "Remove jewellery before swimming, showering, sleeping, or using perfume and hand sanitiser, as chemicals accelerate tarnish.",
        ],
      },
      {
        heading: "Shirt care",
        body: [
          "Cold hand wash or a gentle machine cycle. Dry flat, reshape while damp, and use a warm iron.",
          "Wash dark garment-dyed cotton separately for the first few washes. Do not tumble dry.",
        ],
      },
    ],
  },
  {
    source: "faq",
    pageTitle: "Frequently Asked Questions",
    pageUrl: null,
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "Payment methods",
        body: [
          "SAAJ accepts bKash for online payment and Cash on Delivery. The payment method is chosen at checkout.",
          "For Cash on Delivery, the customer pays the courier on delivery. For bKash, the customer is redirected to bKash and the order is confirmed once payment is verified.",
        ],
      },
      {
        heading: "Guest checkout and order tracking",
        body: [
          "Customers can check out as a guest. A tracking link is emailed after the order is placed; it works without signing in.",
          "If a guest loses the tracking link, they can request a new one from the order page using the order number and the email used at checkout.",
        ],
      },
      {
        heading: "Cancelling an order",
        body: [
          "An order can be cancelled while it is pending, processing, or paid (awaiting fulfilment). Once it is shipped or delivered it can no longer be cancelled.",
          "Customers cancel from the order page. If a bKash payment was already captured on a cancelled order, SAAJ processes the refund manually.",
        ],
      },
      {
        heading: "Sizing",
        body: [
          "Shirts follow a relaxed fit that drops from the shoulder. Ring sizes and chain lengths are listed on each product page.",
          "The first shirt size exchange within Bangladesh is free — see the returns policy.",
        ],
      },
    ],
  },
  {
    source: "saaj-club",
    pageTitle: "SAAJ Club — Membership",
    pageUrl: "/club",
    lastUpdated: UPDATED,
    sections: [
      {
        heading: "What SAAJ Club is",
        body: [
          "SAAJ Club is a paid monthly membership that gives access to a more exclusive layer of SAAJ. The tagline is: for the few.",
          "It is completely optional — anyone can shop SAAJ without joining. Being signed in does not make someone a member; membership is a separate paid subscription.",
        ],
      },
      {
        heading: "SAAJ Club benefits",
        body: [
          "Member pricing: a member discount on eligible pieces, applied automatically at checkout.",
          "Exclusive drops: pieces only members can buy.",
          "Early access: members can buy new drops before the public release date.",
          "Members-only sales: private offers.",
          "Reward points: members earn points on eligible purchases and can see the balance in their account.",
          "Birthday reward: members with a date of birth on file receive reward points in their birthday month.",
          "The exact price, discount percentage and points rate are configured by SAAJ and should be read from the live membership configuration, not assumed.",
        ],
      },
      {
        heading: "How to join SAAJ Club",
        body: [
          "The customer must be signed in. From the SAAJ Club page they pay the monthly fee with bKash.",
          "Membership activates only after the payment is verified by the backend — never on the redirect alone.",
        ],
      },
      {
        heading: "Renewal and cancellation",
        body: [
          "bKash does not support automatic recurring billing, so SAAJ Club renews manually: the customer pays again to extend for another month. The system never claims the membership auto-renews.",
          "Cancelling turns off renewal. Benefits stay active until the end of the current paid period, then the membership expires. The customer is not charged again after cancelling.",
          "Members manage or cancel their membership from Account, then SAAJ Club, then Manage membership.",
        ],
      },
      {
        heading: "Reward points",
        body: [
          "Points are earned on eligible merchandise spend after any discounts, and are credited once the order reaches a completed state (paid, shipped or delivered).",
          "If an order that earned points is cancelled or refunded, the points are reversed.",
          "Points are visible in Account, then SAAJ Club. The exact earn rate is set in the live membership configuration.",
        ],
      },
    ],
  },
];
