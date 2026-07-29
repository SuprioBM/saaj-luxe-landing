import catShirts from "@/assets/cat-shirts.jpg";
import catChains from "@/assets/cat-chains.jpg";
import catRings from "@/assets/cat-rings.jpg";
import catBracelets from "@/assets/cat-bracelets.jpg";
import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";
import p4 from "@/assets/p4.jpg";
import p5 from "@/assets/p5.jpg";

export type Category = {
  n: string;
  slug: string;
  title: string;
  copy: [string, string];
  cta: string;
  img: string;
  blurb: string;
};

export type Product = {
  slug: string;
  name: string;
  price: number;
  category: string;
  img: string;
  isNew?: boolean;
  detail: string;
  materials: string[];
};

export const CATEGORIES: Category[] = [
  {
    n: "01",
    slug: "shirts",
    title: "Shirts",
    copy: ["Timeless fits,", "modern silhouettes."],
    cta: "Shop Shirts",
    img: catShirts,
    blurb: "Crinkle cottons and structured linens cut for shoulders, shadow and stance.",
  },
  {
    n: "02",
    slug: "neckchains",
    title: "Neckchains",
    copy: ["Wear meaning,", "carry confidence."],
    cta: "Shop Neckchains",
    img: catChains,
    blurb: "Solid silver links, weighted for presence and finished to catch low light.",
  },
  {
    n: "03",
    slug: "rings",
    title: "Rings",
    copy: ["Small details,", "big statements."],
    cta: "Shop Rings",
    img: catRings,
    blurb: "Signets and bands with hand-finished faces — small objects, long memory.",
  },
  {
    n: "04",
    slug: "bracelets",
    title: "Bracelets",
    copy: ["Subtle, strong,", "unapologetic."],
    cta: "Shop Bracelets",
    img: catBracelets,
    blurb: "Quiet weight at the wrist. Built to be worn every day, and every night.",
  },
];

export const PRODUCTS: Product[] = [
  {
    slug: "noir-crinkle-shirt",
    name: "Noir Crinkle Shirt",
    price: 2699,
    category: "shirts",
    img: p1,
    detail:
      "A relaxed crinkle-cotton shirt with a soft collar and mother-of-pearl buttons. Cut to fall away from the body, made to be worn open.",
    materials: ["100% crinkle cotton", "Relaxed fit", "Garment dyed in black"],
  },
  {
    slug: "linen-structure-shirt",
    name: "Linen Structure Shirt",
    price: 2799,
    category: "shirts",
    img: p2,
    isNew: true,
    detail:
      "Mid-weight linen with a defined shoulder and a straight hem. Breathes in heat, holds its line in photographs.",
    materials: ["Pure European linen", "Structured shoulder", "Straight hem"],
  },
  {
    slug: "rope-chain-3mm",
    name: "Rope Chain 3mm",
    price: 1899,
    category: "neckchains",
    img: p3,
    detail:
      "A 3mm rope link in solid 925 silver, polished to a low, liquid shine. Sits just below the collarbone.",
    materials: ["925 sterling silver", "3mm rope link", "Lobster clasp"],
  },
  {
    slug: "obsidian-signet-ring",
    name: "Obsidian Signet Ring",
    price: 1499,
    category: "rings",
    img: p4,
    detail:
      "A flat-faced signet with a blackened finish. Weighted band, softened edges, unmarked face.",
    materials: ["925 sterling silver", "Blackened finish", "Sizes 16–22"],
  },
  {
    slug: "void-chain-bracelet",
    name: "Void Chain Bracelet",
    price: 1799,
    category: "bracelets",
    img: p5,
    detail:
      "A tight-link bracelet with a matte body and polished clasp. Quiet on its own, sharp beside a chain.",
    materials: ["925 sterling silver", "Matte link body", "Adjustable 19–21cm"],
  },
];

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const productsByCategory = (slug: string) =>
  PRODUCTS.filter((p) => p.category === slug);

export const findProduct = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

export const findCategory = (slug: string) => CATEGORIES.find((c) => c.slug === slug);
