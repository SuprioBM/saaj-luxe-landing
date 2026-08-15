import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import hero3 from "@/assets/hero-3.jpg";

const TITLE = "Contact SAAJ — Client Care";
const DESCRIPTION =
  "Reach SAAJ client care for sizing, orders, repairs and wholesale. We reply within one business day.";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ContactPage,
});

const CHANNELS = [
  { icon: Mail, label: "Client care", value: "care@saaj.studio" },
  { icon: MessageCircle, label: "WhatsApp", value: "+880 1900-000000" },
  { icon: MapPin, label: "Atelier", value: "Gulshan, Dhaka — by appointment" },
];

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "Order", message: "" });
  const [sent, setSent] = useState(false);

  const valid =
    form.name.trim().length > 1 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
    form.message.trim().length > 9;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSent(true);
    toast.success("Message sent", { description: "We'll reply within one business day." });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <p className="eyebrow">Client Care</p>
        <h1 className="mt-8 max-w-2xl font-display text-4xl font-light leading-[1.05] md:text-6xl">
          Talk to us
          <span className="block italic text-saaj-champagne">directly.</span>
        </h1>

        <div className="mt-16 grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1fr]">
          <div>
            <ul className="flex flex-col gap-px bg-saaj-line">
              {CHANNELS.map(({ icon: Icon, label, value }) => (
                <li key={label} className="flex items-center gap-5 bg-background py-6">
                  <Icon className="h-4 w-4 text-saaj-champagne" strokeWidth={1.25} />
                  <div>
                    <span className="eyebrow block">{label}</span>
                    <span className="mt-2 block text-xs text-muted-foreground">{value}</span>
                  </div>
                </li>
              ))}
            </ul>

            <form onSubmit={submit} className="mt-12 flex flex-col gap-8">
              {(["name", "email"] as const).map((k) => (
                <label key={k} className="block">
                  <span className="eyebrow block">{k === "name" ? "Your name" : "Email"}</span>
                  <input
                    type={k === "email" ? "email" : "text"}
                    value={form[k]}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    className="mt-3 w-full border-b border-saaj-line bg-transparent pb-3 text-sm outline-none transition-colors focus:border-saaj-champagne"
                  />
                </label>
              ))}
              <label className="block">
                <span className="eyebrow block">Subject</span>
                <select
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="mt-3 w-full border-b border-saaj-line bg-transparent pb-3 text-sm outline-none transition-colors focus:border-saaj-champagne [&>option]:bg-background"
                >
                  {["Order", "Sizing", "Repairs", "Wholesale", "Other"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="eyebrow block">Message</span>
                <textarea
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  className="mt-3 w-full resize-none border-b border-saaj-line bg-transparent pb-3 text-sm outline-none transition-colors focus:border-saaj-champagne"
                />
              </label>
              <button
                type="submit"
                disabled={!valid || sent}
                className="self-start border border-saaj-line px-8 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-30"
              >
                {sent ? "Message sent" : "Send message"}
              </button>
            </form>
          </div>

          <img
            src={hero3}
            alt="Man in an open black linen shirt wearing a heavy silver rope chain"
            loading="lazy"
            className="hidden h-full max-h-[900px] w-full object-cover lg:block"
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
