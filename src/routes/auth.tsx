import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { auth } from "@/lib/auth";

const TITLE = "Sign In — SAAJ";
const DESCRIPTION = "Access your SAAJ account, orders and saved pieces.";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const field =
  "w-full border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = (user: { role: string } | null) => {
    void navigate({ to: user?.role === "ADMIN" ? "/admin" : "/account" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6 || (mode === "up" && !name.trim())) {
      toast.error("Complete every field. Password needs 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const user =
        mode === "in"
          ? await auth.login(email.trim(), password)
          : await auth.register(name.trim(), email.trim(), password);
      toast.success(mode === "in" ? "Welcome back." : "Account created.");
      finish(user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      await auth.signInWithGoogle();
      // On redirect, the onAuthStateChange listener hydrates the session;
      // if tokens were returned inline we navigate now.
      finish(auth.get());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">{mode === "in" ? "Sign In" : "Create Account"}</h1>
          <span className="h-px flex-1 bg-saaj-line" />
        </div>

        <div className="mx-auto mt-16 w-full max-w-md">
          <p className="font-display text-4xl font-light">
            {mode === "in" ? "Welcome back." : "Join the few."}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {mode === "in"
              ? "Track orders, revisit saved pieces and check out faster."
              : "One account for orders, saved pieces and early access to each drop."}
          </p>

          <form onSubmit={submit} className="mt-12 space-y-8">
            {mode === "up" ? (
              <input
                className={field}
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            ) : null}
            <input
              className={field}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className={field}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 border border-foreground py-4 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
            >
              {busy ? "PLEASE WAIT" : mode === "in" ? "SIGN IN" : "CREATE ACCOUNT"}
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </button>
          </form>

          <div className="mt-8 flex items-center gap-4">
            <span className="h-px flex-1 bg-saaj-line" />
            <span className="text-[0.625rem] tracking-[0.28em] text-muted-foreground">OR</span>
            <span className="h-px flex-1 bg-saaj-line" />
          </div>

          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="mt-8 flex w-full items-center justify-center gap-3 border border-saaj-line py-4 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-foreground disabled:opacity-40"
          >
            CONTINUE WITH GOOGLE
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "in" ? "up" : "in")}
            className="rule-link mt-10"
          >
            {mode === "in" ? "Create an account" : "I already have an account"}
          </button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
