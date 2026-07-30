import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { auth, useAuth } from "@/lib/auth";

const TABS = [
  { to: "/account", label: "Overview" },
  { to: "/account/orders", label: "Orders" },
  { to: "/account/profile", label: "Profile" },
] as const;

export function AccountShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const user = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">Account</h1>
          <span className="h-px flex-1 bg-saaj-line" />
          {user ? (
            <button
              type="button"
              onClick={() => auth.logout()}
              className="flex items-center gap-2 text-[0.625rem] tracking-[0.22em] text-muted-foreground transition-colors hover:text-saaj-champagne"
            >
              SIGN OUT
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.25} />
            </button>
          ) : null}
        </div>

        <p className="mt-8 font-display text-4xl font-light md:text-5xl">{title}</p>

        <nav className="mt-10 flex gap-8 border-b border-saaj-line">
          {TABS.map((t) => {
            const active = path === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`-mb-px border-b pb-3 text-[0.625rem] tracking-[0.22em] transition-colors ${
                  active
                    ? "border-saaj-champagne text-saaj-champagne"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label.toUpperCase()}
              </Link>
            );
          })}
        </nav>

        <div className="mt-12">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
