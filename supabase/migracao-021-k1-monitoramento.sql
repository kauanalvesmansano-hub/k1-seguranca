-- =====================================================================
-- K1 SEGURANÇA — Migração 021: K1 MONITORAMENTO (central geral do dono do K1)
--  * O dono vê TODAS as contas: empresas de segurança (com os vigilantes
--    dentro de cada empresa), vigilantes individuais, caminhoneiros e família.
--  * Fila única de alertas de todo mundo: atende e resolve um por um.
--  * "Central global": o celular do dono toca como ligação (com voz) para
--    qualquer disparo de qualquer conta.
--  Pode rodar mais de uma vez.
-- =====================================================================

-- Coluna de profissão (vigilante | caminhoneiro), usada também no cadastro individual
alter table public.vigilantes add column if not exists profissao text not null default 'vigilante';
do $$ begin
  alter table public.vigilantes add constraint vigilantes_profissao_chk check (profissao in ('vigilante', 'caminhoneiro'));
exception when duplicate_object then null; end $$;

-- 1) Central global (não pertence a uma empresa)
alter table public.centrais alter column empresa_id drop not null;
alter table public.centrais add column if not exists global boolean not null default false;

create or replace function public._central_por_token(p_token text)
returns public.centrais language plpgsql security definer set search_path = public as $$
declare c public.centrais;
begin
  select * into c from public.centrais where token_hash = public._hash_token(p_token);
  if not found then raise exception 'central_nao_autorizada' using errcode = '28000'; end if;
  if c.global then return c; end if;
  if not exists (select 1 from public.empresas where id = c.empresa_id and ativa and plano_status = 'ativo') then
    raise exception 'empresa_bloqueada' using errcode = '28000';
  end if;
  return c;
end $$;

create or replace function public.mon_ativar_central(p_nome text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.centrais (empresa_id, global, nome, token_hash, ultimo_contato)
  values (null, true, coalesce(nullif(trim(p_nome), ''), 'K1 Monitoramento'), public._hash_token(t), now());
  return t;
end $$;

-- Funções da central valem para a central global (todas as contas)
create or replace function public.central_alertas(p_token text, p_desde timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token); agora timestamptz := clock_timestamp();
begin
  update public.centrais set ultimo_contato = agora where id = c.id;
  return json_build_object(
    'agora', agora,
    'alertas', coalesce((select json_agg(x order by x.criado_em) from (
      select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.status, a.sos_gravando,
             g.nome as vigilante, coalesce(nullif(cl.nome, ''), g.posto, '') as posto, g.gravar_sos,
             coalesce(a.detalhe, '') as detalhe,
             case when c.global then e.nome else '' end as empresa
        from public.alertas a
        join public.vigilantes g on g.id = a.vigilante_id
        join public.empresas e on e.id = a.empresa_id
        left join public.clientes cl on cl.id = a.cliente_id
       where (c.global or a.empresa_id = c.empresa_id)
         and a.criado_em > coalesce(p_desde, agora) - interval '1 minute'
         and a.criado_em > agora - interval '30 minutes'
       order by a.criado_em
       limit 40) x), '[]'::json));
end $$;

create or replace function public.central_situacao(p_token text, p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::json; end if;
  if cardinality(p_ids) > 200 then raise exception 'dados_invalidos'; end if;
  return coalesce((select json_agg(a.id) from public.alertas a
                    where a.id = any(p_ids) and (c.global or a.empresa_id = c.empresa_id) and a.status <> 'resolvido'), '[]'::json);
end $$;

create or replace function public.central_atender(p_token text, p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin
  update public.alertas set status = 'em_atendimento', atendido_em = coalesce(atendido_em, now()),
         atendido_por = case when c.global then 'K1 Monitoramento: ' else 'Central: ' end || c.nome
   where id = p_alerta_id and (c.global or empresa_id = c.empresa_id) and status = 'aberto';
end $$;

create or replace function public.central_sos_encerrar(p_token text, p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin
  update public.alertas set sos_encerrado_em = now(), sos_gravando = false, sos_encerrado_por = 'central: ' || c.nome
   where id = p_alerta_id and (c.global or empresa_id = c.empresa_id) and sos_encerrado_em is null;
end $$;

create or replace function public.central_sos_trechos(p_token text, p_alerta_id uuid, p_depois int)
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token); v_emp uuid;
begin
  v_emp := case when c.global then (select empresa_id from public.alertas where id = p_alerta_id) else c.empresa_id end;
  return public._sos_trechos(v_emp, p_alerta_id, p_depois);
end $$;

-- 2) Painel / app K1 Monitoramento (login do dono do K1)
create or replace function public._mon_ok() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if; end $$;

create or replace function public.mon_resumo()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return json_build_object(
    'agora', now(),
    'empresas', (select count(*) from public.empresas where tipo = 'seguranca'),
    'individuais', (select count(*) from public.empresas where tipo = 'autonomo'),
    'familias', (select count(*) from public.empresas where tipo = 'familia'),
    'pessoas', (select count(*) from public.vigilantes where ativo),
    'em_turno', (select count(*) from public.vigilantes where ativo and em_turno),
    'sem_sinal', (select count(*) from public.vigilantes where ativo and em_turno
                   and coalesce(ultima_atualizacao, turno_iniciado_em, now()) < now() - interval '10 minutes'),
    'bateria_baixa', (select count(*) from public.vigilantes where ativo and em_turno and ultima_bateria < 20),
    'alertas_abertos', (select count(*) from public.alertas where status <> 'resolvido' and criado_em > now() - interval '24 hours'),
    'sos_ao_vivo', (select count(*) from public.alertas where sos_gravando and status <> 'resolvido'));
end $$;

-- Todas as contas (empresas, individuais, caminhoneiros, família), com os números de cada uma
create or replace function public.mon_empresas()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(x order by x.alertas desc, x.nome) from (
    select e.id, e.nome, e.tipo, e.cnpj, e.plano_status, e.ativa, e.criado_em, e.teste_ate,
           e.qtd_vigilantes_contratados as vagas,
           (select count(*) from public.vigilantes g where g.empresa_id = e.id and g.ativo) as pessoas,
           (select count(*) from public.vigilantes g where g.empresa_id = e.id and g.ativo and g.em_turno) as em_turno,
           (select min(g.ultima_bateria) from public.vigilantes g where g.empresa_id = e.id and g.ativo and g.em_turno) as bateria_min,
           (select count(*) from public.alertas a where a.empresa_id = e.id and a.status <> 'resolvido'
               and a.criado_em > now() - interval '24 hours') as alertas,
           (select string_agg(distinct g.profissao, ',') from public.vigilantes g where g.empresa_id = e.id and g.ativo) as profissoes,
           (select u.email from public.usuarios_empresa ue join auth.users u on u.id = ue.user_id
             where ue.empresa_id = e.id order by ue.papel limit 1) as email,
           (select g.telefone from public.vigilantes g where g.empresa_id = e.id and g.ativo and g.telefone is not null limit 1) as telefone
      from public.empresas e) x), '[]'::json);
