import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, Boxes, LogOut, Package, Users } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth, useSignOut } from "@/lib/auth";

const NAV = [
  { to: "/admin", label: "Overview", icon: BarChart3 },
  { to: "/admin/products", label: "Inventory", icon: Boxes },
  { to: "/admin/orders", label: "Orders", icon: Package },
  { to: "/admin/customers", label: "Customers", icon: Users },
] as const;

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuth();
  const signOut = useSignOut();

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <aside className="border-b border-saaj-line lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-6 lg:block">
          <Link to="/" className="font-display text-2xl tracking-[0.42em]">
            SAAJ
          </Link>
          <p className="eyebrow mt-0 lg:mt-3">Atelier Desk</p>
        </div>
        <nav className="saaj-rail flex gap-1 overflow-x-auto px-3 pb-4 lg:mt-4 lg:flex-col lg:overflow-visible lg:px-3">
          {NAV.map((n) => {
            const active = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex shrink-0 items-center gap-3 px-3 py-3 text-[0.625rem] tracking-[0.22em] transition-colors ${
                  active
                    ? "bg-saaj-panel text-saaj-champagne"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" strokeWidth={1.25} />
                {n.label.toUpperCase()}
              </Link>
            );
          })}
        </nav>
        <div className="hidden px-6 py-6 lg:block">
          <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
            {user?.email ?? "NOT SIGNED IN"}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 flex items-center gap-2 text-[0.625rem] tracking-[0.22em] text-muted-foreground transition-colors hover:text-saaj-champagne"
          >
            SIGN OUT
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.25} />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-12 md:px-10 md:py-16">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">{title}</h1>
          <span className="h-px flex-1 bg-saaj-line" />
        </div>
        {subtitle ? (
          <p className="mt-8 font-display text-4xl font-light md:text-5xl">{subtitle}</p>
        ) : null}
        <div className="mt-12">{children}</div>
      </main>
    </div>
  );
}
