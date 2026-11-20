-- K1 Segurança — 022: K1 Monitoramento mostra quando a pessoa se movimentou pela última vez
-- Pessoas de uma conta (ou de todas, com p_empresa_id nulo): bateria, localização, turno, alerta aberto
create or replace function public.mon_pessoas(p_empresa_id uuid default null, p_so_turno boolean default false)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._mon_ok();
  return coalesce((select json_agg(x order by x.em_turno desc, x.nome) from (
    select g.id, g.empresa_id, e.nome as empresa, e.tipo as plano, g.nome, g.matricula, g.matricula_acesso, g.telefone,
           g.profissao, coalesce(nullif(cl.nome, ''), g.posto, '') as local, g.em_turno, g.turno_iniciado_em,
           g.ultima_lat as lat, g.ultima_lng as lng, g.ultima_precisao_m as precisao, g.ultima_bateria as bateria,
           g.ultimo_carregando as carregando, g.ultimo_wifi as wifi, g.ultima_atualizacao as atualizado,
           g.fora_do_posto, g.dispositivo_ativo, g.termo_aceito_em is not null as termo,
           (select max(t.criado_em) from (
              select criado_em, lat, lng, lag(lat) over (order by criado_em) as plat, lag(lng) over (order by criado_em) as plng
                from public.telemetria where vigilante_id = g.id and lat is not null and criado_em > now() - interval '6 hours') t
             where t.plat is not null and abs(t.lat - t.plat) + abs(t.lng - t.plng) > 0.0003) as movimento_em,
           (select json_build_object('id', a.id, 'tipo', a.tipo, 'status', a.status, 'criado_em', a.criado_em)
              from public.alertas a where a.vigilante_id = g.id and a.status <> 'resolvido'
               and a.criado_em > now() - interval '24 hours' order by a.criado_em desc limit 1) as alerta
      from public.vigilantes g
      join public.empresas e on e.id = g.empresa_id
      left join public.clientes cl on cl.id = g.cliente_id
     where g.ativo and (p_empresa_id is null or g.empresa_id = p_empresa_id)
       and (not coalesce(p_so_turno, false) or g.em_turno)
     limit 3000) x), '[]'::json);
end $$;

select 'migracao 022 ok' as resultado;
