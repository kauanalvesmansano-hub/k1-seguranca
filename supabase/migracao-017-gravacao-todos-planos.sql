-- =====================================================================
-- K1 SEGURANÇA — Migração 017 (pode rodar mais de uma vez)
--  Power 4x em QUALQUER plano (empresa, vigilante individual e família):
--  o celular grava câmera + áudio em segredo e envia em trechos.
--   * Empresa: assiste no painel / app / celular da central (como já era na família).
--   * Plano do vigilante e família: os contatos recebem no WhatsApp um LINK
--     para assistir ao vivo (vale 24 h), e o dono do K1 acompanha tudo no
--     painel de administração para acionar a Polícia Militar (190) se preciso.
-- =====================================================================

-- 1) A gravação vale para todos os planos (a pessoa ainda pode desligar)
create or replace function public.vig_sos_segmento(p_token text, p_seq int, p_tipo text, p_mime text, p_duracao numeric, p_dados text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); a public.alertas;
begin
  if not v.gravar_sos then return json_build_object('continuar', false, 'motivo', 'desligado'); end if;
  select * into a from public.alertas
   where vigilante_id = v.id and tipo in ('panico', 'coacao') and criado_em > now() - interval '15 minutes'
   order by criado_em desc limit 1;
  if not found then return json_build_object('continuar', true, 'aguardando', true); end if;
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

-- O app do vigilante pergunta se deve gravar (para ligar no início do turno)
create or replace function public.vig_gravar_sos(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin return v.gravar_sos; end $$;

-- 2) Link público para assistir (WhatsApp dos contatos) — token aleatório, vale 24 h
create table if not exists public.sos_links (
  alerta_id uuid primary key references public.alertas(id) on delete cascade,
  token     text not null unique,
  expira_em timestamptz not null default now() + interval '24 hours'
);
alter table public.sos_links enable row level security;
revoke all on public.sos_links from anon, authenticated;

create or replace function public._sos_link_novo()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.tipo in ('panico', 'coacao') then
    insert into public.sos_links (alerta_id, token) values (new.id, encode(gen_random_bytes(24), 'hex'))
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists t_sos_link on public.alertas;
create trigger t_sos_link after insert on public.alertas for each row execute function public._sos_link_novo();

create or replace function public.sos_publico(p_token text, p_depois int default -1)
returns json language plpgsql security definer set search_path = public as $$
declare l public.sos_links; a public.alertas;
begin
  if p_token is null or length(p_token) < 40 then raise exception 'link_invalido'; end if;
  select * into l from public.sos_links where token = p_token and expira_em > now();
  if not found then raise exception 'link_invalido'; end if;
  select * into a from public.alertas where id = l.alerta_id;
  return public._sos_trechos(a.empresa_id, a.id, p_depois);
end $$;

-- 3) WhatsApp: manda o link (plano do vigilante e família)
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
       and not (e.tipo = 'autonomo' and a.tipo not in ('panico', 'coacao', 'sem_movimento', 'batida'))
     limit 20) x), '[]'::json);
end $$;

-- 4) Dono do K1: SOS de todos os planos sem central própria (vigilante individual e família)
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
     where e.tipo in ('autonomo', 'familia') and a.tipo in ('panico', 'coacao', 'sem_movimento', 'batida')
       and a.criado_em > now() - interval '24 hours'
     limit 50) x), '[]'::json);
end $$;

create or replace function public.admin_resolver_sos(p_alerta_id uuid, p_observacao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao'; end if;
  update public.alertas set status = 'resolvido', resolvido_em = now(), observacao = left(coalesce(p_observacao, ''), 500),
         sos_encerrado_em = coalesce(sos_encerrado_em, now()), sos_gravando = false,
         sos_encerrado_por = coalesce(sos_encerrado_por, 'K1 Segurança (administração)')
   where id = p_alerta_id;
end $$;

-- limpeza dos links vencidos
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-limpeza-links';
    perform cron.schedule('k1-limpeza-links', '30 4 * * *', $c$delete from public.sos_links where expira_em < now() - interval '1 day'$c$);
  end if;
end $$;

-- Permissões
revoke all on function public._sos_link_novo() from public, anon, authenticated;
revoke all on function public.sos_publico(text, int), public.vig_gravar_sos(text) from public;
grant execute on function public.sos_publico(text, int), public.vig_gravar_sos(text) to anon, authenticated;
revoke all on function public.admin_sos_ativos(), public.admin_resolver_sos(uuid, text) from public, anon;
grant execute on function public.admin_sos_ativos(), public.admin_resolver_sos(uuid, text) to authenticated;

select 'migracao 017 ok' as resultado;
