import { rpc, salvarSessao, sairVigilante, type SessaoVigilante } from './vigilante';
import { ativarPanicoPower, desativarPanicoPower } from './panicoNativo';
import K1Panico from '../../modules/k1-panico/src/K1PanicoModule';

/** K1 Família: preço (o servidor confirma na fatura). */
export const FAMILIA_PRIMEIRO = 15;
export const FAMILIA_ADICIONAL = 7;
export const precoFamilia = (pessoas: number) => (pessoas < 1 ? 0 : FAMILIA_PRIMEIRO + (pessoas - 1) * FAMILIA_ADICIONAL);

export type Membro = {
  id: string; nome: string; papel: string | null; compartilhando: boolean; dispositivo_ativo: boolean;
  lat: number | null; lng: number | null; precisao: number | null; bateria: number | null; carregando: boolean | null;
  wifi: boolean | null; atualizado: string | null; acompanhar_ate: string | null; acompanhar_destino: string | null;
  area_lat: number | null; area_lng: number | null; area_raio: number | null; fora_da_area: boolean;
};
export type AlertaFamilia = {
  id: string; tipo: string; status: string; lat: number | null; lng: number | null; criado_em: string; nome: string;
  sos_gravando?: boolean; sos_encerrado_em?: string | null; trechos?: number;
};
export type Familia = { eu: string; familia: string; homem_caido_min: number; gravar_sos?: boolean; membros: Membro[]; alertas: AlertaFamilia[] };

export const TIPO_ALERTA: Record<string, string> = {
  panico: 'SOS — PEDIU SOCORRO', sem_movimento: 'POSSÍVEL QUEDA / SEM MOVIMENTO', bateria_baixa: 'BATERIA BAIXA',
  fora_do_posto: 'SAIU DA ÁREA SEGURA', batida: 'POSSÍVEL BATIDA DE CARRO/MOTO', atraso_chegada: 'NÃO CHEGOU NO HORÁRIO', coacao: 'COAÇÃO',
  senha_errada: 'SENHA ERRADA', sem_resposta: 'SEM RESPOSTA',
};

/** Entra com o código de convite que o responsável passou. */
export async function entrarComCodigo(codigo: string) {
  const r = await rpc<Omit<SessaoVigilante, 'matricula'> & { erro?: string }>('membro_entrar', { p_codigo: codigo });
  if (r.erro) throw new Error(r.erro);
  const s: SessaoVigilante = { ...r, matricula: '', tipo: 'familia' };
  await salvarSessao(s);
  return s;
}

export async function aceitarTermoFamilia(s: SessaoVigilante) {
  await rpc('vig_aceitar_termo', { p_token: s.token });
  const nova = { ...s, termo_aceito: true };
  await salvarSessao(nova);
  await compartilhar(nova, true);
  return nova;
}

export async function carregarFamilia(s: SessaoVigilante) {
  const f = await rpc<Familia>('membro_familia', { p_token: s.token });
  // o serviço nativo precisa saber se grava câmera/áudio no Power 4x
  try { K1Panico?.sosConfigurar(f.gravar_sos !== false); } catch { /* Expo Go */ }
  return f;
}

/** Liga/desliga a gravação de câmera + áudio no SOS (escolha da própria pessoa). */
export async function configurarGravacaoSos(s: SessaoVigilante, ligar: boolean) {
  await rpc('membro_gravar_sos', { p_token: s.token, p_ligar: ligar });
  try { K1Panico?.sosConfigurar(ligar); } catch { /* Expo Go */ }
}

/** Há câmera/áudio para assistir neste alerta? */
export const temSosAoVivo = (a: AlertaFamilia) => a.tipo === 'panico' && (!!a.sos_gravando || (a.trechos ?? 0) > 0);

/** Liga/pausa o envio da localização (e o pânico pelo Power junto). */
export async function compartilhar(s: SessaoVigilante, ligar: boolean, homemCaidoMin = 0) {
  await rpc('membro_compartilhar', { p_token: s.token, p_ligar: ligar });
  if (ligar) await ativarPanicoPower(s.token, homemCaidoMin);
  else await desativarPanicoPower();
}

export function acompanhar(s: SessaoVigilante, minutos: number, destino: string) {
  return rpc<{ ate: string }>('membro_acompanhar', { p_token: s.token, p_minutos: minutos, p_destino: destino });
}
export function cheguei(s: SessaoVigilante) {
  return rpc('membro_cheguei', { p_token: s.token });
}
export function atenderAlerta(s: SessaoVigilante, alertaId: string, resolver: boolean) {
  return rpc('membro_atender_alerta', { p_token: s.token, p_alerta_id: alertaId, p_resolver: resolver });
}

export async function sairDaFamilia() {
  await desativarPanicoPower();
  await sairVigilante();
}

export function haQuanto(d: string | null) {
  if (!d) return 'nunca';
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
}
