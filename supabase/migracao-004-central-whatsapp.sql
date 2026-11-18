-- =====================================================================
-- K1 SEGURANÇA — Migração 004 (pode rodar mais de uma vez)
--  * Celular da CENTRAL: toca como ligação quando chega alerta (grátis)
--  * Ponte de WhatsApp grátis: busca alertas pendentes e registra o envio
-- =====================================================================

-- ---------- Celulares da central (monitoramento) ----------
create table if not exists public.centrais (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  nome            text not null default 'Central',
  token_hash      text not null unique,
  criado_em       timestamptz not null default now(),
  ultimo_contato  timestamptz
);
create index if not exists centrais_empresa_idx on public.centrais (empresa_id);
alter table public.centrais enable row level security;
revoke all on public.centrais from anon, authenticated;
grant select, delete on public.centrais to authenticated;
drop policy if exists centrais_sel on public.centrais;
create policy centrais_sel on public.centrais for select to authenticated using (empresa_id = public.minha_empresa_liberada());
drop policy if exists centrais_del on public.centrais;
create policy centrais_del on public.centrais for delete to authenticated using (empresa_id = public.minha_empresa_liberada());

-- A empresa (logada) transforma este celular em central e recebe um token
create or replace function public.ativar_central(p_nome text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare e uuid := public.minha_empresa_liberada(); t text;
begin
  if e is null then raise exception 'sem_permissao'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.centrais (empresa_id, nome, token_hash, ultimo_contato)
  values (e, coalesce(nullif(trim(p_nome), ''), 'Central'), public._hash_token(t), now());
  return t;
end $$;

create or replace function public._central_por_token(p_token text)
returns public.centrais language plpgsql security definer set search_path = public as $$
declare c public.centrais;
begin
  select * into c from public.centrais where token_hash = public._hash_token(p_token);
  if not found then raise exception 'central_nao_autorizada' using errcode = '28000'; end if;
  if not exists (select 1 from public.empresas where id = c.empresa_id and ativa and plano_status = 'ativo') then
    raise exception 'empresa_bloqueada' using errcode = '28000';
  end if;
  return c;
end $$;

-- O serviço do celular da central pergunta a cada poucos segundos: "chegou alerta novo?"
create or replace function public.central_alertas(p_token text, p_desde timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token); agora timestamptz := clock_timestamp();
begin
  update public.centrais set ultimo_contato = agora where id = c.id;
  return json_build_object(
    'agora', agora,
    'alertas', coalesce((select json_agg(x order by x.criado_em) from (
      select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.status,
             g.nome as vigilante, coalesce(g.posto, '') as posto
        from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
       where a.empresa_id = c.empresa_id
         -- 1 min de folga: o celular ignora os que já viu (alerta gravado bem na hora da consulta não se perde)
         and a.criado_em > coalesce(p_desde, agora) - interval '1 minute'
         and a.criado_em > agora - interval '30 minutes'
       limit 20) x), '[]'::json));
end $$;

-- "Atender" na tela de chamada: coloca o alerta em atendimento
create or replace function public.central_atender(p_token text, p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin
  update public.alertas set status = 'em_atendimento'
   where id = p_alerta_id and empresa_id = c.empresa_id and status = 'aberto';
end $$;

create or replace function public.central_desativar(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.centrais where token_hash = public._hash_token(p_token);
$$;

-- ---------- Ponte de WhatsApp grátis ----------
alter table public.config_k1 add column if not exists ponte_segredo_hash text;
revoke select on public.config_k1 from anon;

create or replace function public._ponte_ok(p_segredo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_segredo is null or length(p_segredo) < 20 or not exists (
       select 1 from public.config_k1 where ponte_segredo_hash = public._hash_token(p_segredo)) then
    raise exception 'ponte_nao_autorizada' using errcode = '28000';
  end if;
end $$;

-- Alertas das últimas 2 horas que ainda não foram enviados, com os contatos de cada empresa
create or replace function public.ponte_pendentes(p_segredo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  return coalesce((select json_agg(x order by x.criado_em) from (
    select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.observacao,
           g.nome as vigilante, coalesce(g.posto, '') as posto, e.nome as empresa,
           coalesce((select json_agg(json_build_object('tipo', ct.tipo, 'nome', ct.nome, 'whatsapp', ct.whatsapp))
                       from public.contatos_alerta ct where ct.empresa_id = a.empresa_id), '[]'::json) as contatos
      from public.alertas a
      join public.vigilantes g on g.id = a.vigilante_id
      join public.empresas e on e.id = a.empresa_id
     where a.envio_status = 'pendente' and a.criado_em > now() - interval '2 hours'
       and e.ativa and e.plano_status = 'ativo'
     limit 20) x), '[]'::json);
end $$;

create or replace function public.ponte_resultado(p_segredo text, p_alerta_id uuid, p_envios json)
returns void language plpgsql security definer set search_path = public as $$
declare algum_ok boolean;
begin
  perform public._ponte_ok(p_segredo);
  insert into public.alertas_envios (alerta_id, canal, destino, ok, resposta)
  select p_alerta_id, 'whatsapp', coalesce(x->>'destino', '?'), coalesce((x->>'ok')::boolean, false), left(x->>'resposta', 500)
    from json_array_elements(coalesce(p_envios, '[]'::json)) x;
  select bool_or(coalesce((x->>'ok')::boolean, false)) into algum_ok from json_array_elements(coalesce(p_envios, '[]'::json)) x;
  update public.alertas set envio_status = case when algum_ok then 'enviado' else 'erro' end where id = p_alerta_id;
end $$;

revoke all on function public.ativar_central(text), public._central_por_token(text), public.central_alertas(text, timestamptz),
  public.central_atender(text, uuid), public.central_desativar(text), public._ponte_ok(text),
  public.ponte_pendentes(text), public.ponte_resultado(text, uuid, json) from public;
grant execute on function public.ativar_central(text) to authenticated;
grant execute on function public.central_alertas(text, timestamptz), public.central_atender(text, uuid),
  public.central_desativar(text), public.ponte_pendentes(text), public.ponte_resultado(text, uuid, json) to anon, authenticated;

select 'migracao 004 ok' as resultado;
