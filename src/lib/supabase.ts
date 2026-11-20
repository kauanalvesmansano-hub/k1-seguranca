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
  bloqueado_temporariamente: 'Muitas tentativas erradas. O acesso foi bloqueado por um tempo. Procure sua empresa.',
  convite_invalido: 'Código inválido ou vencido. Peça um novo código para o responsável.',
  muitas_tentativas: 'Muitas tentativas a partir desta rede. Aguarde 15 minutos.',
  cnpj_ja_cadastrado: 'Este CNPJ já tem cadastro no K1 Segurança.',
  cnpj_invalido: 'CNPJ inválido.',
  desative_vigilantes_antes_de_reduzir: 'Desative vigilantes antes de reduzir a quantidade do plano.',
  'Password should be': 'A senha precisa ter pelo menos 8 caracteres, com letras e números.',
  'weak_password': 'Senha fraca: use pelo menos 8 caracteres, com letras e números.',
  empresa_inativa: 'Acesso suspenso. Procure sua empresa.',
  empresa_bloqueada: 'Acesso suspenso. Procure sua empresa.',
  fatura_nao_encontrada: 'Fatura não encontrada.',
  ponto_invalido: 'QR code não é um ponto de ronda desta empresa.',
  inicie_o_turno: 'Inicie o turno primeiro (na aba Início).',
  escolha_o_assunto: 'Escolha o assunto.',
  descreva_o_que_aconteceu: 'Descreva o que aconteceu.',
  informe_o_nome: 'Informe o nome.',
  dispositivo_nao_autorizado: 'Seu acesso foi encerrado pela empresa. Entre novamente.',
  termo_nao_aceito: 'É preciso aceitar o termo.',
  sem_permissao: 'Você não tem permissão para isso.',
  usuario_ja_vinculado_a_empresa: 'Este usuário já tem uma empresa cadastrada.',
  senha_deve_ter_4_a_8_numeros: 'As senhas devem ter de 4 a 8 números.',
  whatsapp_invalido: 'WhatsApp inválido. Use DDD + número, ex.: 43 99999-1234.',
  no_maximo_6_contatos: 'Você pode ter no máximo 6 contatos.',
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

/** Para onde o link do e-mail de confirmação manda (abre o próprio app). */
export const LINK_CONFIRMACAO = 'k1seguranca://confirmado';

/**
 * Pega (ou cria) a conta do e-mail para os cadastros.
 * - já logado → usa a sessão;
 * - conta existe e o e-mail já foi confirmado → entra;
 * - conta não existe → cria e manda o e-mail de confirmação (devolve null).
 */
export async function contaParaCadastro(email: string, senha: string) {
  const atual = (await supabase.auth.getSession()).data.session;
  if (atual) return atual;
  const e = email.trim().toLowerCase();
  if (!e || senha.length < 8 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    throw new Error('Informe o e-mail e uma senha com 8 ou mais caracteres, com letras e números.');
  }
  const login = await supabase.auth.signInWithPassword({ email: e, password: senha });
  if (login.data.session) return login.data.session;
  if (login.error && /not confirmed/i.test(login.error.message)) {
    await supabase.auth.resend({ type: 'signup', email: e, options: { emailRedirectTo: LINK_CONFIRMACAO } }).catch(() => {});
    throw new Error('Falta confirmar o e-mail. Abra o e-mail do K1 Segurança (veja também o Spam), toque em "Confirmar meu e-mail" e depois toque aqui de novo.');
  }
  const r = await supabase.auth.signUp({ email: e, password: senha, options: { emailRedirectTo: LINK_CONFIRMACAO } });
  if (r.error) throw r.error;
  if (r.data.session) return r.data.session;
  return null; // precisa confirmar o e-mail
}
