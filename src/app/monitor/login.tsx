import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../../components/ui';
import { supabase, traduzErro } from '../../lib/supabase';
import { souDono } from '../../lib/monitor';

/** Login do K1 MONITORAMENTO (só o dono do K1). */
export default function LoginMonitor() {
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
      if (!(await souDono())) {
        await supabase.auth.signOut();
        setErro('Esta conta não é do dono do K1. O K1 Monitoramento é só para a central geral.');
        return;
      }
      router.replace('/monitor/mapa');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  return (
    <TelaK1>
      <Text style={s.titulo}>K1 MONITORAMENTO</Text>
      <Text style={s.sub}>Central geral: todas as empresas, vigilantes, caminhoneiros e famílias.</Text>
      <Campo icone="mail" placeholder="E-MAIL" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Campo icone="lock-closed" placeholder="SENHA" senha value={senha} onChangeText={setSenha} onSubmitEditing={entrar} />
      <BotaoVermelho titulo="ENTRAR" onPress={entrar} carregando={carregando} />
      <Erro texto={erro} />
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#fff', textAlign: 'center', letterSpacing: 3, fontSize: 16, fontWeight: '900' },
  sub: { color: '#a3a8b0', textAlign: 'center', fontSize: 13 },
});
