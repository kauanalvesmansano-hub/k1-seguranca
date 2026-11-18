-- =====================================================================
-- K1 SEGURANÇA — Migração 008 (pode rodar mais de uma vez)
--  Detecção de batida de carro/moto (K1 Família e vigilantes):
--  o celular percebe impacto forte a 25 km/h ou mais seguido de parada,
--  pergunta "Você está bem?" por 30 s e, sem resposta, chama esta função.
-- =====================================================================
alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check
  check (tipo in ('panico', 'coacao', 'senha_errada', 'sem_resposta', 'bateria_baixa', 'fora_do_posto',
                  'sem_movimento', 'atraso_chegada', 'batida'));

create or replace function public.vig_batida(p_token text, p_lat double precision, p_lng double precision,
                                             p_velocidade int, p_forca numeric, p_teste boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); v_id uuid;
begin
  -- no máximo 1 alerta de batida a cada 3 minutos por pessoa (evita repetição)
  if exists (select 1 from public.alertas where vigilante_id = v.id and tipo = 'batida' and criado_em > now() - interval '3 minutes') then
    return json_build_object('ok', true, 'repetido', true);
  end if;
  v_id := public._criar_alerta(v, 'batida', p_lat, p_lng);
  update public.alertas
     set observacao = case when coalesce(p_teste, false) then 'TESTE da detecção de batida. ' else '' end ||
                      'Possível batida: estava a ~' || greatest(coalesce(p_velocidade, 0), 0) || ' km/h, impacto de ' ||
                      round(coalesce(p_forca, 0), 1) || ' g, e não respondeu em 30 s.'
   where id = v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.vig_batida(text, double precision, double precision, int, numeric, boolean) from public;
grant execute on function public.vig_batida(text, double precision, double precision, int, numeric, boolean) to anon, authenticated;

select 'migracao 008 ok' as resultado;
