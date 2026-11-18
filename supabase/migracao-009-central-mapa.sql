-- =====================================================================
-- K1 SEGURANÇA — Migração 009 (pode rodar mais de uma vez)
--  Celular/tela da central: mapa com todos os vigilantes (ou pessoas) em turno
--  e os alertas abertos, usando só o token da central (sem login).
-- =====================================================================
create or replace function public.central_mapa(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token); e public.empresas;
begin
  update public.centrais set ultimo_contato = now() where id = c.id;
  select * into e from public.empresas where id = c.empresa_id;
  return json_build_object(
    'empresa', e.nome, 'tipo', e.tipo, 'agora', now(),
    'pessoas', coalesce((select json_agg(x order by x.nome) from (
       select g.id, g.nome, g.posto, g.em_turno, g.ultima_lat as lat, g.ultima_lng as lng, g.ultima_bateria as bateria,
              g.ultima_atualizacao as atualizado, g.fora_do_posto
         from public.vigilantes g where g.empresa_id = c.empresa_id and g.ativo and g.em_turno) x), '[]'::json),
    'alertas', coalesce((select json_agg(y order by y.criado_em desc) from (
       select a.id, a.tipo, a.status, a.lat, a.lng, a.criado_em, a.observacao, g.nome
         from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
        where a.empresa_id = c.empresa_id and a.status <> 'resolvido' and a.criado_em > now() - interval '12 hours'
        order by a.criado_em desc limit 20) y), '[]'::json));
end $$;
revoke all on function public.central_mapa(text) from public;
grant execute on function public.central_mapa(text) to anon, authenticated;
select 'migracao 009 ok' as resultado;
