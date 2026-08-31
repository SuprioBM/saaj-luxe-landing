-- match_knowledge: the combined rank expression is double precision but the
-- RETURNS TABLE column is `real` — cast it. Behaviour otherwise identical to
-- 20260831150100.

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
language plpgsql stable security invoker set search_path = public as $$
declare
  v_and tsquery := websearch_to_tsquery('english', p_query);
  v_or  tsquery;
begin
  v_or := nullif(replace(v_and::text, ' & ', ' | '), '')::tsquery;
  if v_or is null then
    return;
  end if;

  return query
    select k.id, k.source, k.page_title, k.page_url, k.section, k.content, k.last_updated,
           (ts_rank_cd(k.fts, v_and) * 2 + ts_rank_cd(k.fts, v_or))::real as rank
    from public.knowledge_chunks k
    where k.fts @@ v_or
      and (p_sources is null or k.source = any(p_sources))
    order by rank desc
    limit greatest(1, least(p_match_count, 20));
end;
$$;

grant execute on function public.match_knowledge(text, integer, text[]) to anon, authenticated, service_role;
