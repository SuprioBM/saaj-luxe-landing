-- SAAJ AI Commerce Agent — conversation persistence + static-knowledge RAG.
--
-- Additive only. No existing table/function/policy is touched.
--
--   * chat_threads / chat_messages — LangGraph conversation state. The
--     agent runs per-request on Cloudflare Workers (no long-lived process),
--     so thread history is loaded from here at the start of every request
--     rather than from a LangGraph checkpointer that needs a live TCP
--     connection. thread_id lives here; it is NOT a user_id or order_id.
--
--   * knowledge_chunks — the one centralized RAG layer for SAAJ's static,
--     non-transactional business knowledge (policies, FAQ, brand, care).
--     Retrieval is Postgres full-text search (`match_knowledge`): the
--     project has no embedding provider wired (Groq, the configured LLM,
--     has no embeddings API) and a Worker can't host an embedding model,
--     so lexical retrieval is the pragmatic, dependency-free choice for
--     this content. A nullable `embedding vector` column + the extension
--     are added so a hybrid vector layer is a small migration later, with
--     no re-authoring of the source text.
--
-- Live/transactional data (prices, stock, orders, membership, rewards)
-- never comes from here — it comes from the agent's backend tools.

create extension if not exists vector;

/* ---------------------------------------------------- chat persistence */

create table public.chat_threads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  title         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);
create index chat_threads_updated_idx on public.chat_threads (updated_at);

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.chat_threads(id) on delete cascade,
  -- 'user' | 'assistant' | 'tool' | 'system'
  role       text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content    text not null default '',
  -- tool calls / tool results / product refs surfaced in the UI, etc.
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

grant select on public.chat_threads, public.chat_messages to authenticated;
grant all on public.chat_threads, public.chat_messages to service_role;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- A signed-in customer may read their own threads; guest threads (user_id
-- null) are reachable only through the service-role agent endpoint, which
-- authorizes by possession of the opaque thread id. All writes go through
-- that endpoint — no client insert/update path.
create policy "read own chat threads" on public.chat_threads
  for select to authenticated using (auth.uid() = user_id);
create policy "read own chat messages" on public.chat_messages
  for select to authenticated
  using (exists (
    select 1 from public.chat_threads t
    where t.id = thread_id and t.user_id = auth.uid()
  ));

create trigger chat_threads_updated_at before update on public.chat_threads
  for each row execute function public.set_updated_at();

-- Housekeeping: drop stale guest conversations. Safe to run on any cron.
create or replace function public.prune_chat_threads(p_days integer default 30)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_count integer;
begin
  delete from public.chat_threads
   where user_id is null
     and updated_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.prune_chat_threads(integer) from public, anon, authenticated;
grant execute on function public.prune_chat_threads(integer) to service_role;

/* --------------------------------------------------- knowledge (RAG) --- */

create table public.knowledge_chunks (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,          -- stable slug, e.g. 'return-policy'
  page_title     text not null,
  page_url       text,                   -- in-app route, e.g. '/returns'
  section        text not null default '',
  content        text not null,
  -- sha256 of (source|section|content) — re-ingestion is idempotent and
  -- unchanged chunks are never duplicated.
  content_hash   text not null unique,
  token_estimate integer not null default 0,
  last_updated   date,
  -- reserved for a future hybrid vector layer; unused today.
  embedding      vector(384),
  fts            tsvector generated always as (
                   to_tsvector('english',
                     coalesce(page_title, '') || ' ' ||
                     coalesce(section, '') || ' ' ||
                     coalesce(content, ''))
                 ) stored,
  created_at     timestamptz not null default now()
);
create index knowledge_chunks_fts_idx    on public.knowledge_chunks using gin (fts);
create index knowledge_chunks_source_idx on public.knowledge_chunks (source);

grant select on public.knowledge_chunks to anon, authenticated;
grant all on public.knowledge_chunks to service_role;
alter table public.knowledge_chunks enable row level security;

-- Static, public business knowledge — readable by anyone; only the
-- service-role ingestion pipeline writes.
create policy "knowledge is public" on public.knowledge_chunks
  for select to anon, authenticated using (true);

-- Ranked lexical retrieval. `p_sources` optionally restricts to specific
-- source slugs (metadata filtering). Returns enough context per row for the
-- LLM to ground an answer; the caller decides how many rows to keep.
create or replace function public.match_knowledge(
  p_query text,
  p_match_count integer default 5,
  p_sources text[] default null
) returns table (
  id           uuid,
  source       text,
  page_title   text,
  page_url     text,
  section      text,
  content      text,
  last_updated date,
  rank         real
)
language sql stable security invoker set search_path = public as $$
  select k.id, k.source, k.page_title, k.page_url, k.section, k.content, k.last_updated,
         ts_rank_cd(k.fts, websearch_to_tsquery('english', p_query)) as rank
  from public.knowledge_chunks k
  where websearch_to_tsquery('english', p_query) @@ k.fts
    and (p_sources is null or k.source = any(p_sources))
  order by rank desc
  limit greatest(1, least(p_match_count, 20));
$$;

grant execute on function public.match_knowledge(text, integer, text[]) to anon, authenticated, service_role;

-- Replace every chunk for a source in one shot — the ingestion pipeline
-- calls this so a re-ingested page never leaves stale chunks behind.
create or replace function public.replace_knowledge_source(
  p_source text,
  p_chunks jsonb
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_chunk jsonb;
  v_count integer := 0;
begin
  delete from public.knowledge_chunks where source = p_source;
  for v_chunk in select * from jsonb_array_elements(p_chunks)
  loop
    insert into public.knowledge_chunks
      (source, page_title, page_url, section, content, content_hash, token_estimate, last_updated)
    values (
      p_source,
      v_chunk->>'page_title',
      v_chunk->>'page_url',
      coalesce(v_chunk->>'section', ''),
      v_chunk->>'content',
      v_chunk->>'content_hash',
      coalesce((v_chunk->>'token_estimate')::integer, 0),
      nullif(v_chunk->>'last_updated', '')::date
    )
    on conflict (content_hash) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.replace_knowledge_source(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_knowledge_source(text, jsonb) to service_role;
