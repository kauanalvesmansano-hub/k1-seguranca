-- =====================================================================
-- K1 SEGURANÇA — Migração 016 (pode rodar mais de uma vez)
--  PLANO DO VIGILANTE (contratado por ele mesmo): R$ 20/mês, 7 dias grátis.
--  Ele cadastra os contatos de emergência dele e o WhatsApp da empresa onde
--  trabalha. No pânico (Power 4x), coação, homem caído ou batida, todos esses
--  números recebem a mensagem automática no WhatsApp.
-- =====================================================================
alter table public.empresas drop constraint if exists empresas_tipo_chk;
alter table public.empresas add constraint empresas_tipo_chk check (tipo in ('seguranca', 'familia', 'autonomo'));

alter table public.config_k1 add column if not exists valor_autonomo numeric(10,2) not null default 20.00;
grant select (valor_autonomo) on public.config_k1 to authenticated;
grant update (valor_autonomo) on public.config_k1 to authenticated;

create or replace function public.preco_total(p_tipo text, p_qtd int)
returns numeric language sql stable security definer set search_path = public as $$
  select case when p_tipo = 'familia'
              then c.familia_primeiro + greatest(coalesce(p_qtd, 1) - 1, 0) * c.familia_adicional
              when p_tipo = 'autonomo' then c.valor_autonomo
              else coalesce(p_qtd, 0) * public.preco_vigilante(p_qtd) end
    from public.config_k1 c where c.id = 1
$$;

-- Contatos: além de encarregado/empresa/monitoramento, agora "emergencia" (família/amigos do vigilante)
alter table public.contatos_alerta drop constraint if exists contatos_alerta_tipo_check;
alter table public.contatos_alerta add constraint contatos_alerta_tipo_check
  check (tipo in ('encarregado', 'empresa', 'monitoramento', 'emergencia'));

