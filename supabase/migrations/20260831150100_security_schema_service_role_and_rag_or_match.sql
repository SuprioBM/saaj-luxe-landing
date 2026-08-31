-- Two fixes.
--
-- 1. `permission denied for schema security` for service_role.
--    The private `security` schema had USAGE granted to anon/authenticated
--    only (20260816100000). That was fine while every caller of
--    public.is_active_member / active_membership was the *authenticated*
--    user's client. The SAAJ Club work then put `is_active_member` inside
--    `place_order`, which is called by the service-role admin client from
--    `initiateCheckout` — and the new AI agent's tools call
--    `is_active_member` / `active_membership` the same way. service_role
--    needs USAGE on `security` (and EXECUTE on the definer helpers) or those
--    paths fail. This grant closes the gap for member checkout and the agent.
--
-- 2. match_knowledge: full-text queries ANDed every term
--    (websearch_to_tsquery), so "how long do refunds take" missed the
--    "refunds are issued ... within 5 to 7 working days" chunk because it
--    contains neither "long" nor "take". Switch to OR-matching and let
--    ts_rank_cd reward chunks that hit more terms / tighter proximity —
--    the right behaviour for policy/FAQ retrieval where the customer's
--    wording rarely matches the document's.

grant usage on schema security to service_role;
grant execute on function security.is_staff(uuid) to service_role;
grant execute on function security.has_role(uuid, public.app_role) to service_role;
grant execute on function security.is_active_member(uuid) to service_role;
grant execute on function security.active_membership(uuid) to service_role;

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
  -- Convert the ANDed query to an ORed one: 'a & b & c' -> 'a | b | c'.
  v_or := nullif(replace(v_and::text, ' & ', ' | '), '')::tsquery;
  if v_or is null then
    return;
  end if;

  return query
    select k.id, k.source, k.page_title, k.page_url, k.section, k.content, k.last_updated,
           -- rank against the AND query when it matches (tighter), else the OR query
           ts_rank_cd(k.fts, v_and) * 2 + ts_rank_cd(k.fts, v_or) as rank
    from public.knowledge_chunks k
    where k.fts @@ v_or
      and (p_sources is null or k.source = any(p_sources))
    order by rank desc
    limit greatest(1, least(p_match_count, 20));
end;
$$;

grant execute on function public.match_knowledge(text, integer, text[]) to anon, authenticated, service_role;
