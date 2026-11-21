-- Migração 030 — alerta de SEM SINAL / SEM INTERNET e de BATERIA ACABOU (extrema urgência)
-- O celular manda sinal de vida a cada 2 min. Se uma pessoa em turno ficar 6 min sem mandar nada,
-- o servidor cria o alerta sozinho (o celular sem bateria/sem internet não consegue avisar).
-- Se a última bateria era 10% ou menos (sem carregar), o alerta é BATERIA ACABOU.
-- Quando o Android desliga (bateria zerada ou alguém desligou), o app manda um último aviso na hora.
-- Quando o celular volta a dar sinal, o alerta é fechado sozinho com o horário da volta.

alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check
  check (tipo in ('panico', 'coacao', 'senha_errada', 'sem_resposta', 'bateria_baixa', 'fora_do_posto',
                  'sem_movimento', 'atraso_chegada', 'batida', 'ronda_perdida', 'plantao_nao_assumido',
                  'sem_sinal', 'bateria_acabou', 'bateria_critica', 'celular_desligado'));

alter table public.vigilantes add column if not exists sem_sinal_alertado_em timestamptz;
alter table public.vigilantes add column if not exists alerta_bateria_critica_em timestamptz;

create or replace function public.vig_telemetria(
  p_token text, p_lat double precision, p_lng double precision, p_precisao_m real,
  p_bateria int, p_carregando boolean, p_wifi_conectado boolean, p_wifi_nome text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); e public.empresas; d double precision; v_antes timestamptz;
