/**
 * Local RAG ingestion for the SAAJ AI agent's static knowledge base.
 *
 *   node scripts/ingest-knowledge.mjs
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env, chunks the
 * sources in src/lib/agent/knowledge-sources.ts exactly as src/lib/agent/
 * ingest.ts does, and calls replace_knowledge_source(). Idempotent — safe
 * to run repeatedly. In the deployed app the same thing runs from
 * Admin → Overview → "Re-ingest knowledge".
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Extract the KNOWLEDGE_SOURCES array literal from the TS module.
const srcFile = readFileSync(path.join(root, "src/lib/agent/knowledge-sources.ts"), "utf8");
const literal = srcFile.match(/export const KNOWLEDGE_SOURCES[^=]*=\s*(\[[\s\S]*?\n\]);/)[1];
const constants = { UPDATED: srcFile.match(/const UPDATED = "([^"]+)"/)?.[1] ?? "2026-08-31" };
// eslint-disable-next-line no-new-func
const KNOWLEDGE_SOURCES = Function(...Object.keys(constants), `return ${literal};`)(
  ...Object.values(constants),
);

const MAX_CHUNK_CHARS = 1200;

async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sectionChunks(src, section) {
  const paras = section.body.map((p) => p.trim()).filter(Boolean);
  const chunks = [];
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
  return chunks.map((c) => `${src.pageTitle} — ${section.heading}\n${c}`);
}

let total = 0;
for (const src of KNOWLEDGE_SOURCES) {
  const chunks = [];
  for (const section of src.sections) {
    for (const content of sectionChunks(src, section)) {
      chunks.push({
        page_title: src.pageTitle,
        page_url: src.pageUrl,
        section: section.heading,
        content,
        content_hash: await sha256Hex(`${src.source}|${section.heading}|${content}`),
        token_estimate: Math.ceil(content.length / 4),
        last_updated: src.lastUpdated,
      });
    }
  }
  const { error } = await admin.rpc("replace_knowledge_source", {
    p_source: src.source,
    p_chunks: chunks,
  });
  if (error) {
    console.error(`  ✗ ${src.source}: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${src.source} — ${chunks.length} chunks`);
    total += chunks.length;
  }
}
console.log(`\nIngested ${total} chunks across ${KNOWLEDGE_SOURCES.length} sources.`);
