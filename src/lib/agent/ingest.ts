import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { KNOWLEDGE_SOURCES, type KnowledgeSource } from "@/lib/agent/knowledge-sources";

/**
 * Static-knowledge ingestion pipeline:
 *
 *   source page → sections → semantic chunks → content hash → Supabase
 *
 * Idempotent: `replace_knowledge_source` clears a source's chunks and
 * re-inserts, and `content_hash` is unique, so running twice on unchanged
 * content changes nothing. A chunk keeps enough context (page + heading +
 * related paragraphs) for the LLM to ground an answer.
 */

const MAX_CHUNK_CHARS = 1200;

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type PreparedChunk = {
  page_title: string;
  page_url: string | null;
  section: string;
  content: string;
  content_hash: string;
  token_estimate: number;
  last_updated: string;
};

/** Split one section into chunks, never mid-paragraph, heading kept with each. */
function sectionChunks(
  src: KnowledgeSource,
  section: { heading: string; body: string[] },
): string[] {
  const paras = section.body.map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const para of paras) {
    const candidate = current ? `${current}\n${para}` : para;
    if (candidate.length > MAX_CHUNK_CHARS && current) {
      chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  // Prefix every chunk with page + section so a retrieved chunk is
  // self-describing.
  return chunks.map((c) => `${src.pageTitle} — ${section.heading}\n${c}`);
}

export async function prepareChunks(source: KnowledgeSource): Promise<PreparedChunk[]> {
  const out: PreparedChunk[] = [];
  for (const section of source.sections) {
    for (const content of sectionChunks(source, section)) {
      out.push({
        page_title: source.pageTitle,
        page_url: source.pageUrl,
        section: section.heading,
        content,
        content_hash: await sha256Hex(`${source.source}|${section.heading}|${content}`),
        token_estimate: Math.ceil(content.length / 4),
        last_updated: source.lastUpdated,
      });
    }
  }
  return out;
}

export async function ingestKnowledge(
  admin: SupabaseClient<Database>,
  sources: KnowledgeSource[] = KNOWLEDGE_SOURCES,
): Promise<{ source: string; chunks: number }[]> {
  const results: { source: string; chunks: number }[] = [];
  for (const src of sources) {
    const chunks = await prepareChunks(src);
    const { error } = await admin.rpc("replace_knowledge_source", {
      p_source: src.source,
      p_chunks:
        chunks as unknown as Database["public"]["Functions"]["replace_knowledge_source"]["Args"]["p_chunks"],
    });
    if (error) throw new Error(`ingest ${src.source}: ${error.message}`);
    results.push({ source: src.source, chunks: chunks.length });
  }
  return results;
}
