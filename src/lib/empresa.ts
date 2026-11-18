import { supabase } from './supabase';

export type Fatura = {
  id: string; competencia: string; qtd_vigilantes: number; valor_unitario: number; valor_total: number;
  vencimento: string; status: 'aberta' | 'paga' | 'vencida' | 'cancelada'; renovar: boolean | null;
  pix_chave: string; pix_copia_cola: string; paga_em: string | null;
};
/** Tabela de preço: R$ 25,00 por vigilante; a partir de 16 vigilantes (mais de 15), R$ 20,00 cada. */
export const PRECO_PADRAO = 25;
export const PRECO_VOLUME = 20;
export const VOLUME_A_PARTIR = 16;
export const DIAS_TESTE = 7;
export const precoVigilante = (qtd: number) => (qtd >= VOLUME_A_PARTIR ? PRECO_VOLUME : PRECO_PADRAO);

export type Plano = {
  plano_status: 'ativo' | 'bloqueado' | 'encerrado';
  em_teste?: boolean; teste_ate?: string | null; tipo?: 'seguranca' | 'familia';
  vigilantes_contratados: number; vigilantes_ativos: number; valor_por_vigilante: number; previa_total: number;
  pix_nome: string; whatsapp_k1: string | null; fatura: Fatura | null;
};

export async function carregarPlano(): Promise<Plano | null> {
  const { data, error } = await supabase.rpc('empresa_plano');
  if (error) return null;
  return data as Plano;
}

export async function responderRenovacao(faturaId: string, renovar: boolean) {
  const { data, error } = await supabase.rpc('empresa_responder_renovacao', { p_fatura_id: faturaId, p_renovar: renovar });
  if (error) throw error;
  return data as { renovar: boolean; mensagem: string };
}

export type Checkin = {
  id: number; vigilante_id: string; resultado: 'ok' | 'coacao' | 'senha_errada' | 'sem_resposta'; criado_em: string;
  vigilantes?: { nome: string; posto: string | null } | null;
};

/** Como a empresa vê cada confirmação. */
export const RESULTADO: Record<Checkin['resultado'], { txt: string; cor: string; icone: 'checkmark-circle' | 'close' | 'warning' | 'alert-circle' }> = {
  ok: { txt: 'Senha OK', cor: '#22c55e', icone: 'checkmark-circle' },
  senha_errada: { txt: 'Senha Incorreta', cor: '#ef4444', icone: 'close' },
  coacao: { txt: 'COAÇÃO', cor: '#ef4444', icone: 'warning' },
  sem_resposta: { txt: 'Sem resposta', cor: '#f59e0b', icone: 'alert-circle' },
};

export const mesAno = (d: string) => {
  const [a, m] = d.split('-');
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}/${a}`;
};
export const dataBR = (d: string) => d.split('-').reverse().join('/');
