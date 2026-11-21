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
  empresa_bloqueada: 'Aplicativo bloqueado por falta de pagamento. Funcionário: procure seu encarregado. Autônomo ou família: pague o Pix da K1 (fale no WhatsApp da K1) e o acesso volta assim que o pagamento for confirmado.',
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
  ja_tem_plano_deste_tipo: 'Esta conta já tem um plano deste tipo. Abra "Meus planos" para usar o plano que você já tem.',
  senha_deve_ter_4_a_8_numeros: 'As senhas devem ter de 4 a 8 números.',
  whatsapp_invalido: 'WhatsApp inválido. Use DDD + número, ex.: 43 99999-1234.',
  no_maximo_6_contatos: 'Você pode ter no máximo 6 contatos.',
  senha_e_coacao_devem_ser_diferentes: 'A senha normal e a de coação precisam ser diferentes.',
  limite_de_vigilantes_do_plano_atingido: 'Limite do plano atingido. Aumente a quantidade no painel.',
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Este e-mail já tem conta. Use "Entrar".',
  'Network request failed': 'Sem internet. Verifique a conexão.',
  'For security purposes, you can only request this after': 'Aguarde 1 minuto para pedir outro e-mail.',
  'Email rate limit exceeded': 'Muitos e-mails pedidos agora. Aguarde alguns minutos e tente de novo.',
  'email rate limit exceeded': 'Muitos e-mails pedidos agora. Aguarde alguns minutos e tente de novo.',
  'Error sending confirmation email': 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.',
  'Error sending recovery email': 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.',
  'Email not confirmed': 'Falta confirmar o e-mail. Toque em "Reenviar e-mail de confirmação".',
  'New password should be different': 'A senha nova precisa ser diferente da antiga.',
};

export function traduzErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  for (const k of Object.keys(ERROS)) if (msg.includes(k)) return ERROS[k];
  for (const [re, txt] of ERROS_PT) { const r = msg.match(re); if (r) return typeof txt === 'function' ? txt(r) : txt; }
  // nunca mostra frase em inglês para o usuário
  return /[a-z]{4,} [a-z]{3,}/i.test(msg) && !/[áéíóúãõç]/i.test(msg) ? 'Não foi possível concluir agora. Tente de novo em instantes.' : msg;
}

const ERROS_PT: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/error sending (magic link|recovery|confirmation|invite|email change)? ?email|535|smtp/i, 'Não foi possível enviar o e-mail agora (o servidor de e-mail recusou). Tente de novo em alguns minutos.'],
  [/database error granting user|database error/i, 'Erro no servidor ao entrar. Tente de novo.'],
  [/for security purposes.*?(\d+) seconds?/i, m => `Por segurança, espere ${m[1]} segundos para pedir de novo.`],
  [/rate limit|too many requests/i, 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.'],
  [/token has expired|otp_expired|invalid.*token|token.*invalid/i, 'Código ou link vencido. Peça outro.'],
  [/signups not allowed|user not found/i, 'Este e-mail não está cadastrado.'],
  [/new password should be different/i, 'A senha nova precisa ser diferente da atual.'],
  [/password should be at least|weak.?password/i, 'Senha fraca: use 8 ou mais caracteres, com letras e números.'],
  [/jwt expired|refresh token/i, 'A sua sessão venceu. Entre de novo.'],
  [/failed to fetch|network request failed|networkerror/i, 'Sem internet. Confira a conexão e tente de novo.'],
];

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
  // o Supabase não avisa direto que o e-mail já existe: devolve um usuário sem "identities"
  if (r.data.user && (r.data.user.identities?.length ?? 0) === 0) {
    throw new Error('Este e-mail já tem conta no K1, mas a senha não confere. Use a mesma senha que você criou ou toque em "Esqueci a senha".');
  }
  return null; // precisa confirmar o e-mail
}

export const LINK_NOVA_SENHA = 'k1seguranca://nova-senha';

/** Reenvia o e-mail de confirmação do cadastro. */
export async function reenviarConfirmacao(email: string) {
  const e = email.trim().toLowerCase();
  if (!e.includes('@')) throw new Error('Digite o seu e-mail primeiro.');
  const { error } = await supabase.auth.resend({ type: 'signup', email: e, options: { emailRedirectTo: LINK_CONFIRMACAO } });
  if (error) throw error;
}

/** Manda o e-mail para criar uma senha nova. */
export async function esqueciSenha(email: string) {
  const e = email.trim().toLowerCase();
  if (!e.includes('@')) throw new Error('Digite o seu e-mail primeiro.');
  const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo: LINK_NOVA_SENHA });
  if (error) throw error;
}
