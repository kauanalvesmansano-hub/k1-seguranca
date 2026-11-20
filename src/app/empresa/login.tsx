import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AjudaEmail } from '../../components/AjudaEmail';
import { router } from 'expo-router';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../../components/ui';
import { supabase, traduzErro } from '../../lib/supabase';

/** Login da EMPRESA (e-mail e senha). Só a empresa acessa esta área. */
export default function LoginEmpresa() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro('');
    if (!email.trim() || !senha) { setErro('Informe e-mail e senha.'); return; }
    setCarregando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) throw error;
      const { data } = await supabase.from('usuarios_empresa').select('empresa_id').maybeSingle();
      router.replace(data ? '/empresa/painel' : '/empresa/cadastro');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  return (
    <TelaK1>
      <Text style={s.titulo}>ÁREA DA EMPRESA</Text>
      <Campo icone="mail" placeholder="E-MAIL" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Campo icone="lock-closed" placeholder="SENHA" senha value={senha} onChangeText={setSenha} onSubmitEditing={entrar} />
      <BotaoVermelho titulo="ENTRAR" onPress={entrar} carregando={carregando} />
      <Erro texto={erro} />
      <AjudaEmail email={email} />
      <Pressable onPress={() => router.push('/empresa/cadastro')} hitSlop={10}>
        <Text style={s.link}>NÃO TEM CONTA? <Text style={{ color: '#ff3b33' }}>CADASTRE SUA EMPRESA</Text></Text>
      </Pressable>
      <Pressable onPress={() => router.back()} hitSlop={10}><Text style={[s.link, { color: '#8d939c' }]}>VOLTAR</Text></Pressable>
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#cfcfcf', textAlign: 'center', letterSpacing: 3, fontSize: 13, fontWeight: '700' },
  link: { color: '#cfcfcf', textAlign: 'center', fontSize: 13, fontWeight: '600', paddingVertical: 4 },
});
