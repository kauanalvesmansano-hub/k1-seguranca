import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, configurado } from './config';

// Cliente usado pela EMPRESA (login com e-mail e senha).
// O FUNCIONÁRIO não faz login no Supabase: ele só chama as funções vig_*
// com o token do celular, e por isso não tem acesso a nada da empresa.
export const supabase = createClient(
  configurado ? SUPABASE_URL : 'https://exemplo.supabase.co',
  configurado ? SUPABASE_ANON_KEY : 'chave-nao-configurada',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

const ERROS: Record<string, string> = {
  dados_invalidos: 'Matrícula ou senha incorretas.',
  bloqueado_temporariamente: 'Muitas tentativas erradas. Aguarde 15 minutos ou procure sua empresa.',
  empresa_inativa: 'Acesso suspenso. Procure sua empresa.',
  empresa_bloqueada: 'Acesso suspenso. Procure sua empresa.',
  fatura_nao_encontrada: 'Fatura não encontrada.',
  ponto_invalido: 'QR code não é um ponto de ronda desta empresa.',
  inicie_o_turno: 'Inicie o turno antes de fazer a ronda.',
  dispositivo_nao_autorizado: 'Seu acesso foi encerrado pela empresa. Entre novamente.',
  termo_nao_aceito: 'É preciso aceitar o termo.',
  sem_permissao: 'Você não tem permissão para isso.',
  usuario_ja_vinculado_a_empresa: 'Este usuário já tem uma empresa cadastrada.',
  senha_deve_ter_4_a_8_numeros: 'As senhas devem ter de 4 a 8 números.',
  senha_e_coacao_devem_ser_diferentes: 'A senha normal e a de coação precisam ser diferentes.',
  limite_de_vigilantes_do_plano_atingido: 'Limite do plano atingido. Aumente a quantidade no painel.',
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Este e-mail já tem conta. Use "Entrar".',
  'Network request failed': 'Sem internet. Verifique a conexão.',
};

export function traduzErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  for (const k of Object.keys(ERROS)) if (msg.includes(k)) return ERROS[k];
  return msg;
}
