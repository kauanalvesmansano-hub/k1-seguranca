import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../../components/ui';
import { supabase, traduzErro } from '../../lib/supabase';
import { TERMO_VERSAO } from '../../lib/config';

/** Cadastro da empresa: conta + dados + aceite do termo. */
export default function CadastroEmpresa() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [qtd, setQtd] = useState('5');
  const [aceite, setAceite] = useState(false);
  const [verTermo, setVerTermo] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const quantidade = Math.max(0, parseInt(qtd, 10) || 0);
  const valor = (quantidade * 20).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function cadastrar() {
    setErro('');
    if (nome.trim().length < 2 || !responsavel.trim() || quantidade < 1) { setErro('Preencha empresa, responsável e quantidade.'); return; }
    if (!aceite) { setErro('É preciso aceitar o termo.'); return; }
    setCarregando(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!email.trim() || senha.length < 6) throw new Error('Informe e-mail e uma senha com 6+ caracteres.');
        const r = await supabase.auth.signUp({ email: email.trim(), password: senha });
        if (r.error) throw r.error;
        session = r.data.session;
        if (!session) { setErro('Conta criada! Confirme no seu e-mail, faça login e termine o cadastro.'); return; }
      }
      const { error } = await supabase.rpc('registrar_empresa', {
        p_nome: nome, p_cnpj: cnpj, p_qtd_vigilantes: quantidade, p_nome_responsavel: responsavel,
        p_aceite_termo: true, p_termo_versao: TERMO_VERSAO,
      });
      if (error) throw error;
      router.replace('/empresa/painel');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  return (
    <TelaK1 rodape={false}>
      <Text style={s.titulo}>CADASTRO DA EMPRESA</Text>
      <Campo icone="mail" placeholder="E-MAIL" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Campo icone="lock-closed" placeholder="CRIE UMA SENHA" senha value={senha} onChangeText={setSenha} />
      <Campo icone="business" placeholder="NOME DA EMPRESA" autoCapitalize="words" value={nome} onChangeText={setNome} />
      <Campo icone="document-text" placeholder="CNPJ" keyboardType="number-pad" value={cnpj} onChangeText={setCnpj} />
      <Campo icone="person" placeholder="SEU NOME (RESPONSÁVEL)" autoCapitalize="words" value={responsavel} onChangeText={setResponsavel} />
      <Campo icone="people" placeholder="QUANTIDADE DE VIGILANTES" keyboardType="number-pad" value={qtd} onChangeText={setQtd} />
      <Text style={s.valor}>R$ 20,00 por vigilante · Total mensal: <Text style={{ color: '#fff', fontWeight: '800' }}>{valor}</Text></Text>

      <Pressable onPress={() => setAceite(!aceite)} style={s.aceite} hitSlop={6}>
        <Ionicons name={aceite ? 'checkbox' : 'square-outline'} size={24} color={aceite ? '#e10600' : '#9aa0aa'} />
        <Text style={s.aceiteTxt}>Li e aceito o <Text style={{ color: '#ff3b33' }} onPress={() => setVerTermo(!verTermo)}>Termo de Uso e Monitoramento</Text></Text>
      </Pressable>
      {verTermo && (
        <View style={s.termo}>
          <Text style={s.termoTxt}>
            • Uso exclusivo em celulares da empresa e só durante o turno do vigilante.{'\n'}
            • Dados coletados: localização, bateria, Wi-Fi, confirmações de presença e pânico. Sem fotos, áudio ou mensagens.{'\n'}
            • Base legal: proteção da vida e da integridade física (LGPD art. 7º VII e 11 II "e"). A empresa é controladora e a K1 é operadora.{'\n'}
            • A empresa deve informar cada vigilante. O vigilante também aceita o termo no app.{'\n'}
            • O K1 Segurança é uma ferramenta de apoio e não substitui o 190 nem a central de monitoramento.{'\n'}
            • R$ 20,00 por vigilante contratado, por mês. Fatura no fechamento do mês (dia 25), vencimento dia 5. Sem pagamento, o acesso é bloqueado.
          </Text>
        </View>
      )}

      <BotaoVermelho titulo="CADASTRAR EMPRESA" icone="checkmark-circle-outline" onPress={cadastrar} carregando={carregando} />
      <Erro texto={erro} />
      <Pressable onPress={() => router.back()} hitSlop={10}><Text style={s.voltar}>VOLTAR</Text></Pressable>
      <View style={{ height: 30 }} />
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#cfcfcf', textAlign: 'center', letterSpacing: 3, fontSize: 13, fontWeight: '700' },
  valor: { color: '#9aa0aa', textAlign: 'center' },
  aceite: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aceiteTxt: { color: '#d0d4da', flex: 1 },
  termo: { backgroundColor: '#0e0f12', borderWidth: 1, borderColor: '#3a3d45', borderRadius: 10, padding: 14 },
  termoTxt: { color: '#c3c8cf', fontSize: 13, lineHeight: 20 },
  voltar: { color: '#8d939c', textAlign: 'center', fontWeight: '600', paddingVertical: 4 },
});