end $$;

-- Pessoas de uma conta (ou de todas, com p_empresa_id nulo): bateria, localização, turno, alerta aberto
create or replace function public.mon_pessoas(p_empresa_id uuid default null, p_so_turno boolean default false)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(x order by x.em_turno desc, x.nome) from (
    select g.id, g.empresa_id, e.nome as empresa, e.tipo as plano, g.nome, g.matricula, g.matricula_acesso, g.telefone,
           g.profissao, coalesce(nullif(cl.nome, ''), g.posto, '') as local, g.em_turno, g.turno_iniciado_em,
           g.ultima_lat as lat, g.ultima_lng as lng, g.ultima_precisao_m as precisao, g.ultima_bateria as bateria,
           g.ultimo_carregando as carregando, g.ultimo_wifi as wifi, g.ultima_atualizacao as atualizado,
           g.fora_do_posto, g.dispositivo_ativo, g.termo_aceito_em is not null as termo,
           (select json_build_object('id', a.id, 'tipo', a.tipo, 'status', a.status, 'criado_em', a.criado_em)
              from public.alertas a where a.vigilante_id = g.id and a.status <> 'resolvido'
               and a.criado_em > now() - interval '24 hours' order by a.criado_em desc limit 1) as alerta
      from public.vigilantes g
      join public.empresas e on e.id = g.empresa_id
      left join public.clientes cl on cl.id = g.cliente_id
     where g.ativo and (p_empresa_id is null or g.empresa_id = p_empresa_id)
       and (not coalesce(p_so_turno, false) or g.em_turno)
     limit 3000) x), '[]'::json);
end $$;

-- Fila de alertas de todas as contas
create or replace function public.mon_alertas(p_todos boolean default false, p_empresa_id uuid default null, p_limite int default 300)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(x order by x.criado_em desc) from (
    select a.id, a.tipo, a.status, a.lat, a.lng, a.bateria, a.criado_em, a.atendido_em, a.atendido_por, a.resolvido_em,
           a.observacao, a.detalhe, a.sos_gravando, a.sos_encerrado_em, a.empresa_id, a.vigilante_id,
           e.nome as empresa, e.tipo as plano, g.nome as pessoa, g.telefone, g.profissao,
           coalesce(nullif(cl.nome, ''), g.posto, '') as local,
           (select count(*) from public.sos_midia m where m.alerta_id = a.id) as trechos,
           (select token from public.sos_links where alerta_id = a.id and expira_em > now()) as sos_token
      from public.alertas a
      join public.empresas e on e.id = a.empresa_id
      join public.vigilantes g on g.id = a.vigilante_id
      left join public.clientes cl on cl.id = a.cliente_id
     where (p_empresa_id is null or a.empresa_id = p_empresa_id)
       and (coalesce(p_todos, false) or (a.status <> 'resolvido' and a.criado_em > now() - interval '24 hours'))
     order by a.criado_em desc
     limit least(greatest(coalesce(p_limite, 300), 1), 1000)) x), '[]'::json);