begin
  if not v.em_turno then
    return json_build_object('em_turno', false);
  end if;
  select * into e from public.empresas where id = v.empresa_id;
  v_antes := greatest(v.ultima_atualizacao, v.turno_iniciado_em);
  insert into public.telemetria (empresa_id, vigilante_id, lat, lng, precisao_m, bateria, carregando, wifi_conectado, wifi_nome)
  values (v.empresa_id, v.id, p_lat, p_lng, p_precisao_m, p_bateria, p_carregando, p_wifi_conectado, p_wifi_nome);
  update public.vigilantes
     set ultima_lat = coalesce(p_lat, ultima_lat), ultima_lng = coalesce(p_lng, ultima_lng),
         ultima_precisao_m = p_precisao_m, ultima_bateria = p_bateria, ultimo_carregando = p_carregando,
         ultimo_wifi = p_wifi_conectado, ultimo_wifi_nome = p_wifi_nome, ultima_atualizacao = now()
   where id = v.id returning * into v;

  -- Bateria baixa: 15% ou menos, sem carregar, no máximo 1 alerta por hora
  if p_bateria is not null and p_bateria <= 15 and not coalesce(p_carregando, false)
     and (v.ultimo_alerta_bateria is null or v.ultimo_alerta_bateria < now() - interval '1 hour') then
    perform public._criar_alerta(v, 'bateria_baixa', p_lat, p_lng);
    update public.vigilantes set ultimo_alerta_bateria = now() where id = v.id;
  end if;

  -- Bateria crítica: 5% ou menos, sem carregar — vai desligar a qualquer momento (1 por hora)
  if p_bateria is not null and p_bateria <= 5 and not coalesce(p_carregando, false)
     and (v.alerta_bateria_critica_em is null or v.alerta_bateria_critica_em < now() - interval '1 hour') then
    perform public._criar_alerta(v, 'bateria_critica', p_lat, p_lng);
    update public.vigilantes set alerta_bateria_critica_em = now() where id = v.id;
  end if;

  -- O celular voltou a dar sinal depois de um alerta de sem sinal / bateria acabou / desligado
  if v.sem_sinal_alertado_em is not null and v.sem_sinal_alertado_em >= coalesce(v_antes, '-infinity') then
    update public.alertas
       set status = 'resolvido', resolvido_em = now(),
           observacao = left(trim(coalesce(observacao, '') || ' Automático: o celular voltou a dar sinal às '
                              || to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI') || '.'), 500)
     where vigilante_id = v.id and status <> 'resolvido' and tipo in ('sem_sinal', 'bateria_acabou', 'celular_desligado')
       and criado_em > now() - interval '24 hours';
    update public.vigilantes set sem_sinal_alertado_em = null where id = v.id;
  end if;

  -- Cerca virtual: saiu do raio do posto (descontando a imprecisão do GPS)
  if v.posto_lat is not null and p_lat is not null and coalesce(p_precisao_m, 0) < 200 then
    d := public._distancia_m(v.posto_lat, v.posto_lng, p_lat, p_lng);
    if d > v.posto_raio_m + coalesce(p_precisao_m, 0) and not v.fora_do_posto then
      perform public._criar_alerta(v, 'fora_do_posto', p_lat, p_lng);
      update public.vigilantes set fora_do_posto = true where id = v.id;
    elsif d <= v.posto_raio_m and v.fora_do_posto then
      update public.vigilantes set fora_do_posto = false where id = v.id;
    end if;
  end if;

  return json_build_object('em_turno', true, 'proximo_checkin', v.proximo_checkin,
                           'checkin_devido', v.proximo_checkin <= now(), 'homem_caido_min', e.homem_caido_min);
end $$;

-- Último aviso do celular quando o Android vai desligar
create or replace function public.vig_desligando(p_token text, p_bateria int, p_carregando boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); v_tipo text;
begin
  if not v.em_turno then return json_build_object('ok', false); end if;
  if v.sem_sinal_alertado_em is not null and v.sem_sinal_alertado_em > now() - interval '10 minutes' then
    return json_build_object('ok', true);
  end if;
  v_tipo := case when coalesce(p_bateria, v.ultima_bateria, 100) <= 10 and not coalesce(p_carregando, false)
                 then 'bateria_acabou' else 'celular_desligado' end;
  update public.vigilantes set ultima_bateria = coalesce(p_bateria, ultima_bateria) where id = v.id returning * into v;
  perform public._criar_alerta(v, v_tipo, null, null);
  update public.vigilantes set sem_sinal_alertado_em = now() where id = v.id;
  return json_build_object('ok', true, 'tipo', v_tipo);
end $$;
revoke all on function public.vig_desligando(text, int, boolean) from public;
grant execute on function public.vig_desligando(text, int, boolean) to anon, authenticated;

-- Roda a cada minuto: quem está em turno e parou de dar sinal há 6 minutos
create or replace function public.verificar_sem_sinal()
returns int language plpgsql security definer set search_path = public as $$
declare v public.vigilantes; n int := 0;
begin
  for v in
    select g.* from public.vigilantes g join public.empresas e on e.id = g.empresa_id
     where g.ativo and g.em_turno and e.ativa and e.plano_status = 'ativo'
       and coalesce(greatest(g.ultima_atualizacao, g.turno_iniciado_em), now()) < now() - interval '6 minutes'
       and (g.sem_sinal_alertado_em is null
            or g.sem_sinal_alertado_em < greatest(g.ultima_atualizacao, g.turno_iniciado_em))
  loop
    perform public._criar_alerta(v,
      case when v.ultima_bateria is not null and v.ultima_bateria <= 10 and not coalesce(v.ultimo_carregando, false)
           then 'bateria_acabou' else 'sem_sinal' end, null, null);
    update public.vigilantes set sem_sinal_alertado_em = now() where id = v.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.verificar_sem_sinal() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('k1-sem-sinal') where exists (select 1 from cron.job where jobname = 'k1-sem-sinal');
    perform cron.schedule('k1-sem-sinal', '* * * * *', 'select public.verificar_sem_sinal()');
  end if;
end $$;

-- WhatsApp e administração também recebem os novos alertas (vigilante individual e família)
create or replace function public.ponte_pendentes(p_segredo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  return coalesce((select json_agg(x order by x.criado_em) from (
    select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.observacao, a.detalhe, e.tipo as conta,
           g.nome as vigilante, coalesce((select nome from public.clientes where id = a.cliente_id), g.posto, g.acompanhar_destino, '') as posto,
           e.nome as empresa,
           case when e.tipo <> 'seguranca' and g.gravar_sos then (select token from public.sos_links where alerta_id = a.id) end as sos_token,
           coalesce((select json_agg(json_build_object('tipo', ct.tipo, 'nome', ct.nome, 'whatsapp', ct.whatsapp))
                       from public.contatos_alerta ct where ct.empresa_id = a.empresa_id), '[]'::json) as contatos
      from public.alertas a
      join public.vigilantes g on g.id = a.vigilante_id
      join public.empresas e on e.id = a.empresa_id
     where a.envio_status = 'pendente' and a.criado_em > now() - interval '2 hours'
       and e.ativa and e.plano_status = 'ativo'
       and not (a.tipo = 'panico' and e.tipo = 'seguranca')
       and not (e.tipo = 'autonomo' and a.tipo not in ('panico', 'coacao', 'sem_movimento', 'batida', 'sem_sinal', 'bateria_acabou', 'bateria_critica', 'celular_desligado'))
     limit 20) x), '[]'::json);
end $$;

create or replace function public.admin_sos_ativos()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao'; end if;
  return coalesce((select json_agg(x order by x.criado_em desc) from (
    select a.id, a.tipo, a.status, a.criado_em, a.lat, a.lng, a.bateria, a.sos_gravando, a.sos_encerrado_em,
           g.nome as pessoa, g.telefone, coalesce(g.posto, '') as local, e.nome as conta, e.tipo as plano,
           (select token from public.sos_links where alerta_id = a.id and expira_em > now()) as token,
           (select count(*) from public.sos_midia m where m.alerta_id = a.id) as trechos,
           (select json_agg(json_build_object('nome', ct.nome, 'whatsapp', ct.whatsapp)) from public.contatos_alerta ct where ct.empresa_id = e.id) as contatos
      from public.alertas a
      join public.vigilantes g on g.id = a.vigilante_id
      join public.empresas e on e.id = a.empresa_id
     where e.tipo in ('autonomo', 'familia') and a.tipo in ('panico', 'coacao', 'sem_movimento', 'batida', 'sem_sinal', 'bateria_acabou', 'celular_desligado')
       and a.criado_em > now() - interval '24 hours'
     limit 50) x), '[]'::json);
end $$;

select 'migracao 030 ok' as resultado;
