-- K1 Segurança — 020: vigilantes do MESMO posto, em turno, são avisados quando o parceiro aciona pânico/coação
create or replace function public.vig_alertas_parceiros(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token);
begin
  if not v.em_turno then return '[]'::json; end if;
  return coalesce((select json_agg(x order by x.criado_em) from (
    select a.id, a.tipo, a.lat, a.lng, a.criado_em, g.nome as vigilante,
           coalesce(nullif(cl.nome, ''), g.posto, '') as posto
      from public.alertas a
      join public.vigilantes g on g.id = a.vigilante_id
      left join public.clientes cl on cl.id = a.cliente_id
     where a.empresa_id = v.empresa_id
       and a.vigilante_id <> v.id
       and a.tipo in ('panico', 'coacao')
       and a.status <> 'resolvido'
       and a.criado_em > now() - interval '30 minutes'
       and ((v.cliente_id is not null and coalesce(a.cliente_id, g.cliente_id) = v.cliente_id)
         or (v.cliente_id is null and g.cliente_id is null
             and nullif(trim(v.posto), '') is not null and lower(trim(g.posto)) = lower(trim(v.posto))))
     limit 10) x), '[]'::json);
end $$;
revoke all on function public.vig_alertas_parceiros(text) from public;
grant execute on function public.vig_alertas_parceiros(text) to anon, authenticated;
