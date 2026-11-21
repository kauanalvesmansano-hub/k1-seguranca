-- Migração 029 — uma conta (e-mail) pode ter vários planos: empresa, vigilante individual e família.
-- Cada plano é uma conta separada, com seu próprio teste grátis, fatura e bloqueio.
-- usuarios_empresa continua sendo o "plano aberto agora" (todo o resto do sistema já lê dali);
-- planos_usuario guarda TODOS os planos da pessoa, e trocar_plano() escolhe qual fica aberto.

create table if not exists public.planos_usuario (
  user_id    uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome       text not null,
  papel      text not null default 'admin',
  criado_em  timestamptz not null default now(),
  primary key (user_id, empresa_id)
);
alter table public.planos_usuario enable row level security;
revoke all on public.planos_usuario from anon, authenticated;

insert into public.planos_usuario (user_id, empresa_id, nome, papel, criado_em)
select user_id, empresa_id, nome, papel, criado_em from public.usuarios_empresa
on conflict do nothing;

-- Antes de abrir um plano novo: no máximo 1 plano individual e 1 família por conta; fecha o plano que estava aberto
create or replace function public._ue_antes_inserir()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tipo text;
begin
  select tipo into v_tipo from public.empresas where id = new.empresa_id;
  if v_tipo in ('autonomo', 'familia') and exists (
       select 1 from public.planos_usuario p join public.empresas e on e.id = p.empresa_id
        where p.user_id = new.user_id and p.empresa_id <> new.empresa_id and e.tipo = v_tipo) then
    raise exception 'ja_tem_plano_deste_tipo';
  end if;
  -- O plano individual é usado no app do vigilante: não fecha o painel de empresa/família que já está aberto
  if v_tipo = 'autonomo' and exists (select 1 from public.usuarios_empresa u join public.empresas e on e.id = u.empresa_id
                                      where u.user_id = new.user_id and e.tipo <> 'autonomo') then
    insert into public.planos_usuario (user_id, empresa_id, nome, papel) values (new.user_id, new.empresa_id, new.nome, new.papel)
    on conflict (user_id, empresa_id) do nothing;
    return null;
  end if;
  perform set_config('k1.trocando_plano', '1', true);
  delete from public.usuarios_empresa where user_id = new.user_id;
  perform set_config('k1.trocando_plano', '', true);
  return new;
end $$;
drop trigger if exists ue_antes_inserir on public.usuarios_empresa;
create trigger ue_antes_inserir before insert on public.usuarios_empresa
  for each row execute function public._ue_antes_inserir();

-- Todo plano aberto fica guardado na lista de planos da pessoa
create or replace function public._ue_guardar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.planos_usuario (user_id, empresa_id, nome, papel)
  values (new.user_id, new.empresa_id, new.nome, new.papel)
  on conflict (user_id, empresa_id) do update set nome = excluded.nome, papel = excluded.papel;
  return new;
end $$;
drop trigger if exists ue_guardar on public.usuarios_empresa;
create trigger ue_guardar after insert or update on public.usuarios_empresa
  for each row execute function public._ue_guardar();

-- Se o plano aberto for apagado (ex.: conta removida), abre outro plano que a pessoa ainda tenha
create or replace function public._ue_depois_apagar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('k1.trocando_plano', true), '') = '1' then return old; end if;
  if not exists (select 1 from public.usuarios_empresa where user_id = old.user_id)
     and exists (select 1 from auth.users where id = old.user_id) then
    begin
      insert into public.usuarios_empresa (user_id, empresa_id, nome, papel)
      select p.user_id, p.empresa_id, p.nome, p.papel from public.planos_usuario p
        join public.empresas e on e.id = p.empresa_id
       where p.user_id = old.user_id and p.empresa_id <> old.empresa_id
       order by p.criado_em desc limit 1;
    exception when others then null;  -- nunca impede apagar a conta
    end;
  end if;
  return old;
end $$;
drop trigger if exists ue_depois_apagar on public.usuarios_empresa;
create trigger ue_depois_apagar after delete on public.usuarios_empresa
  for each row execute function public._ue_depois_apagar();

revoke all on function public._ue_antes_inserir(), public._ue_guardar(), public._ue_depois_apagar() from public, anon, authenticated;

