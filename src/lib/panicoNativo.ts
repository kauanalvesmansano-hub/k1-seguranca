import { PermissionsAndroid, Platform, type Permission } from 'react-native';
import K1Panico from '../../modules/k1-panico/src/K1PanicoModule';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

/** O pânico pelo botão Power só existe no Android, em build próprio (não no Expo Go). */
export const panicoPowerDisponivel = Platform.OS === 'android' && K1Panico != null;

async function pedirPermissoes() {
  const lista: Permission[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
  if (Number(Platform.Version) >= 33) lista.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  try { await PermissionsAndroid.requestMultiple(lista); } catch { /* segue mesmo sem */ }
}

/** Início do turno: começa a vigiar 4 toques no Power, mesmo com o app fechado. */
export async function ativarPanicoPower(token: string) {
  if (!panicoPowerDisponivel || !K1Panico) return false;
  await pedirPermissoes();
  await K1Panico.iniciar(SUPABASE_URL, SUPABASE_ANON_KEY, token);
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
