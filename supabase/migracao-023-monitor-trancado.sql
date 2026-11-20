-- =====================================================================
-- K1 SEGURANÇA — Migração 023: K1 MONITORAMENTO TRANCADO NO COMPUTADOR
--  Para usar a central geral é preciso, ao mesmo tempo:
--   1) login do dono do K1 (e-mail e senha);
--   2) a SENHA DO MONITORAMENTO (outra senha, só do dono, guardada com bcrypt);
--   3) estar num COMPUTADOR AUTORIZADO (o programa K1 Segurança para PC gera uma chave
--      secreta, guardada criptografada pelo Windows, e só ela destrava).
--  A liberação vale só para aquela sessão de login, no máximo 12 h.
--  Pode rodar mais de uma vez.
-- =====================================================================

create table if not exists public.mon_config (
  id int primary key default 1 check (id = 1),
  senha_hash text,
  atualizado_em timestamptz not null default now()
);
insert into public.mon_config (id) values (1) on conflict do nothing;

create table if not exists public.mon_aparelhos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave_hash text not null unique,
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);

create table if not exists public.mon_sessoes (
  session_id text primary key,
  user_id uuid not null,
  aparelho_id uuid references public.mon_aparelhos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create table if not exists public.mon_tentativas (
  id bigserial primary key,
  user_id uuid,
  criado_em timestamptz not null default now()
);

alter table public.mon_config enable row level security;
alter table public.mon_aparelhos enable row level security;
alter table public.mon_sessoes enable row level security;
alter table public.mon_tentativas enable row level security;
-- (sem políticas: só as funções abaixo mexem nessas tabelas)

create or replace function public._mon_sessao_id() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'session_id', '')
$$;

-- Dono + sessão destravada no computador autorizado
create or replace function public._mon_ok() returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
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
    'tem_senha', (select senha_hash is not null from public.mon_config where id = 1),
    'aparelho_autorizado', p_chave_aparelho is not null and exists (
        select 1 from public.mon_aparelhos where chave_hash = encode(extensions.digest(p_chave_aparelho, 'sha256'), 'hex')),
    'aparelhos', (select count(*) from public.mon_aparelhos),
    'destravado', exists (select 1 from public.mon_sessoes where session_id = public._mon_sessao_id()
                           and user_id = auth.uid() and expira_em > now()));
end $$;

-- Primeira vez: cria a senha do monitoramento e já autoriza ESTE computador
create or replace function public.mon_criar_senha(p_senha text, p_chave_aparelho text, p_nome_aparelho text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if (select senha_hash from public.mon_config where id = 1) is not null then raise exception 'senha_ja_criada'; end if;
  if length(coalesce(p_senha, '')) < 8 or p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'senha_fraca'; end if;
  if length(coalesce(p_chave_aparelho, '')) < 32 then raise exception 'aparelho_invalido'; end if;
  update public.mon_config set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 11)), atualizado_em = now() where id = 1;
  insert into public.mon_aparelhos (nome, chave_hash)
  values (left(coalesce(nullif(trim(p_nome_aparelho), ''), 'Computador'), 80), encode(extensions.digest(p_chave_aparelho, 'sha256'), 'hex'))
  on conflict (chave_hash) do nothing;
end $$;

-- Autorizar OUTRO computador (precisa da senha do monitoramento; no máximo 5)
drop function if exists public.mon_autorizar_aparelho(text, text, text);
create or replace function public.mon_autorizar_aparelho(p_senha text, p_chave_aparelho text, p_nome_aparelho text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
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

-- Destravar: senha do monitoramento + computador autorizado → vale para esta sessão (12 h)
drop function if exists public.mon_destravar(text, text);
create or replace function public.mon_destravar(p_senha text, p_chave_aparelho text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare h text; ap uuid; sid text := public._mon_sessao_id();
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao' using errcode = '42501'; end if;
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

create or replace function public.mon_trancar()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.mon_sessoes where session_id = public._mon_sessao_id() and user_id = auth.uid();
end $$;

drop function if exists public.mon_trocar_senha(text, text);
create or replace function public.mon_trocar_senha(p_atual text, p_nova text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  perform public._mon_ok();
  select senha_hash into h from public.mon_config where id = 1;
  if extensions.crypt(coalesce(p_atual, ''), h) <> h then
    insert into public.mon_tentativas (user_id) values (auth.uid());
    return 'senha_do_monitoramento_incorreta';
  end if;
  if length(coalesce(p_nova, '')) < 8 or p_nova !~ '[A-Za-z]' or p_nova !~ '[0-9]' then raise exception 'senha_fraca'; end if;
  update public.mon_config set senha_hash = extensions.crypt(p_nova, extensions.gen_salt('bf', 11)), atualizado_em = now() where id = 1;
  -- troca de senha tranca todas as outras sessões
  delete from public.mon_sessoes where session_id <> public._mon_sessao_id();
  return 'ok';
end $$;

create or replace function public.mon_aparelhos_lista()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(json_build_object('id', id, 'nome', nome, 'criado_em', criado_em, 'ultimo_uso', ultimo_uso) order by criado_em)
                     from public.mon_aparelhos), '[]'::json);
end $$;

create or replace function public.mon_remover_aparelho(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  delete from public.mon_aparelhos where id = p_id;
end $$;

create or replace function public.mon_ativar_central(p_nome text)
returns text language plpgsql security definer set search_path = public as $$
begin raise exception 'monitoramento_so_no_computador'; end $$;

-- A central global no celular deixa de existir: o monitoramento é só no computador
update public.centrais set token_hash = 'revogado-' || id::text where global;

revoke all on function public._mon_sessao_id(), public.mon_status(text), public.mon_criar_senha(text, text, text),
  public.mon_autorizar_aparelho(text, text, text), public.mon_destravar(text, text), public.mon_trancar(),
  public.mon_trocar_senha(text, text), public.mon_aparelhos_lista(), public.mon_remover_aparelho(uuid) from public, anon;
grant execute on function public.mon_status(text), public.mon_criar_senha(text, text, text),
  public.mon_autorizar_aparelho(text, text, text), public.mon_destravar(text, text), public.mon_trancar(),
  public.mon_trocar_senha(text, text), public.mon_aparelhos_lista(), public.mon_remover_aparelho(uuid) to authenticated;

select 'migracao 023 ok' as resultado;
