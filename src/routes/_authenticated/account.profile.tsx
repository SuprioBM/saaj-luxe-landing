import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AccountShell } from "@/components/AccountShell";
import { auth, useAuth } from "@/lib/auth";
import { SignedOut } from "@/routes/_authenticated/account.index";

const TITLE = "Profile — SAAJ";
const DESCRIPTION = "Manage your SAAJ profile details and contact information.";

export const Route = createFileRoute("/_authenticated/account/profile")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountProfile,
});

const field =
  "w-full border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne disabled:text-muted-foreground";

function AccountProfile() {
  const user = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [busy, setBusy] = useState(false);

  if (!user) return <SignedOut />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await auth.updateProfile({ name: name.trim(), phone: phone.trim() });
    setBusy(false);
    toast.success("Profile updated.");
  };

  return (
    <AccountShell title="Your details.">
      <form onSubmit={save} className="max-w-md space-y-8">
        <div>
          <label className="eyebrow">Name</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="eyebrow">Email</label>
          <input className={field} value={user.email} disabled />
        </div>
        <div>
          <label className="eyebrow">Phone</label>
          <input
            className={field}
            value={phone}
            placeholder="+91"
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="border border-foreground px-10 py-4 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
        >
          {busy ? "SAVING" : "SAVE CHANGES"}
        </button>
      </form>
    </AccountShell>
  );
}
