import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * RAG retrieval over SAAJ's static business knowledge (policies, FAQ,
 * brand, product care). Lexical ranking via `match_knowledge` — see the
 * migration for why this project uses full-text search rather than vector
 * embeddings.
 *
 * This is ONLY for unstructured static knowledge. Prices, stock, orders,
 * membership and rewards never come from here.
 */

export type KnowledgeHit = {
  source: string;
  pageTitle: string;
  pageUrl: string | null;
  section: string;
  content: string;
  lastUpdated: string | null;
};

export async function searchKnowledge(
  admin: SupabaseClient<Database>,
  query: string,
  opts?: { limit?: number; sources?: string[] },
): Promise<KnowledgeHit[]> {
  const { data, error } = await admin.rpc("match_knowledge", {
    p_query: query,
    p_match_count: opts?.limit ?? 5,
    p_sources: opts?.sources ?? null,
  });
  if (error) throw error;
  return (
    (data as {
      source: string;
      page_title: string;
      page_url: string | null;
      section: string;
      content: string;
      last_updated: string | null;
    }[]) ?? []
  ).map((r) => ({
    source: r.source,
    pageTitle: r.page_title,
    pageUrl: r.page_url,
    section: r.section,
    content: r.content,
    lastUpdated: r.last_updated,
  }));
}
