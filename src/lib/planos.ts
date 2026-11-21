import { supabase } from './supabase';
import { limparTipoConta } from './conta';

export type TipoPlano = 'seguranca' | 'autonomo' | 'familia';
export type MeuPlanoConta = {
  empresa_id: string; nome: string; tipo: TipoPlano; plano_status: string;
  teste_ate: string | null; em_teste: boolean; atual: boolean;
  fatura_aberta: { valor: number; vencimento: string } | null;
};

export const NOME_TIPO: Record<TipoPlano, string> = {
  seguranca: 'Empresa de segurança', autonomo: 'Vigilante individual', familia: 'Pessoal / Família',
};

/** Todos os planos da conta (e-mail) logada. Cada um tem teste grátis e cobrança próprios. */
export async function meusPlanos(): Promise<MeuPlanoConta[]> {
  const { data, error } = await supabase.rpc('meus_planos');
  if (error) throw error;
  return (data as MeuPlanoConta[]) ?? [];
}

/** Deixa este plano aberto no painel. */
export async function trocarPlano(empresaId: string) {
  const { error } = await supabase.rpc('trocar_plano', { p_empresa_id: empresaId });
  if (error) throw error;
  limparTipoConta();
}