-- Lista dos planos da conta logada
create or replace function public.meus_planos()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'empresa_id', e.id, 'nome', e.nome, 'tipo', e.tipo, 'plano_status', e.plano_status,
           'teste_ate', e.teste_ate, 'em_teste', e.teste_ate is not null and e.teste_ate > now(),
           'atual', e.id = public.minha_empresa(),
           'fatura_aberta', (select json_build_object('valor', f.valor_total, 'vencimento', f.vencimento)
                               from public.faturas f where f.empresa_id = e.id and f.status in ('aberta', 'vencida')
                              order by f.vencimento limit 1))
         order by p.criado_em), '[]'::json)
    from public.planos_usuario p join public.empresas e on e.id = p.empresa_id
   where p.user_id = auth.uid()
$$;

-- Abre outro plano da mesma conta (só os planos que são dela)
create or replace function public.trocar_plano(p_empresa_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare p public.planos_usuario; v_tipo text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  select * into p from public.planos_usuario where user_id = auth.uid() and empresa_id = p_empresa_id;
  if not found then raise exception 'sem_permissao'; end if;
  if p_empresa_id is distinct from public.minha_empresa() then
    insert into public.usuarios_empresa (user_id, empresa_id, nome, papel) values (p.user_id, p.empresa_id, p.nome, p.papel);
  end if;
  select tipo into v_tipo from public.empresas where id = p_empresa_id;
  return json_build_object('empresa_id', p_empresa_id, 'tipo', v_tipo);
end $$;

revoke all on function public.meus_planos(), public.trocar_plano(uuid) from public, anon;
grant execute on function public.meus_planos(), public.trocar_plano(uuid) to authenticated;

-- Cadastros sem o bloqueio "já tem empresa"
create or replace function public.registrar_empresa(
  p_nome text, p_cnpj text, p_qtd_vigilantes int, p_nome_responsavel text,
  p_aceite_termo boolean, p_termo_versao text)
returns public.empresas language plpgsql security definer set search_path = public, extensions as $$
declare e public.empresas; v_codigo text; v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
        v_dias int;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  -- 029: a mesma conta pode ter vários planos (cada um cobrado separado)
  if not coalesce(p_aceite_termo, false) then raise exception 'termo_nao_aceito'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 120 or length(trim(coalesce(p_nome_responsavel, ''))) not between 2 and 120 then
    raise exception 'dados_invalidos';
  end if;
  if v_cnpj is not null and length(v_cnpj) not in (11, 14) then raise exception 'cnpj_invalido'; end if;
  if v_cnpj is not null and exists (select 1 from public.empresas where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj) then
    raise exception 'cnpj_ja_cadastrado';
  end if;
  select dias_teste into v_dias from public.config_k1 where id = 1;
  loop
    v_codigo := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from public.empresas where codigo = v_codigo);
  end loop;

  insert into public.empresas (nome, cnpj, codigo, qtd_vigilantes_contratados, termo_versao, termo_aceito_em, termo_aceito_por, teste_ate)
  values (trim(p_nome), v_cnpj, v_codigo, greatest(1, least(coalesce(p_qtd_vigilantes, 1), 5000)), p_termo_versao, now(), auth.uid(),
          now() + make_interval(days => coalesce(v_dias, 7)))
  returning * into e;

  insert into public.usuarios_empresa (user_id, empresa_id, nome, papel)
  values (auth.uid(), e.id, trim(p_nome_responsavel), 'admin');
  return e;
end $$;

create or replace function public.registrar_familia(
  p_nome text, p_qtd_pessoas int, p_nome_responsavel text, p_aceite_termo boolean, p_termo_versao text)
returns public.empresas language plpgsql security definer set search_path = public, extensions as $$
declare e public.empresas; v_codigo text; v_dias int;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  -- 029: a mesma conta pode ter vários planos (cada um cobrado separado)
  if not coalesce(p_aceite_termo, false) then raise exception 'termo_nao_aceito'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 120 or length(trim(coalesce(p_nome_responsavel, ''))) not between 2 and 120 then
    raise exception 'dados_invalidos';
  end if;
  select dias_teste into v_dias from public.config_k1 where id = 1;
  loop
    v_codigo := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from public.empresas where codigo = v_codigo);
  end loop;
  insert into public.empresas (nome, codigo, tipo, qtd_vigilantes_contratados, intervalo_checkin_min, termo_versao,
                               termo_aceito_em, termo_aceito_por, teste_ate)
  values (trim(p_nome), v_codigo, 'familia', greatest(1, least(coalesce(p_qtd_pessoas, 1), 50)), 240, p_termo_versao,
          now(), auth.uid(), now() + make_interval(days => coalesce(v_dias, 7)))
  returning * into e;
  insert into public.usuarios_empresa (user_id, empresa_id, nome, papel) values (auth.uid(), e.id, trim(p_nome_responsavel), 'admin');
  return e;
