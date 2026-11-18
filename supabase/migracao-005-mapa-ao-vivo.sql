-- =====================================================================
-- K1 SEGURANÇA — Migração 005 (pode rodar mais de uma vez)
--  * Mapa ao vivo: cada ponto de ronda ganha a posição no mapa
--    (gravada automaticamente na primeira leitura do QR)
-- =====================================================================
alter table public.pontos_ronda add column if not exists lat double precision;
alter table public.pontos_ronda add column if not exists lng double precision;

-- Pontos já lidos: usa a primeira leitura com GPS
update public.pontos_ronda p
   set lat = r.lat, lng = r.lng
  from (select distinct on (ponto_id) ponto_id, lat, lng
          from public.rondas_registros where lat is not null order by ponto_id, criado_em) r
 where r.ponto_id = p.id and p.lat is null;

create or replace function public.vig_registrar_ponto(p_token text, p_codigo text, p_lat double precision, p_lng double precision)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); p public.pontos_ronda;
        la double precision; ln double precision;
begin
  if not v.em_turno then raise exception 'inicie_o_turno'; end if;
  select * into p from public.pontos_ronda where codigo = upper(trim(p_codigo)) and empresa_id = v.empresa_id and ativo;
  if not found then raise exception 'ponto_invalido'; end if;
  la := coalesce(p_lat, v.ultima_lat); ln := coalesce(p_lng, v.ultima_lng);
  insert into public.rondas_registros (empresa_id, vigilante_id, ponto_id, lat, lng)
  values (v.empresa_id, v.id, p.id, la, ln);
  if p.lat is null and la is not null then
    update public.pontos_ronda set lat = la, lng = ln where id = p.id;
  end if;
  return json_build_object('ponto', p.nome, 'hora', now());
end $$;
grant update (lat, lng) on public.pontos_ronda to authenticated;

select 'migracao 005 ok' as resultado;
