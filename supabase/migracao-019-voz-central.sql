-- K1 Segurança — 019: a central recebe o nome do local e o detalhe do alerta (para a voz explicar o disparo)
create or replace function public.central_alertas(p_token text, p_desde timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare c public.centrais := public._central_por_token(p_token); agora timestamptz := clock_timestamp();
begin
  update public.centrais set ultimo_contato = agora where id = c.id;
  return json_build_object(
    'agora', agora,
    'alertas', coalesce((select json_agg(x order by x.criado_em) from (
      select a.id, a.tipo, a.lat, a.lng, a.bateria, a.criado_em, a.status, a.sos_gravando,
             g.nome as vigilante, coalesce(nullif(cl.nome, ''), g.posto, '') as posto, g.gravar_sos,
             coalesce(a.detalhe, '') as detalhe
        from public.alertas a join public.vigilantes g on g.id = a.vigilante_id
        left join public.clientes cl on cl.id = a.cliente_id
       where a.empresa_id = c.empresa_id
         and a.criado_em > coalesce(p_desde, agora) - interval '1 minute'
         and a.criado_em > agora - interval '30 minutes'
       limit 20) x), '[]'::json));
end $$;
