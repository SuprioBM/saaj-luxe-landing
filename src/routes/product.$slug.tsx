import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ProductCard } from "@/components/ProductCard";
import { QtyStepper } from "@/components/QtyStepper";
import { RecentlyViewedRail } from "@/components/RecentlyViewedRail";
import { SizePicker } from "@/components/SizePicker";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StarRating } from "@/components/StarRating";
import { StockBadge } from "@/components/StockBadge";
import { WishlistButton } from "@/components/WishlistButton";
import { findProduct, formatBDT, stockForSize, type SizeStock } from "@/data/catalog";
import { useProduct, useProducts } from "@/lib/catalog-live";
import { useAddToCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useMemberPrice, useMembership, usePotentialMemberPrice } from "@/lib/membership";
import { releaseState } from "@/lib/membership-pricing";
import { recentlyViewed } from "@/lib/recently-viewed";
import { createReview, listProductReviews, myReviewEligibility } from "@/lib/reviews.functions";

const fmtReleaseDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "soon";

function ClubGate({ slug, heading, body }: { slug: string; heading: string; body: string }) {
  const user = useAuth();
  return (
    <div className="mt-9 border border-saaj-champagne/30 p-5">
      <p className="text-[0.625rem] tracking-[0.28em] text-saaj-champagne">✦ {heading.toUpperCase()}</p>
      <p className="mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">{body}</p>
      {user ? (
        <Link
          to="/club"
          className="mt-5 inline-flex items-center gap-2 border border-saaj-champagne px-6 py-3 text-[0.5625rem] tracking-[0.24em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
        >
          JOIN SAAJ CLUB
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
        </Link>
      ) : (
        <Link
          to="/auth"
          search={{ redirect: `/product/${slug}` }}
          className="mt-5 inline-flex items-center gap-2 border border-saaj-champagne px-6 py-3 text-[0.5625rem] tracking-[0.24em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
        >
          JOIN SAAJ CLUB
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
        </Link>
      )}
    </div>
  );
}

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params }) => {
    const product = findProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Unavailable — SAAJ" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.product.name} — SAAJ`;
    const description = loaderData.product.detail;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { product: loaded } = Route.useLoaderData();
  const { product: live } = useProduct(loaded.slug);
  const product = live ?? loaded;
  const user = useAuth();
  const membership = useMembership();
  const memberPrice = useMemberPrice(product);
  const potentialPrice = usePotentialMemberPrice(product);
  const release = releaseState(product, membership.isMember);
  const { data: products = [] } = useProducts();
  const gallery: string[] = product.gallery?.length ? product.gallery : [product.img];
  const [shot, setShot] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [zoom, setZoom] = useState(false);
  const touchX = useRef<number | null>(null);
  const prev = () => setShot((i) => Math.max(0, i - 1));
  const next = () => setShot((i) => Math.min(gallery.length - 1, i + 1));
  const addToCart = useAddToCart();

  useEffect(() => {
    setShot(0);
    setSize(null);
    setQty(1);
    recentlyViewed.push(product.slug);
  }, [product.slug]);

  const available = stockForSize(product, size);
  // Empty until the live DB fetch resolves (placeholder data intentionally
  // carries no real variant ids) — gates the buy button so it can't be
  // clicked into a false "not ready" error during that brief window.
  const variantId = size
    ? product.sizes.find((s: SizeStock) => s.size === size)?.id || undefined
    : undefined;
  const related = products.filter(
    (p) => p.slug !== product.slug && p.category === product.category,
  )
    .concat(products.filter((p) => p.slug !== product.slug && p.category !== product.category))
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="grid grid-cols-1 gap-px bg-saaj-line lg:grid-cols-2">
          <div className="bg-saaj-panel">
            <div
              className="group relative overflow-hidden"
              onMouseEnter={() => setZoom(true)}
              onMouseLeave={() => setZoom(false)}
              onTouchStart={(e) => {
                touchX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (touchX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                touchX.current = null;
                if (Math.abs(dx) < 45) return;
                if (dx < 0) next();
                else prev();
              }}
            >
              <img
                src={gallery[shot]}
                alt={`${product.name} — view ${shot + 1}`}
                className={`h-full max-h-[80vh] w-full object-cover transition-transform duration-700 ${
                  zoom ? "scale-125" : "scale-100"
                }`}
                draggable={false}
              />
              {gallery.length > 1 && (
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4">
                  <button
                    type="button"
                    aria-label="Previous image"
                    onClick={prev}
                    disabled={shot === 0}
                    className="hidden h-11 w-11 items-center justify-center rounded-full border border-saaj-line bg-background/40 backdrop-blur-sm transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:pointer-events-none disabled:opacity-25 md:flex"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <div className="flex items-center gap-2">
                    {gallery.map((g: string, i: number) => (
                      <span
                        key={g}
                        className={`h-px w-6 transition-colors ${
                          i === shot ? "bg-saaj-champagne" : "bg-saaj-line"
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={next}
                    disabled={shot === gallery.length - 1}
                    className="hidden h-11 w-11 items-center justify-center rounded-full border border-saaj-line bg-background/40 backdrop-blur-sm transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:pointer-events-none disabled:opacity-25 md:flex"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                </div>
              )}

            </div>

            {gallery.length > 1 && (
              <div className="saaj-rail flex gap-2 overflow-x-auto p-3">
                {gallery.map((g: string, i: number) => (
                  <button
                    key={g}
                    type="button"
                    aria-label={`View image ${i + 1}`}
                    onClick={() => setShot(i)}
                    className={`h-20 w-16 shrink-0 overflow-hidden border transition-colors ${
                      i === shot ? "border-saaj-champagne" : "border-saaj-line"
                    }`}
                  >
                    <img src={g} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center bg-background px-6 py-14 md:px-12">
            <Link
              to="/category/$slug"
              params={{ slug: product.category }}
              className="eyebrow hover:text-saaj-champagne"
            >
              {product.category}
            </Link>
            <h1 className="mt-5 font-display text-4xl font-light md:text-5xl">{product.name}</h1>

            <ProductRatingSummary productId={product.id} />

            <div className="mt-4">
              {memberPrice.isMemberPrice ? (
                <p className="text-sm">
                  <span className="text-muted-foreground line-through">
                    {formatBDT(memberPrice.listPrice)}
                  </span>{" "}
                  <span className="text-saaj-champagne">{formatBDT(memberPrice.memberPrice)}</span>
                  <span className="ml-2 text-[0.5625rem] tracking-[0.18em] text-saaj-champagne/70">
                    YOUR CLUB PRICE
                  </span>
                </p>
              ) : (
                <>
                  <p className="text-sm text-saaj-champagne">{formatBDT(product.price)}</p>
                  {potentialPrice.eligible && potentialPrice.saves > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="text-saaj-champagne">
                        {formatBDT(potentialPrice.memberPrice)}
                      </span>{" "}
                      for SAAJ Club
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <span className="mt-8 block h-px w-14 bg-saaj-line" />
            <p className="mt-8 max-w-md text-xs leading-relaxed text-muted-foreground">
              {product.detail}
            </p>

            {release.state === "members-only" ? (
              <ClubGate
                slug={product.slug}
                heading="SAAJ Club members only"
                body="This piece is a SAAJ Club exclusive. Join to unlock it — plus member pricing, early access and reward points."
              />
            ) : release.state === "coming-soon" && !release.memberEligibleNow ? (
              <div className="mt-9 border border-saaj-champagne/30 p-5">
                <p className="text-[0.625rem] tracking-[0.28em] text-saaj-champagne">COMING SOON</p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {membership.isMember
                    ? `Available to SAAJ Club members from ${fmtReleaseDate(release.memberDate)}.`
                    : `Available to SAAJ Club members first. Public release: ${fmtReleaseDate(release.publicDate)}.`}
                </p>
                {!membership.isMember ? (
                  <Link
                    to="/club"
                    className="mt-5 inline-flex items-center gap-2 border border-saaj-champagne px-6 py-3 text-[0.5625rem] tracking-[0.24em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
                  >
                    JOIN SAAJ CLUB
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
                  </Link>
                ) : null}
              </div>
            ) : (
              <>
                {release.state === "coming-soon" && release.memberEligibleNow ? (
                  <p className="mt-8 text-[0.625rem] tracking-[0.2em] text-saaj-champagne">
                    ✦ EARLY ACCESS — SAAJ CLUB · you're seeing this before public release
                  </p>
                ) : null}

                <div className="mt-9">
                  <p className="eyebrow mb-3">Select Size</p>
                  <SizePicker sizes={product.sizes} value={size} onChange={setSize} />
                </div>

                {size && (
                  <div className="mt-6 flex items-center gap-5">
                    <StockBadge qty={available} />
                    <QtyStepper value={qty} max={Math.max(1, available)} onChange={setQty} />
                  </div>
                )}

                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    disabled={!size || !variantId || available <= 0 || addToCart.isPending}
                    onClick={() => {
                      if (!size || !variantId) return;
                      addToCart.mutate(
                        { variantId, qty },
                        {
                          onSuccess: () => toast.success(`${product.name} — ${size} added to bag`),
                          onError: (err) =>
                            toast.error(
                              err instanceof Error ? err.message : "Could not add this to your bag.",
                            ),
                        },
                      );
                    }}
                    className="flex items-center justify-between border border-saaj-line px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:cursor-not-allowed disabled:text-muted-foreground/50 sm:w-72"
                  >
                    {!size ? "Select a size" : !variantId ? "Loading…" : "Add to bag"}
                    <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <WishlistButton slug={product.slug} label="Save" />
                </div>

                {user && !membership.isMember && potentialPrice.eligible && potentialPrice.saves > 0 ? (
                  <div className="mt-6 border border-saaj-line p-4">
                    <p className="text-[0.625rem] tracking-[0.24em] text-saaj-champagne">WANT MORE?</p>
                    <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
                      Join SAAJ Club for {formatBDT(membership.config.monthlyPrice)}/month and this
                      piece is {formatBDT(potentialPrice.memberPrice)} — plus exclusive drops and
                      early access.
                    </p>
                    <Link to="/club" className="rule-link mt-3">
                      Join SAAJ Club
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
                    </Link>
                  </div>
                ) : null}
              </>
            )}

            <ul className="mt-10 flex flex-col gap-3">
              {product.materials.map((m: string) => (
                <li
                  key={m}
                  className="border-b border-saaj-line pb-3 text-[0.6875rem] uppercase tracking-[0.2em] text-foreground/80"
                >
                  {m}
                </li>
              ))}
            </ul>

            <Link to="/cart" className="rule-link mt-9 self-start">
              View bag
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        </section>

        <ReviewsSection productId={product.id} productName={product.name} />

        <section className="px-5 py-16 md:px-8 md:py-24">
          <div className="flex items-center gap-5">
            <h2 className="eyebrow">You may also wear</h2>
            <span className="h-px flex-1 bg-saaj-line" />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>

        <RecentlyViewedRail exclude={product.slug} />
      </main>
      <SiteFooter />
    </div>
  );
}

function ProductRatingSummary({ productId }: { productId?: string }) {
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => listProductReviews({ data: { productId: productId! } }),
    enabled: Boolean(productId),
  });
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="mt-4 flex items-center gap-3">
      <StarRating value={avg} />
      <span className="text-[0.625rem] tracking-[0.2em] text-muted-foreground">
        {reviews.length} REVIEW{reviews.length === 1 ? "" : "S"}
      </span>
    </div>
  );
}

function ReviewsSection({ productId, productName }: { productId?: string; productName: string }) {
  const user = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reviewsQuery = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => listProductReviews({ data: { productId: productId! } }),
    enabled: Boolean(productId),
  });

  const eligibilityQuery = useQuery({
    queryKey: ["reviews", "eligibility", productId, user?.id],
    queryFn: () => myReviewEligibility({ data: { productId: productId! } }),
    enabled: Boolean(productId && user),
  });

  if (!productId) return null;
  const reviews = reviewsQuery.data ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 4) {
      toast.error("Tell us a little more about the piece.");
      return;
    }
    setSubmitting(true);
    try {
      await createReview({ data: { productId, rating, title, body } });
      toast.success("Review published — thank you.");
      setTitle("");
      setBody("");
      setRating(5);
      void qc.invalidateQueries({ queryKey: ["reviews", productId] });
      void qc.invalidateQueries({ queryKey: ["reviews", "eligibility", productId, user?.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish your review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="border-t border-saaj-line px-5 py-16 md:px-8 md:py-20">
      <div className="flex items-center gap-5">
        <h2 className="eyebrow">Reviews</h2>
        <span className="h-px flex-1 bg-saaj-line" />
      </div>

      {reviews.length === 0 ? (
        <p className="mt-8 text-xs text-muted-foreground">No reviews yet — be the first to wear it in.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-px bg-saaj-line md:grid-cols-3">
          {reviews.map((r) => (
            <article key={r.id} className="bg-background p-6">
              <StarRating value={r.rating} />
              {r.title ? <p className="mt-3 text-sm">{r.title}</p> : null}
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{r.body}</p>
              <p className="mt-5 text-[0.625rem] uppercase tracking-[0.22em] text-foreground/70">
                {r.authorName} {r.verified ? "· VERIFIED BUYER" : ""} —{" "}
                {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </article>
          ))}
        </div>
      )}

      {user && eligibilityQuery.data?.isVerifiedBuyer && !eligibilityQuery.data.alreadyReviewed ? (
        <form onSubmit={submit} className="mt-12 max-w-lg space-y-6 border-t border-saaj-line pt-10">
          <p className="eyebrow">Write a review — {productName}</p>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} stars`}
                className="p-1"
              >
                <StarRating value={n <= rating ? 5 : 0} />
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="How does it wear?"
            className="w-full resize-none border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne"
          />
          <button
            type="submit"
            disabled={submitting}
            className="border border-foreground px-8 py-3 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
          >
            {submitting ? "PUBLISHING" : "PUBLISH REVIEW"}
          </button>
        </form>
      ) : user && eligibilityQuery.data?.alreadyReviewed ? (
        <p className="mt-10 text-xs text-muted-foreground">You've already reviewed this piece — thank you.</p>
      ) : user && eligibilityQuery.data && !eligibilityQuery.data.isVerifiedBuyer ? (
        <p className="mt-10 text-xs text-muted-foreground">
          Reviews are open to verified buyers — order this piece to leave one.
        </p>
      ) : null}
    </section>
  );
}
