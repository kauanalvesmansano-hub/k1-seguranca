-- =====================================================================
-- K1 SEGURANÇA — Migração 024: K1 MONITORAMENTO pede CÓDIGO DE 6 DÍGITOS POR E-MAIL
--  Além do login, da senha do monitoramento e do computador autorizado, a sessão
--  precisa ter sido confirmada com o código de 6 dígitos enviado ao e-mail do dono
--  (o Supabase registra isso no próprio token: amr = otp). Vale por 12 h.
-- =====================================================================

create or replace function public._mon_codigo_ok() returns boolean language sql stable as $$
  select exists (
    select 1 from json_array_elements(coalesce(nullif(current_setting('request.jwt.claims', true), '')::json -> 'amr', '[]'::json)) x
     where x ->> 'method' = 'otp'
       and to_timestamp((x ->> 'timestamp')::bigint) > now() - interval '12 hours')
$$;

create or replace function public._mon_ok() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not public._mon_codigo_ok() then raise exception 'falta_codigo_email' using errcode = '42501'; end if;
  if not exists (select 1 from public.mon_sessoes
                  where session_id = public._mon_sessao_id() and user_id = auth.uid() and expira_em > now()) then
    raise exception 'monitoramento_trancado' using errcode = '42501';
  end if;
end $$;

create or replace function public.mon_status(p_chave_aparelho text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  return json_build_object(
    'codigo_ok', public._mon_codigo_ok(),
    'tem_senha', (select senha_hash is not null from public.mon_config where id = 1),
    'aparelho_autorizado', p_chave_aparelho is not null and exists (
        select 1 from public.mon_aparelhos where chave_hash = encode(extensions.digest(p_chave_aparelho, 'sha256'), 'hex')),
    'aparelhos', (select count(*) from public.mon_aparelhos),
    'destravado', public._mon_codigo_ok() and exists (select 1 from public.mon_sessoes where session_id = public._mon_sessao_id()
                           and user_id = auth.uid() and expira_em > now()));
end $$;

create or replace function public._mon_exige_codigo() returns void language plpgsql stable as $$
begin
  if not public._mon_codigo_ok() then raise exception 'falta_codigo_email' using errcode = '42501'; end if;
end $$;

-- (exige o código do e-mail)
create or replace function public.mon_criar_senha(p_senha text, p_chave_aparelho text, p_nome_aparelho text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform public._mon_exige_codigo();
  if (select senha_hash from public.mon_config where id = 1) is not null then raise exception 'senha_ja_criada'; end if;
  if length(coalesce(p_senha, '')) < 8 or p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'senha_fraca'; end if;
  if length(coalesce(p_chave_aparelho, '')) < 32 then raise exception 'aparelho_invalido'; end if;
  update public.mon_config set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 11)), atualizado_em = now() where id = 1;
  insert into public.mon_aparelhos (nome, chave_hash)
  values (left(coalesce(nullif(trim(p_nome_aparelho), ''), 'Computador'), 80), encode(extensions.digest(p_chave_aparelho, 'sha256'), 'hex'))
  on conflict (chave_hash) do nothing;
end $$;

-- (exige o código do e-mail)
create or replace function public.mon_autorizar_aparelho(p_senha text, p_chave_aparelho text, p_nome_aparelho text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform public._mon_exige_codigo();
  if (select count(*) from public.mon_tentativas where user_id = auth.uid() and criado_em > now() - interval '15 minutes') >= 5 then
    return 'muitas_tentativas'; end if;
  select senha_hash into h from public.mon_config where id = 1;
  if h is null or extensions.crypt(coalesce(p_senha, ''), h) <> h then
    insert into public.mon_tentativas (user_id) values (auth.uid());
    return 'senha_do_monitoramento_incorreta';
  end if;
  if (select count(*) from public.mon_aparelhos) >= 5 then raise exception 'limite_de_aparelhos'; end if;
  if length(coalesce(p_chave_aparelho, '')) < 32 then raise exception 'aparelho_invalido'; end if;
  insert into public.mon_aparelhos (nome, chave_hash)
  values (left(coalesce(nullif(trim(p_nome_aparelho), ''), 'Computador'), 80), encode(extensions.digest(p_chave_aparelho, 'sha256'), 'hex'))
  on conflict (chave_hash) do nothing;
  return 'ok';
end $$;

-- (exige o código do e-mail)
create or replace function public.mon_destravar(p_senha text, p_chave_aparelho text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare h text; ap uuid; sid text := public._mon_sessao_id();
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  perform public._mon_exige_codigo();
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
  update public.mon_aparelhos set ultimo_uso = now() where id = ap;
  return 'ok';
end $$;

select 'migracao 024 ok' as resultado;