-- Cadastro: cria a conta (1 vigilante = ele mesmo) e devolve a matrícula para o app entrar
create or replace function public.registrar_autonomo(
  p_nome text, p_telefone text, p_empresa_trabalho text, p_whatsapp_empresa text,
  p_senha text, p_senha_coacao text, p_aceite_termo boolean, p_termo_versao text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare e public.empresas; v_codigo text; v_dias int; v_id uuid; v_acesso text; v_zap text;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if exists (select 1 from public.usuarios_empresa where user_id = auth.uid()) then raise exception 'usuario_ja_vinculado_a_empresa'; end if;
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

-- Contatos de emergência pelo próprio app do vigilante (só no plano do vigilante)
create or replace function public._vig_autonomo(p_token text)
returns public.vigilantes language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  if not exists (select 1 from public.empresas where id = v.empresa_id and tipo = 'autonomo') then raise exception 'sem_permissao'; end if;
  return v;
end $$;

create or replace function public.vig_contatos(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_autonomo(p_token);
begin
  return coalesce((select json_agg(json_build_object('id', id, 'tipo', tipo, 'nome', nome, 'whatsapp', whatsapp) order by tipo desc, nome)
                     from public.contatos_alerta where empresa_id = v.empresa_id), '[]'::json);
end $$;

create or replace function public.vig_contato_salvar(p_token text, p_tipo text, p_nome text, p_whatsapp text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_autonomo(p_token); v_zap text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'); v_id uuid;
begin
  if p_tipo not in ('emergencia', 'empresa') then raise exception 'dados_invalidos'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 80 then raise exception 'informe_o_nome'; end if;
  if length(v_zap) not between 10 and 13 then raise exception 'whatsapp_invalido'; end if;
  if length(v_zap) <= 11 then v_zap := '55' || v_zap; end if;
  if (select count(*) from public.contatos_alerta where empresa_id = v.empresa_id) >= 6 then raise exception 'no_maximo_6_contatos'; end if;
  insert into public.contatos_alerta (empresa_id, tipo, nome, whatsapp) values (v.empresa_id, p_tipo, trim(p_nome), v_zap)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.vig_contato_excluir(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_autonomo(p_token);
begin
  delete from public.contatos_alerta where id = p_id and empresa_id = v.empresa_id;
end $$;

-- Situação do plano (o app mostra "teste grátis até…" e o valor)
create or replace function public.vig_meu_plano(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); e public.empresas;
begin
  select * into e from public.empresas where id = v.empresa_id;
  return json_build_object('tipo', e.tipo, 'teste_ate', e.teste_ate, 'plano_status', e.plano_status,
                           'valor', public.preco_total(e.tipo, e.qtd_vigilantes_contratados));
end $$;

-- WhatsApp: no plano do vigilante, pânico/coação/homem caído/batida VÃO para os contatos dele
create or replace function public.ponte_pendentes(p_segredo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  return coalesce((select json_agg(x order by x.criado_em) from (
    select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.observacao, a.detalhe, e.tipo as conta,
           g.nome as vigilante, coalesce((select nome from public.clientes where id = a.cliente_id), g.posto, g.acompanhar_destino, '') as posto,
           e.nome as empresa,
           coalesce((select json_agg(json_build_object('tipo', ct.tipo, 'nome', ct.nome, 'whatsapp', ct.whatsapp))
                       from public.contatos_alerta ct where ct.empresa_id = a.empresa_id), '[]'::json) as contatos
      from public.alertas a
      join public.vigilantes g on g.id = a.vigilante_id
      join public.empresas e on e.id = a.empresa_id
     where a.envio_status = 'pendente' and a.criado_em > now() - interval '2 hours'
       and e.ativa and e.plano_status = 'ativo'
       -- empresa de segurança: pânico é só para a central (não vai para o WhatsApp)
       and not (a.tipo = 'panico' and e.tipo = 'seguranca')
       -- plano do vigilante: só as emergências
       and not (e.tipo = 'autonomo' and a.tipo not in ('panico', 'coacao', 'sem_movimento', 'batida'))
     limit 20) x), '[]'::json);
end $$;

-- O pânico do plano do vigilante não vira registro oculto de livro (não há empresa para ler)
create or replace function public._panico_no_livro()
returns trigger language plpgsql security definer set search_path = public as $$
declare g public.vigilantes; e public.empresas; v_local text;
begin
  if new.tipo <> 'panico' then return new; end if;
  select * into e from public.empresas where id = new.empresa_id;
  if e.tipo <> 'seguranca' then return new; end if;
  select * into g from public.vigilantes where id = new.vigilante_id;
  v_local := coalesce((select nome from public.clientes where id = new.cliente_id), g.posto, 'posto não informado');
  insert into public.livro_registros (empresa_id, cliente_id, vigilante_id, turno_inicio, assunto, hora_fato, descricao,
                                      lat, lng, oculto_vigilante, alerta_id)
  values (new.empresa_id, new.cliente_id, new.vigilante_id, g.turno_iniciado_em, 'Pânico (botão Power 4x)', new.criado_em,
          'O vigilante ' || g.nome || ' acionou o pânico silencioso às ' ||
          to_char(new.criado_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS') || ' de ' ||
          to_char(new.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') ||
          '. Possível assalto no local: ' || v_local || '.' ||
          case when new.bateria is not null then ' Bateria do celular: ' || new.bateria || '%.' else '' end ||
          case when new.lat is null then ' Sem localização no momento.' else '' end,
          new.lat, new.lng, true, new.id);
  return new;
end $$;

-- Permissões
revoke all on function public._vig_autonomo(text) from public, anon, authenticated;
revoke all on function public.registrar_autonomo(text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.registrar_autonomo(text, text, text, text, text, text, boolean, text) to authenticated;
revoke all on function public.vig_contatos(text), public.vig_contato_salvar(text, text, text, text), public.vig_contato_excluir(text, uuid),
  public.vig_meu_plano(text) from public;
grant execute on function public.vig_contatos(text), public.vig_contato_salvar(text, text, text, text), public.vig_contato_excluir(text, uuid),
  public.vig_meu_plano(text) to anon, authenticated;

select 'migracao 016 ok' as resultado;
