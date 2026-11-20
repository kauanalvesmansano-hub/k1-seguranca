-- =====================================================================
-- K1 SEGURANÇA — Migração 026: COBRANÇA NO APP + PAGAMENTOS NO K1 MONITORAMENTO
--  * Celular bloqueado por falta de pagamento: o plano do vigilante e a família
--    veem o Pix para pagar (antes só aparecia "procure sua empresa").
--  * K1 Monitoramento: situação de pagamento de cada conta, confirmar pagamento,
--    bloquear/liberar e REMOVER a conta (só o dono do K1).
-- =====================================================================

-- Tela de pagamento no celular (funciona mesmo com a conta bloqueada; só precisa do token válido)
create or replace function public.vig_plano_pagamento(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes; e public.empresas; f public.faturas; cfg public.config_k1;
begin
  select g.* into v from public.vigilantes g join public.vigilantes_credenciais c on c.vigilante_id = g.id
   where c.token_hash = public._hash_token(p_token) and g.ativo;
  if not found then raise exception 'dispositivo_nao_autorizado' using errcode = '28000'; end if;
  select * into e from public.empresas where id = v.empresa_id;
  select * into cfg from public.config_k1 where id = 1;
  select * into f from public.faturas where empresa_id = e.id and status in ('aberta', 'vencida') order by competencia limit 1;
  return json_build_object(
    'tipo', e.tipo, 'plano_status', e.plano_status, 'ativa', e.ativa,
    'em_teste', e.teste_ate is not null and e.teste_ate > now(), 'teste_ate', e.teste_ate,
    'valor_mensal', public.preco_total(e.tipo, e.qtd_vigilantes_contratados),
    'whatsapp_k1', cfg.whatsapp, 'pix_nome', cfg.pix_nome,
    -- só quem paga a própria conta (plano do vigilante e família) vê o Pix no celular
    'fatura', case when f.id is null or e.tipo = 'seguranca' then null else json_build_object(
       'id', f.id, 'valor_total', f.valor_total, 'vencimento', f.vencimento, 'status', f.status,
       'pix_chave', f.pix_chave, 'pix_copia_cola', f.pix_copia_cola) end);
end $$;
revoke all on function public.vig_plano_pagamento(text) from public;
grant execute on function public.vig_plano_pagamento(text) to anon, authenticated;

-- Situação de pagamento por conta
create or replace function public._mon_pagamento(p_empresa uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'situacao', case
        when e.plano_status = 'bloqueado' then 'bloqueado'
        when e.plano_status = 'encerrado' then 'encerrado'
        when exists (select 1 from public.faturas x where x.empresa_id = e.id and x.status = 'vencida') then 'vencido'
        when e.teste_ate is not null and e.teste_ate > now() then 'teste'
        when exists (select 1 from public.faturas x where x.empresa_id = e.id and x.status = 'aberta') then 'aguardando'
        when exists (select 1 from public.faturas x where x.empresa_id = e.id and x.status = 'paga') then 'pago'
        else 'sem_fatura' end,
    'teste_ate', e.teste_ate,
    'valor_mensal', public.preco_total(e.tipo, e.qtd_vigilantes_contratados),
    'aberta', (select json_build_object('id', x.id, 'valor', x.valor_total, 'vencimento', x.vencimento, 'status', x.status,
                                        'competencia', x.competencia)
                 from public.faturas x where x.empresa_id = e.id and x.status in ('aberta', 'vencida') order by x.competencia limit 1),
    'ultima_paga', (select json_build_object('valor', x.valor_total, 'paga_em', x.paga_em, 'competencia', x.competencia)
                      from public.faturas x where x.empresa_id = e.id and x.status = 'paga' order by x.paga_em desc nulls last limit 1))
  from public.empresas e where e.id = p_empresa
$$;
revoke all on function public._mon_pagamento(uuid) from public, anon, authenticated;

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
           (select u.email from public.usuarios_empresa ue join auth.users u on u.id = ue.user_id
             where ue.empresa_id = e.id order by ue.papel limit 1) as email,
           (select g.telefone from public.vigilantes g where g.empresa_id = e.id and g.ativo and g.telefone is not null limit 1) as telefone,
           public._mon_pagamento(e.id) as pagamento
      from public.empresas e) x), '[]'::json);
end $$;

create or replace function public.mon_faturas(p_empresa_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(json_build_object('id', f.id, 'competencia', f.competencia, 'valor', f.valor_total,
                                                     'vencimento', f.vencimento, 'status', f.status, 'paga_em', f.paga_em,
                                                     'renovar', f.renovar, 'qtd', f.qtd_vigilantes) order by f.competencia desc)
                     from public.faturas f where f.empresa_id = p_empresa_id), '[]'::json);
end $$;

-- Confirmar pagamento recebido (libera a conta se não houver outra vencida)
create or replace function public.mon_confirmar_pagamento(p_fatura_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f public.faturas;
begin
  perform public._mon_ok();
  update public.faturas set status = 'paga', paga_em = now(), confirmada_por = auth.uid()
   where id = p_fatura_id and status in ('aberta', 'vencida') returning * into f;
  if not found then raise exception 'fatura_nao_encontrada'; end if;
  update public.empresas set plano_status = 'ativo', bloqueada_em = null
   where id = f.empresa_id and plano_status = 'bloqueado'
     and not exists (select 1 from public.faturas x where x.empresa_id = f.empresa_id and x.status = 'vencida');
end $$;

-- Bloquear / liberar na mão
create or replace function public.mon_definir_status(p_empresa_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  if p_status not in ('ativo', 'bloqueado', 'encerrado') then raise exception 'dados_invalidos'; end if;
  update public.empresas set plano_status = p_status, bloqueada_em = case when p_status = 'ativo' then null else now() end
   where id = p_empresa_id;
  if p_status <> 'ativo' then
    update public.vigilantes set em_turno = false, proximo_checkin = null where empresa_id = p_empresa_id;
  end if;
end $$;

-- REMOVER a conta e tudo dela (vigilantes, alertas, livro, vídeos, faturas...). Exige digitar o nome da conta.
create or replace function public.mon_remover_conta(p_empresa_id uuid, p_confirmacao text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.empresas;
begin
  perform public._mon_ok();
  select * into e from public.empresas where id = p_empresa_id;
  if not found then raise exception 'conta_nao_encontrada'; end if;
  if lower(trim(coalesce(p_confirmacao, ''))) <> lower(trim(e.nome)) then raise exception 'confirmacao_incorreta'; end if;
  delete from public.empresas where id = p_empresa_id;
end $$;

revoke all on function public.mon_faturas(uuid), public.mon_confirmar_pagamento(uuid), public.mon_definir_status(uuid, text),
  public.mon_remover_conta(uuid, text) from public, anon;
grant execute on function public.mon_faturas(uuid), public.mon_confirmar_pagamento(uuid), public.mon_definir_status(uuid, text),
  public.mon_remover_conta(uuid, text) to authenticated;

select 'migracao 026 ok' as resultado;
