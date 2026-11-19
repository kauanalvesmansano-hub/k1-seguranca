-- =====================================================================
-- K1 SEGURANÇA — Migração 012 (pode rodar mais de uma vez)
--  O celular da central toca sem parar até o alerta ser RESOLVIDO.
--  Esta função diz quais dos alertas que estão tocando ainda não foram resolvidos.
-- =====================================================================
create or replace function public.central_situacao(p_token text, p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::json; end if;
  if cardinality(p_ids) > 200 then raise exception 'dados_invalidos'; end if;
  return coalesce((select json_agg(a.id) from public.alertas a
                    where a.id = any(p_ids) and a.empresa_id = c.empresa_id and a.status <> 'resolvido'), '[]'::json);
end $$;
revoke all on function public.central_situacao(text, uuid[]) from public;
grant execute on function public.central_situacao(text, uuid[]) to anon, authenticated;

select 'migracao 012 ok' as resultado;
