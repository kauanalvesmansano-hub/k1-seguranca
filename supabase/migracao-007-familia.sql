-- =====================================================================
-- K1 SEGURANÇA — Migração 007 (pode rodar mais de uma vez)
--  K1 FAMÍLIA / PESSOAL: proteção para pessoas comuns, famílias e pequenas empresas.
--  - Um "círculo" é uma conta (tabela empresas) com tipo = 'familia'.
--  - Cada pessoa protegida usa a mesma estrutura do vigilante (posição, bateria,
--    pânico pelo Power, homem caído, central, WhatsApp), mas entra por CÓDIGO DE CONVITE.
--  - Todos do círculo veem todos no mapa (compartilhamento consentido, dá para pausar).
--  - Preço: R$ 15,00 a 1ª pessoa + R$ 7,00 por pessoa a mais (por mês). 7 dias grátis.
-- =====================================================================

-- ---------- Tipo de conta ----------
alter table public.empresas add column if not exists tipo text not null default 'seguranca';
do $$ begin
  alter table public.empresas add constraint empresas_tipo_chk check (tipo in ('seguranca', 'familia'));
exception when duplicate_object then null; end $$;

alter table public.config_k1 add column if not exists familia_primeiro numeric(10,2) not null default 15.00;
alter table public.config_k1 add column if not exists familia_adicional numeric(10,2) not null default 7.00;
grant update (familia_primeiro, familia_adicional) on public.config_k1 to authenticated;
grant select (familia_primeiro, familia_adicional) on public.config_k1 to authenticated;

-- ---------- Convite por código ----------
alter table public.vigilantes_credenciais add column if not exists convite_hash text unique;
alter table public.vigilantes_credenciais add column if not exists convite_expira timestamptz;

-- ---------- "Me acompanhe" (aviso se não chegar no horário) ----------
alter table public.vigilantes add column if not exists acompanhar_ate      timestamptz;
alter table public.vigilantes add column if not exists acompanhar_destino  text;
alter table public.vigilantes add column if not exists papel_familia       text;   -- ex.: Mãe, Filho, Avó

alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check
  check (tipo in ('panico', 'coacao', 'senha_errada', 'sem_resposta', 'bateria_baixa', 'fora_do_posto', 'sem_movimento', 'atraso_chegada'));

-- ---------------------------------------------------------------------
-- PREÇO
-- ---------------------------------------------------------------------
create or replace function public.preco_total(p_tipo text, p_qtd int)
returns numeric language sql stable security definer set search_path = public as $$
  select case when p_tipo = 'familia'
              then c.familia_primeiro + greatest(coalesce(p_qtd, 1) - 1, 0) * c.familia_adicional
              else coalesce(p_qtd, 0) * public.preco_vigilante(p_qtd) end
    from public.config_k1 c where c.id = 1
$$;
grant execute on function public.preco_total(text, int) to anon, authenticated;

