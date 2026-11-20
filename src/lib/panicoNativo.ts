import { PermissionsAndroid, Platform, type Permission } from 'react-native';
import K1Panico from '../../modules/k1-panico/src/K1PanicoModule';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

/** O pânico pelo botão Power só existe no Android, em build próprio (não no Expo Go). */
export const panicoPowerDisponivel = Platform.OS === 'android' && K1Panico != null;

async function pedirPermissoes() {
  // câmera e microfone: no pânico o celular grava em segredo para o monitoramento acompanhar
  const lista: Permission[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (Number(Platform.Version) >= 33) lista.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  try { await PermissionsAndroid.requestMultiple(lista); } catch { /* segue mesmo sem */ }
}

/** Início do turno: começa a vigiar 4 toques no Power, mesmo com o app fechado. */
export async function ativarPanicoPower(token: string, homemCaidoMin = 0) {
  if (!panicoPowerDisponivel || !K1Panico) return false;
  await pedirPermissoes();
  await K1Panico.iniciar(SUPABASE_URL, SUPABASE_ANON_KEY, token, homemCaidoMin);
  // gravação oculta de câmera + áudio no Power 4x (todos os planos; a pessoa pode desligar)
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.rpc('vig_gravar_sos', { p_token: token });
    K1Panico.sosConfigurar(data !== false);
  } catch { K1Panico.sosConfigurar(true); }
  return true;
}

/** Fim do turno ou saída do app. */
export async function desativarPanicoPower() {
  if (!panicoPowerDisponivel || !K1Panico) return;
  try { await K1Panico.parar(); } catch { /* ignora */ }
}

export function panicoPowerAtivo() {
  return panicoPowerDisponivel && K1Panico ? K1Panico.ativo() : false;
}
