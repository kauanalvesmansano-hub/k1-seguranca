import { PermissionsAndroid, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import K1Panico from '../../modules/k1-panico/src/K1PanicoModule';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { supabase } from './supabase';

const CHAVE = 'k1_central_token';

/** O alarme tipo ligação só existe no Android, no APK do K1 (não no Expo Go). */
export const centralDisponivel = Platform.OS === 'android' && K1Panico != null;

export type StatusCentral = { ativa: boolean; telaCheia: boolean; semEconomia: boolean; furaSilencio: boolean };

export function statusCentral(): StatusCentral {
  if (!centralDisponivel || !K1Panico) return { ativa: false, telaCheia: false, semEconomia: false, furaSilencio: false };
  return { ativa: K1Panico.centralAtiva(), telaCheia: K1Panico.podeTelaCheia(), semEconomia: K1Panico.semEconomiaBateria(), furaSilencio: K1Panico.podeFurarSilencio() };
}

/** Transforma este celular na central: ele toca como ligação a cada pânico, coação ou homem caído. */
export async function ativarCentral(nome: string, global = false) {
  if (!centralDisponivel || !K1Panico) throw new Error('Disponível só no app K1 para Android.');
  if (Number(Platform.Version) >= 33) {
    try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); } catch { /* segue */ }
  }
  let token = await SecureStore.getItemAsync(CHAVE);
  if (!token) {
    const { data, error } = await supabase.rpc(global ? 'mon_ativar_central' : 'ativar_central', { p_nome: nome });
    if (error) throw error;
    token = data as string;
    await SecureStore.setItemAsync(CHAVE, token);
  }
  await K1Panico.centralIniciar(SUPABASE_URL, SUPABASE_ANON_KEY, token);
}

export async function desativarCentral() {
  const token = await SecureStore.getItemAsync(CHAVE);
  if (token) {
    try { await supabase.rpc('central_desativar', { p_token: token }); } catch { /* sem internet: o token fica inválido quando a empresa remover */ }
    await SecureStore.deleteItemAsync(CHAVE);
  }
  if (K1Panico) await K1Panico.centralParar();
}

export function testarCentral() {
  return K1Panico ? K1Panico.centralTestar() : false;
}
export function pedirTelaCheia() { K1Panico?.abrirPermissaoTelaCheia(); }
export function pedirSemEconomia() { K1Panico?.pedirSemEconomiaBateria(); }
export function pedirFurarSilencio() { K1Panico?.pedirFurarSilencio(); }
