import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../../components/ui';
import { contaParaCadastro, supabase, traduzErro } from '../../lib/supabase';
import { TERMO_VERSAO } from '../../lib/config';
import { entrar, salvarContato } from '../../lib/vigilante';

/** Plano do vigilante: ele mesmo contrata, cadastra os contatos de emergência e a empresa onde trabalha. */
export default function CadastroAutonomo() {
  const [email, setEmail] = useState('');
  const [senhaConta, setSenhaConta] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [zapEmpresa, setZapEmpresa] = useState('');
  const [contatoNome, setContatoNome] = useState('');
  const [contatoZap, setContatoZap] = useState('');
  const [senha, setSenha] = useState('');
  const [coacao, setCoacao] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function cadastrar() {
    setErro('');
    if (nome.trim().length < 2) { setErro('Informe o seu nome.'); return; }
    if (!/^\d{4,8}$/.test(senha) || !/^\d{4,8}$/.test(coacao)) { setErro('A senha do app e a senha de coação devem ter de 4 a 8 números.'); return; }
    if (senha === coacao) { setErro('A senha de coação tem que ser diferente da senha normal.'); return; }
    if (contatoNome.trim().length < 2 || contatoZap.replace(/\D/g, '').length < 10) { setErro('Cadastre pelo menos 1 contato de emergência (nome e WhatsApp com DDD).'); return; }
    if (!aceite) { setErro('É preciso aceitar o termo.'); return; }
    setCarregando(true);
    try {
      const session = await contaParaCadastro(email, senhaConta);
      if (!session) { setErro('Enviamos um e-mail de confirmação. Abra o e-mail do K1 Segurança (veja também o Spam), toque em "Confirmar meu e-mail" e depois toque aqui de novo — seus dados continuam preenchidos.'); return; }
      const { data, error } = await supabase.rpc('registrar_autonomo', {
        p_nome: nome, p_telefone: telefone, p_empresa_trabalho: empresa, p_whatsapp_empresa: zapEmpresa,
        p_senha: senha, p_senha_coacao: coacao, p_aceite_termo: true, p_termo_versao: TERMO_VERSAO,
      });
      if (error) throw error;
      // já ativa este celular como o celular do vigilante
      const s = await entrar((data as { matricula_acesso: string }).matricula_acesso, senha);
      try { await salvarContato(s, 'emergencia', contatoNome, contatoZap); } catch { /* cadastra depois em Contatos */ }
      router.replace('/funcionario/termo');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  return (
    <TelaK1 rodape={false}>
      <Text style={s.titulo}>PLANO DO VIGILANTE</Text>
      <View style={s.teste}>
        <Text style={s.testeTit}>🎁 7 DIAS GRÁTIS · depois R$ 20,00/mês</Text>
        <Text style={s.testeTxt}>Apertou o Power 4x: WhatsApp automático para a sua família e para a sua empresa, com a sua localização.</Text>
      </View>

      <Text style={s.sec}>SUA CONTA</Text>
      <Campo icone="mail" placeholder="SEU E-MAIL" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Campo icone="lock-closed" placeholder="SENHA DA CONTA (8+, LETRAS E NÚMEROS)" senha value={senhaConta} onChangeText={setSenhaConta} />
      <Campo icone="person" placeholder="SEU NOME COMPLETO" autoCapitalize="words" value={nome} onChangeText={setNome} />
      <Campo icone="call" placeholder="SEU CELULAR COM DDD" keyboardType="phone-pad" value={telefone} onChangeText={setTelefone} />

      <Text style={s.sec}>ONDE VOCÊ TRABALHA</Text>
      <Campo icone="business" placeholder="NOME DA EMPRESA / POSTO" autoCapitalize="words" value={empresa} onChangeText={setEmpresa} />
      <Campo icone="logo-whatsapp" placeholder="WHATSAPP DA EMPRESA (OPCIONAL)" keyboardType="phone-pad" value={zapEmpresa} onChangeText={setZapEmpresa} />

      <Text style={s.sec}>CONTATO DE EMERGÊNCIA</Text>
      <Campo icone="heart" placeholder="NOME (EX.: ESPOSA, IRMÃO)" autoCapitalize="words" value={contatoNome} onChangeText={setContatoNome} />
      <Campo icone="logo-whatsapp" placeholder="WHATSAPP DELE(A) COM DDD" keyboardType="phone-pad" value={contatoZap} onChangeText={setContatoZap} />
      <Text style={s.dica}>Depois dá para colocar mais contatos (até 6).</Text>

      <Text style={s.sec}>SENHAS DO APP</Text>
      <Campo icone="keypad" placeholder="SENHA DO APP (4 A 8 NÚMEROS)" keyboardType="number-pad" senha maxLength={8} value={senha} onChangeText={setSenha} />
      <Campo icone="warning" placeholder="SENHA DE COAÇÃO (DIFERENTE)" keyboardType="number-pad" senha maxLength={8} value={coacao} onChangeText={setCoacao} />
      <Text style={s.dica}>Se um bandido mandar você abrir o app, digite a senha de coação: o app abre normal e seus contatos são avisados em silêncio.</Text>

      <Pressable onPress={() => setAceite(!aceite)} style={s.aceite} hitSlop={6}>
        <Ionicons name={aceite ? 'checkbox' : 'square-outline'} size={24} color={aceite ? '#e10600' : '#9aa0aa'} />
        <Text style={s.aceiteTxt}>
          Li e aceito: o app usa minha localização durante o turno para pedir socorro; meus contatos recebem mensagens no WhatsApp quando eu
          acionar o pânico; o app não substitui o 190; após 7 dias o plano custa R$ 20,00 por mês e posso cancelar quando quiser.
        </Text>
      </Pressable>

      <BotaoVermelho titulo="CRIAR E COMEÇAR O TESTE" icone="checkmark-circle-outline" onPress={cadastrar} carregando={carregando} />
      <Erro texto={erro} />
      <Pressable onPress={() => router.back()} hitSlop={10}><Text style={s.voltar}>VOLTAR</Text></Pressable>
      <View style={{ height: 30 }} />
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#fff', textAlign: 'center', letterSpacing: 2, fontSize: 16, fontWeight: '900' },
  teste: { borderWidth: 1.5, borderColor: '#16a34a', backgroundColor: '#052e16', borderRadius: 12, padding: 12, gap: 4 },
  testeTit: { color: '#4ade80', fontWeight: '900', fontSize: 15, textAlign: 'center' },
  testeTxt: { color: '#d1fae5', fontSize: 13, textAlign: 'center' },
  sec: { color: '#9aa0aa', letterSpacing: 2, fontSize: 12, fontWeight: '800', marginTop: 6 },
  dica: { color: '#8d939c', fontSize: 12, marginTop: -4 },
  aceite: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  aceiteTxt: { color: '#cfcfcf', flex: 1, fontSize: 13, lineHeight: 19 },
  voltar: { color: '#9aa0aa', textAlign: 'center', marginTop: 6, letterSpacing: 2 },
});
