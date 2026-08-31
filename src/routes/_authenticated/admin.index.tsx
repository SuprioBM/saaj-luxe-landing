import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { formatBDT } from "@/data/catalog";
import { adminDashboardStats } from "@/lib/admin/dashboard.functions";
import {
  adminGroqKeyStatus,
  adminKnowledgeStatus,
  adminReingestKnowledge,
  adminResetGroqKeys,
} from "@/lib/admin/agent.functions";

const TITLE = "Atelier Desk — SAAJ";
const DESCRIPTION = "SAAJ internal dashboard: revenue, orders and inventory health.";

export const Route = createFileRoute("/_authenticated/admin/")({
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
  component: AdminOverview,
});

function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminDashboardStats(),
  });
  const peak = Math.max(1, ...(data?.revenueSeries.map((r) => r.value) ?? [1]));

  return (
    <AdminShell title="Overview" subtitle="The house, at a glance.">
      {isLoading || !data ? (
        <div className="grid gap-px bg-saaj-line sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="saaj-skeleton h-36" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-saaj-line sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Revenue" value={formatBDT(data.revenue)} />
            <Metric label="Orders" value={String(data.orders)} />
            <Metric label="Customers" value={String(data.customers)} />
            <Metric label="Club Members" value={String(data.activeMembers)} />
            <Metric label="Low Stock" value={String(data.lowStock)} />
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <section>
              <div className="flex items-center gap-5">
                <h2 className="eyebrow">Revenue (7 days)</h2>
                <span className="h-px flex-1 bg-saaj-line" />
              </div>
              {data.revenueSeries.every((r) => r.value === 0) ? (
                <p className="mt-8 text-xs text-muted-foreground">No revenue recorded yet.</p>
              ) : (
                <div className="mt-10 flex h-48 items-end gap-3">
                  {data.revenueSeries.map((r) => (
                    <div key={r.label} className="flex flex-1 flex-col items-center gap-3">
                      <div
                        className="w-full bg-saaj-champagne/70"
                        style={{ height: `${Math.max(4, (r.value / peak) * 100)}%` }}
                      />
                      <span className="text-[0.5rem] tracking-[0.22em] text-muted-foreground">
                        {r.label.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center gap-5">
                <h2 className="eyebrow">Best Sellers</h2>
                <span className="h-px flex-1 bg-saaj-line" />
              </div>
              {data.topProducts.length === 0 ? (
                <p className="mt-8 text-xs text-muted-foreground">No paid orders yet.</p>
              ) : (
                <ul className="mt-8 divide-y divide-saaj-line border-y border-saaj-line">
                  {data.topProducts.map((p) => (
                    <li key={p.slug} className="flex items-center justify-between gap-6 py-4">
                      <span className="truncate text-sm">{p.name}</span>
                      <span className="shrink-0 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                        {p.sold} SOLD · {formatBDT(p.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/products" className="rule-link mt-8">
                Manage inventory
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </section>
          </div>

          <AssistantKnowledgePanel />
        </>
      )}
    </AdminShell>
  );
}

function AssistantKnowledgePanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: status = [] } = useQuery({
    queryKey: ["admin", "knowledge-status"],
    queryFn: () => adminKnowledgeStatus(),
  });

  const reingest = async () => {
    setBusy(true);
    try {
      const res = await adminReingestKnowledge();
      toast.success(
        `Knowledge base refreshed — ${res.total} chunks across ${res.sources.length} sources.`,
      );
      void qc.invalidateQueries({ queryKey: ["admin", "knowledge-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not refresh the knowledge base.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-16">
      <div className="flex items-center gap-5">
        <h2 className="eyebrow flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.25} />
          AI Assistant — knowledge base
        </h2>
        <span className="h-px flex-1 bg-saaj-line" />
      </div>
      <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted-foreground">
        The SAAJ assistant answers policy, shipping, returns and brand questions from this retrieval
        store. Live data (prices, stock, orders, membership, rewards) always comes from the
        database, never from here. Re-ingest after editing the source content in
        <span className="text-foreground/80"> src/lib/agent/knowledge-sources.ts</span>.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        {status.length ? (
          status.map((s) => (
            <span
              key={s.source}
              className="text-[0.625rem] tracking-[0.16em] text-muted-foreground"
            >
              {s.source.toUpperCase()} · {s.chunks}
            </span>
          ))
        ) : (
          <span className="text-[0.625rem] tracking-[0.16em] text-muted-foreground">
            NOT YET INGESTED
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void reingest()}
        className="mt-6 border border-foreground px-8 py-3 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
      >
        {busy ? "REFRESHING" : "RE-INGEST KNOWLEDGE"}
      </button>

      <GroqKeyPanel />
    </section>
  );
}

const KEY_STATE_TONE: Record<string, string> = {
  AVAILABLE: "text-saaj-champagne",
  COOLDOWN: "text-muted-foreground",
  DISABLED: "text-destructive",
};

function GroqKeyPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin", "groq-keys"],
    queryFn: () => adminGroqKeyStatus(),
    refetchInterval: 20_000,
  });

  const reset = async () => {
    setBusy(true);
    try {
      await adminResetGroqKeys({ data: {} });
      toast.success("Groq keys re-enabled on this server.");
      void qc.invalidateQueries({ queryKey: ["admin", "groq-keys"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset the keys.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-12 border-t border-saaj-line pt-8">
      <p className="eyebrow">Groq key pool (this server instance)</p>
      {!data ? (
        <p className="mt-4 saaj-skeleton h-4 w-56" />
      ) : (
        <>
          <p className="mt-4 text-xs text-muted-foreground">
            {data.rotationEnabled ? "Rotation on" : "Rotation off"} · {data.poolSize} key
            {data.poolSize === 1 ? "" : "s"} · {data.totalRequests} req · {data.successfulRequests}{" "}
            ok · {data.rotations} rotations · {data.count429} × 429 · {data.count5xx} × 5xx ·{" "}
            {data.invalidKeyCount} invalid · avg {data.averageAttempts} attempts
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
            {data.keys.map((k) => (
              <span
                key={k.id}
                className={`text-[0.625rem] tracking-[0.14em] ${KEY_STATE_TONE[k.state] ?? "text-muted-foreground"}`}
              >
                {k.id.toUpperCase()} · {k.state}
                {k.cooldownMsRemaining > 0 ? ` ${Math.ceil(k.cooldownMsRemaining / 1000)}s` : ""}
                {k.failureCount > 0 ? ` (${k.failureCount})` : ""}
              </span>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void reset()}
            className="mt-5 border border-saaj-line px-6 py-2.5 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
          >
            {busy ? "RESETTING" : "RE-ENABLE ALL KEYS"}
          </button>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-8">
      <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
        {label.toUpperCase()}
      </p>
      <p className="mt-6 font-display text-3xl font-light">{value}</p>
    </div>
  );
}
