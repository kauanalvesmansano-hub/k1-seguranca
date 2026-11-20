-- =====================================================================
-- K1 SEGURANÇA — Migração 014 (pode rodar mais de uma vez)
--  1) LIVRO DE OCORRÊNCIAS DIGITAL: o vigilante registra no turno (assunto,
--     horário do fato, descrição, foto). Ao ENCERRAR o turno, o livro do turno
--     (e as ocorrências do turno) vira PDF e vai para o WhatsApp do monitoramento.
--  2) A empresa pode REMOVER ocorrências e registros do livro.
-- =====================================================================

-- ---------- 1) Livro ----------
create table if not exists public.livro_registros (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  cliente_id    uuid references public.clientes(id) on delete set null,
  vigilante_id  uuid not null references public.vigilantes(id) on delete cascade,
  turno_inicio  timestamptz,
  assunto       text not null check (length(trim(assunto)) between 2 and 60),
  hora_fato     timestamptz not null default now(),
  descricao     text not null check (length(trim(descricao)) between 2 and 3000),
  foto_base64   text check (length(foto_base64) <= 900000 and foto_base64 ~ '^[A-Za-z0-9+/=\r\n]+$'),
  lat           double precision,
  lng           double precision,
  criado_em     timestamptz not null default now()
);
create index if not exists livro_empresa_idx on public.livro_registros (empresa_id, hora_fato desc);
create index if not exists livro_vig_turno_idx on public.livro_registros (vigilante_id, turno_inicio);
alter table public.livro_registros enable row level security;
revoke all on public.livro_registros from anon, authenticated;
grant select, delete on public.livro_registros to authenticated;
drop policy if exists livro_sel on public.livro_registros;
create policy livro_sel on public.livro_registros for select to authenticated using (empresa_id = public.minha_empresa_liberada());
drop policy if exists livro_del on public.livro_registros;
create policy livro_del on public.livro_registros for delete to authenticated using (empresa_id = public.minha_empresa_liberada() and public.eh_admin());
drop trigger if exists t_cliente on public.livro_registros;
create trigger t_cliente before insert on public.livro_registros for each row execute function public._cliente_do_registro();

-- PDF do turno para o WhatsApp (a ponte busca os pendentes)
create table if not exists public.livro_envios (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  vigilante_id  uuid not null references public.vigilantes(id) on delete cascade,
  turno_inicio  timestamptz not null,
  turno_fim     timestamptz not null default now(),
  status        text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'sem_contato')),
  resposta      text,
  tentativas    int not null default 0,
  criado_em     timestamptz not null default now(),
  unique (vigilante_id, turno_inicio)
);
alter table public.livro_envios enable row level security;
revoke all on public.livro_envios from anon, authenticated;
grant select on public.livro_envios to authenticated;
drop policy if exists livro_env_sel on public.livro_envios;
create policy livro_env_sel on public.livro_envios for select to authenticated using (empresa_id = public.minha_empresa_liberada());

-- Assuntos prontos (o app mostra estes botões)
create or replace function public.livro_assuntos()
returns text[] language sql immutable as $$
  select array['Assunção de serviço', 'Passagem de serviço', 'Ronda realizada', 'Entrada/saída de veículo',
               'Prestador de serviço', 'Entrega/correspondência', 'Chaves', 'Alarme disparado',
               'Falta de energia/água', 'Portão/porta aberta', 'Lâmpada/equipamento com defeito',
               'Pessoa suspeita', 'Ocorrência policial', 'Reclamação de morador/cliente', 'Outros']
$$;

create or replace function public.vig_livro_registrar(p_token text, p_assunto text, p_hora timestamptz,
                                                      p_descricao text, p_foto_base64 text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); v_id uuid; v_hora timestamptz;
begin
  if not v.em_turno then raise exception 'inicie_o_turno'; end if;
  if length(trim(coalesce(p_assunto, ''))) not between 2 and 60 then raise exception 'escolha_o_assunto'; end if;
  if length(trim(coalesce(p_descricao, ''))) < 2 then raise exception 'descreva_o_que_aconteceu'; end if;
  -- horário do fato: dentro do turno e nunca no futuro
  v_hora := least(greatest(coalesce(p_hora, now()), v.turno_iniciado_em - interval '1 hour'), now());
  if (select count(*) from public.livro_registros where vigilante_id = v.id and criado_em > now() - interval '1 minute') >= 10 then
    raise exception 'muitas_tentativas';
  end if;
  insert into public.livro_registros (empresa_id, vigilante_id, turno_inicio, assunto, hora_fato, descricao, foto_base64, lat, lng)
  values (v.empresa_id, v.id, v.turno_iniciado_em, trim(p_assunto), v_hora, trim(p_descricao), nullif(p_foto_base64, ''),
          v.ultima_lat, v.ultima_lng)
  returning id into v_id;
  return json_build_object('id', v_id, 'hora', v_hora);
