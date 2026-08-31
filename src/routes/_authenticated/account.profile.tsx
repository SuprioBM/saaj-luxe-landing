import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccountShell } from "@/components/AccountShell";
import {
  type Address,
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from "@/lib/addresses.functions";
import { auth, useAuth } from "@/lib/auth";
import { SignedOut } from "@/routes/_authenticated/account.index";

const TITLE = "Profile — SAAJ";
const DESCRIPTION = "Manage your SAAJ profile details, addresses and contact information.";

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
  const [dob, setDob] = useState(user?.dateOfBirth ?? "");
  const [busy, setBusy] = useState(false);

  if (!user) return <SignedOut />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await auth.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        dateOfBirth: dob.trim() || null,
      });
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
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
            placeholder="+880"
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="eyebrow">Date of birth</label>
          <input
            type="date"
            className={`${field} [color-scheme:dark]`}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          <p className="mt-2 text-[0.625rem] leading-relaxed text-muted-foreground">
            SAAJ Club members get a birthday reward. Optional.
          </p>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="border border-foreground px-10 py-4 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
        >
          {busy ? "SAVING" : "SAVE CHANGES"}
        </button>
      </form>

      <div className="mt-16 border-t border-saaj-line pt-12">
        <AddressBook />
      </div>
    </AccountShell>
  );
}

const emptyForm = { label: "Home", name: "", phone: "", line1: "", city: "", state: "", pincode: "" };

function AddressBook() {
  const qc = useQueryClient();
  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => listAddresses(),
  });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["addresses"] });

  const set = (key: keyof typeof emptyForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createAddress({ data: { ...form, country: "BD", isDefault: addresses.length === 0 } });
      toast.success("Address saved.");
      setForm(emptyForm);
      setAdding(false);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this address.");
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (a: Address) => {
    try {
      await updateAddress({ data: { id: a.id, isDefault: true } });
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update this address.");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAddress({ data: { id } });
      toast.success("Address removed.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this address.");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-5">
        <h2 className="eyebrow">Addresses</h2>
        <span className="h-px flex-1 bg-saaj-line" />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-2 text-[0.625rem] tracking-[0.22em] text-muted-foreground transition-colors hover:text-saaj-champagne"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.25} />
          ADD ADDRESS
        </button>
      </div>

      {adding ? (
        <form onSubmit={submit} className="mt-8 grid max-w-lg grid-cols-1 gap-6 sm:grid-cols-2">
          <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Label (Home, Office…)" className={field} />
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Recipient name" className={field} />
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone (+880…)" className={field} />
          <input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} placeholder="Post code" className={field} />
          <input value={form.line1} onChange={(e) => set("line1", e.target.value)} placeholder="Street address" className={`${field} sm:col-span-2`} />
          <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={field} />
          <input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="District" className={field} />
          <button
            type="submit"
            disabled={busy}
            className="self-start border border-foreground px-8 py-3 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40 sm:col-span-2"
          >
            {busy ? "SAVING" : "SAVE ADDRESS"}
          </button>
        </form>
      ) : null}

      {isLoading ? (
        <div className="mt-8 saaj-skeleton h-20" />
      ) : addresses.length === 0 ? (
        <p className="mt-8 text-xs text-muted-foreground">No saved addresses yet.</p>
      ) : (
        <ul className="mt-8 space-y-px bg-saaj-line">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-4 bg-background p-5">
              <div>
                <p className="text-xs">
                  {a.label}
                  {a.isDefault ? <span className="ml-2 text-saaj-champagne">· DEFAULT</span> : null}
                </p>
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
                  {a.name} · {a.phone}
                  <br />
                  {a.line1}, {a.city}, {a.state} {a.pincode}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!a.isDefault ? (
                  <button
                    type="button"
                    aria-label="Make default"
                    onClick={() => void makeDefault(a)}
                    className="text-muted-foreground transition-colors hover:text-saaj-champagne"
                  >
                    <Star className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove address"
                  onClick={() => void remove(a.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.25} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
