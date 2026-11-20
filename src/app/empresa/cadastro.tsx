import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DIAS_TESTE, precoVigilante } from '../../lib/empresa';
const brlTxt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../../components/ui';
import { contaParaCadastro, supabase, traduzErro } from '../../lib/supabase';
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
  const unit = precoVigilante(quantidade);
  const valor = (quantidade * unit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function cadastrar() {
    setErro('');
    if (nome.trim().length < 2 || !responsavel.trim() || quantidade < 1) { setErro('Preencha empresa, responsável e quantidade.'); return; }
    if (!aceite) { setErro('É preciso aceitar o termo.'); return; }
    setCarregando(true);
    try {
      const session = await contaParaCadastro(email, senha);
      if (!session) { setErro('Enviamos um e-mail de confirmação. Abra o e-mail do K1 Segurança (veja também o Spam), toque em "Confirmar meu e-mail" e depois toque aqui de novo — seus dados continuam preenchidos.'); return; }
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
      <View style={s.teste}>
        <Text style={s.testeTit}>🎁 {DIAS_TESTE} DIAS GRÁTIS PARA TESTAR</Text>
        <Text style={s.testeTxt}>Sem cobrança no teste. Depois: R$ 25,00 por vigilante/mês · mais de 15 vigilantes: R$ 20,00 cada.</Text>
      </View>
      <Text style={s.valor}>{brlTxt(unit)} por vigilante · Após o teste: <Text style={{ color: '#fff', fontWeight: '800' }}>{valor}/mês</Text></Text>

      <Pressable onPress={() => setAceite(!aceite)} style={s.aceite} hitSlop={6}>
        <Ionicons name={aceite ? 'checkbox' : 'square-outline'} size={24} color={aceite ? '#e10600' : '#9aa0aa'} />
        <Text style={s.aceiteTxt}>Li e aceito o <Text style={{ color: '#ff3b33' }} onPress={() => setVerTermo(!verTermo)}>Termo de Uso e Monitoramento</Text></Text>
      </Pressable>
      {verTermo && (
        <View style={s.termo}>
          <Text style={s.termoTxt}>
            • Uso exclusivo em celulares da empresa e só durante o turno do vigilante.{'\n'}
            • Dados coletados: localização, bateria, Wi-Fi, confirmações de presença, rondas e pânico. Fotos só nas ocorrências registradas pelo vigilante. Sem áudio ou mensagens.{'\n'}
            • Base legal: proteção da vida e da integridade física (LGPD art. 7º VII e 11 II "e"). A empresa é controladora e a K1 é operadora.{'\n'}
            • A empresa deve informar cada vigilante. O vigilante também aceita o termo no app.{'\n'}
            • O K1 Segurança é uma ferramenta de apoio e não substitui o 190 nem a central de monitoramento.{'\n'}
            • {DIAS_TESTE} dias de teste grátis. Depois, R$ 25,00 por vigilante contratado por mês (acima de 15 vigilantes, R$ 20,00 cada). A 1ª fatura sai no fim do teste (proporcional ao mês); as próximas no fechamento (dia 25), vencimento dia 5. Sem pagamento, o acesso é bloqueado.
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
  teste: { borderWidth: 1.5, borderColor: '#16a34a', backgroundColor: '#052e16', borderRadius: 12, padding: 12, gap: 4 },
  testeTit: { color: '#4ade80', fontWeight: '900', fontSize: 15, textAlign: 'center' },
  testeTxt: { color: '#d1fae5', fontSize: 13, textAlign: 'center' },
  titulo: { color: '#cfcfcf', textAlign: 'center', letterSpacing: 3, fontSize: 13, fontWeight: '700' },
  valor: { color: '#9aa0aa', textAlign: 'center' },
  aceite: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aceiteTxt: { color: '#d0d4da', flex: 1 },
  termo: { backgroundColor: '#0e0f12', borderWidth: 1, borderColor: '#3a3d45', borderRadius: 10, padding: 14 },
  termoTxt: { color: '#c3c8cf', fontSize: 13, lineHeight: 20 },
  voltar: { color: '#8d939c', textAlign: 'center', fontWeight: '600', paddingVertical: 4 },
});
