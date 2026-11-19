-- =====================================================================
-- K1 SEGURANÇA — Migração 011 (pode rodar mais de uma vez)
--  1) LOCAIS / CLIENTES: cada contrato da empresa (condomínio, loja, fábrica).
--     Vigilantes e pontos de ronda ficam ligados a um local.
--  2) RONDA PROGRAMADA: o local define "passar em todos os pontos a cada X min".
--     Se o vigilante não completar a volta no prazo, a central recebe alerta.
--  3) PORTAL DO CLIENTE: link só do cliente (sem login) para ver rondas,
--     ocorrências, visitantes e quem está de serviço no local dele.
--  4) CONTROLE DE VISITANTES na portaria.
-- =====================================================================

-- ---------- 1) Locais / clientes ----------
create table if not exists public.clientes (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas(id) on delete cascade,
  nome                  text not null check (length(trim(nome)) between 2 and 120),
  endereco              text check (length(endereco) <= 200),
  ronda_intervalo_min   int check (ronda_intervalo_min between 15 and 720),   -- null = sem ronda programada
  ronda_tolerancia_min  int not null default 10 check (ronda_tolerancia_min between 0 and 120),
  portal_token_hash     text unique,
  portal_criado_em      timestamptz,
  ativo                 boolean not null default true,
  criado_em             timestamptz not null default now()
);
create index if not exists clientes_empresa_idx on public.clientes (empresa_id);
alter table public.clientes enable row level security;
revoke all on public.clientes from anon, authenticated;
grant select (id, empresa_id, nome, endereco, ronda_intervalo_min, ronda_tolerancia_min, portal_criado_em, ativo, criado_em)
  on public.clientes to authenticated;
drop policy if exists cli_sel on public.clientes;
create policy cli_sel on public.clientes for select to authenticated using (empresa_id = public.minha_empresa_liberada());

alter table public.vigilantes       add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.vigilantes       add column if not exists ronda_ciclo_inicio timestamptz;
alter table public.pontos_ronda     add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.pontos_ronda     add column if not exists ordem int not null default 0;
alter table public.rondas_registros add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.ocorrencias      add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.alertas          add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.alertas          add column if not exists detalhe text;

-- O local é gravado no momento do registro (se o vigilante mudar de posto, o histórico não muda)
create or replace function public._cliente_do_registro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is null then
    if tg_table_name = 'rondas_registros' then
      select coalesce(p.cliente_id, v.cliente_id) into new.cliente_id
        from public.pontos_ronda p, public.vigilantes v where p.id = new.ponto_id and v.id = new.vigilante_id;
    else
      select cliente_id into new.cliente_id from public.vigilantes where id = new.vigilante_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_cliente on public.rondas_registros;
create trigger t_cliente before insert on public.rondas_registros for each row execute function public._cliente_do_registro();
drop trigger if exists t_cliente on public.ocorrencias;
create trigger t_cliente before insert on public.ocorrencias for each row execute function public._cliente_do_registro();
drop trigger if exists t_cliente on public.alertas;
create trigger t_cliente before insert on public.alertas for each row execute function public._cliente_do_registro();

-- Novo tipo de alerta
alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check
  check (tipo in ('panico', 'coacao', 'senha_errada', 'sem_resposta', 'bateria_baixa', 'fora_do_posto',
                  'sem_movimento', 'atraso_chegada', 'batida', 'ronda_perdida'));

