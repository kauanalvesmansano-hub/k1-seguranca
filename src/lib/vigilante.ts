import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

// Sessão do FUNCIONÁRIO: só um token guardado com criptografia no celular.
const CHAVE = 'k1_vigilante';

export type SessaoVigilante = {
  token: string;
  matricula: string;
  vigilante_id: string;
  nome: string;
  empresa: string;
  termo_aceito: boolean;
  intervalo_checkin_min: number;
  prazo_resposta_min: number;
  /** 'familia' = pessoa protegida do K1 Família (entrou por código de convite) */
  tipo?: 'familia';
};

export async function lerSessao(): Promise<SessaoVigilante | null> {
  const s = await SecureStore.getItemAsync(CHAVE);
  if (!s) return null;
  try {
    const v = JSON.parse(s) as SessaoVigilante;
    // sessão incompleta (versão antiga do app ou login que não terminou): descarta e pede login de novo
    if (!v?.token || typeof v.token !== 'string') { await SecureStore.deleteItemAsync(CHAVE); return null; }
    return v;
  } catch { await SecureStore.deleteItemAsync(CHAVE); return null; }
}

export async function salvarSessao(s: SessaoVigilante) {
  await SecureStore.setItemAsync(CHAVE, JSON.stringify(s));
}

export async function sairVigilante() {
  await SecureStore.deleteItemAsync(CHAVE);
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.message.includes('dispositivo_nao_autorizado')) await sairVigilante();
    throw error;
  }
  return data as T;
}

export async function entrar(matricula: string, senha: string) {
  const r = await rpc<Omit<SessaoVigilante, 'matricula'> & { erro?: string }>('vig_entrar', { p_matricula: matricula, p_senha: senha });
  if (r.erro) throw new Error(r.erro); // senha errada: o servidor responde sem erro para registrar a tentativa
  if (!r.token) throw new Error('Não foi possível ativar este celular. Tente entrar de novo.');
  const s: SessaoVigilante = { ...r, matricula };
  await salvarSessao(s);
  return s;
}

export async function aceitarTermo(s: SessaoVigilante) {
  if (!s.token) { await sairVigilante(); throw new Error('sessao_invalida'); }
  await rpc('vig_aceitar_termo', { p_token: s.token });
  const nova = { ...s, termo_aceito: true };
  await salvarSessao(nova);
  return nova;
}

export function status(s: SessaoVigilante) {
  return rpc<{ em_turno: boolean; proximo_checkin: string | null; termo_aceito: boolean; homem_caido_min?: number }>('vig_status', { p_token: s.token });
}

export function turno(s: SessaoVigilante, iniciar: boolean) {
  return rpc<{ em_turno: boolean; proximo_checkin: string | null }>('vig_turno', { p_token: s.token, p_iniciar: iniciar });
}

export function checkin(s: SessaoVigilante, senha: string, lat: number | null, lng: number | null) {
  return rpc<{ resultado: 'ok' | 'tentar_novamente'; tentativas_restantes?: number; proximo_checkin?: string }>(
    'vig_checkin', { p_token: s.token, p_senha: senha, p_lat: lat, p_lng: lng },
  );
}

export type Ocorrencia = { id: string; tipo: string; descricao: string; status: 'nova' | 'vista' | 'resolvida'; criado_em: string; tem_foto?: boolean };

export function registrarOcorrencia(s: SessaoVigilante, tipo: string, descricao: string, fotoBase64?: string | null) {
  return rpc<{ id: string }>('vig_ocorrencia', {
    p_token: s.token, p_tipo: tipo, p_descricao: descricao, p_lat: null, p_lng: null, p_foto_base64: fotoBase64 ?? null,
  });
}

export type PontoRonda = { id: string; nome: string; ultima_leitura: string | null };

export function pontosRonda(s: SessaoVigilante) {
  return rpc<PontoRonda[]>('vig_pontos_ronda', { p_token: s.token });
}

export function registrarPonto(s: SessaoVigilante, codigo: string) {
  return rpc<{ ponto: string; hora: string }>('vig_registrar_ponto', { p_token: s.token, p_codigo: codigo, p_lat: null, p_lng: null });
}

export function minhasOcorrencias(s: SessaoVigilante) {
  return rpc<Ocorrencia[]>('vig_minhas_ocorrencias', { p_token: s.token });
}

export function panico(s: SessaoVigilante, lat: number | null, lng: number | null, bateria: number | null) {
  return rpc('vig_panico', { p_token: s.token, p_lat: lat, p_lng: lng, p_bateria: bateria });
}
