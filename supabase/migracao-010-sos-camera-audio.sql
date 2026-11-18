-- =====================================================================
-- K1 SEGURANÇA — Migração 010 (pode rodar mais de uma vez)
--  SOS com câmera e áudio (K1 Família):
--  ao apertar o Power 4 vezes, o celular da própria pessoa grava câmera + áudio
--  em trechos de ~6 s e envia; a central / família assiste quase ao vivo
--  até alguém encerrar (ou 15 minutos). Só a própria pessoa inicia a gravação.
-- =====================================================================
alter table public.vigilantes add column if not exists gravar_sos boolean not null default true;   -- a pessoa pode desligar em Ajustes
alter table public.alertas add column if not exists sos_gravando boolean not null default false;
alter table public.alertas add column if not exists sos_encerrado_em timestamptz;
alter table public.alertas add column if not exists sos_encerrado_por text;

create table if not exists public.sos_midia (
  id           bigint generated always as identity primary key,
  alerta_id    uuid not null references public.alertas(id) on delete cascade,
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  vigilante_id uuid not null references public.vigilantes(id) on delete cascade,
  seq          int not null,
  tipo         text not null check (tipo in ('video', 'audio')),
  mime         text not null,
  duracao_s    numeric(5,1),
  dados        text not null check (length(dados) <= 2000000 and dados ~ '^[A-Za-z0-9+/=\r\n]+$'),
  criado_em    timestamptz not null default now(),
  unique (alerta_id, seq)
);
create index if not exists sos_midia_alerta_idx on public.sos_midia (alerta_id, seq);
alter table public.sos_midia enable row level security;
revoke all on public.sos_midia from anon, authenticated;
grant select on public.sos_midia to authenticated;
drop policy if exists sos_midia_sel on public.sos_midia;
create policy sos_midia_sel on public.sos_midia for select to authenticated using (empresa_id = public.minha_empresa_liberada());

-- A pessoa liga/desliga a gravação no SOS (consentimento dela, no próprio celular)
create or replace function public.membro_gravar_sos(p_token text, p_ligar boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token);
begin
  update public.vigilantes set gravar_sos = coalesce(p_ligar, false) where id = v.id;
  return json_build_object('gravar_sos', coalesce(p_ligar, false));
end $$;

-- O celular manda um trecho. Vai para o pânico mais recente (últimos 15 min) ainda não encerrado.
-- Resposta: continuar = false quando a central encerrou, resolveu, ou passou de 15 minutos.
create or replace function public.vig_sos_segmento(p_token text, p_seq int, p_tipo text, p_mime text, p_duracao numeric, p_dados text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); a public.alertas;
begin
  if not v.gravar_sos or not exists (select 1 from public.empresas where id = v.empresa_id and tipo = 'familia') then
    return json_build_object('continuar', false, 'motivo', 'desligado');
  end if;
  select * into a from public.alertas
   where vigilante_id = v.id and tipo = 'panico' and criado_em > now() - interval '15 minutes'
   order by criado_em desc limit 1;
  if not found then return json_build_object('continuar', true, 'aguardando', true); end if;   -- pânico ainda não chegou (sem internet)
  if a.sos_encerrado_em is not null or a.status = 'resolvido' or a.criado_em < now() - interval '15 minutes' then
    update public.alertas set sos_gravando = false where id = a.id;
    return json_build_object('continuar', false, 'motivo', coalesce(a.sos_encerrado_por, 'encerrado'));
  end if;
  if p_seq is null or p_seq < 0 or p_seq > 400 then raise exception 'dados_invalidos'; end if;
  insert into public.sos_midia (alerta_id, empresa_id, vigilante_id, seq, tipo, mime, duracao_s, dados)
  values (a.id, v.empresa_id, v.id, p_seq, case when p_tipo = 'audio' then 'audio' else 'video' end,
          left(coalesce(p_mime, 'video/mp4'), 40), p_duracao, p_dados)
  on conflict (alerta_id, seq) do nothing;
  update public.alertas set sos_gravando = true where id = a.id and not sos_gravando;
  return json_build_object('continuar', true, 'alerta_id', a.id);
end $$;

