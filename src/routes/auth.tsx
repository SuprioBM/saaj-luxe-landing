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
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    // Only accept in-app absolute paths — never an external URL.
    redirect:
      typeof search.redirect === "string" && search.redirect.startsWith("/")
        ? search.redirect
        : undefined,
  }),
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
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const finish = (user: { role: string } | null) => {
    if (redirect) {
      void navigate({ href: redirect });
      return;
    }
    void navigate({ to: user?.role === "ADMIN" ? "/admin" : "/account" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "reset") {
      if (!email.trim()) {
        toast.error("Enter your email address.");
        return;
      }
      setBusy(true);
      try {
        await auth.requestPasswordReset(email.trim());
        toast.success("Password reset email sent — check your inbox.");
        setMode("in");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not send that email.");
      } finally {
        setBusy(false);
      }
      return;
    }

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
      const message = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(message);
      if (mode === "up" && message.toLowerCase().includes("check your email")) {
        setAwaitingVerification(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      // The browser navigates away to Google on success — this only
      // returns (and reaches the catch) if starting the redirect failed.
      await auth.signInWithGoogle();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed.");
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!email.trim()) return;
    try {
      await auth.resendVerification(email.trim());
      toast.success("Verification email resent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend that email.");
    }
  };

  const heading = mode === "in" ? "Sign In" : mode === "up" ? "Create Account" : "Reset Password";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">{heading}</h1>
          <span className="h-px flex-1 bg-saaj-line" />
        </div>

        <div className="mx-auto mt-16 w-full max-w-md">
          <p className="font-display text-4xl font-light">
            {mode === "in" ? "Welcome back." : mode === "up" ? "Join the few." : "Forgotten it happens."}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {mode === "in"
              ? "Track orders, revisit saved pieces and check out faster."
              : mode === "up"
                ? "One account for orders, saved pieces and early access to each drop."
                : "We'll email you a link to set a new password."}
          </p>

          {awaitingVerification ? (
            <div className="mt-8 border border-saaj-line p-5">
              <p className="text-xs text-muted-foreground">
                Check {email || "your inbox"} for a confirmation link before signing in.
              </p>
              <button type="button" onClick={() => void resend()} className="rule-link mt-4">
                Resend verification email
              </button>
            </div>
          ) : null}

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
            {mode !== "reset" ? (
              <input
                className={field}
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            ) : null}
            {mode === "in" ? (
              <button
                type="button"
                onClick={() => setMode("reset")}
                className="block text-[0.625rem] tracking-[0.2em] text-muted-foreground transition-colors hover:text-saaj-champagne"
              >
                FORGOT PASSWORD?
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 border border-foreground py-4 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
            >
              {busy
                ? "PLEASE WAIT"
                : mode === "in"
                  ? "SIGN IN"
                  : mode === "up"
                    ? "CREATE ACCOUNT"
                    : "SEND RESET LINK"}
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </button>
          </form>

          {mode !== "reset" ? (
            <>
              <div className="mt-8 flex items-center gap-4">
                <span className="h-px flex-1 bg-saaj-line" />
                <span className="text-[0.625rem] tracking-[0.28em] text-muted-foreground">OR</span>
                <span className="h-px flex-1 bg-saaj-line" />
              </div>

              <button
                type="button"
                onClick={() => void google()}
                disabled={busy}
                className="mt-8 flex w-full items-center justify-center gap-3 border border-saaj-line py-4 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-foreground disabled:opacity-40"
              >
                CONTINUE WITH GOOGLE
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setAwaitingVerification(false);
              setMode(mode === "in" ? "up" : "in");
            }}
            className="rule-link mt-10"
          >
            {mode === "up" ? "I already have an account" : "Create an account"}
          </button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