end $$;

create or replace function public.mon_atender(p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  update public.alertas set status = 'em_atendimento', atendido_em = coalesce(atendido_em, now()),
         atendido_por = coalesce(atendido_por, 'K1 Monitoramento')
   where id = p_alerta_id and status = 'aberto';
end $$;

create or replace function public.mon_resolver(p_alerta_id uuid, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  update public.alertas
     set status = 'resolvido', resolvido_em = now(), resolvido_por = auth.uid(),
         atendido_em = coalesce(atendido_em, now()), atendido_por = coalesce(atendido_por, 'K1 Monitoramento'),
         observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), observacao),
         sos_encerrado_em = case when sos_gravando then now() else sos_encerrado_em end,
         sos_gravando = false,
         sos_encerrado_por = case when sos_gravando then 'K1 Monitoramento' else sos_encerrado_por end
   where id = p_alerta_id and status <> 'resolvido';
end $$;

-- Resolver vários de uma vez (ex.: vários disparos de teste)
create or replace function public.mon_resolver_varios(p_ids uuid[], p_observacao text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public._mon_ok();
  if p_ids is null or cardinality(p_ids) > 500 then raise exception 'dados_invalidos'; end if;
  update public.alertas
     set status = 'resolvido', resolvido_em = now(), resolvido_por = auth.uid(),
         atendido_em = coalesce(atendido_em, now()), atendido_por = coalesce(atendido_por, 'K1 Monitoramento'),
         observacao = coalesce(nullif(left(trim(coalesce(p_observacao, '')), 500), ''), observacao),
         sos_encerrado_em = case when sos_gravando then now() else sos_encerrado_em end, sos_gravando = false
   where id = any(p_ids) and status <> 'resolvido';
  get diagnostics n = row_count;
  return n;
end $$;

-- Ocorrências e livro de todas as contas
create or replace function public.mon_ocorrencias(p_empresa_id uuid default null, p_dias int default 30)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(x order by x.criado_em desc) from (
    select o.id, o.tipo, o.descricao, o.status, o.lat, o.lng, o.criado_em, o.foto_base64 is not null as tem_foto,
           e.nome as empresa, g.nome as pessoa, coalesce(nullif(cl.nome, ''), g.posto, '') as local
      from public.ocorrencias o
      join public.empresas e on e.id = o.empresa_id
      join public.vigilantes g on g.id = o.vigilante_id
      left join public.clientes cl on cl.id = o.cliente_id
     where (p_empresa_id is null or o.empresa_id = p_empresa_id)
       and o.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 366))
     order by o.criado_em desc limit 1000) x), '[]'::json);
end $$;

create or replace function public.mon_livro(p_empresa_id uuid default null, p_dias int default 7)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(x order by x.hora desc) from (
    select l.id, l.assunto, l.descricao, coalesce(l.hora_fato, l.criado_em) as hora, l.lat, l.lng,
           l.foto_base64 is not null as tem_foto, l.oculto_vigilante, l.alerta_id,
           e.nome as empresa, g.nome as pessoa, coalesce(nullif(cl.nome, ''), g.posto, '') as local
      from public.livro_registros l
      join public.empresas e on e.id = l.empresa_id
      join public.vigilantes g on g.id = l.vigilante_id
      left join public.clientes cl on cl.id = l.cliente_id
     where (p_empresa_id is null or l.empresa_id = p_empresa_id)
       and l.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 366))
     order by coalesce(l.hora_fato, l.criado_em) desc limit 1000) x), '[]'::json);
end $$;

