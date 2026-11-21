-- Migração 028 — teste grátis de 30 dias (empresa, autônomo e família)
alter table public.config_k1 alter column dias_teste set default 30;
update public.config_k1 set dias_teste = 30 where id = 1;

-- Quem ainda está no teste ganha os 30 dias contados do cadastro
update public.empresas
   set teste_ate = greatest(teste_ate, criado_em + interval '30 days')
 where teste_ate is not null and teste_ate > now() and not coalesce(teste_faturado, false);

select 'migracao 028 ok · dias_teste=' || (select dias_teste from public.config_k1 where id = 1) as resultado;
