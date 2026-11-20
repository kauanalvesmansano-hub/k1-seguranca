-- Migração 027 — blindagem após o teste de invasão
-- 1) IP real da requisição: antes lia o 1º item do X-Forwarded-For, que o atacante
--    escreve como quiser (trocava de "IP" a cada tentativa e furava o limite de 20 erros).
--    Agora usa o cf-connecting-ip (posto pela Cloudflare, não dá para falsificar) e,
--    na falta dele, o ÚLTIMO item do X-Forwarded-For (o que o proxy do Supabase acrescenta).
create or replace function public._ip_requisicao()
returns text language sql stable set search_path = public as $$
  with h as (select nullif(current_setting('request.headers', true), '')::json j)
  select coalesce(
    nullif(trim((select j->>'cf-connecting-ip' from h)), ''),
    nullif(trim((select (regexp_split_to_array(coalesce(j->>'x-forwarded-for', ''), '\s*,\s*'))[
             array_length(regexp_split_to_array(coalesce(j->>'x-forwarded-for', ''), '\s*,\s*'), 1)] from h)), ''),
    'desconhecido')
$$;
revoke all on function public._ip_requisicao() from public, anon, authenticated;

-- 2) Função temporária usada só no teste
drop function if exists public._dbg_hdr();

-- 3) Tabelas do monitoramento: já tinham RLS sem políticas (ninguém lia), agora nem o acesso existe
revoke all on public.mon_config, public.mon_aparelhos, public.mon_sessoes, public.mon_tentativas from anon, authenticated;

-- 4) Função de gatilho não precisa ficar chamável por fora
revoke all on function public._sos_rolagem() from public, anon, authenticated;

select 'migracao 027 ok' as resultado;