create or replace function public.mon_foto(p_tipo text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  if p_tipo = 'ocorrencia' then return (select foto_base64 from public.ocorrencias where id = p_id); end if;
  return (select foto_base64 from public.livro_registros where id = p_id);
end $$;

-- Relatório: por conta e por tipo, com tempo de atendimento
create or replace function public.mon_relatorio(p_dias int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare d int := least(greatest(coalesce(p_dias, 30), 1), 366);
begin
  perform public._mon_ok();
  return json_build_object(
    'dias', d,
    'total', (select count(*) from public.alertas where criado_em > now() - make_interval(days => d)),
    'por_tipo', coalesce((select json_object_agg(tipo, n) from (
        select tipo, count(*) n from public.alertas where criado_em > now() - make_interval(days => d) group by tipo) t), '{}'::json),
    'por_dia', coalesce((select json_agg(json_build_object('dia', dia, 'n', n) order by dia) from (
        select (criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) n
          from public.alertas where criado_em > now() - make_interval(days => d) group by 1) t), '[]'::json),
    'por_hora', coalesce((select json_agg(json_build_object('hora', h, 'n', n) order by h) from (
        select extract(hour from criado_em at time zone 'America/Sao_Paulo')::int as h, count(*) n
          from public.alertas where criado_em > now() - make_interval(days => d) and tipo in ('panico', 'coacao') group by 1) t), '[]'::json),
    'atendimento_medio_min', (select round(avg(extract(epoch from (atendido_em - criado_em)) / 60)::numeric, 1)
          from public.alertas where atendido_em is not null and criado_em > now() - make_interval(days => d)),
    'resolucao_media_min', (select round(avg(extract(epoch from (resolvido_em - criado_em)) / 60)::numeric, 1)
          from public.alertas where resolvido_em is not null and criado_em > now() - make_interval(days => d)),
    'sem_resolver', (select count(*) from public.alertas where status <> 'resolvido' and criado_em > now() - make_interval(days => d)),
    'ocorrencias', (select count(*) from public.ocorrencias where criado_em > now() - make_interval(days => d)),
    'livro', (select count(*) from public.livro_registros where criado_em > now() - make_interval(days => d)),
    'por_conta', coalesce((select json_agg(x order by x.total desc) from (
        select e.id, e.nome, e.tipo, count(a.id) as total,
               count(a.id) filter (where a.tipo in ('panico', 'coacao')) as panicos,
               count(a.id) filter (where a.status <> 'resolvido') as abertos,
               round(avg(extract(epoch from (a.atendido_em - a.criado_em)) / 60)::numeric, 1) as atendimento_min
          from public.empresas e
          join public.alertas a on a.empresa_id = e.id and a.criado_em > now() - make_interval(days => d)
         group by e.id, e.nome, e.tipo) x), '[]'::json));
end $$;

-- SOS ao vivo (câmera + áudio) de qualquer conta
create or replace function public.mon_sos_trechos(p_alerta_id uuid, p_depois int)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return public._sos_trechos((select empresa_id from public.alertas where id = p_alerta_id), p_alerta_id, p_depois);
end $$;

create or replace function public.mon_sos_encerrar(p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  update public.alertas set sos_encerrado_em = now(), sos_gravando = false, sos_encerrado_por = 'K1 Monitoramento'
   where id = p_alerta_id and sos_encerrado_em is null;
end $$;

-- Trilha (por onde a pessoa passou nas últimas horas)
create or replace function public.mon_trilha(p_vigilante_id uuid, p_horas int default 6)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(json_build_array(t.lat, t.lng, t.bateria, t.criado_em) order by t.criado_em)
                     from (select * from public.telemetria
                            where vigilante_id = p_vigilante_id and lat is not null
                              and criado_em > now() - make_interval(hours => least(greatest(coalesce(p_horas, 6), 1), 48))
                            order by criado_em desc limit 2000) t), '[]'::json);
end $$;

-- Permissões
revoke all on function public._mon_ok(), public.mon_ativar_central(text), public.mon_resumo(), public.mon_empresas(),
  public.mon_pessoas(uuid, boolean), public.mon_alertas(boolean, uuid, int), public.mon_atender(uuid),
  public.mon_resolver(uuid, text), public.mon_resolver_varios(uuid[], text), public.mon_ocorrencias(uuid, int),
  public.mon_livro(uuid, int), public.mon_foto(text, uuid), public.mon_relatorio(int), public.mon_sos_trechos(uuid, int),
  public.mon_sos_encerrar(uuid), public.mon_trilha(uuid, int) from public, anon;
grant execute on function public.mon_ativar_central(text), public.mon_resumo(), public.mon_empresas(),
  public.mon_pessoas(uuid, boolean), public.mon_alertas(boolean, uuid, int), public.mon_atender(uuid),
  public.mon_resolver(uuid, text), public.mon_resolver_varios(uuid[], text), public.mon_ocorrencias(uuid, int),
  public.mon_livro(uuid, int), public.mon_foto(text, uuid), public.mon_relatorio(int), public.mon_sos_trechos(uuid, int),
  public.mon_sos_encerrar(uuid), public.mon_trilha(uuid, int) to authenticated;

select 'migracao 021 ok' as resultado;
