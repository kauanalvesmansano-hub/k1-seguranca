import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { TelaK1, Campo, BotaoVermelho, Erro } from '../components/ui';
import { supabase, traduzErro } from '../lib/supabase';

/** Abre pelo link do e-mail "criar nova senha" (k1seguranca://nova-senha). */
export default function NovaSenha() {
  const url = Linking.useURL();
  const [pronto, setPronto] = useState<'aguardando' | 'ok' | 'erro'>('aguardando');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    if (!url) return;
    (async () => {
      try {
        const depois = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
        const p = new URLSearchParams(depois);
        const access = p.get('access_token'), refresh = p.get('refresh_token'), code = p.get('code');
        if (access && refresh) { const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh }); if (error) throw error; }
        else if (code) { const { error } = await supabase.auth.exchangeCodeForSession(code); if (error) throw error; }
        else throw new Error('sem token');
        setPronto('ok');
      } catch { setPronto('erro'); }
    })();
  }, [url]);

  async function salvar() {
    setErro('');
    if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) { setErro('A senha precisa ter 8 ou mais caracteres, com letras e números.'); return; }
    if (senha !== senha2) { setErro('As duas senhas não são iguais.'); return; }
    setSalvando(true);
    try { const { error } = await supabase.auth.updateUser({ password: senha }); if (error) throw error; setFeito(true); }
    catch (e) { setErro(traduzErro(e)); } finally { setSalvando(false); }
  }

  return (
    <TelaK1 rodape={false}>
      <Text style={s.titulo}>CRIAR NOVA SENHA</Text>
      {pronto === 'aguardando' && <ActivityIndicator color="#e10600" />}
      {pronto === 'erro' && <Text style={s.txt}>Este link expirou ou já foi usado. Peça outro em "Esqueci a senha".</Text>}
      {pronto === 'ok' && !feito && (
        <View style={{ gap: 12 }}>
          <Campo icone="lock-closed" placeholder="SENHA NOVA (8+, LETRAS E NÚMEROS)" senha value={senha} onChangeText={setSenha} />
          <Campo icone="lock-closed" placeholder="REPITA A SENHA NOVA" senha value={senha2} onChangeText={setSenha2} />
          <BotaoVermelho titulo="SALVAR SENHA NOVA" icone="checkmark-circle-outline" onPress={salvar} carregando={salvando} />
          <Erro texto={erro} />
        </View>
      )}
      {feito && <Text style={[s.txt, { color: '#4ade80' }]}>Senha trocada com segurança! Volte para o cadastro e toque em CRIAR com a senha nova.</Text>}
      <BotaoVermelho titulo={feito ? 'CONTINUAR' : 'VOLTAR'} icone="arrow-forward" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  txt: { color: '#cfcfcf', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
