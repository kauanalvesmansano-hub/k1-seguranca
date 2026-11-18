-- =====================================================================
-- K1 SEGURANÇA — Migração 003 (pode rodar mais de uma vez)
--  * Ronda com QR code (pontos de ronda + registros)
--  * Cerca virtual do posto (alerta "fora do posto")
--  * Alerta automático de bateria baixa
--  * Homem caído / sem movimento (opcional, por empresa)
--  * Foto na ocorrência
-- =====================================================================

-- ---------- Novos tipos de alerta ----------
alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check
  check (tipo in ('panico', 'coacao', 'senha_errada', 'sem_resposta', 'bateria_baixa', 'fora_do_posto', 'sem_movimento'));

-- ---------- Configurações ----------
alter table public.empresas   add column if not exists homem_caido_min int not null default 0;   -- 0 = desligado
do $$ begin
  alter table public.empresas add constraint empresas_homem_caido_chk check (homem_caido_min between 0 and 60);
exception when duplicate_object then null; end $$;
grant update (homem_caido_min) on public.empresas to authenticated;

alter table public.vigilantes add column if not exists posto_lat double precision;
alter table public.vigilantes add column if not exists posto_lng double precision;
alter table public.vigilantes add column if not exists posto_raio_m int not null default 150;
alter table public.vigilantes add column if not exists fora_do_posto boolean not null default false;
alter table public.vigilantes add column if not exists ultimo_alerta_bateria timestamptz;

create or replace function public._distancia_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
       + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Empresa define (ou remove) a cerca virtual do posto de um vigilante
create or replace function public.definir_posto(p_vigilante_id uuid, p_lat double precision, p_lng double precision, p_raio_m int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() or not exists (
       select 1 from public.vigilantes where id = p_vigilante_id and empresa_id = public.minha_empresa_liberada()) then
    raise exception 'sem_permissao';
  end if;
  update public.vigilantes
     set posto_lat = p_lat, posto_lng = p_lng,
         posto_raio_m = greatest(30, least(coalesce(p_raio_m, 150), 5000)), fora_do_posto = false
   where id = p_vigilante_id;
end $$;

-- ---------- Telemetria agora também gera alertas automáticos ----------
create or replace function public.vig_telemetria(
  p_token text, p_lat double precision, p_lng double precision, p_precisao_m real,
  p_bateria int, p_carregando boolean, p_wifi_conectado boolean, p_wifi_nome text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); e public.empresas; d double precision;
begin
  if not v.em_turno then
    return json_build_object('em_turno', false);
  end if;
  select * into e from public.empresas where id = v.empresa_id;
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

create or replace function public.vig_status(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); e public.empresas;
begin
  select * into e from public.empresas where id = v.empresa_id;
  return json_build_object('em_turno', v.em_turno, 'proximo_checkin', v.proximo_checkin,
                           'termo_aceito', v.termo_aceito_em is not null, 'homem_caido_min', e.homem_caido_min);
end $$;

-- Homem caído: o celular ficou parado além do limite e o vigilante não respondeu
create or replace function public.vig_sem_movimento(p_token text, p_lat double precision, p_lng double precision, p_minutos int)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); v_id uuid;
begin
  v_id := public._criar_alerta(v, 'sem_movimento', p_lat, p_lng);
  update public.alertas set observacao = 'Celular parado há ' || coalesce(p_minutos, 0) || ' min e sem resposta ao aviso.' where id = v_id;
  return json_build_object('ok', true);
end $$;

