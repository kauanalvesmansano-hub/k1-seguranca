-- =====================================================================
-- K1 SEGURANÇA — Migração 018 (pode rodar mais de uma vez)
--  Correções do 2º teste de segurança:
--   1) Pânico repetido (apertou o Power várias vezes seguidas) não abre um
--      alerta novo a cada toque: o mesmo alerta é atualizado por 2 minutos.
--      Também impede alguém com o celular de inundar o sistema de alertas.
--   2) Vídeo do SOS: no máximo 160 trechos (~16 min) e 1,6 MB por trecho.
--   3) search_path fixo na função livro_assuntos (aviso do Security Advisor).
-- =====================================================================
create or replace function public.vig_panico(p_token text, p_lat double precision, p_lng double precision, p_bateria int,
                                             p_ocorrido_em timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
declare v public.vigilantes := public._vig_por_token(p_token); v_id uuid; v_ult public.alertas;
begin
  if p_bateria is not null then
    update public.vigilantes set ultima_bateria = p_bateria where id = v.id returning * into v;
  end if;
  -- mesmo pânico ainda aberto nos últimos 2 minutos: só atualiza a posição
  select * into v_ult from public.alertas
   where vigilante_id = v.id and tipo = 'panico' and status <> 'resolvido' and criado_em > now() - interval '2 minutes'
   order by criado_em desc limit 1;
  if found then
    update public.alertas set lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng), bateria = coalesce(p_bateria, bateria)
     where id = v_ult.id;
    return json_build_object('ok', true, 'repetido', true);
  end if;
  -- trava contra inundação: no máximo 10 pânicos por hora por celular
  if (select count(*) from public.alertas where vigilante_id = v.id and tipo = 'panico' and criado_em > now() - interval '1 hour') >= 10 then
    return json_build_object('ok', true, 'limite', true);
  end if;
  v_id := public._criar_alerta(v, 'panico', p_lat, p_lng);
  if p_ocorrido_em is not null and p_ocorrido_em < now() - interval '30 seconds' then
    update public.alertas
       set observacao = 'Pânico acionado às ' || to_char(p_ocorrido_em at time zone 'America/Sao_Paulo', 'HH24:MI:SS')
                        || ' sem internet; enviado quando a conexão voltou.'
     where id = v_id;
  end if;
  return json_build_object('ok', true);
end $$;

alter table public.sos_midia drop constraint if exists sos_midia_dados_check;
alter table public.sos_midia drop constraint if exists sos_midia_tamanho;
alter table public.sos_midia add constraint sos_midia_tamanho
  check (length(dados) <= 2200000 and dados ~ '^[A-Za-z0-9+/=\r\n]+$') not valid;
alter table public.sos_midia drop constraint if exists sos_midia_seq_max;
alter table public.sos_midia add constraint sos_midia_seq_max check (seq between 0 and 160) not valid;

alter function public.livro_assuntos() set search_path = public;

select 'migracao 018 ok' as resultado;