-- Encerrar a transmissão (quem monitora)
create or replace function public.sos_encerrar(p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.alertas set sos_encerrado_em = now(), sos_gravando = false,
         sos_encerrado_por = coalesce((select nome from public.usuarios_empresa where user_id = auth.uid()), 'responsável')
   where id = p_alerta_id and empresa_id = public.minha_empresa_liberada() and sos_encerrado_em is null;
end $$;

create or replace function public.central_sos_encerrar(p_token text, p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin
  update public.alertas set sos_encerrado_em = now(), sos_gravando = false, sos_encerrado_por = 'central: ' || c.nome
   where id = p_alerta_id and empresa_id = c.empresa_id and sos_encerrado_em is null;
end $$;

create or replace function public.membro_sos_encerrar(p_token text, p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token);
begin
  update public.alertas set sos_encerrado_em = now(), sos_gravando = false, sos_encerrado_por = v.nome
   where id = p_alerta_id and empresa_id = v.empresa_id and vigilante_id <> v.id and sos_encerrado_em is null;
end $$;

-- Assistir: trechos depois de "p_depois" (central por token e família por token)
create or replace function public._sos_trechos(p_empresa uuid, p_alerta_id uuid, p_depois int)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'alerta', (select json_build_object('id', a.id, 'nome', g.nome, 'gravando', a.sos_gravando, 'encerrado_em', a.sos_encerrado_em,
                                        'encerrado_por', a.sos_encerrado_por, 'lat', a.lat, 'lng', a.lng, 'criado_em', a.criado_em)
                 from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
                where a.id = p_alerta_id and a.empresa_id = p_empresa),
    'trechos', coalesce((select json_agg(json_build_object('seq', m.seq, 'tipo', m.tipo, 'mime', m.mime, 'dados', m.dados) order by m.seq)
                           from (select * from public.sos_midia where alerta_id = p_alerta_id and empresa_id = p_empresa and seq > coalesce(p_depois, -1)
                                  order by seq limit 4) m), '[]'::json))
$$;
create or replace function public.central_sos_trechos(p_token text, p_alerta_id uuid, p_depois int)
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin return public._sos_trechos(c.empresa_id, p_alerta_id, p_depois); end $$;
create or replace function public.membro_sos_trechos(p_token text, p_alerta_id uuid, p_depois int)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token);
begin return public._sos_trechos(v.empresa_id, p_alerta_id, p_depois); end $$;

-- Mapa da família e da central passam a dizer se há câmera ao vivo
create or replace function public.membro_familia(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token); e public.empresas;
begin
  select * into e from public.empresas where id = v.empresa_id;
  return json_build_object(
    'eu', v.id, 'familia', e.nome, 'homem_caido_min', e.homem_caido_min, 'gravar_sos', v.gravar_sos,
    'membros', coalesce((select json_agg(x order by x.nome) from (
       select g.id, g.nome, g.papel_familia as papel, g.em_turno as compartilhando, g.dispositivo_ativo,
              case when g.em_turno then g.ultima_lat end as lat, case when g.em_turno then g.ultima_lng end as lng,
              g.ultima_precisao_m as precisao, g.ultima_bateria as bateria, g.ultimo_carregando as carregando,
              g.ultimo_wifi as wifi, g.ultima_atualizacao as atualizado, g.acompanhar_ate, g.acompanhar_destino,
              g.posto_lat as area_lat, g.posto_lng as area_lng, g.posto_raio_m as area_raio, g.fora_do_posto as fora_da_area
         from public.vigilantes g where g.empresa_id = v.empresa_id and g.ativo) x), '[]'::json),
    'alertas', coalesce((select json_agg(y order by y.criado_em desc) from (
       select a.id, a.tipo, a.status, a.lat, a.lng, a.criado_em, g.nome, a.sos_gravando, a.sos_encerrado_em,
              (select count(*) from public.sos_midia m where m.alerta_id = a.id) as trechos
         from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
        where a.empresa_id = v.empresa_id and a.criado_em > now() - interval '24 hours'
        order by a.criado_em desc limit 20) y), '[]'::json));
end $$;

create or replace function public.central_alertas(p_token text, p_desde timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token); agora timestamptz := clock_timestamp();
begin
  update public.centrais set ultimo_contato = agora where id = c.id;
  return json_build_object(
    'agora', agora,
    'alertas', coalesce((select json_agg(x order by x.criado_em) from (
      select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.status, a.sos_gravando,
             g.nome as vigilante, coalesce(g.posto, '') as posto, g.gravar_sos
        from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
       where a.empresa_id = c.empresa_id
         and a.criado_em > coalesce(p_desde, agora) - interval '1 minute'
         and a.criado_em > agora - interval '30 minutes'
       limit 20) x), '[]'::json));
end $$;

-- Limpeza: gravações apagadas após 30 dias
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-limpeza-sos';
    perform cron.schedule('k1-limpeza-sos', '50 4 * * *', $c$delete from public.sos_midia where criado_em < now() - interval '30 days'$c$);
  end if;
end $$;

-- Permissões
revoke all on function public._sos_trechos(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.membro_gravar_sos(text, boolean), public.vig_sos_segmento(text, int, text, text, numeric, text),
  public.central_sos_encerrar(text, uuid), public.membro_sos_encerrar(text, uuid), public.central_sos_trechos(text, uuid, int),
  public.membro_sos_trechos(text, uuid, int), public.sos_encerrar(uuid) from public;
grant execute on function public.membro_gravar_sos(text, boolean), public.vig_sos_segmento(text, int, text, text, numeric, text),
  public.central_sos_encerrar(text, uuid), public.membro_sos_encerrar(text, uuid), public.central_sos_trechos(text, uuid, int),
  public.membro_sos_trechos(text, uuid, int) to anon, authenticated;
grant execute on function public.sos_encerrar(uuid) to authenticated;
revoke execute on function public.sos_encerrar(uuid) from anon;

select 'migracao 010 ok' as resultado;
