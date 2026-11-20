import { supabase } from './supabase';
import { K1 } from '../components/k1';

/** K1 MONITORAMENTO — central geral do dono do K1 (todas as contas). */

export type MonAlerta = {
  id: string; tipo: string; status: 'aberto' | 'em_atendimento' | 'resolvido';
  lat: number | null; lng: number | null; bateria: number | null; criado_em: string;
  atendido_em: string | null; atendido_por: string | null; resolvido_em: string | null;
  observacao: string | null; detalhe: string | null; sos_gravando: boolean; sos_encerrado_em: string | null;
  empresa_id: string; vigilante_id: string; empresa: string; plano: string; pessoa: string;
  telefone: string | null; profissao: string; local: string; trechos: number;
};
export type MonConta = {
  id: string; nome: string; tipo: string; cnpj: string | null; plano_status: string; ativa: boolean; criado_em: string;
  teste_ate: string | null; vagas: number; pessoas: number; em_turno: number; bateria_min: number | null; alertas: number;
  profissoes: string | null; email: string | null; telefone: string | null;
};
export type MonPessoa = {
  id: string; empresa_id: string; empresa: string; plano: string; nome: string; matricula: string; matricula_acesso: string | null;
  telefone: string | null; profissao: string; local: string; em_turno: boolean; turno_iniciado_em: string | null;
  lat: number | null; lng: number | null; precisao: number | null; bateria: number | null; carregando: boolean | null;
  wifi: boolean | null; atualizado: string | null; fora_do_posto: boolean; dispositivo_ativo: boolean; termo: boolean;
  movimento_em: string | null;
  alerta: { id: string; tipo: string; status: string; criado_em: string } | null;
};

export const TIPOS: Record<string, { txt: string; cor: string }> = {
  panico: { txt: 'PÂNICO', cor: '#ef4444' }, coacao: { txt: 'COAÇÃO', cor: '#ef4444' },
  sem_movimento: { txt: 'HOMEM CAÍDO', cor: '#ef4444' }, batida: { txt: 'BATIDA / TOMBAMENTO', cor: '#ef4444' },
  senha_errada: { txt: 'SENHA ERRADA', cor: K1.amarelo }, sem_resposta: { txt: 'SEM RESPOSTA', cor: K1.amarelo },
  fora_do_posto: { txt: 'FORA DO POSTO', cor: K1.amarelo }, bateria_baixa: { txt: 'BATERIA BAIXA', cor: K1.amarelo },
  atraso_chegada: { txt: 'NÃO CHEGOU NO HORÁRIO', cor: '#ef4444' }, ronda_perdida: { txt: 'RONDA NÃO CONCLUÍDA', cor: K1.amarelo },
  plantao_nao_assumido: { txt: 'PLANTÃO NÃO ASSUMIDO', cor: '#ef4444' }, parada_sem_resposta: { txt: 'PARADA SEM RESPOSTA', cor: '#ef4444' },
  desvio_rota: { txt: 'DESVIO DE ROTA', cor: K1.amarelo }, parada_longa: { txt: 'PARADA FORA DO PLANO', cor: K1.amarelo },
};
export const tipo = (t: string) => TIPOS[t] ?? { txt: t.toUpperCase(), cor: K1.amarelo };
export const CRITICOS = ['panico', 'coacao', 'sem_movimento', 'batida', 'atraso_chegada', 'plantao_nao_assumido', 'parada_sem_resposta'];
export const PLANOS: Record<string, { txt: string; cor: string }> = {
  seguranca: { txt: 'Empresa', cor: '#1d4ed8' }, autonomo: { txt: 'Individual', cor: '#6d28d9' },
  familia: { txt: 'Família', cor: '#15803d' }, transportadora: { txt: 'Transportadora', cor: '#b45309' },
};
export const plano = (p: string) => PLANOS[p] ?? { txt: p, cor: '#334155' };

export function ha(s: string | null | undefined) {
  if (!s) return '—';
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h} h ${m % 60} min` : new Date(s).toLocaleDateString('pt-BR');
}
export const semSinal = (p: MonPessoa) => p.em_turno && (!p.atualizado || Date.now() - new Date(p.atualizado).getTime() > 10 * 60000);

async function chamar<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
export const souDono = async () => { try { await chamar('mon_resumo'); return true; } catch { return false; } };
export const resumo = () => chamar<Record<string, number>>('mon_resumo');
export const contas = () => chamar<MonConta[]>('mon_empresas');
export const pessoas = (empresa: string | null = null, soTurno = false) => chamar<MonPessoa[]>('mon_pessoas', { p_empresa_id: empresa, p_so_turno: soTurno });
export const alertas = (todos = false, empresa: string | null = null, limite = 300) =>
  chamar<MonAlerta[]>('mon_alertas', { p_todos: todos, p_empresa_id: empresa, p_limite: limite });
export const atender = (id: string) => chamar<void>('mon_atender', { p_alerta_id: id });
export const resolver = (id: string, obs: string) => chamar<void>('mon_resolver', { p_alerta_id: id, p_observacao: obs });
export const resolverVarios = (ids: string[], obs: string) => chamar<number>('mon_resolver_varios', { p_ids: ids, p_observacao: obs });
export const relatorio = (dias: number) => chamar<Record<string, unknown>>('mon_relatorio', { p_dias: dias });
export const ocorrencias = (empresa: string | null, dias: number) => chamar<Record<string, unknown>[]>('mon_ocorrencias', { p_empresa_id: empresa, p_dias: dias });
export const livro = (empresa: string | null, dias: number) => chamar<Record<string, unknown>[]>('mon_livro', { p_empresa_id: empresa, p_dias: dias });
export const trilha = (id: string, horas: number) => chamar<[number, number, number | null, string][]>('mon_trilha', { p_vigilante_id: id, p_horas: horas });

/** Pessoas → pontos do mapa (vermelho = alerta, cinza = sem sinal, laranja = bateria baixa, verde = ok). */
export function pontosDe(lista: MonPessoa[], soTurno = true) {
  return lista.filter(p => p.lat != null && p.lng != null && (!soTurno || p.em_turno || p.alerta)).map(p => ({
    id: p.id, lat: p.lat as number, lng: p.lng as number, grande: !!p.alerta,
    cor: p.alerta ? '#ef4444' : semSinal(p) ? '#64748b' : (p.bateria != null && p.bateria < 20) ? '#f59e0b' : '#22c55e',
    titulo: (p.profissao === 'caminhoneiro' ? '🚚 ' : '') + p.nome,
    texto: `${p.empresa}${p.local ? ' · ' + p.local : ''} · 🔋 ${p.bateria ?? '—'}% · ${ha(p.atualizado)}${p.alerta ? ' · ⚠ ' + tipo(p.alerta.tipo).txt : ''}`,
  }));
}

/** Endereço aproximado (bairro, cidade - UF) da posição, para o painel. Guarda em memória para não repetir. */
const cacheEnd = new Map<string, string>();
export async function endereco(lat: number, lng: number): Promise<string> {
  const chave = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const c = cacheEnd.get(chave); if (c) return c;
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`);
    const d = await r.json();
    const uf = String(d.principalSubdivisionCode ?? '').replace('BR-', '');
    const txt = [d.locality && d.locality !== d.city ? d.locality : '', [d.city, uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
    if (txt) { cacheEnd.set(chave, txt); return txt; }
  } catch { /* sem internet */ }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
/** Online = mandou sinal nos últimos 10 minutos. */
export const online = (p: MonPessoa) => !!p.atualizado && Date.now() - new Date(p.atualizado).getTime() <= 10 * 60000;
