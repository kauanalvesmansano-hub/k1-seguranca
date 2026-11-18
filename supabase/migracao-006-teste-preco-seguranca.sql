-- =====================================================================
-- K1 SEGURANÇA — Migração 006 (pode rodar mais de uma vez)
--  1) Teste grátis de 7 dias para empresas novas
--  2) Preço: R$ 25,00 por vigilante; acima de 15 vigilantes, R$ 20,00 cada
--  3) Reforço de segurança (auditoria):
--     - login do vigilante: bloqueio progressivo por conta + limite por IP
--       (antes o contador de erros era desfeito junto com o erro: sem bloqueio real)
--     - funções internas sem acesso público
--     - config da K1 sem expor a senha da ponte
--     - só o administrador da empresa altera/apaga contatos
--     - código dos QR de ronda gerado só pelo servidor
--     - foto da ocorrência validada (impede código malicioso no painel)
--     - limite de vigilantes ativos garantido pelo servidor
--     - matrícula de acesso com gerador criptográfico
--     - registro de auditoria das ações sensíveis
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 e 2) PREÇO E TESTE GRÁTIS
-- ---------------------------------------------------------------------
alter table public.config_k1 add column if not exists valor_volume     numeric(10,2) not null default 20.00;
alter table public.config_k1 add column if not exists volume_a_partir  int not null default 16;   -- "mais de 15"
alter table public.config_k1 add column if not exists dias_teste       int not null default 7;
alter table public.config_k1 alter column valor_por_vigilante set default 25.00;
update public.config_k1 set valor_por_vigilante = 25.00, valor_volume = 20.00, volume_a_partir = 16 where id = 1;
alter table public.empresas alter column valor_por_vigilante set default 25.00;

alter table public.empresas add column if not exists teste_ate       timestamptz;
alter table public.empresas add column if not exists teste_faturado  boolean not null default false;

-- Preço por vigilante para uma quantidade contratada
create or replace function public.preco_vigilante(p_qtd int)
returns numeric language sql stable security definer set search_path = public as $$
  select case when coalesce(p_qtd, 0) >= c.volume_a_partir then c.valor_volume else c.valor_por_vigilante end
    from public.config_k1 c where c.id = 1
$$;

-- CNPJ não pode ganhar teste grátis duas vezes
do $$ begin
  create unique index if not exists empresas_cnpj_unico on public.empresas ((regexp_replace(cnpj, '\D', '', 'g')))
   where cnpj is not null and length(regexp_replace(cnpj, '\D', '', 'g')) >= 11;
exception when unique_violation then raise notice 'Há CNPJs repetidos: índice único não criado.'; end $$;

create or replace function public.registrar_empresa(
  p_nome text, p_cnpj text, p_qtd_vigilantes int, p_nome_responsavel text,
  p_aceite_termo boolean, p_termo_versao text)
returns public.empresas language plpgsql security definer set search_path = public, extensions as $$
declare e public.empresas; v_codigo text; v_cnpj text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
        v_dias int;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if exists (select 1 from public.usuarios_empresa where user_id = auth.uid()) then
    raise exception 'usuario_ja_vinculado_a_empresa';
  end if;
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

