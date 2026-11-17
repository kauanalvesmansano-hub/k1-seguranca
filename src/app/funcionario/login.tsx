import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../../components/ui';
import { entrar } from '../../lib/vigilante';
import { traduzErro } from '../../lib/supabase';

/** Login do funcionário: MATRÍCULA + SENHA (criados pela empresa). */
export default function LoginFuncionario() {
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function onEntrar() {
    setErro('');
    if (!matricula.trim() || !senha) { setErro('Informe matrícula e senha.'); return; }
    setCarregando(true);
    try {
      const sessao = await entrar(matricula.trim(), senha);
      router.replace(sessao.termo_aceito ? '/funcionario/inicio' : '/funcionario/termo');
    } catch (e) {
      setErro(traduzErro(e));
    } finally {
      setCarregando(false);
    }
  }

  function recuperarSenha() {
    // Por segurança o funcionário não troca a própria senha pelo app
    // (um bandido com o celular não pode redefinir).
    Alert.alert('Recuperar senha', 'Por segurança, só a sua empresa pode redefinir a sua senha. Procure seu encarregado.');
  }

  return (
    <TelaK1>
      <Campo icone="person" placeholder="MATRÍCULA" keyboardType="number-pad" value={matricula} onChangeText={setMatricula} maxLength={7} />
      <Campo icone="lock-closed" placeholder="SENHA" senha keyboardType="number-pad" value={senha} onChangeText={setSenha} maxLength={8} onSubmitEditing={onEntrar} />
      <BotaoVermelho titulo="ENTRAR" onPress={onEntrar} carregando={carregando} />
      <Erro texto={erro} />
      <Pressable onPress={recuperarSenha} style={s.link} hitSlop={10}>
        <Ionicons name="refresh" size={20} color="#cfcfcf" />
        <Text style={s.linkTxt}>RECUPERAR SENHA</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={s.link} hitSlop={10}>
        <Text style={[s.linkTxt, { color: '#8d939c' }]}>VOLTAR</Text>
      </Pressable>
    </TelaK1>
  );
}

const s = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  linkTxt: { color: '#cfcfcf', fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
});
