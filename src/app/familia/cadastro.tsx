import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../../components/ui';
import { supabase, traduzErro } from '../../lib/supabase';
import { TERMO_VERSAO } from '../../lib/config';
import { FAMILIA_ADICIONAL, FAMILIA_PRIMEIRO, precoFamilia } from '../../lib/familia';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Responsável cria o círculo (família, casal, amigos ou pequena equipe). */
export default function CadastroFamilia() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [qtd, setQtd] = useState('3');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const pessoas = Math.max(0, Math.min(50, parseInt(qtd, 10) || 0));

  async function cadastrar() {
    setErro('');
    if (nome.trim().length < 2 || responsavel.trim().length < 2 || pessoas < 1) { setErro('Preencha o nome da família, o seu nome e quantas pessoas.'); return; }
    if (!aceite) { setErro('É preciso aceitar o termo.'); return; }
    setCarregando(true);
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!email.trim() || senha.length < 8 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) throw new Error('Informe o e-mail e uma senha com 8 ou mais caracteres, com letras e números.');
        const r = await supabase.auth.signUp({ email: email.trim(), password: senha });
        if (r.error) throw r.error;
        session = r.data.session;
        if (!session) { setErro('Conta criada! Confirme no seu e-mail, entre em "Já tenho conta" e termine o cadastro.'); return; }
      }
      const { error } = await supabase.rpc('registrar_familia', {
        p_nome: nome, p_qtd_pessoas: pessoas, p_nome_responsavel: responsavel, p_aceite_termo: true, p_termo_versao: TERMO_VERSAO,
      });
      if (error) throw error;
      router.replace('/empresa/painel');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  return (
    <TelaK1 rodape={false}>
      <Text style={s.titulo}>CRIAR MINHA FAMÍLIA</Text>
      <View style={s.teste}>
        <Text style={s.testeTit}>🎁 7 DIAS GRÁTIS</Text>
        <Text style={s.testeTxt}>Depois: {brl(FAMILIA_PRIMEIRO)}/mês a 1ª pessoa + {brl(FAMILIA_ADICIONAL)} cada pessoa a mais.</Text>
      </View>
      <Campo icone="mail" placeholder="SEU E-MAIL" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Campo icone="lock-closed" placeholder="CRIE UMA SENHA (8+, LETRAS E NÚMEROS)" senha value={senha} onChangeText={setSenha} />
      <Campo icone="home" placeholder="NOME DO GRUPO (EX.: FAMÍLIA SILVA)" autoCapitalize="words" value={nome} onChangeText={setNome} />
      <Campo icone="person" placeholder="SEU NOME" autoCapitalize="words" value={responsavel} onChangeText={setResponsavel} />
      <Campo icone="people" placeholder="QUANTAS PESSOAS (CONTANDO VOCÊ)" keyboardType="number-pad" value={qtd} onChangeText={setQtd} />
      <Text style={s.valor}>{pessoas} pessoa(s) · após o teste: <Text style={{ color: '#fff', fontWeight: '800' }}>{brl(precoFamilia(pessoas))}/mês</Text></Text>

      <Pressable onPress={() => setAceite(!aceite)} style={s.aceite} hitSlop={6}>
        <Ionicons name={aceite ? 'checkbox' : 'square-outline'} size={24} color={aceite ? '#e10600' : '#9aa0aa'} />
        <Text style={s.aceiteTxt}>
          Li e aceito: cada pessoa será convidada e precisa concordar no próprio celular; ninguém é monitorado escondido;
          sou responsável legal pelos menores de 18 anos que eu convidar; o app não substitui o 190/192.
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
  valor: { color: '#9aa0aa', textAlign: 'center' },
  aceite: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  aceiteTxt: { color: '#cfcfcf', flex: 1, fontSize: 13, lineHeight: 19 },
  voltar: { color: '#9aa0aa', textAlign: 'center', marginTop: 6, letterSpacing: 2 },
});
