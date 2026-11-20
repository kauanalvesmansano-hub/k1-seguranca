-- =====================================================================
-- K1 SEGURANÇA — Migração 013 (pode rodar mais de uma vez)
--  PLANTÃO NÃO ASSUMIDO: cada local (posto) pode ter vários vigilantes e
--  horários de início de plantão (ex.: 07:00 e 19:00). Se NENHUM vigilante
--  do local iniciar o turno até o horário + tolerância, a central recebe o alerta.
-- =====================================================================
alter table public.clientes add column if not exists plantao_horarios text[] not null default '{}';
alter table public.clientes add column if not exists plantao_dias int[] not null default '{0,1,2,3,4,5,6}';  -- 0 = domingo
alter table public.clientes add column if not exists plantao_tolerancia_min int not null default 15
  check (plantao_tolerancia_min between 0 and 180);
grant select (plantao_horarios, plantao_dias, plantao_tolerancia_min) on public.clientes to authenticated;

create table if not exists public.plantoes_verificados (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  dia        date not null,
  horario    text not null,
  assumido   boolean not null,
  criado_em  timestamptz not null default now(),
  primary key (cliente_id, dia, horario)
);
alter table public.plantoes_verificados enable row level security;
revoke all on public.plantoes_verificados from anon, authenticated;

alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check
  check (tipo in ('panico', 'coacao', 'senha_errada', 'sem_resposta', 'bateria_baixa', 'fora_do_posto',
                  'sem_movimento', 'atraso_chegada', 'batida', 'ronda_perdida', 'plantao_nao_assumido'));

-- Painel: horários do plantão do local
create or replace function public.salvar_plantao(p_cliente_id uuid, p_horarios text[], p_dias int[], p_tolerancia int)
returns void language plpgsql security definer set search_path = public as $$
declare v_ok uuid; h text;
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if cardinality(coalesce(p_horarios, '{}')) > 6 then raise exception 'no_maximo_6_horarios'; end if;
  foreach h in array coalesce(p_horarios, '{}') loop
    if h !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'horario_invalido'; end if;
  end loop;
  if exists (select 1 from unnest(coalesce(p_dias, '{}')) d where d not between 0 and 6) then raise exception 'dados_invalidos'; end if;
  if p_tolerancia is null or p_tolerancia not between 0 and 180 then raise exception 'dados_invalidos'; end if;
  update public.clientes
     set plantao_horarios = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p_horarios, '{}')) x),
         plantao_dias = (select coalesce(array_agg(distinct d order by d), '{}') from unnest(coalesce(p_dias, '{}')) d),
         plantao_tolerancia_min = p_tolerancia
   where id = p_cliente_id and empresa_id = public.minha_empresa_liberada() returning id into v_ok;
  if v_ok is null then raise exception 'nao_encontrado'; end if;
end $$;

-- Roda a cada minuto
create or replace function public.verificar_plantoes()
returns int language plpgsql security definer set search_path = public as $$
declare c record; h text; agora_local timestamp := now() at time zone 'America/Sao_Paulo';
        hoje date := (now() at time zone 'America/Sao_Paulo')::date; inicio timestamptz; v_vig public.vigilantes;
        v_assumido boolean; v_nomes text; v_alerta uuid; v_qtd int := 0;
begin
  for c in
    select cl.* from public.clientes cl
      join public.empresas e on e.id = cl.empresa_id and e.ativa and e.plano_status = 'ativo'
     where cl.ativo and cardinality(cl.plantao_horarios) > 0
       and extract(dow from agora_local)::int = any(cl.plantao_dias)
       and exists (select 1 from public.vigilantes g where g.cliente_id = cl.id and g.ativo)
  loop
    foreach h in array c.plantao_horarios loop
      inicio := (hoje + h::time) at time zone 'America/Sao_Paulo';
      -- só confere entre (horário + tolerância) e 3 h depois; e uma vez por dia/horário
      continue when now() < inicio + make_interval(mins => c.plantao_tolerancia_min)
                 or now() > inicio + make_interval(mins => c.plantao_tolerancia_min) + interval '3 hours';
      continue when exists (select 1 from public.plantoes_verificados where cliente_id = c.id and dia = hoje and horario = h);
      -- assumiu = algum vigilante do local iniciou o turno a partir de 2 h antes do horário
      v_assumido := exists (select 1 from public.vigilantes g where g.cliente_id = c.id and g.ativo and g.em_turno
                               and g.turno_iniciado_em >= inicio - interval '2 hours');
      insert into public.plantoes_verificados (cliente_id, dia, horario, assumido) values (c.id, hoje, h, v_assumido)
      on conflict do nothing;
      if not v_assumido then
        select string_agg(nome, ', ' order by nome) into v_nomes from public.vigilantes where cliente_id = c.id and ativo;
        select * into v_vig from public.vigilantes where cliente_id = c.id and ativo order by nome limit 1;
        v_alerta := public._criar_alerta(v_vig, 'plantao_nao_assumido', null, null);
        update public.alertas set detalhe = left('Ninguém assumiu o plantão das ' || h || ' em ' || c.nome || '. Escalados: ' || coalesce(v_nomes, '—'), 500),
                                  lat = null, lng = null, bateria = null
         where id = v_alerta;
        v_qtd := v_qtd + 1;
      end if;
    end loop;
  end loop;
  delete from public.plantoes_verificados where dia < hoje - 7;
  return v_qtd;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-plantoes';
    perform cron.schedule('k1-plantoes', '* * * * *', 'select public.verificar_plantoes()');
  end if;
end $$;

-- WhatsApp: manda também o detalhe (ex.: quais pontos faltaram, qual plantão ficou descoberto)
create or replace function public.ponte_pendentes(p_segredo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  return coalesce((select json_agg(x order by x.criado_em) from (
    select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.observacao, a.detalhe, e.tipo as conta,
           g.nome as vigilante, coalesce((select nome from public.clientes where id = a.cliente_id), g.posto, g.acompanhar_destino, '') as posto,
           e.nome as empresa,
           coalesce((select json_agg(json_build_object('tipo', ct.tipo, 'nome', ct.nome, 'whatsapp', ct.whatsapp))
                       from public.contatos_alerta ct where ct.empresa_id = a.empresa_id), '[]'::json) as contatos
      from public.alertas a
      join public.vigilantes g on g.id = a.vigilante_id
      join public.empresas e on e.id = a.empresa_id
     where a.envio_status = 'pendente' and a.criado_em > now() - interval '2 hours'
       and e.ativa and e.plano_status = 'ativo'
     limit 20) x), '[]'::json);
end $$;

revoke all on function public.verificar_plantoes() from public, anon, authenticated;
revoke all on function public.salvar_plantao(uuid, text[], int[], int) from public, anon;
grant execute on function public.salvar_plantao(uuid, text[], int[], int) to authenticated;

select 'migracao 013 ok' as resultado;