end $$;

create or replace function public.registrar_autonomo(
  p_nome text, p_telefone text, p_empresa_trabalho text, p_whatsapp_empresa text,
  p_senha text, p_senha_coacao text, p_aceite_termo boolean, p_termo_versao text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare e public.empresas; v_codigo text; v_dias int; v_id uuid; v_acesso text; v_zap text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  -- 029: a mesma conta pode ter vários planos (cada um cobrado separado)
  if not coalesce(p_aceite_termo, false) then raise exception 'termo_nao_aceito'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 120 then raise exception 'dados_invalidos'; end if;
  if not public._senha_valida(p_senha) or not public._senha_valida(p_senha_coacao) then raise exception 'senha_deve_ter_4_a_8_numeros'; end if;
  if p_senha = p_senha_coacao then raise exception 'senha_e_coacao_devem_ser_diferentes'; end if;
  select dias_teste into v_dias from public.config_k1 where id = 1;
  loop
    v_codigo := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from public.empresas where codigo = v_codigo);
  end loop;
  insert into public.empresas (nome, codigo, tipo, qtd_vigilantes_contratados, intervalo_checkin_min, termo_versao,
                               termo_aceito_em, termo_aceito_por, teste_ate)
  values (left(trim(p_nome), 120), v_codigo, 'autonomo', 1, 240, p_termo_versao, now(), auth.uid(),
          now() + make_interval(days => coalesce(v_dias, 7)))
  returning * into e;
  insert into public.usuarios_empresa (user_id, empresa_id, nome, papel) values (auth.uid(), e.id, trim(p_nome), 'admin');
  loop
    v_acesso := (1000000 + (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 9000000))::text;
    exit when not exists (select 1 from public.vigilantes where matricula_acesso = v_acesso);
  end loop;
  insert into public.vigilantes (empresa_id, nome, matricula, matricula_acesso, telefone, posto)
  values (e.id, trim(p_nome), 'AUT-' || v_acesso, v_acesso, left(nullif(trim(p_telefone), ''), 20),
          left(nullif(trim(coalesce(p_empresa_trabalho, '')), ''), 120))
  returning id into v_id;
  insert into public.vigilantes_credenciais (vigilante_id, senha_hash, senha_coacao_hash)
  values (v_id, crypt(p_senha, gen_salt('bf', 10)), crypt(p_senha_coacao, gen_salt('bf', 10)));
  v_zap := regexp_replace(coalesce(p_whatsapp_empresa, ''), '\D', '', 'g');
  if length(v_zap) between 10 and 13 then
    if length(v_zap) <= 11 then v_zap := '55' || v_zap; end if;
    insert into public.contatos_alerta (empresa_id, tipo, nome, whatsapp)
    values (e.id, 'empresa', left(coalesce(nullif(trim(p_empresa_trabalho), ''), 'Empresa'), 80), v_zap);
  end if;
  return json_build_object('matricula_acesso', v_acesso, 'empresa_id', e.id);
end $$;

-- Monitor e admin enxergam o dono de todos os planos
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
           (select u.email from public.planos_usuario ue join auth.users u on u.id = ue.user_id
             where ue.empresa_id = e.id order by ue.papel limit 1) as email,
           (select g.telefone from public.vigilantes g where g.empresa_id = e.id and g.ativo and g.telefone is not null limit 1) as telefone,
           public._mon_pagamento(e.id) as pagamento
      from public.empresas e) x), '[]'::json);
end $$;

create or replace function public.admin_resumo()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_k1_admin() then raise exception 'sem_permissao'; end if;
  return json_build_object(
    'empresas', (select coalesce(json_agg(x order by x.nome), '[]') from (
        select e.id, e.nome, e.cnpj, e.plano_status, e.criado_em,
               (select count(*) from public.vigilantes v where v.empresa_id = e.id and v.ativo) as vigilantes_ativos,
               (select u.nome from public.planos_usuario u where u.empresa_id = e.id and u.papel = 'admin' limit 1) as responsavel
          from public.empresas e) x),
    'faturas', (select coalesce(json_agg(y order by y.status, y.vencimento), '[]') from (
        select f.id, f.empresa_id, e.nome as empresa, f.competencia, f.qtd_vigilantes, f.valor_total, f.vencimento,
               f.status, f.renovar, f.paga_em
          from public.faturas f join public.empresas e on e.id = f.empresa_id
         order by f.criado_em desc limit 300) y),
    'config', (select row_to_json(c) from public.config_k1 c where id = 1));
end $$;

select 'migracao 029 ok' as resultado;