create or replace function public.gerar_faturas_mes(p_forcar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare cfg public.config_k1; r record; v_comp date := date_trunc('month', current_date)::date;
        v_qtd int; v_total numeric; v_txid text; n int := 0;
begin
  select * into cfg from public.config_k1 where id = 1;
  if not p_forcar and extract(day from current_date) < cfg.dia_fechamento then return 0; end if;
  for r in select * from public.empresas e
            where e.ativa and e.plano_status = 'ativo'
              and (e.teste_ate is null or e.teste_ate <= now())
              and not exists (select 1 from public.faturas f where f.empresa_id = e.id and f.competencia = v_comp)
  loop
    v_qtd := r.qtd_vigilantes_contratados;
    v_total := public.preco_total(r.tipo, v_qtd);
    v_txid := 'K1' || to_char(v_comp, 'YYYYMM') || substr(replace(r.id::text, '-', ''), 1, 12);
    insert into public.faturas (empresa_id, competencia, qtd_vigilantes, valor_unitario, valor_total, vencimento,
                                status, pix_chave, pix_copia_cola, txid, paga_em)
    values (r.id, v_comp, v_qtd, round(v_total / greatest(v_qtd, 1), 2), v_total,
            (v_comp + interval '1 month')::date + (cfg.dias_para_pagar - 1),
            case when v_total = 0 then 'paga' else 'aberta' end, cfg.pix_chave,
            public._pix_copia_cola(cfg.pix_chave, cfg.pix_nome, cfg.pix_cidade, v_total, v_txid),
            v_txid, case when v_total = 0 then now() end);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.faturar_fim_teste()
returns int language plpgsql security definer set search_path = public as $$
declare cfg public.config_k1; r record; v_comp date; v_dias_mes int; v_restantes int; v_total numeric; v_txid text; n int := 0;
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
      v_total := round(public.preco_total(r.tipo, r.qtd_vigilantes_contratados) * v_restantes / v_dias_mes, 2);
      v_txid := 'K1T' || to_char(v_comp, 'YYYYMM') || substr(replace(r.id::text, '-', ''), 1, 12);
      insert into public.faturas (empresa_id, competencia, qtd_vigilantes, valor_unitario, valor_total, vencimento,
                                  status, pix_chave, pix_copia_cola, txid, paga_em)
      values (r.id, v_comp, r.qtd_vigilantes_contratados, round(v_total / greatest(r.qtd_vigilantes_contratados, 1), 2), v_total,
              current_date + 3, case when v_total = 0 then 'paga' else 'aberta' end, cfg.pix_chave,
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
declare v_emp uuid := public.minha_empresa(); e public.empresas; f public.faturas; cfg public.config_k1; v_qtd int; v_total numeric;
begin
  if v_emp is null then raise exception 'sem_permissao'; end if;
  select * into e from public.empresas where id = v_emp;
  select * into cfg from public.config_k1 where id = 1;
  v_qtd := e.qtd_vigilantes_contratados;
  v_total := public.preco_total(e.tipo, v_qtd);
  select * into f from public.faturas where empresa_id = v_emp and status in ('aberta', 'vencida') order by competencia limit 1;
  if not found then
    select * into f from public.faturas where empresa_id = v_emp order by competencia desc limit 1;
  end if;
  return json_build_object(
    'tipo', e.tipo,
    'plano_status', e.plano_status,
    'vigilantes_contratados', v_qtd,
    'vigilantes_ativos', (select count(*) from public.vigilantes where empresa_id = v_emp and ativo),
    'valor_por_vigilante', round(v_total / greatest(v_qtd, 1), 2),
    'valor_padrao', cfg.valor_por_vigilante, 'valor_volume', cfg.valor_volume, 'volume_a_partir', cfg.volume_a_partir,
    'familia_primeiro', cfg.familia_primeiro, 'familia_adicional', cfg.familia_adicional,
    'previa_total', v_total,
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

-- ---------------------------------------------------------------------
-- RESPONSÁVEL (usuário logado com e-mail)
-- ---------------------------------------------------------------------
create or replace function public.registrar_familia(
  p_nome text, p_qtd_pessoas int, p_nome_responsavel text, p_aceite_termo boolean, p_termo_versao text)
returns public.empresas language plpgsql security definer set search_path = public, extensions as $$
declare e public.empresas; v_codigo text; v_dias int;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if exists (select 1 from public.usuarios_empresa where user_id = auth.uid()) then raise exception 'usuario_ja_vinculado_a_empresa'; end if;
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

-- Código de convite: 8 letras/números, sem os que confundem (0/O, 1/I)
create or replace function public._novo_codigo_convite()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(8); c text := ''; i int;
begin
  for i in 0..7 loop c := c || substr(alfabeto, (get_byte(b, i) % 32) + 1, 1); end loop;
  return c;
end $$;

-- Adiciona uma pessoa ao círculo e devolve o código de convite (vale 7 dias, uso único)
create or replace function public.criar_membro(p_nome text, p_telefone text, p_papel text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_emp uuid := public.minha_empresa_liberada(); e public.empresas; v_id uuid; v_acesso text; v_codigo text;
begin
  if v_emp is null or not public.eh_admin() then raise exception 'sem_permissao'; end if;
  select * into e from public.empresas where id = v_emp;
  if e.tipo <> 'familia' then raise exception 'sem_permissao'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 80 then raise exception 'dados_invalidos'; end if;
  loop
    v_acesso := (1000000 + (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 9000000))::text;
    exit when not exists (select 1 from public.vigilantes where matricula_acesso = v_acesso);
  end loop;
  insert into public.vigilantes (empresa_id, nome, matricula, matricula_acesso, telefone, papel_familia)
  values (v_emp, trim(p_nome), 'F-' || v_acesso, v_acesso, left(nullif(trim(p_telefone), ''), 20), left(nullif(trim(p_papel), ''), 30))
  returning id into v_id;
  loop
    v_codigo := public._novo_codigo_convite();
    exit when not exists (select 1 from public.vigilantes_credenciais where convite_hash = public._hash_token(v_codigo));
  end loop;
  insert into public.vigilantes_credenciais (vigilante_id, senha_hash, senha_coacao_hash, convite_hash, convite_expira)
  values (v_id, crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf', 8)), crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf', 8)),
          public._hash_token(v_codigo), now() + interval '7 days');
  return json_build_object('id', v_id, 'codigo', v_codigo, 'expira', now() + interval '7 days');
end $$;

-- Novo código para alguém que trocou de celular (o celular antigo é desconectado)
create or replace function public.novo_convite(p_vigilante_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_codigo text;
begin
  if not public.eh_admin() or not exists (
       select 1 from public.vigilantes g join public.empresas e on e.id = g.empresa_id
        where g.id = p_vigilante_id and g.empresa_id = public.minha_empresa_liberada() and e.tipo = 'familia') then
    raise exception 'sem_permissao';
  end if;
  loop
    v_codigo := public._novo_codigo_convite();
    exit when not exists (select 1 from public.vigilantes_credenciais where convite_hash = public._hash_token(v_codigo));
  end loop;
  update public.vigilantes_credenciais
     set convite_hash = public._hash_token(v_codigo), convite_expira = now() + interval '7 days', token_hash = null
   where vigilante_id = p_vigilante_id;
  update public.vigilantes set dispositivo_ativo = false, em_turno = false where id = p_vigilante_id;
  return json_build_object('codigo', v_codigo, 'expira', now() + interval '7 days');
end $$;

-- ---------------------------------------------------------------------
-- PESSOA PROTEGIDA (celular com token, sem login)
-- ---------------------------------------------------------------------
create or replace function public.membro_entrar(p_codigo text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c public.vigilantes_credenciais; v public.vigilantes; e public.empresas; v_token text; v_ip text := public._ip_requisicao();
begin
  if (select count(*) from public.tentativas_login where ip = v_ip and criado_em > now() - interval '15 minutes') >= 20 then
    raise exception 'muitas_tentativas';
  end if;
  select * into c from public.vigilantes_credenciais
   where convite_hash = public._hash_token(upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')))
     and convite_expira > now() for update;
  if not found then
    insert into public.tentativas_login (ip, matricula) values (v_ip, 'convite');
    return json_build_object('erro', 'convite_invalido');
  end if;
  select * into v from public.vigilantes where id = c.vigilante_id and ativo;
  if not found then return json_build_object('erro', 'convite_invalido'); end if;
  select * into e from public.empresas where id = v.empresa_id and ativa;
  if not found or e.plano_status <> 'ativo' then raise exception 'empresa_bloqueada'; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  update public.vigilantes_credenciais set token_hash = public._hash_token(v_token), convite_hash = null, convite_expira = null
   where vigilante_id = v.id;
  update public.vigilantes set dispositivo_ativo = true where id = v.id returning * into v;
  return json_build_object(
    'token', v_token, 'vigilante_id', v.id, 'nome', v.nome, 'empresa', e.nome, 'tipo', 'familia',
    'termo_aceito', v.termo_aceito_em is not null, 'intervalo_checkin_min', 0, 'prazo_resposta_min', 0);
end $$;

create or replace function public._membro_por_token(p_token text)
returns public.vigilantes language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  if not exists (select 1 from public.empresas where id = v.empresa_id and tipo = 'familia') then
    raise exception 'sem_permissao' using errcode = '28000';
  end if;
  return v;
end $$;

-- Mapa da família: todos do círculo (só quem é do círculo vê)
create or replace function public.membro_familia(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token); e public.empresas;
begin
  select * into e from public.empresas where id = v.empresa_id;
  return json_build_object(
    'eu', v.id, 'familia', e.nome, 'homem_caido_min', e.homem_caido_min,
    'membros', coalesce((select json_agg(x order by x.nome) from (
       select g.id, g.nome, g.papel_familia as papel, g.em_turno as compartilhando, g.dispositivo_ativo,
              case when g.em_turno then g.ultima_lat end as lat, case when g.em_turno then g.ultima_lng end as lng,
              g.ultima_precisao_m as precisao, g.ultima_bateria as bateria, g.ultimo_carregando as carregando,
              g.ultimo_wifi as wifi, g.ultima_atualizacao as atualizado, g.acompanhar_ate, g.acompanhar_destino,
              g.posto_lat as area_lat, g.posto_lng as area_lng, g.posto_raio_m as area_raio, g.fora_do_posto as fora_da_area
         from public.vigilantes g where g.empresa_id = v.empresa_id and g.ativo) x), '[]'::json),
    'alertas', coalesce((select json_agg(y order by y.criado_em desc) from (
       select a.id, a.tipo, a.status, a.lat, a.lng, a.criado_em, g.nome
         from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
        where a.empresa_id = v.empresa_id and a.criado_em > now() - interval '24 hours'
        order by a.criado_em desc limit 20) y), '[]'::json));
end $$;

-- Ligar/pausar o compartilhamento (a pessoa sempre pode pausar; a família vê "pausado")
create or replace function public.membro_compartilhar(p_token text, p_ligar boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token);
begin
  if p_ligar and v.termo_aceito_em is null then raise exception 'termo_nao_aceito'; end if;
  update public.vigilantes
     set em_turno = p_ligar, turno_iniciado_em = case when p_ligar then now() else turno_iniciado_em end,
         proximo_checkin = null
   where id = v.id;
  return json_build_object('compartilhando', p_ligar);
end $$;

-- "Me acompanhe": avisa a família se não chegar até o horário
create or replace function public.membro_acompanhar(p_token text, p_minutos int, p_destino text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token); v_ate timestamptz;
begin
  v_ate := now() + make_interval(mins => greatest(5, least(coalesce(p_minutos, 30), 720)));
  update public.vigilantes set acompanhar_ate = v_ate, acompanhar_destino = left(nullif(trim(p_destino), ''), 80),
         em_turno = true, proximo_checkin = null where id = v.id;
  return json_build_object('ate', v_ate);
end $$;

create or replace function public.membro_cheguei(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token);
begin
  update public.vigilantes set acompanhar_ate = null, acompanhar_destino = null where id = v.id;
end $$;

-- Roda a cada minuto: quem não chegou no horário gera alerta para a família
create or replace function public.verificar_acompanhamentos()
returns int language plpgsql security definer set search_path = public as $$
declare r public.vigilantes; n int := 0;
begin
  for r in select g.* from public.vigilantes g join public.empresas e on e.id = g.empresa_id
            where g.acompanhar_ate is not null and g.acompanhar_ate < now() and g.ativo and e.ativa and e.plano_status = 'ativo'
            for update of g skip locked
  loop
    perform public._criar_alerta(r, 'atraso_chegada', null, null);
    update public.vigilantes set acompanhar_ate = null where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Responder um alerta pelo celular da família ("estou indo", "resolvido")
create or replace function public.membro_atender_alerta(p_token text, p_alerta_id uuid, p_resolver boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._membro_por_token(p_token);
begin
  update public.alertas
     set status = case when p_resolver then 'resolvido' else 'em_atendimento' end,
         resolvido_em = case when p_resolver then now() end,
         observacao = coalesce(observacao, '') || case when p_resolver then 'Resolvido por ' else 'Atendido por ' end || v.nome
   where id = p_alerta_id and empresa_id = v.empresa_id and status <> 'resolvido';
end $$;

-- Ponte do WhatsApp: informa se é família (muda o texto da mensagem)
create or replace function public.ponte_pendentes(p_segredo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  return coalesce((select json_agg(x order by x.criado_em) from (
    select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.observacao, e.tipo as conta,
           g.nome as vigilante, coalesce(g.posto, g.acompanhar_destino, '') as posto, e.nome as empresa,
           coalesce((select json_agg(json_build_object('tipo', ct.tipo, 'nome', ct.nome, 'whatsapp', ct.whatsapp))
                       from public.contatos_alerta ct where ct.empresa_id = a.empresa_id), '[]'::json) as contatos
      from public.alertas a
      join public.vigilantes g on g.id = a.vigilante_id
      join public.empresas e on e.id = a.empresa_id
     where a.envio_status = 'pendente' and a.criado_em > now() - interval '2 hours'
       and e.ativa and e.plano_status = 'ativo'
     limit 20) x), '[]'::json);
end $$;

-- ---------- Permissões ----------
revoke all on function public._novo_codigo_convite(), public._membro_por_token(text), public.verificar_acompanhamentos()
  from public, anon, authenticated;
revoke all on function public.registrar_familia(text, int, text, boolean, text), public.criar_membro(text, text, text),
  public.novo_convite(uuid) from public, anon;
grant execute on function public.registrar_familia(text, int, text, boolean, text), public.criar_membro(text, text, text),
  public.novo_convite(uuid) to authenticated;
revoke all on function public.membro_entrar(text), public.membro_familia(text), public.membro_compartilhar(text, boolean),
  public.membro_acompanhar(text, int, text), public.membro_cheguei(text), public.membro_atender_alerta(text, uuid, boolean) from public;
grant execute on function public.membro_entrar(text), public.membro_familia(text), public.membro_compartilhar(text, boolean),
  public.membro_acompanhar(text, int, text), public.membro_cheguei(text), public.membro_atender_alerta(text, uuid, boolean) to anon, authenticated;
grant update (papel_familia) on public.vigilantes to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-acompanhamentos';
    perform cron.schedule('k1-acompanhamentos', '* * * * *', 'select public.verificar_acompanhamentos()');
  end if;
end $$;

select 'migracao 007 ok' as resultado;