-- ---------- Ronda com QR code ----------
create table if not exists public.pontos_ronda (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) >= 2),
  codigo      text not null unique default ('K1R-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
create index if not exists pontos_ronda_empresa_idx on public.pontos_ronda (empresa_id);

create table if not exists public.rondas_registros (
  id            bigint generated always as identity primary key,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  vigilante_id  uuid not null references public.vigilantes(id) on delete cascade,
  ponto_id      uuid not null references public.pontos_ronda(id) on delete cascade,
  lat           double precision,
  lng           double precision,
  criado_em     timestamptz not null default now()
);
create index if not exists rondas_reg_idx on public.rondas_registros (empresa_id, criado_em desc);

alter table public.pontos_ronda     enable row level security;
alter table public.rondas_registros enable row level security;
revoke all on public.pontos_ronda, public.rondas_registros from anon, authenticated;
grant select, insert, delete on public.pontos_ronda to authenticated;
grant update (nome, ativo) on public.pontos_ronda to authenticated;
grant select on public.rondas_registros to authenticated;
drop policy if exists pr_sel on public.pontos_ronda;
create policy pr_sel on public.pontos_ronda for select to authenticated using (empresa_id = public.minha_empresa_liberada());
drop policy if exists pr_ins on public.pontos_ronda;
create policy pr_ins on public.pontos_ronda for insert to authenticated with check (empresa_id = public.minha_empresa_liberada() and public.eh_admin());
drop policy if exists pr_upd on public.pontos_ronda;
create policy pr_upd on public.pontos_ronda for update to authenticated
  using (empresa_id = public.minha_empresa_liberada() and public.eh_admin()) with check (empresa_id = public.minha_empresa_liberada());
drop policy if exists pr_del on public.pontos_ronda;
create policy pr_del on public.pontos_ronda for delete to authenticated using (empresa_id = public.minha_empresa_liberada() and public.eh_admin());
drop policy if exists rr_sel on public.rondas_registros;
create policy rr_sel on public.rondas_registros for select to authenticated using (empresa_id = public.minha_empresa_liberada());

-- Vigilante lê o QR de um ponto
create or replace function public.vig_registrar_ponto(p_token text, p_codigo text, p_lat double precision, p_lng double precision)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); p public.pontos_ronda;
begin
  if not v.em_turno then raise exception 'inicie_o_turno'; end if;
  select * into p from public.pontos_ronda where codigo = upper(trim(p_codigo)) and empresa_id = v.empresa_id and ativo;
  if not found then raise exception 'ponto_invalido'; end if;
  insert into public.rondas_registros (empresa_id, vigilante_id, ponto_id, lat, lng)
  values (v.empresa_id, v.id, p.id, coalesce(p_lat, v.ultima_lat), coalesce(p_lng, v.ultima_lng));
  return json_build_object('ponto', p.nome, 'hora', now());
end $$;

-- Pontos da empresa e a última leitura deste vigilante no turno atual
create or replace function public.vig_pontos_ronda(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  return coalesce((select json_agg(x order by x.nome) from (
    select p.id, p.nome,
           (select max(r.criado_em) from public.rondas_registros r
             where r.ponto_id = p.id and r.vigilante_id = v.id
               and r.criado_em >= coalesce(v.turno_iniciado_em, now() - interval '12 hours')) as ultima_leitura
      from public.pontos_ronda p where p.empresa_id = v.empresa_id and p.ativo) x), '[]'::json);
end $$;

-- ---------- Foto na ocorrência (JPEG reduzido, em base64) ----------
alter table public.ocorrencias add column if not exists foto_base64 text;
do $$ begin
  alter table public.ocorrencias add constraint ocorrencias_foto_tam_chk check (foto_base64 is null or length(foto_base64) <= 700000);
exception when duplicate_object then null; end $$;

drop function if exists public.vig_ocorrencia(text, text, text, double precision, double precision);
create or replace function public.vig_ocorrencia(p_token text, p_tipo text, p_descricao text, p_lat double precision, p_lng double precision,
                                                 p_foto_base64 text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); v_id uuid;
begin
  insert into public.ocorrencias (empresa_id, vigilante_id, tipo, descricao, lat, lng, foto_base64)
  values (v.empresa_id, v.id, p_tipo, trim(p_descricao), coalesce(p_lat, v.ultima_lat), coalesce(p_lng, v.ultima_lng),
          nullif(p_foto_base64, ''))
  returning id into v_id;
  return json_build_object('id', v_id);
end $$;

create or replace function public.vig_minhas_ocorrencias(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  return coalesce((select json_agg(x order by x.criado_em desc) from (
    select id, tipo, descricao, status, criado_em, (foto_base64 is not null) as tem_foto from public.ocorrencias
     where vigilante_id = v.id order by criado_em desc limit 30) x), '[]'::json);
end $$;

-- ---------- Permissões das funções novas ----------
revoke all on function public.vig_sem_movimento(text, double precision, double precision, int),
  public.vig_registrar_ponto(text, text, double precision, double precision),
  public.vig_pontos_ronda(text),
  public.vig_ocorrencia(text, text, text, double precision, double precision, text),
  public.definir_posto(uuid, double precision, double precision, int) from public;
grant execute on function public.vig_sem_movimento(text, double precision, double precision, int) to anon, authenticated;
grant execute on function public.vig_registrar_ponto(text, text, double precision, double precision) to anon, authenticated;
grant execute on function public.vig_pontos_ronda(text) to anon, authenticated;
grant execute on function public.vig_ocorrencia(text, text, text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.definir_posto(uuid, double precision, double precision, int) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.rondas_registros; exception when duplicate_object then null; end;
  end if;
end $$;

select 'migracao 003 ok' as resultado;
