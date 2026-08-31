import { createServerFn } from "@tanstack/react-start";

import { requireStaff } from "@/lib/mw/authz";

/**
 * Staff-only: (re)ingest SAAJ's static knowledge into the RAG store. Safe to
 * run any time — ingestion is idempotent (see src/lib/agent/ingest.ts).
 */
export const adminReingestKnowledge = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(
    async ({
      context,
    }): Promise<{ sources: { source: string; chunks: number }[]; total: number }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { ingestKnowledge } = await import("@/lib/agent/ingest");

      const sources = await ingestKnowledge(supabaseAdmin);

      await supabaseAdmin.from("audit_logs").insert({
        actor_id: context.userId,
        action: "agent.knowledge_reingest",
        entity_type: "knowledge_chunks",
        entity_id: "all",
        metadata: { sources },
      });

      return { sources, total: sources.reduce((s, r) => s + r.chunks, 0) };
    },
  );

export const adminKnowledgeStatus = createServerFn({ method: "POST" })
  .middleware([requireStaff])
  .handler(async ({ context }): Promise<{ source: string; chunks: number }[]> => {
    const { data, error } = await context.supabase.from("knowledge_chunks").select("source");
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const row of (data as { source: string }[]) ?? []) {
      counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([source, chunks]) => ({ source, chunks }))
      .sort((a, b) => a.source.localeCompare(b.source));
  });
