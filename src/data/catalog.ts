import catShirts from "@/assets/cat-shirts.jpg";
import catChains from "@/assets/cat-chains.jpg";
import catRings from "@/assets/cat-rings.jpg";
import catBracelets from "@/assets/cat-bracelets.jpg";
import hero from "@/assets/hero.jpg";
import hero2 from "@/assets/hero-2.jpg";
import hero3 from "@/assets/hero-3.jpg";
import hero4 from "@/assets/hero-4.jpg";
import philosophy from "@/assets/philosophy.jpg";
import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";
import p4 from "@/assets/p4.jpg";
import p5 from "@/assets/p5.jpg";
import p6 from "@/assets/p6.jpg";
import p7 from "@/assets/p7.jpg";
import p8 from "@/assets/p8.jpg";
import p9 from "@/assets/p9.jpg";

export type Category = {
  n: string;
  slug: string;
  title: string;
  copy: [string, string];
  cta: string;
  img: string;
  blurb: string;
};

export type SizeStock = { size: string; stock: number };

export type Review = {
  id: string;
  name: string;
  rating: number;
  date: string;
  verified: boolean;
  title: string;
  body: string;
  photos?: string[];
};

export type Product = {
  slug: string;
  name: string;
  price: number;
  category: string;
  img: string;
  gallery: string[];
  sku: string;
  isNew?: boolean;
  sold: number;
  addedAt: string;
  tags: string[];
  detail: string;
  materials: string[];
  specs: [string, string][];
  sizes: SizeStock[];
  reviews: Review[];
  pairsWith: string[];
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

export const SIZE_SETS: Record<string, string[]> = {
  shirts: ["S", "M", "L", "XL", "XXL"],
  rings: ["Size 6", "Size 7", "Size 8", "Size 9", "Size 10", "Size 11", "Size 12"],
  bracelets: ["Small", "Medium", "Large"],
  neckchains: ["45 cm", "50 cm", "55 cm"],
};

const shirtSpecs: [string, string][] = [
  ["Fit", "Relaxed, drops from the shoulder"],
  ["Collar", "Soft-fused point collar"],
  ["Care", "Cold hand wash, dry flat, warm iron"],
  ["Origin", "Cut & sewn in India"],
];

const metalSpecs: [string, string][] = [
  ["Metal", "925 sterling silver"],
  ["Finish", "Hand-polished, anti-tarnish sealed"],
  ["Care", "Store dry, polish with the enclosed cloth"],
  ["Origin", "Hand-finished in Jaipur"],
];

export const PRODUCTS: Product[] = [
  {
    slug: "noir-crinkle-shirt",
    name: "Noir Crinkle Shirt",
    price: 2699,
    category: "shirts",
    img: p1,
    gallery: [p1, hero4, hero, catShirts],
    sku: "SAAJ-SH-001",
    sold: 214,
    addedAt: "2026-05-12",
    tags: ["black", "cotton", "oversized", "essential"],
    detail:
      "A relaxed crinkle-cotton shirt with a soft collar and mother-of-pearl buttons. Cut to fall away from the body, made to be worn open.",
    materials: ["100% crinkle cotton", "Relaxed fit", "Garment dyed in black"],
    specs: shirtSpecs,
    sizes: [
      { size: "S", stock: 4 },
      { size: "M", stock: 7 },
      { size: "L", stock: 0 },
      { size: "XL", stock: 4 },
      { size: "XXL", stock: 8 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Aarav M.",
        rating: 5,
        date: "2026-06-02",
        verified: true,
        title: "The drape is unreal",
        body: "Fabric moves exactly like the campaign shots. Sized up to XL for the oversized look and it hangs perfectly.",
        photos: [hero4, p1],
      },
      {
        id: "r2",
        name: "Kabir S.",
        rating: 4,
        date: "2026-05-28",
        verified: true,
        title: "Worth it",
        body: "Deep, proper black — no fade after three washes. Collar could be a touch stiffer for my taste.",
      },
      {
        id: "r3",
        name: "Dev R.",
        rating: 5,
        date: "2026-05-19",
        verified: false,
        title: "Every night out",
        body: "Wear it open over a chain. It has become the only shirt I reach for.",
      },
    ],
    pairsWith: ["rope-chain-3mm", "obsidian-signet-ring", "void-chain-bracelet"],
  },
  {
    slug: "linen-structure-shirt",
    name: "Linen Structure Shirt",
    price: 2799,
    category: "shirts",
    img: p2,
    gallery: [p2, hero3, catShirts],
    sku: "SAAJ-SH-002",
    isNew: true,
    sold: 96,
    addedAt: "2026-07-04",
    tags: ["linen", "structured", "summer"],
    detail:
      "Mid-weight linen with a defined shoulder and a straight hem. Breathes in heat, holds its line in photographs.",
    materials: ["Pure European linen", "Structured shoulder", "Straight hem"],
    specs: shirtSpecs,
    sizes: [
      { size: "S", stock: 2 },
      { size: "M", stock: 0 },
      { size: "L", stock: 5 },
      { size: "XL", stock: 3 },
      { size: "XXL", stock: 0 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Ishaan T.",
        rating: 5,
        date: "2026-07-11",
        verified: true,
        title: "Holds its shape",
        body: "Linen that doesn't collapse by noon. The shoulder line is what sells it.",
      },
      {
        id: "r2",
        name: "Rohan V.",
        rating: 4,
        date: "2026-07-08",
        verified: true,
        title: "Beautiful weave",
        body: "Runs slightly long in the body, which I like. Ordered L at 6'1\".",
      },
    ],
    pairsWith: ["cuban-link-chain", "brushed-band-ring", "flatline-bangle"],
  },
  {
    slug: "shadow-oversized-shirt",
    name: "Shadow Oversized Shirt",
    price: 2999,
    category: "shirts",
    img: p6,
    gallery: [p6, hero2, catShirts],
    sku: "SAAJ-SH-003",
    isNew: true,
    sold: 41,
    addedAt: "2026-07-21",
    tags: ["charcoal", "linen", "oversized", "drop-shoulder"],
    detail:
      "A drop-shoulder linen shirt in deep charcoal. Boxier through the chest, longer at the back, engineered to photograph as one clean silhouette.",
    materials: ["Washed heavy linen", "Drop shoulder", "Extended back hem"],
    specs: shirtSpecs,
    sizes: [
      { size: "S", stock: 0 },
      { size: "M", stock: 3 },
      { size: "L", stock: 6 },
      { size: "XL", stock: 1 },
      { size: "XXL", stock: 2 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Yash B.",
        rating: 5,
        date: "2026-07-25",
        verified: true,
        title: "Best of the drop",
        body: "The charcoal reads almost black indoors. Cut is genuinely oversized without swallowing you.",
        photos: [p6],
      },
    ],
    pairsWith: ["rope-chain-3mm", "brushed-band-ring"],
  },
  {
    slug: "rope-chain-3mm",
    name: "Rope Chain 3mm",
    price: 1899,
    category: "neckchains",
    img: p3,
    gallery: [p3, hero3, catChains],
    sku: "SAAJ-NC-001",
    sold: 302,
    addedAt: "2026-04-18",
    tags: ["silver", "rope", "everyday", "925"],
    detail:
      "A 3mm rope link in solid 925 silver, polished to a low, liquid shine. Sits just below the collarbone.",
    materials: ["925 sterling silver", "3mm rope link", "Lobster clasp"],
    specs: metalSpecs,
    sizes: [
      { size: "45 cm", stock: 6 },
      { size: "50 cm", stock: 9 },
      { size: "55 cm", stock: 0 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Neel A.",
        rating: 5,
        date: "2026-06-14",
        verified: true,
        title: "Heavier than expected",
        body: "Proper weight, no plating smell. 50cm sits exactly where the photos show.",
        photos: [hero3],
      },
      {
        id: "r2",
        name: "Arjun P.",
        rating: 5,
        date: "2026-06-01",
        verified: true,
        title: "Never takes it off",
        body: "Two months daily including showers, still no tarnish.",
      },
    ],
    pairsWith: ["noir-crinkle-shirt", "obsidian-signet-ring"],
  },
  {
    slug: "cuban-link-chain",
    name: "Cuban Link Chain 7mm",
    price: 2499,
    category: "neckchains",
    img: p7,
    gallery: [p7, catChains, hero2],
    sku: "SAAJ-NC-002",
    isNew: true,
    sold: 78,
    addedAt: "2026-07-16",
    tags: ["silver", "cuban", "statement", "925"],
    detail:
      "A 7mm Cuban link with a box clasp and an oxidised core. Loud in weight, quiet in finish.",
    materials: ["925 sterling silver", "7mm flat Cuban link", "Concealed box clasp"],
    specs: metalSpecs,
    sizes: [
      { size: "45 cm", stock: 0 },
      { size: "50 cm", stock: 4 },
      { size: "55 cm", stock: 2 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Vikram D.",
        rating: 4,
        date: "2026-07-22",
        verified: true,
        title: "Serious presence",
        body: "This is the loud one. Clasp is solid and doesn't catch on collars.",
      },
    ],
    pairsWith: ["shadow-oversized-shirt", "brushed-band-ring"],
  },
  {
    slug: "obsidian-signet-ring",
    name: "Obsidian Signet Ring",
    price: 1499,
    category: "rings",
    img: p4,
    gallery: [p4, hero2, catRings],
    sku: "SAAJ-RG-001",
    sold: 188,
    addedAt: "2026-04-30",
    tags: ["silver", "signet", "blackened", "925"],
    detail:
      "A flat-faced signet with a blackened finish. Weighted band, softened edges, unmarked face.",
    materials: ["925 sterling silver", "Blackened finish", "Sizes 6–12"],
    specs: metalSpecs,
    sizes: [
      { size: "Size 6", stock: 3 },
      { size: "Size 7", stock: 5 },
      { size: "Size 8", stock: 0 },
      { size: "Size 9", stock: 6 },
      { size: "Size 10", stock: 2 },
      { size: "Size 11", stock: 0 },
      { size: "Size 12", stock: 1 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Sameer K.",
        rating: 5,
        date: "2026-06-20",
        verified: true,
        title: "Weight is everything",
        body: "You feel it on the hand. The blackening has worn in beautifully on the edges.",
        photos: [p4],
      },
      {
        id: "r2",
        name: "Aditya N.",
        rating: 4,
        date: "2026-06-09",
        verified: true,
        title: "Order half up",
        body: "Band is wide so it sits snug. Size 9 for a usual 8.5.",
      },
    ],
    pairsWith: ["void-chain-bracelet", "rope-chain-3mm"],
  },
  {
    slug: "brushed-band-ring",
    name: "Brushed Band Ring",
    price: 1299,
    category: "rings",
    img: p8,
    gallery: [p8, catRings, hero2],
    sku: "SAAJ-RG-002",
    sold: 121,
    addedAt: "2026-06-25",
    tags: ["silver", "band", "minimal", "925"],
    detail:
      "A wide, flat band with a brushed face and a mirror interior. The quietest piece SAAJ makes.",
    materials: ["925 sterling silver", "8mm brushed band", "Comfort-fit interior"],
    specs: metalSpecs,
    sizes: [
      { size: "Size 6", stock: 0 },
      { size: "Size 7", stock: 4 },
      { size: "Size 8", stock: 7 },
      { size: "Size 9", stock: 3 },
      { size: "Size 10", stock: 0 },
      { size: "Size 11", stock: 2 },
      { size: "Size 12", stock: 0 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Manav J.",
        rating: 5,
        date: "2026-07-02",
        verified: true,
        title: "Perfectly plain",
        body: "No branding, no fuss. Exactly what I wanted next to a signet.",
      },
    ],
    pairsWith: ["flatline-bangle", "cuban-link-chain"],
  },
  {
    slug: "void-chain-bracelet",
    name: "Void Chain Bracelet",
    price: 1799,
    category: "bracelets",
    img: p5,
    gallery: [p5, catBracelets, hero2],
    sku: "SAAJ-BR-001",
    sold: 143,
    addedAt: "2026-05-05",
    tags: ["silver", "chain", "matte", "925"],
    detail:
      "A tight-link bracelet with a matte body and polished clasp. Quiet on its own, sharp beside a chain.",
    materials: ["925 sterling silver", "Matte link body", "Adjustable 19–21cm"],
    specs: metalSpecs,
    sizes: [
      { size: "Small", stock: 5 },
      { size: "Medium", stock: 2 },
      { size: "Large", stock: 0 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Rehan Q.",
        rating: 5,
        date: "2026-06-18",
        verified: true,
        title: "Pairs with everything",
        body: "The matte body means it never fights the chain. Clasp is secure.",
        photos: [p5],
      },
      {
        id: "r2",
        name: "Tanay G.",
        rating: 4,
        date: "2026-05-30",
        verified: false,
        title: "Great weight",
        body: "Medium fits a 17cm wrist with a little room.",
      },
    ],
    pairsWith: ["obsidian-signet-ring", "noir-crinkle-shirt"],
  },
  {
    slug: "flatline-bangle",
    name: "Flatline Bangle",
    price: 1599,
    category: "bracelets",
    img: p9,
    gallery: [p9, catBracelets, hero2],
    sku: "SAAJ-BR-002",
    isNew: true,
    sold: 34,
    addedAt: "2026-07-19",
    tags: ["silver", "bangle", "minimal", "925"],
    detail:
      "A single flat ribbon of silver, brushed and closed. No clasp, no movement — just a clean line at the wrist.",
    materials: ["925 sterling silver", "3mm flat profile", "Seamless closed form"],
    specs: metalSpecs,
    sizes: [
      { size: "Small", stock: 3 },
      { size: "Medium", stock: 6 },
      { size: "Large", stock: 1 },
    ],
    reviews: [
      {
        id: "r1",
        name: "Zayan H.",
        rating: 5,
        date: "2026-07-27",
        verified: true,
        title: "Minimal done right",
        body: "Slides on cleanly and stays put. Stacks well with the Void chain.",
      },
    ],
    pairsWith: ["brushed-band-ring", "linen-structure-shirt"],
  },
];

export const HERO_SLIDES = [
  {
    n: "01",
    eyebrow: "Shirts. Accessories. Presence.",
    title: ["Not for", "everyone."],
    accent: "Made for you.",
    subtitle: "Crafted for those who define their own identity.",
    cta: "Explore Collection",
    to: "/shop" as const,
    img: hero,
    alt: "Model in a black crinkle shirt with a silver chain, shot in low light",
  },
  {
    n: "02",
    eyebrow: "Silver. Weight. Restraint.",
    title: ["Luxury in", "every"],
    accent: "detail.",
    subtitle: "Minimal forms. Maximum presence.",
    cta: "Shop Jewelry",
    to: "/category/$slug" as const,
    params: { slug: "rings" },
    img: hero2,
    alt: "Hands wearing heavy sterling silver rings and a bracelet in dramatic light",
  },
  {
    n: "03",
    eyebrow: "The Shadow Edit",
    title: ["Built to be", "remembered."],
    accent: "Season 04.",
    subtitle: "Timeless pieces for modern individuals.",
    cta: "View New Arrivals",
    to: "/shop" as const,
    search: { sort: "newest" as const },
    img: hero3,
    alt: "Man in an open black linen shirt wearing a heavy silver rope chain",
  },
  {
    n: "04",
    eyebrow: "Made for the few",
    title: ["Wear your", "statement."],
    accent: "Own the room.",
    subtitle: "Confidence designed into every piece.",
    cta: "Discover More",
    to: "/shop" as const,
    img: hero4,
    alt: "Man adjusting the collar of a black crinkle shirt, silver signet ring visible",
  },
];

export const PHILOSOPHY_IMG = philosophy;

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const productsByCategory = (slug: string) =>
  PRODUCTS.filter((p) => p.category === slug);

export const findProduct = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

export const findCategory = (slug: string) => CATEGORIES.find((c) => c.slug === slug);

export const totalStock = (p: Product) => p.sizes.reduce((s, x) => s + x.stock, 0);

export const stockForSize = (p: Product, size: string | null) =>
  size ? (p.sizes.find((s) => s.size === size)?.stock ?? 0) : 0;

export type StockState = {
  label: string;
  tone: "in" | "low" | "out";
};

export const stockState = (qty: number): StockState => {
  if (qty <= 0) return { label: "Out of Stock", tone: "out" };
  if (qty <= 2) return { label: `Only ${qty} left`, tone: "low" };
  if (qty <= 4) return { label: "Low Stock", tone: "low" };
  return { label: "In Stock", tone: "in" };
};

export const avgRating = (p: Product) =>
  p.reviews.length ? p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length : 0;

export const searchProducts = (query: string, limit = 6) => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PRODUCTS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.category.includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.tags.some((t) => t.includes(q)),
  ).slice(0, limit);
};

export const PRICE_MAX = Math.max(...PRODUCTS.map((p) => p.price));
export const PRICE_MIN = Math.min(...PRODUCTS.map((p) => p.price));
