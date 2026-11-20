import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { TelaK1, BotaoVermelho, BotaoContorno } from '../components/ui';
import { lerSessao } from '../lib/vigilante';
import { supabase } from '../lib/supabase';
import { configurado } from '../lib/config';

/** Primeira tela: FUNCIONÁRIO, EMPRESA ou PESSOAL / FAMÍLIA. */
export default function Escolha() {
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    (async () => {
      // Se já estiver logado, vai direto para a área certa
      const vig = await lerSessao();
      if (vig?.tipo === 'familia') { router.replace(vig.termo_aceito ? '/familia/mapa' : '/familia/termo'); return; }
      if (vig) { router.replace(vig.termo_aceito ? '/funcionario/inicio' : '/funcionario/termo'); return; }
      if (configurado) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { router.replace('/empresa/painel'); return; }
      }
      setVerificando(false);
    })();
  }, []);

  if (verificando) {
    return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><ActivityIndicator color="#e10600" /></View>;
  }

  return (
    <TelaK1>
      {!configurado && (
        <Text style={s.aviso}>Configure SUPABASE_URL e SUPABASE_ANON_KEY em src/lib/config.ts</Text>
      )}
      <Text style={s.titulo}>COMO VOCÊ VAI ACESSAR?</Text>
      <BotaoVermelho titulo="SOU FUNCIONÁRIO" icone="person-outline" onPress={() => router.push('/funcionario/login')} />
      <BotaoContorno titulo="SOU EMPRESA" icone="business-outline" onPress={() => router.push('/empresa/login')} />
      <BotaoContorno titulo="PESSOAL / FAMÍLIA" icone="people-outline" onPress={() => router.push('/familia/entrar')} />
      <BotaoContorno titulo="SOU VIGILANTE · PLANO INDIVIDUAL" icone="shield-checkmark-outline" onPress={() => router.push('/autonomo/cadastro')} />
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#cfcfcf', textAlign: 'center', letterSpacing: 3, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  aviso: { color: '#f59e0b', textAlign: 'center', fontSize: 13 },
});