-- Painel: criar / editar / apagar local
create or replace function public.salvar_cliente(p_id uuid, p_nome text, p_endereco text, p_intervalo int, p_tolerancia int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.minha_empresa_liberada(); v_id uuid;
begin
  if v_emp is null or not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 120 then raise exception 'dados_invalidos'; end if;
  if p_intervalo is not null and p_intervalo not between 15 and 720 then raise exception 'intervalo_de_ronda_invalido'; end if;
  if p_id is null then
    if (select count(*) from public.clientes where empresa_id = v_emp) >= 500 then raise exception 'limite_atingido'; end if;
    insert into public.clientes (empresa_id, nome, endereco, ronda_intervalo_min, ronda_tolerancia_min)
    values (v_emp, trim(p_nome), nullif(trim(coalesce(p_endereco, '')), ''), p_intervalo, coalesce(p_tolerancia, 10))
    returning id into v_id;
  else
    update public.clientes set nome = trim(p_nome), endereco = nullif(trim(coalesce(p_endereco, '')), ''),
           ronda_intervalo_min = p_intervalo, ronda_tolerancia_min = coalesce(p_tolerancia, 10)
     where id = p_id and empresa_id = v_emp returning id into v_id;
    if v_id is null then raise exception 'nao_encontrado'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.excluir_cliente(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  delete from public.clientes where id = p_id and empresa_id = public.minha_empresa_liberada();
end $$;

create or replace function public.vincular_cliente(p_vigilante_id uuid, p_ponto_id uuid, p_cliente_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.minha_empresa_liberada();
begin
  if v_emp is null or not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if p_cliente_id is not null and not exists (select 1 from public.clientes where id = p_cliente_id and empresa_id = v_emp) then
    raise exception 'nao_encontrado';
  end if;
  if p_vigilante_id is not null then
    update public.vigilantes set cliente_id = p_cliente_id, ronda_ciclo_inicio = null where id = p_vigilante_id and empresa_id = v_emp;
  end if;
  if p_ponto_id is not null then
    update public.pontos_ronda set cliente_id = p_cliente_id where id = p_ponto_id and empresa_id = v_emp;
  end if;
end $$;

-- Gera (ou troca) o link do portal. O link antigo para de funcionar.
create or replace function public.gerar_link_cliente(p_cliente_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := encode(gen_random_bytes(24), 'hex'); v_ok uuid;
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  update public.clientes set portal_token_hash = public._hash_token(v_token), portal_criado_em = now()
   where id = p_cliente_id and empresa_id = public.minha_empresa_liberada() returning id into v_ok;
  if v_ok is null then raise exception 'nao_encontrado'; end if;
  return v_token;
end $$;

create or replace function public.revogar_link_cliente(p_cliente_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'sem_permissao'; end if;
  update public.clientes set portal_token_hash = null, portal_criado_em = null
   where id = p_cliente_id and empresa_id = public.minha_empresa_liberada();
end $$;

-- ---------- 2) Ronda programada ----------
-- Situação da volta atual (o app do vigilante mostra na aba Ronda)
create or replace function public._ronda_situacao(v public.vigilantes)
returns json language plpgsql stable security definer set search_path = public as $$
declare c public.clientes; inicio timestamptz;
begin
  if v.cliente_id is null then return null; end if;
  select * into c from public.clientes where id = v.cliente_id and ativo;
  if not found or c.ronda_intervalo_min is null or not v.em_turno then return null; end if;
  inicio := greatest(coalesce(v.ronda_ciclo_inicio, v.turno_iniciado_em), v.turno_iniciado_em);
  return json_build_object(
    'local', c.nome, 'intervalo_min', c.ronda_intervalo_min, 'tolerancia_min', c.ronda_tolerancia_min,
    'inicio', inicio, 'prazo', inicio + make_interval(mins => c.ronda_intervalo_min),
    'pontos', coalesce((select json_agg(json_build_object('nome', p.nome,
                 'feito_em', (select max(r.criado_em) from public.rondas_registros r
                               where r.ponto_id = p.id and r.vigilante_id = v.id and r.criado_em >= inicio))
                 order by p.ordem, p.nome)
               from public.pontos_ronda p where p.cliente_id = c.id and p.ativo), '[]'::json));
end $$;

create or replace function public.vig_ronda_situacao(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin return public._ronda_situacao(v); end $$;

-- Lista de pontos no app: só os do local do vigilante (sem local = todos da empresa, como antes)
create or replace function public.vig_pontos_ronda(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  return coalesce((select json_agg(x order by x.ordem, x.nome) from (
    select p.id, p.nome, p.ordem,
           (select max(r.criado_em) from public.rondas_registros r
             where r.ponto_id = p.id and r.vigilante_id = v.id
               and r.criado_em >= coalesce(v.turno_iniciado_em, now() - interval '12 hours')) as ultima_leitura
      from public.pontos_ronda p
     where p.empresa_id = v.empresa_id and p.ativo
       and (v.cliente_id is null or p.cliente_id = v.cliente_id)) x), '[]'::json);
end $$;

-- Roda a cada minuto: fecha as voltas vencidas e avisa se faltou ponto
create or replace function public.verificar_rondas()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_faltando text; v_qtd int := 0; v_inicio timestamptz; v_fim timestamptz; v_vig public.vigilantes; v_alerta uuid;
begin
  for r in
    select g.id, g.turno_iniciado_em, g.ronda_ciclo_inicio, c.id as cli, c.ronda_intervalo_min as intervalo, c.ronda_tolerancia_min as tol
      from public.vigilantes g
      join public.clientes c on c.id = g.cliente_id and c.ativo and c.ronda_intervalo_min is not null
      join public.empresas e on e.id = g.empresa_id and e.ativa and e.plano_status = 'ativo'
     where g.ativo and g.em_turno and g.turno_iniciado_em is not null
       and exists (select 1 from public.pontos_ronda p where p.cliente_id = c.id and p.ativo)
  loop
    v_inicio := greatest(coalesce(r.ronda_ciclo_inicio, r.turno_iniciado_em), r.turno_iniciado_em);
    v_fim := v_inicio + make_interval(mins => r.intervalo);
    continue when now() < v_fim + make_interval(mins => r.tol);
    select string_agg(p.nome, ', ' order by p.ordem, p.nome) into v_faltando
      from public.pontos_ronda p
     where p.cliente_id = r.cli and p.ativo
       and not exists (select 1 from public.rondas_registros x
                        where x.ponto_id = p.id and x.vigilante_id = r.id
                          and x.criado_em >= v_inicio and x.criado_em <= v_fim + make_interval(mins => r.tol));
    if v_faltando is not null then
      select * into v_vig from public.vigilantes where id = r.id;
      v_alerta := public._criar_alerta(v_vig, 'ronda_perdida', null, null);
      update public.alertas set detalhe = 'Faltou: ' || left(v_faltando, 400) where id = v_alerta;
      v_qtd := v_qtd + 1;
    end if;
    -- a próxima volta começa no fim desta (se ficou muito para trás, começa agora)
    update public.vigilantes
       set ronda_ciclo_inicio = case when v_fim + make_interval(mins => r.intervalo) < now() then now() else v_fim end
     where id = r.id;
  end loop;
  return v_qtd;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-rondas';
    perform cron.schedule('k1-rondas', '* * * * *', 'select public.verificar_rondas()');
  end if;
end $$;

-- ---------- 4) Visitantes ----------
create table if not exists public.visitantes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  cliente_id    uuid references public.clientes(id) on delete set null,
  vigilante_id  uuid not null references public.vigilantes(id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 2 and 120),
  documento     text check (length(documento) <= 40),
  destino       text check (length(destino) <= 120),
  placa         text check (length(placa) <= 12),
  observacao    text check (length(observacao) <= 500),
  foto_base64   text check (length(foto_base64) <= 400000 and foto_base64 ~ '^[A-Za-z0-9+/=\r\n]+$'),
  entrada_em    timestamptz not null default now(),
  saida_em      timestamptz,
  saida_vigilante_id uuid references public.vigilantes(id) on delete set null
);
create index if not exists visitantes_empresa_idx on public.visitantes (empresa_id, entrada_em desc);
create index if not exists visitantes_cliente_idx on public.visitantes (cliente_id, entrada_em desc);
alter table public.visitantes enable row level security;
revoke all on public.visitantes from anon, authenticated;
grant select on public.visitantes to authenticated;
drop policy if exists vis_sel on public.visitantes;
create policy vis_sel on public.visitantes for select to authenticated using (empresa_id = public.minha_empresa_liberada());
drop trigger if exists t_cliente on public.visitantes;
create trigger t_cliente before insert on public.visitantes for each row execute function public._cliente_do_registro();

create or replace function public.vig_visitante_entrada(p_token text, p_nome text, p_documento text, p_destino text,
                                                        p_placa text, p_observacao text, p_foto_base64 text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); v_id uuid;
begin
  if not v.em_turno then raise exception 'inicie_o_turno'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 120 then raise exception 'informe_o_nome'; end if;
  if (select count(*) from public.visitantes where vigilante_id = v.id and entrada_em > now() - interval '1 minute') >= 10 then
    raise exception 'muitas_tentativas';
  end if;
  insert into public.visitantes (empresa_id, vigilante_id, nome, documento, destino, placa, observacao, foto_base64)
  values (v.empresa_id, v.id, trim(p_nome), nullif(trim(coalesce(p_documento, '')), ''), nullif(trim(coalesce(p_destino, '')), ''),
          nullif(upper(replace(trim(coalesce(p_placa, '')), ' ', '')), ''), nullif(trim(coalesce(p_observacao, '')), ''),
          nullif(p_foto_base64, ''))
  returning id into v_id;
  return json_build_object('id', v_id);
end $$;

create or replace function public.vig_visitante_saida(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  update public.visitantes set saida_em = now(), saida_vigilante_id = v.id
   where id = p_id and empresa_id = v.empresa_id and saida_em is null
     and (cliente_id is not distinct from v.cliente_id);
end $$;

-- Lista da portaria: quem está dentro + quem saiu nas últimas 12 h (no local do vigilante)
create or replace function public.vig_visitantes(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  return coalesce((select json_agg(x order by x.saida_em is not null, x.entrada_em desc) from (
    select id, nome, documento, destino, placa, observacao, entrada_em, saida_em, foto_base64 is not null as tem_foto
      from public.visitantes
     where empresa_id = v.empresa_id and (cliente_id is not distinct from v.cliente_id)
       and (saida_em is null or entrada_em > now() - interval '12 hours')
     order by entrada_em desc limit 100) x), '[]'::json);
end $$;

-- ---------- 3) Portal do cliente ----------
-- Só leitura, só do local dele. Não mostra senha, coação, telefone nem dados internos.
create or replace function public.cliente_portal(p_token text, p_dia date default null)
returns json language plpgsql security definer set search_path = public as $$
declare c public.clientes; e public.empresas; d0 timestamptz; d1 timestamptz;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'link_invalido'; end if;
  select * into c from public.clientes where portal_token_hash = public._hash_token(p_token) and ativo;
  if not found then raise exception 'link_invalido'; end if;
  select * into e from public.empresas where id = c.empresa_id;
  if not e.ativa or e.plano_status <> 'ativo' then raise exception 'servico_indisponivel'; end if;
  d0 := (coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date))::timestamp at time zone 'America/Sao_Paulo';
  d1 := d0 + interval '1 day';
  return json_build_object(
    'local', c.nome, 'endereco', c.endereco, 'empresa', e.nome, 'dia', (d0 at time zone 'America/Sao_Paulo')::date,
    'ronda_intervalo_min', c.ronda_intervalo_min, 'agora', now(),
    'equipe', coalesce((select json_agg(json_build_object('nome', g.nome, 'em_servico', g.em_turno,
                 'desde', case when g.em_turno then g.turno_iniciado_em end, 'ultimo_sinal', g.ultima_atualizacao,
                 'lat', case when g.em_turno then g.ultima_lat end, 'lng', case when g.em_turno then g.ultima_lng end)
                 order by g.em_turno desc, g.nome)
               from public.vigilantes g where g.cliente_id = c.id and g.ativo), '[]'::json),
    'pontos', coalesce((select json_agg(json_build_object('nome', p.nome, 'lat', p.lat, 'lng', p.lng) order by p.ordem, p.nome)
               from public.pontos_ronda p where p.cliente_id = c.id and p.ativo), '[]'::json),
    'rondas', coalesce((select json_agg(json_build_object('hora', r.criado_em, 'ponto', p.nome, 'vigilante', g.nome) order by r.criado_em desc)
               from public.rondas_registros r join public.pontos_ronda p on p.id = r.ponto_id join public.vigilantes g on g.id = r.vigilante_id
              where r.cliente_id = c.id and r.criado_em >= d0 and r.criado_em < d1), '[]'::json),
    'rondas_perdidas', coalesce((select json_agg(json_build_object('hora', a.criado_em, 'vigilante', g.nome, 'detalhe', a.detalhe) order by a.criado_em desc)
               from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
              where a.cliente_id = c.id and a.tipo = 'ronda_perdida' and a.criado_em >= d0 and a.criado_em < d1), '[]'::json),
    'ocorrencias', coalesce((select json_agg(json_build_object('hora', o.criado_em, 'tipo', o.tipo, 'descricao', o.descricao,
                 'vigilante', g.nome, 'status', o.status, 'foto', o.foto_base64) order by o.criado_em desc)
               from public.ocorrencias o join public.vigilantes g on g.id = o.vigilante_id
              where o.cliente_id = c.id and o.criado_em >= d0 and o.criado_em < d1), '[]'::json),
    'visitantes', coalesce((select json_agg(json_build_object('nome', x.nome, 'destino', x.destino, 'placa', x.placa,
                 'entrada', x.entrada_em, 'saida', x.saida_em) order by x.entrada_em desc)
               from public.visitantes x where x.cliente_id = c.id and x.entrada_em >= d0 and x.entrada_em < d1), '[]'::json),
    -- emergências: só a quantidade e se já foram atendidas (coação nunca aparece para o cliente)
    'emergencias', coalesce((select json_agg(json_build_object('hora', a.criado_em, 'tipo', a.tipo, 'status', a.status) order by a.criado_em desc)
               from public.alertas a where a.cliente_id = c.id and a.tipo in ('panico', 'sem_movimento', 'batida')
                and a.criado_em >= d0 and a.criado_em < d1), '[]'::json));
end $$;

-- ---------- Permissões ----------
revoke all on function public._cliente_do_registro(), public._ronda_situacao(public.vigilantes), public.verificar_rondas() from public, anon, authenticated;
revoke all on function public.salvar_cliente(uuid, text, text, int, int), public.excluir_cliente(uuid), public.vincular_cliente(uuid, uuid, uuid),
  public.gerar_link_cliente(uuid), public.revogar_link_cliente(uuid) from public, anon;
grant execute on function public.salvar_cliente(uuid, text, text, int, int), public.excluir_cliente(uuid), public.vincular_cliente(uuid, uuid, uuid),
  public.gerar_link_cliente(uuid), public.revogar_link_cliente(uuid) to authenticated;
revoke all on function public.vig_ronda_situacao(text), public.vig_visitante_entrada(text, text, text, text, text, text, text),
  public.vig_visitante_saida(text, uuid), public.vig_visitantes(text), public.cliente_portal(text, date) from public;
grant execute on function public.vig_ronda_situacao(text), public.vig_visitante_entrada(text, text, text, text, text, text, text),
  public.vig_visitante_saida(text, uuid), public.vig_visitantes(text), public.cliente_portal(text, date) to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.visitantes; exception when duplicate_object then null; end;
  end if;
end $$;

select 'migracao 011 ok' as resultado;