end $$;

-- Lista do turno atual (sem as fotos, para ser leve)
create or replace function public.vig_livro_turno(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  return json_build_object('assuntos', public.livro_assuntos(), 'em_turno', v.em_turno,
    'registros', coalesce((select json_agg(x order by x.hora_fato desc) from (
      select id, assunto, hora_fato, descricao, foto_base64 is not null as tem_foto
        from public.livro_registros where vigilante_id = v.id and v.em_turno and turno_inicio = v.turno_iniciado_em) x), '[]'::json));
end $$;

-- O vigilante pode apagar um registro DELE enquanto o turno não terminou
create or replace function public.vig_livro_excluir(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  delete from public.livro_registros where id = p_id and vigilante_id = v.id and v.em_turno and turno_inicio = v.turno_iniciado_em;
end $$;

-- Ao encerrar o turno (pelo app, pela empresa ou por desconectar o celular): agenda o PDF
create or replace function public._livro_fechar_turno()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.em_turno and not new.em_turno and old.turno_iniciado_em is not null
     and (exists (select 1 from public.livro_registros where vigilante_id = old.id and turno_inicio = old.turno_iniciado_em)
          or exists (select 1 from public.ocorrencias where vigilante_id = old.id and criado_em >= old.turno_iniciado_em)) then
    insert into public.livro_envios (empresa_id, vigilante_id, turno_inicio)
    values (old.empresa_id, old.id, old.turno_iniciado_em)
    on conflict (vigilante_id, turno_inicio) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists t_livro_fechar on public.vigilantes;
create trigger t_livro_fechar after update of em_turno on public.vigilantes
  for each row execute function public._livro_fechar_turno();

-- Ponte de WhatsApp: livros a enviar (com tudo que vai no PDF)
create or replace function public.ponte_livros(p_segredo text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  return coalesce((select json_agg(x order by x.turno_fim) from (
    select l.id, l.turno_inicio, l.turno_fim, g.nome as vigilante, g.matricula, coalesce(c.nome, g.posto, '') as posto,
           e.nome as empresa, e.cnpj,
           coalesce((select json_agg(json_build_object('assunto', r.assunto, 'hora', r.hora_fato, 'descricao', r.descricao,
                       'foto', r.foto_base64, 'lat', r.lat, 'lng', r.lng) order by r.hora_fato)
                       from public.livro_registros r where r.vigilante_id = l.vigilante_id and r.turno_inicio = l.turno_inicio), '[]'::json) as registros,
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

create or replace function public.ponte_livro_resultado(p_segredo text, p_id uuid, p_status text, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._ponte_ok(p_segredo);
  update public.livro_envios
     set status = case when p_status in ('enviado', 'sem_contato') then p_status
                       when tentativas + 1 >= 5 then 'erro' else 'pendente' end,
         tentativas = tentativas + 1, resposta = left(p_resposta, 500)
   where id = p_id;
end $$;

-- ---------- 2) Remover ocorrências (só administrador da empresa) ----------
grant delete on public.ocorrencias to authenticated;
drop policy if exists oc_del on public.ocorrencias;
create policy oc_del on public.ocorrencias for delete to authenticated
  using (empresa_id = public.minha_empresa_liberada() and public.eh_admin());

-- Remover registros de comunicação (aba Relatórios do app da empresa)
grant delete on public.checkins to authenticated;
drop policy if exists chk_del on public.checkins;
create policy chk_del on public.checkins for delete to authenticated
  using (empresa_id = public.minha_empresa_liberada() and public.eh_admin());

-- Limpeza: fotos do livro com mais de 180 dias
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'k1-limpeza-livro';
    perform cron.schedule('k1-limpeza-livro', '40 4 * * *', $c$delete from public.livro_envios where criado_em < now() - interval '90 days'$c$);
  end if;
end $$;

-- ---------- Permissões ----------
revoke all on function public._livro_fechar_turno() from public, anon, authenticated;
revoke all on function public.vig_livro_registrar(text, text, timestamptz, text, text), public.vig_livro_turno(text),
  public.vig_livro_excluir(text, uuid), public.ponte_livros(text), public.ponte_livro_resultado(text, uuid, text, text) from public;
grant execute on function public.vig_livro_registrar(text, text, timestamptz, text, text), public.vig_livro_turno(text),
  public.vig_livro_excluir(text, uuid), public.ponte_livros(text), public.ponte_livro_resultado(text, uuid, text, text) to anon, authenticated;
grant execute on function public.livro_assuntos() to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.livro_registros; exception when duplicate_object then null; end;
  end if;
end $$;

select 'migracao 014 ok' as resultado;
