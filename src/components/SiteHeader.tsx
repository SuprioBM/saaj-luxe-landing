import { Link } from "@tanstack/react-router";
import { ArrowRight, Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatBDT } from "@/data/catalog";
import { useCategories, useProducts } from "@/lib/catalog-live";
import { useCartCount } from "@/lib/cart";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const count = useCartCount();
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category.includes(q),
    ).slice(0, 6);
  }, [query, products]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-saaj-line bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
              className="transition-colors hover:text-saaj-champagne"
            >
              <Menu className="h-5 w-5" strokeWidth={1.25} />
            </button>
            <Link to="/" className="font-display text-2xl tracking-[0.42em] md:text-3xl text-saaj-champagne">
              SAAJ
            </Link>
          </div>
          <nav className="hidden items-center gap-10 lg:flex">
            {categories.map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="text-[0.6875rem] uppercase tracking-[0.24em] text-foreground/80 transition-colors hover:text-saaj-champagne"
              >
                {c.title}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen((v) => !v)}
              className="transition-colors hover:text-saaj-champagne"
            >
              <Search className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.25} />
            </button>
            <Link to="/wishlist" aria-label="Saved pieces" className="hidden sm:block">
              <Heart className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.25} />
            </Link>
            <Link to="/account" aria-label="Account" className="hidden sm:block">
              <User className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.25} />
            </Link>


            <Link to="/cart" aria-label="Cart" className="relative">
              <ShoppingBag className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.25} />
              <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-saaj-champagne text-[0.5rem] font-medium text-background">
                {count}
              </span>
            </Link>
          </div>
        </div>

        {/* Search bar */}
        <div
          className={`overflow-hidden border-saaj-line transition-[max-height,opacity] duration-500 ${
            searchOpen ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-5 pb-6 pt-2 md:px-8">
            <div className="flex items-center gap-4 border-b border-saaj-line pb-3 focus-within:border-saaj-champagne">
              <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.25} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SEARCH SAAJ"
                aria-label="Search products"
                className="w-full bg-transparent text-[0.8125rem] uppercase tracking-[0.22em] outline-none placeholder:text-muted-foreground/60"
              />
              {query && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                  <X className="h-4 w-4 text-muted-foreground" strokeWidth={1.25} />
                </button>
              )}
            </div>

            {query.trim() && (
              <div className="mt-5 flex flex-col gap-4">
                {results.length === 0 && (
                  <p className="text-xs text-muted-foreground">No pieces match "{query}".</p>
                )}
                {results.map((p) => (
                  <Link
                    key={p.slug}
                    to="/product/$slug"
                    params={{ slug: p.slug }}
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery("");
                    }}
                    className="group flex items-center gap-4"
                  >
                    <img
                      src={p.img}
                      alt={p.name}
                      loading="lazy"
                      className="h-14 w-12 border border-saaj-line object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-xs transition-colors group-hover:text-saaj-champagne">
                        {p.name}
                      </p>
                      <p className="mt-1 text-[0.625rem] tracking-[0.2em] text-muted-foreground">
                        {formatBDT(p.price)}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.25} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <div
        aria-hidden={!menuOpen}
        className={`fixed inset-0 z-[60] transition-opacity duration-500 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col border-r border-saaj-line bg-background transition-transform duration-500 ease-out ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-saaj-line px-6 py-5">
            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              className="font-display text-2xl tracking-[0.42em] text-saaj-champagne"
            >
              SAAJ
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="transition-colors hover:text-saaj-champagne"
            >
              <X className="h-5 w-5" strokeWidth={1.25} />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-6 py-8">
            <p className="eyebrow mb-6">Collections</p>
            {categories.map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                onClick={() => setMenuOpen(false)}
                className="group flex items-baseline gap-4 border-b border-saaj-line py-4"
              >
                <span className="text-[0.625rem] tracking-[0.24em] text-muted-foreground">
                  {c.n}
                </span>
                <span className="font-display text-2xl font-light transition-colors group-hover:text-saaj-champagne">
                  {c.title}
                </span>
                <ArrowRight
                  className="ml-auto h-4 w-4 self-center text-muted-foreground transition-transform group-hover:translate-x-1"
                  strokeWidth={1.25}
                />
              </Link>
            ))}

            <p className="eyebrow mb-4 mt-10">House</p>
            <div className="flex flex-col gap-4">
              {[
                { to: "/shop" as const, label: "Shop All" },
                { to: "/lookbook" as const, label: "Lookbook" },
                { to: "/about" as const, label: "Our Philosophy" },
                { to: "/wishlist" as const, label: "Saved" },
                { to: "/cart" as const, label: "Cart" },
                { to: "/account" as const, label: "My Account" },
                { to: "/contact" as const, label: "Contact" },


              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuOpen(false)}
                  className="text-[0.6875rem] uppercase tracking-[0.24em] text-foreground/80 hover:text-saaj-champagne"
                >
                  {l.label}
                </Link>
              ))}
            </div>

          </nav>

          <div className="border-t border-saaj-line px-6 py-6">
            <p className="font-display text-lg italic text-saaj-champagne">Made for you.</p>
            <p className="mt-2 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
              © 2026 SAAJ
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