-- Fechamento do mês: não cobra empresa em teste; usa a tabela de preço
create or replace function public.gerar_faturas_mes(p_forcar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare cfg public.config_k1; r record; v_comp date := date_trunc('month', current_date)::date;
        v_qtd int; v_unit numeric; v_total numeric; v_txid text; n int := 0;
begin
  select * into cfg from public.config_k1 where id = 1;
  if not p_forcar and extract(day from current_date) < cfg.dia_fechamento then return 0; end if;

  for r in select * from public.empresas e
            where e.ativa and e.plano_status = 'ativo'
              and (e.teste_ate is null or e.teste_ate <= now())
              and not exists (select 1 from public.faturas f where f.empresa_id = e.id and f.competencia = v_comp)
  loop
    v_qtd  := r.qtd_vigilantes_contratados;
    v_unit := public.preco_vigilante(v_qtd);
    v_total := v_qtd * v_unit;
    v_txid := 'K1' || to_char(v_comp, 'YYYYMM') || substr(replace(r.id::text, '-', ''), 1, 12);
    insert into public.faturas (empresa_id, competencia, qtd_vigilantes, valor_unitario, valor_total, vencimento,
                                status, pix_chave, pix_copia_cola, txid, paga_em)
    values (r.id, v_comp, v_qtd, v_unit, v_total,
            (v_comp + interval '1 month')::date + (cfg.dias_para_pagar - 1),
            case when v_total = 0 then 'paga' else 'aberta' end,
            cfg.pix_chave,
            public._pix_copia_cola(cfg.pix_chave, cfg.pix_nome, cfg.pix_cidade, v_total, v_txid),
            v_txid, case when v_total = 0 then now() end);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Fim do teste: gera a 1ª fatura (proporcional aos dias restantes do mês), vence em 3 dias
create or replace function public.faturar_fim_teste()
returns int language plpgsql security definer set search_path = public as $$
declare cfg public.config_k1; r record; v_comp date; v_dias_mes int; v_restantes int;
        v_unit numeric; v_total numeric; v_txid text; n int := 0;
begin
  select * into cfg from public.config_k1 where id = 1;
  for r in select * from public.empresas e
            where e.ativa and e.plano_status = 'ativo' and not e.teste_faturado
              and e.teste_ate is not null and e.teste_ate <= now()
  loop
    v_comp := date_trunc('month', (r.teste_ate at time zone 'America/Sao_Paulo'))::date;
    if not exists (select 1 from public.faturas where empresa_id = r.id and competencia = v_comp) then
      v_dias_mes := extract(day from (v_comp + interval '1 month - 1 day'))::int;
      v_restantes := v_dias_mes - extract(day from (r.teste_ate at time zone 'America/Sao_Paulo'))::int + 1;
      v_unit := public.preco_vigilante(r.qtd_vigilantes_contratados);
      v_total := round(r.qtd_vigilantes_contratados * v_unit * v_restantes / v_dias_mes, 2);
      v_txid := 'K1T' || to_char(v_comp, 'YYYYMM') || substr(replace(r.id::text, '-', ''), 1, 12);
      insert into public.faturas (empresa_id, competencia, qtd_vigilantes, valor_unitario, valor_total, vencimento,
                                  status, pix_chave, pix_copia_cola, txid, paga_em)
      values (r.id, v_comp, r.qtd_vigilantes_contratados, v_unit, v_total, current_date + 3,
              case when v_total = 0 then 'paga' else 'aberta' end, cfg.pix_chave,
              public._pix_copia_cola(cfg.pix_chave, cfg.pix_nome, cfg.pix_cidade, v_total, v_txid),
              v_txid, case when v_total = 0 then now() end);
      n := n + 1;
    end if;
    update public.empresas set teste_faturado = true where id = r.id;
  end loop;
  return n;
end $$;

create or replace function public.empresa_plano()
returns json language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid := public.minha_empresa(); e public.empresas; f public.faturas; cfg public.config_k1; v_qtd int; v_unit numeric;
begin
  if v_emp is null then raise exception 'sem_permissao'; end if;
  select * into e from public.empresas where id = v_emp;
  select * into cfg from public.config_k1 where id = 1;
  v_qtd := e.qtd_vigilantes_contratados;
  v_unit := public.preco_vigilante(v_qtd);
  select * into f from public.faturas where empresa_id = v_emp and status in ('aberta', 'vencida') order by competencia limit 1;
  if not found then
    select * into f from public.faturas where empresa_id = v_emp order by competencia desc limit 1;
  end if;
  return json_build_object(
    'plano_status', e.plano_status,
    'vigilantes_contratados', v_qtd,
    'vigilantes_ativos', (select count(*) from public.vigilantes where empresa_id = v_emp and ativo),
    'valor_por_vigilante', v_unit,
    'valor_padrao', cfg.valor_por_vigilante, 'valor_volume', cfg.valor_volume, 'volume_a_partir', cfg.volume_a_partir,
    'previa_total', v_qtd * v_unit,
    'em_teste', e.teste_ate is not null and e.teste_ate > now(),
    'teste_ate', e.teste_ate,
    'pix_nome', cfg.pix_nome,
    'whatsapp_k1', cfg.whatsapp,
    'fatura', case when f.id is null then null else json_build_object(
       'id', f.id, 'competencia', f.competencia, 'qtd_vigilantes', f.qtd_vigilantes,
       'valor_unitario', f.valor_unitario, 'valor_total', f.valor_total, 'vencimento', f.vencimento,
       'status', f.status, 'renovar', f.renovar, 'pix_chave', f.pix_chave, 'pix_copia_cola', f.pix_copia_cola,
       'paga_em', f.paga_em) end);
end $$;

grant update (valor_volume, volume_a_partir, dias_teste) on public.config_k1 to authenticated;

-- ---------------------------------------------------------------------
-- 3) SEGURANÇA
-- ---------------------------------------------------------------------

