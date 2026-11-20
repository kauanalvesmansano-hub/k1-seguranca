-- =====================================================================
-- K1 SEGURANÇA — Migração 025
--  1) COMPUTADOR CONFIÁVEL: depois que o dono confirma o código do e-mail num
--     computador autorizado, aquele computador fica confiável por 30 dias e não pede
--     mais o código (continua pedindo a senha do monitoramento).
--  2) SOS CONTÍNUO: a câmera/áudio oculto do Power 4x grava até a central encerrar
--     (ou resolver o alerta), com limite de segurança de 2 h. Para não lotar o banco:
--     os primeiros 15 min ficam guardados inteiros (prova) e, depois disso, só os
--     últimos ~2 min (para o ao vivo).
-- =====================================================================

alter table public.mon_aparelhos add column if not exists confiavel_ate timestamptz;

-- O código do e-mail vale na sessão (12 h) OU o computador da sessão é confiável
create or replace function public._mon_ok() returns void language plpgsql stable security definer set search_path = public as $$
declare s public.mon_sessoes;
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select * into s from public.mon_sessoes
   where session_id = public._mon_sessao_id() and user_id = auth.uid() and expira_em > now();
  if not found then raise exception 'monitoramento_trancado' using errcode = '42501'; end if;
  if not public._mon_codigo_ok() and not exists (
       select 1 from public.mon_aparelhos where id = s.aparelho_id and confiavel_ate > now()) then
    raise exception 'falta_codigo_email' using errcode = '42501';
  end if;
end $$;

create or replace function public._mon_aparelho_confiavel(p_chave text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.mon_aparelhos
                  where chave_hash = encode(extensions.digest(coalesce(p_chave, ''), 'sha256'), 'hex')
                    and confiavel_ate > now())
$$;

create or replace function public.mon_status(p_chave_aparelho text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare conf boolean := public._mon_aparelho_confiavel(p_chave_aparelho);
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  return json_build_object(
    'codigo_ok', public._mon_codigo_ok() or conf,
    'computador_confiavel', conf,
    'tem_senha', (select senha_hash is not null from public.mon_config where id = 1),
    'aparelho_autorizado', p_chave_aparelho is not null and exists (
        select 1 from public.mon_aparelhos where chave_hash = encode(extensions.digest(p_chave_aparelho, 'sha256'), 'hex')),
    'aparelhos', (select count(*) from public.mon_aparelhos),
    'destravado', exists (select 1 from public.mon_sessoes s where s.session_id = public._mon_sessao_id()
                           and s.user_id = auth.uid() and s.expira_em > now())
                  and (public._mon_codigo_ok() or conf));
end $$;

create or replace function public.mon_destravar(p_senha text, p_chave_aparelho text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare h text; ap uuid; sid text := public._mon_sessao_id(); com_codigo boolean := public._mon_codigo_ok();
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not com_codigo and not public._mon_aparelho_confiavel(p_chave_aparelho) then
    raise exception 'falta_codigo_email' using errcode = '42501';
  end if;
  if sid = '' then raise exception 'sessao_invalida'; end if;
  if (select count(*) from public.mon_tentativas where user_id = auth.uid() and criado_em > now() - interval '15 minutes') >= 5 then
    return 'muitas_tentativas'; end if;
  select id into ap from public.mon_aparelhos where chave_hash = encode(extensions.digest(coalesce(p_chave_aparelho, ''), 'sha256'), 'hex');
  select senha_hash into h from public.mon_config where id = 1;
  if ap is null then
    insert into public.mon_tentativas (user_id) values (auth.uid());
    return 'computador_nao_autorizado';
  end if;
  if h is null or extensions.crypt(coalesce(p_senha, ''), h) <> h then
    insert into public.mon_tentativas (user_id) values (auth.uid());
    return 'senha_do_monitoramento_incorreta';
  end if;
  delete from public.mon_sessoes where expira_em < now();
  insert into public.mon_sessoes (session_id, user_id, aparelho_id, expira_em)
  values (sid, auth.uid(), ap, now() + interval '12 hours')
  on conflict (session_id) do update set expira_em = excluded.expira_em, aparelho_id = excluded.aparelho_id;
  -- confirmou o código neste computador → fica confiável por 30 dias
  update public.mon_aparelhos set ultimo_uso = now(),
         confiavel_ate = case when com_codigo then now() + interval '30 days' else confiavel_ate end
   where id = ap;
  return 'ok';
end $$;

-- Esquecer a confiança de todos os computadores (volta a pedir o código)
create or replace function public.mon_desconfiar_todos()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  update public.mon_aparelhos set confiavel_ate = null;
end $$;

create or replace function public.mon_aparelhos_lista()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(json_build_object('id', id, 'nome', nome, 'criado_em', criado_em, 'ultimo_uso', ultimo_uso,
                                                     'confiavel_ate', confiavel_ate) order by criado_em)
                     from public.mon_aparelhos), '[]'::json);
end $$;

revoke all on function public._mon_aparelho_confiavel(text), public.mon_desconfiar_todos() from public, anon;
grant execute on function public.mon_desconfiar_todos() to authenticated;

-- ---------- SOS contínuo ----------
alter table public.sos_midia drop constraint if exists sos_midia_seq_max;
alter table public.sos_midia add constraint sos_midia_seq_max check (seq between 0 and 1500) not valid;

create or replace function public._sos_rolagem() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- guarda inteiros os primeiros 150 trechos (~15 min); depois só os últimos 20 (~2 min) para o ao vivo
  if new.seq > 170 then
    delete from public.sos_midia where alerta_id = new.alerta_id and seq >= 150 and seq < new.seq - 20;
  end if;
  return null;
end $$;
drop trigger if exists sos_rolagem on public.sos_midia;
create trigger sos_rolagem after insert on public.sos_midia for each row execute function public._sos_rolagem();

-- aceita até 1500 trechos (2 h)
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
  if p_seq is null or p_seq < 0 or p_seq > 1500 then raise exception 'dados_invalidos'; end if;
  insert into public.sos_midia (alerta_id, empresa_id, vigilante_id, seq, tipo, mime, duracao_s, dados)
  values (a.id, v.empresa_id, v.id, p_seq, case when p_tipo = 'audio' then 'audio' else 'video' end,
          left(coalesce(p_mime, 'video/mp4'), 40), p_duracao, p_dados)
  on conflict (alerta_id, seq) do nothing;
  update public.alertas set sos_gravando = true where id = a.id and not sos_gravando;
  return json_build_object('continuar', true, 'alerta_id', a.id);
end $$;

select 'migracao 025 ok' as resultado;
