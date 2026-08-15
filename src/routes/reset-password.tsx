import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { auth } from "@/lib/auth";

const TITLE = "Set a New Password — SAAJ";
const DESCRIPTION = "Set a new password for your SAAJ account.";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const field =
  "w-full border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password needs at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      // Supabase establishes a recovery session client-side from the emailed
      // link's URL fragment automatically — this just sets the new password
      // on that session.
      await auth.updatePassword(password);
      toast.success("Password updated — you're signed in.");
      void navigate({ to: "/account" });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "That reset link may have expired. Request a new one from the sign-in page.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">New Password</h1>
          <span className="h-px flex-1 bg-saaj-line" />
        </div>

        <div className="mx-auto mt-16 w-full max-w-md">
          <p className="font-display text-4xl font-light">Set a new password.</p>
          <form onSubmit={submit} className="mt-12 space-y-8">
            <input
              className={field}
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className={field}
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 border border-foreground py-4 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
            >
              {busy ? "SAVING" : "UPDATE PASSWORD"}
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