-- 3.1 Registro de tentativas de login do vigilante (por IP e por matrícula)
create table if not exists public.tentativas_login (
  id         bigint generated always as identity primary key,
  ip         text not null,
  matricula  text,
  criado_em  timestamptz not null default now()
);
create index if not exists tentativas_login_ip_idx on public.tentativas_login (ip, criado_em desc);
alter table public.tentativas_login enable row level security;
revoke all on public.tentativas_login from anon, authenticated;

create or replace function public._ip_requisicao()
returns text language sql stable set search_path = public as $$
  select coalesce(nullif(trim(split_part(
           coalesce((nullif(current_setting('request.headers', true), '')::json)->>'x-forwarded-for', ''), ',', 1)), ''),
         'desconhecido')
$$;

-- Login do vigilante. Senha errada NÃO gera erro do banco (o erro desfaria o contador):
-- devolve {"erro": "..."} e o app mostra a mensagem.
create or replace function public.vig_entrar(p_matricula text, p_senha text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v public.vigilantes; c public.vigilantes_credenciais; e public.empresas; v_token text; v_coacao boolean := false;
        v_ip text := public._ip_requisicao(); v_erros int;
begin
  -- Limite por IP: 20 erros em 15 min bloqueia o IP
  if (select count(*) from public.tentativas_login where ip = v_ip and criado_em > now() - interval '15 minutes') >= 20 then
    raise exception 'muitas_tentativas';
  end if;

  select * into v from public.vigilantes where matricula_acesso = trim(coalesce(p_matricula, '')) and ativo;
  if not found then
    insert into public.tentativas_login (ip, matricula) values (v_ip, left(p_matricula, 20));
    return json_build_object('erro', 'dados_invalidos');
  end if;
  select * into e from public.empresas where id = v.empresa_id and ativa;
  if not found then raise exception 'empresa_inativa'; end if;
  if e.plano_status <> 'ativo' then raise exception 'empresa_bloqueada'; end if;
  select * into c from public.vigilantes_credenciais where vigilante_id = v.id for update;

  if c.bloqueado_ate is not null and c.bloqueado_ate > now() then
    raise exception 'bloqueado_temporariamente';
  end if;
  if c.senha_coacao_hash = crypt(coalesce(p_senha, ''), c.senha_coacao_hash) then
    v_coacao := true;
  elsif c.senha_hash <> crypt(coalesce(p_senha, ''), c.senha_hash) then
    v_erros := c.erros_ativacao + 1;
    -- Bloqueio progressivo: 5 erros = 15 min, 10 = 1 h, 15 ou mais = 24 h
    update public.vigilantes_credenciais
       set erros_ativacao = v_erros,
           bloqueado_ate = case when v_erros >= 15 then now() + interval '24 hours'
                                when v_erros >= 10 then now() + interval '1 hour'
                                when v_erros >= 5 and v_erros % 5 = 0 then now() + interval '15 minutes' end
     where vigilante_id = v.id;
    insert into public.tentativas_login (ip, matricula) values (v_ip, v.matricula_acesso);
    return json_build_object('erro', 'dados_invalidos');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  update public.vigilantes_credenciais
     set token_hash = public._hash_token(v_token), erros_ativacao = 0, bloqueado_ate = null
   where vigilante_id = v.id;
  update public.vigilantes set dispositivo_ativo = true where id = v.id returning * into v;
  if v_coacao then
    perform public._criar_alerta(v, 'coacao', null, null);
  end if;

  return json_build_object(
    'token', v_token, 'vigilante_id', v.id, 'nome', v.nome, 'empresa', e.nome,
    'termo_aceito', v.termo_aceito_em is not null,
    'intervalo_checkin_min', e.intervalo_checkin_min, 'prazo_resposta_min', e.prazo_resposta_min);
end $$;

-- 3.2 Matrícula de acesso com gerador criptográfico (não previsível)
create or replace function public.criar_vigilante(
  p_nome text, p_matricula text, p_telefone text, p_posto text,
  p_senha text, p_senha_coacao text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_emp uuid := public.minha_empresa_liberada(); v_id uuid; v_limite int; v_qtd int; v_acesso text;
begin
  if v_emp is null or not public.eh_admin() then raise exception 'sem_permissao'; end if;
  if not public._senha_valida(p_senha) or not public._senha_valida(p_senha_coacao) then
    raise exception 'senha_deve_ter_4_a_8_numeros';
  end if;
  if p_senha = p_senha_coacao then raise exception 'senha_e_coacao_devem_ser_diferentes'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 120 or length(trim(coalesce(p_matricula, ''))) not between 1 and 40 then
    raise exception 'dados_invalidos';
  end if;

  select qtd_vigilantes_contratados into v_limite from public.empresas where id = v_emp;
  select count(*) into v_qtd from public.vigilantes where empresa_id = v_emp and ativo;
  if v_qtd >= v_limite then raise exception 'limite_de_vigilantes_do_plano_atingido'; end if;

  loop
    v_acesso := (1000000 + (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 9000000))::text;
    exit when not exists (select 1 from public.vigilantes where matricula_acesso = v_acesso);
  end loop;

  insert into public.vigilantes (empresa_id, nome, matricula, matricula_acesso, telefone, posto)
  values (v_emp, trim(p_nome), trim(p_matricula), v_acesso, left(nullif(trim(p_telefone), ''), 20), left(nullif(trim(p_posto), ''), 120))
  returning id into v_id;

  insert into public.vigilantes_credenciais (vigilante_id, senha_hash, senha_coacao_hash)
  values (v_id, crypt(p_senha, gen_salt('bf', 10)), crypt(p_senha_coacao, gen_salt('bf', 10)));
  return json_build_object('id', v_id, 'matricula_acesso', v_acesso);
end $$;

-- 3.3 Limite de vigilantes ativos garantido no servidor (não dá para burlar pelo painel)
create or replace function public._checar_limite_vigilantes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limite int; v_qtd int;
begin
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    select qtd_vigilantes_contratados into v_limite from public.empresas where id = new.empresa_id;
    select count(*) into v_qtd from public.vigilantes where empresa_id = new.empresa_id and ativo and id <> new.id;
    if v_qtd >= v_limite then raise exception 'limite_de_vigilantes_do_plano_atingido'; end if;
  end if;
  return new;
end $$;
drop trigger if exists vigilantes_limite on public.vigilantes;
create trigger vigilantes_limite before insert or update of ativo on public.vigilantes
  for each row execute function public._checar_limite_vigilantes();

create or replace function public._checar_reducao_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.qtd_vigilantes_contratados < old.qtd_vigilantes_contratados and
     (select count(*) from public.vigilantes where empresa_id = new.id and ativo) > new.qtd_vigilantes_contratados then
    raise exception 'desative_vigilantes_antes_de_reduzir';
  end if;
  return new;
end $$;
drop trigger if exists empresas_reducao on public.empresas;
create trigger empresas_reducao before update of qtd_vigilantes_contratados on public.empresas
  for each row execute function public._checar_reducao_plano();

-- 3.4 Contatos: todos da empresa veem, só o administrador cria/altera/apaga; dados validados
drop policy if exists cont_all on public.contatos_alerta;
drop policy if exists cont_sel on public.contatos_alerta;
drop policy if exists cont_ins on public.contatos_alerta;
drop policy if exists cont_upd on public.contatos_alerta;
drop policy if exists cont_del on public.contatos_alerta;
create policy cont_sel on public.contatos_alerta for select to authenticated using (empresa_id = public.minha_empresa_liberada());
create policy cont_ins on public.contatos_alerta for insert to authenticated with check (empresa_id = public.minha_empresa_liberada() and public.eh_admin());
create policy cont_upd on public.contatos_alerta for update to authenticated
  using (empresa_id = public.minha_empresa_liberada() and public.eh_admin()) with check (empresa_id = public.minha_empresa_liberada() and public.eh_admin());
create policy cont_del on public.contatos_alerta for delete to authenticated using (empresa_id = public.minha_empresa_liberada() and public.eh_admin());
revoke insert, update on public.contatos_alerta from authenticated;
grant insert (empresa_id, tipo, nome, whatsapp, receber_ligacao) on public.contatos_alerta to authenticated;
grant update (tipo, nome, whatsapp, receber_ligacao) on public.contatos_alerta to authenticated;
do $$ begin
  alter table public.contatos_alerta add constraint contatos_nome_tam_chk check (length(trim(nome)) between 1 and 80) not valid;
exception when duplicate_object then null; end $$;

-- 3.5 QR de ronda: o código é sempre gerado pelo servidor
revoke insert on public.pontos_ronda from authenticated;
grant insert (empresa_id, nome, ativo) on public.pontos_ronda to authenticated;

-- 3.6 Foto da ocorrência só pode ser imagem em base64 (bloqueia código malicioso no painel)
do $$ begin
  alter table public.ocorrencias add constraint ocorrencias_foto_b64_chk
    check (foto_base64 is null or foto_base64 ~ '^[A-Za-z0-9+/=\r\n]+$') not valid;
exception when duplicate_object then null; end $$;

-- 3.7 Configuração da K1: ninguém lê a senha da ponte do WhatsApp
revoke select on public.config_k1 from authenticated;
grant select (id, pix_chave, pix_nome, pix_cidade, valor_por_vigilante, dia_fechamento, dias_para_pagar, whatsapp,
              valor_volume, volume_a_partir, dias_teste) on public.config_k1 to authenticated;

-- 3.8 Auditoria: quem fez o quê nas ações sensíveis
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  empresa_id  uuid,
  usuario_id  uuid,
  ip          text,
  acao        text not null,
  detalhe     jsonb,
  criado_em   timestamptz not null default now()
);
create index if not exists auditoria_empresa_idx on public.auditoria (empresa_id, criado_em desc);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
drop policy if exists aud_sel on public.auditoria;
create policy aud_sel on public.auditoria for select to authenticated
  using ((empresa_id = public.minha_empresa() and public.eh_admin()) or public.eh_k1_admin());

create or replace function public._auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_acao text; v_det jsonb;
begin
  if tg_table_name = 'vigilantes_credenciais' then
    select empresa_id into v_emp from public.vigilantes where id = new.vigilante_id;
    if new.senha_hash is distinct from old.senha_hash or new.senha_coacao_hash is distinct from old.senha_coacao_hash then
      v_acao := 'senhas_do_vigilante_alteradas';
    elsif new.token_hash is distinct from old.token_hash then
      v_acao := case when new.token_hash is null then 'celular_desconectado' else 'celular_conectado' end;
    elsif new.bloqueado_ate is not null and old.bloqueado_ate is distinct from new.bloqueado_ate then
      v_acao := 'login_bloqueado_por_erros';
    else return new; end if;
    v_det := jsonb_build_object('vigilante_id', new.vigilante_id);
  elsif tg_table_name = 'vigilantes' then
    v_emp := coalesce(new.empresa_id, old.empresa_id);
    if tg_op = 'INSERT' then v_acao := 'vigilante_criado';
    elsif new.ativo is distinct from old.ativo then v_acao := case when new.ativo then 'vigilante_reativado' else 'vigilante_desativado' end;
    elsif new.nome is distinct from old.nome or new.telefone is distinct from old.telefone then v_acao := 'vigilante_editado';
    else return new; end if;
    v_det := jsonb_build_object('vigilante_id', new.id, 'nome', new.nome);
  elsif tg_table_name = 'contatos_alerta' then
    v_emp := coalesce(new.empresa_id, old.empresa_id);
    v_acao := 'contato_' || lower(tg_op);
    v_det := jsonb_build_object('nome', coalesce(new.nome, old.nome), 'whatsapp', coalesce(new.whatsapp, old.whatsapp));
  elsif tg_table_name = 'empresas' then
    v_emp := new.id;
    if new.plano_status is distinct from old.plano_status then v_acao := 'plano_' || new.plano_status;
    elsif new.qtd_vigilantes_contratados is distinct from old.qtd_vigilantes_contratados
       or new.intervalo_checkin_min is distinct from old.intervalo_checkin_min
       or new.homem_caido_min is distinct from old.homem_caido_min then v_acao := 'configuracao_alterada';
    else return new; end if;
    v_det := jsonb_build_object('plano', new.plano_status, 'qtd', new.qtd_vigilantes_contratados);
  end if;
  insert into public.auditoria (empresa_id, usuario_id, ip, acao, detalhe)
  values (v_emp, auth.uid(), public._ip_requisicao(), v_acao, v_det);
  return coalesce(new, old);
end $$;

drop trigger if exists aud_credenciais on public.vigilantes_credenciais;
create trigger aud_credenciais after update on public.vigilantes_credenciais for each row execute function public._auditar();
drop trigger if exists aud_vigilantes on public.vigilantes;
create trigger aud_vigilantes after insert or update of ativo, nome, telefone on public.vigilantes for each row execute function public._auditar();
drop trigger if exists aud_contatos on public.contatos_alerta;
create trigger aud_contatos after insert or update or delete on public.contatos_alerta for each row execute function public._auditar();
drop trigger if exists aud_empresas on public.empresas;
create trigger aud_empresas after update on public.empresas for each row execute function public._auditar();

-- 3.9 Funções internas: ninguém de fora executa. Funções da empresa: só usuário logado.
do $$
declare f text;
begin
  foreach f in array array[
    'public._central_por_token(text)', 'public._ponte_ok(text)', 'public._distancia_m(double precision, double precision, double precision, double precision)',
    'public._emv(text, text)', 'public._sem_acento(text, integer)', 'public._crc16(text)', 'public._pix_copia_cola(text, text, text, numeric, text)',
    'public._criar_alerta(public.vigilantes, text, double precision, double precision)', 'public._vig_por_token(text)', 'public._hash_token(text)',
    'public._senha_valida(text)', 'public._ip_requisicao()', 'public._auditar()', 'public._checar_limite_vigilantes()', 'public._checar_reducao_plano()',
    'public.verificar_checkins_atrasados()', 'public.processar_bloqueios()', 'public.gerar_faturas_mes(boolean)', 'public.faturar_fim_teste()']
  loop
    begin execute format('revoke all on function %s from public, anon, authenticated', f);
    exception when undefined_function then null; end;
  end loop;
  foreach f in array array[
    'public.definir_posto(uuid, double precision, double precision, integer)', 'public.ativar_central(text)',
    'public.admin_confirmar_pagamento(uuid)', 'public.admin_definir_status(uuid, text)', 'public.admin_gerar_faturas_agora()',
    'public.admin_resumo()', 'public.eh_k1_admin()', 'public.empresa_plano()', 'public.empresa_responder_renovacao(uuid, boolean)',
    'public.criar_vigilante(text, text, text, text, text, text)', 'public.alterar_senhas_vigilante(uuid, text, text)',
    'public.revogar_dispositivo(uuid)', 'public.registrar_empresa(text, text, integer, text, boolean, text)',
    'public.minha_empresa()', 'public.minha_empresa_liberada()', 'public.eh_admin()']
  loop
    begin
      execute format('revoke all on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    exception when undefined_function then null; end;
  end loop;
end $$;
grant execute on function public.preco_vigilante(int) to anon, authenticated;
grant execute on function public.vig_entrar(text, text) to anon, authenticated;

-- 3.10 Agendamentos: fim do teste (de hora em hora) e limpeza de registros antigos
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-fim-teste';
    perform cron.schedule('k1-fim-teste', '17 * * * *', 'select public.faturar_fim_teste()');
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-limpeza-seguranca';
    perform cron.schedule('k1-limpeza-seguranca', '40 4 * * *',
      $c$delete from public.tentativas_login where criado_em < now() - interval '2 days';
         delete from public.auditoria where criado_em < now() - interval '365 days';$c$);
  end if;
end $$;

select 'migracao 006 ok' as resultado;
