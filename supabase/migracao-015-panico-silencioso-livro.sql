-- =====================================================================
-- K1 SEGURANÇA — Migração 015 (pode rodar mais de uma vez)
--  PÂNICO (Power 4x / SOS) em empresa de segurança:
--   * fica registrado AUTOMATICAMENTE no livro de ocorrências (hora do aperto,
--     quem atendeu, quando foi resolvido e a observação), só para a empresa;
--   * NÃO aparece no celular do vigilante (o assaltante pode estar olhando),
--     NÃO vai para o WhatsApp e NÃO entra no PDF do livro enviado no WhatsApp.
--  (Contas do K1 Família continuam recebendo o SOS no WhatsApp normalmente.)
-- =====================================================================
alter table public.livro_registros add column if not exists oculto_vigilante boolean not null default false;
alter table public.livro_registros add column if not exists alerta_id uuid references public.alertas(id) on delete set null;
alter table public.alertas add column if not exists atendido_em timestamptz;
alter table public.alertas add column if not exists atendido_por text;

-- Quem atendeu (painel, app da empresa ou celular da central)
create or replace function public._alerta_atendido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'aberto' and old.status = 'aberto' and new.atendido_em is null then
    new.atendido_em := now();
    new.atendido_por := coalesce(new.atendido_por, (select nome from public.usuarios_empresa where user_id = auth.uid()), 'Central');
  end if;
  return new;
end $$;
drop trigger if exists t_alerta_atendido on public.alertas;
create trigger t_alerta_atendido before update of status on public.alertas for each row execute function public._alerta_atendido();

create or replace function public.central_atender(p_token text, p_alerta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token);
begin
  update public.alertas set status = 'em_atendimento', atendido_por = 'Central: ' || c.nome
   where id = p_alerta_id and empresa_id = c.empresa_id and status = 'aberto';
end $$;

-- Pânico → livro de ocorrências (oculto do vigilante)
create or replace function public._panico_no_livro()
returns trigger language plpgsql security definer set search_path = public as $$
declare g public.vigilantes; e public.empresas; v_local text;
begin
  if new.tipo <> 'panico' then return new; end if;
  select * into e from public.empresas where id = new.empresa_id;
  if e.tipo = 'familia' then return new; end if;
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
drop trigger if exists t_panico_livro on public.alertas;
create trigger t_panico_livro after insert on public.alertas for each row execute function public._panico_no_livro();

-- Atendimento e resolução entram no mesmo registro do livro
create or replace function public._panico_livro_atualiza()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_txt text := '';
begin
  if new.tipo <> 'panico' or new.status = old.status then return new; end if;
  if old.status = 'aberto' and new.status <> 'aberto' then
    v_txt := v_txt || E'\nAtendido às ' || to_char(coalesce(new.atendido_em, now()) at time zone 'America/Sao_Paulo', 'HH24:MI:SS') ||
             ' por ' || coalesce(new.atendido_por, 'Central') || '.';
  end if;
  if new.status = 'resolvido' then
    v_txt := v_txt || E'\nResolvido às ' || to_char(coalesce(new.resolvido_em, now()) at time zone 'America/Sao_Paulo', 'HH24:MI:SS') ||
             coalesce('. Providência: ' || nullif(rtrim(trim(new.observacao), '.'), ''), '') || '.';
  end if;
  if v_txt <> '' then
    update public.livro_registros set descricao = left(descricao || v_txt, 3000) where alerta_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists t_panico_livro_upd on public.alertas;
create trigger t_panico_livro_upd after update of status on public.alertas for each row execute function public._panico_livro_atualiza();

-- Celular do vigilante: nunca mostra os registros ocultos, nem deixa apagar
create or replace function public.vig_livro_turno(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  return json_build_object('assuntos', public.livro_assuntos(), 'em_turno', v.em_turno,
    'registros', coalesce((select json_agg(x order by x.hora_fato desc) from (
      select id, assunto, hora_fato, descricao, foto_base64 is not null as tem_foto
        from public.livro_registros
       where vigilante_id = v.id and v.em_turno and turno_inicio = v.turno_iniciado_em and not oculto_vigilante) x), '[]'::json));
end $$;
create or replace function public.vig_livro_excluir(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  delete from public.livro_registros
   where id = p_id and vigilante_id = v.id and v.em_turno and turno_inicio = v.turno_iniciado_em and not oculto_vigilante;
end $$;

-- PDF do WhatsApp: sem os registros ocultos (e não gera PDF só por causa deles)
create or replace function public._livro_fechar_turno()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.em_turno and not new.em_turno and old.turno_iniciado_em is not null
     and (exists (select 1 from public.livro_registros where vigilante_id = old.id and turno_inicio = old.turno_iniciado_em and not oculto_vigilante)
          or exists (select 1 from public.ocorrencias where vigilante_id = old.id and criado_em >= old.turno_iniciado_em)) then
    insert into public.livro_envios (empresa_id, vigilante_id, turno_inicio)
    values (old.empresa_id, old.id, old.turno_iniciado_em)
    on conflict (vigilante_id, turno_inicio) do nothing;
  end if;
  return new;
end $$;

create or replace function public.ponte_livros(p_segredo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  return coalesce((select json_agg(x order by x.turno_fim) from (
    select l.id, l.turno_inicio, l.turno_fim, g.nome as vigilante, g.matricula, coalesce(c.nome, g.posto, '') as posto,
           e.nome as empresa, e.cnpj,
           coalesce((select json_agg(json_build_object('assunto', r.assunto, 'hora', r.hora_fato, 'descricao', r.descricao,
                       'foto', r.foto_base64, 'lat', r.lat, 'lng', r.lng) order by r.hora_fato)
                       from public.livro_registros r where r.vigilante_id = l.vigilante_id and r.turno_inicio = l.turno_inicio
                        and not r.oculto_vigilante), '[]'::json) as registros,
           coalesce((select json_agg(json_build_object('tipo', o.tipo, 'hora', o.criado_em, 'descricao', o.descricao,
                       'foto', o.foto_base64, 'lat', o.lat, 'lng', o.lng) order by o.criado_em)
                       from public.ocorrencias o where o.vigilante_id = l.vigilante_id
                        and o.criado_em >= l.turno_inicio and o.criado_em <= l.turno_fim), '[]'::json) as ocorrencias,
           coalesce((select json_agg(ct.whatsapp) from public.contatos_alerta ct
                      where ct.empresa_id = l.empresa_id and ct.tipo = 'monitoramento'), '[]'::json) as contatos
      from public.livro_envios l
      join public.vigilantes g on g.id = l.vigilante_id
      left join public.clientes c on c.id = g.cliente_id
      join public.empresas e on e.id = l.empresa_id and e.ativa and e.plano_status = 'ativo'
     where l.status = 'pendente' and l.tentativas < 5 and l.criado_em > now() - interval '2 days'
     order by l.turno_fim limit 3) x), '[]'::json);
end $$;

-- WhatsApp de alertas: pânico de empresa de segurança NÃO vai para o WhatsApp
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
       and not (a.tipo = 'panico' and e.tipo is distinct from 'familia')
     limit 20) x), '[]'::json);
end $$;

-- O que já estava na fila de WhatsApp de pânico de empresa não sai mais
update public.alertas a set envio_status = 'enviado'
  from public.empresas e
 where e.id = a.empresa_id and a.tipo = 'panico' and a.envio_status = 'pendente' and e.tipo is distinct from 'familia';

revoke all on function public._alerta_atendido(), public._panico_no_livro(), public._panico_livro_atualiza() from public, anon, authenticated;

select 'migracao 015 ok' as resultado;
