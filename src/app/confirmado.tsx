import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TelaK1, BotaoVermelho } from '../components/ui';
import { supabase } from '../lib/supabase';

/** Abre quando a pessoa toca em "Confirmar meu e-mail" no e-mail do K1 (link k1seguranca://confirmado). */
export default function Confirmado() {
  const url = Linking.useURL();
  const [estado, setEstado] = useState<'aguardando' | 'ok' | 'erro'>('aguardando');

  useEffect(() => {
    if (!url) return;
    (async () => {
      try {
        // o Supabase manda os tokens depois do "#" (ou um ?code=…)
        const depois = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? '';
        const p = new URLSearchParams(depois);
        if (p.get('error_description')) throw new Error(p.get('error_description') ?? '');
        const access = p.get('access_token'), refresh = p.get('refresh_token'), code = p.get('code');
        if (access && refresh) {
          const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        setEstado('ok');
      } catch { setEstado('erro'); }
    })();
  }, [url]);

  function continuar() {
    if (router.canGoBack()) router.back(); else router.replace('/');
  }

  return (
    <TelaK1 rodape={false}>
      <View style={{ alignItems: 'center', gap: 14, marginTop: 20 }}>
        {estado === 'aguardando' ? <ActivityIndicator color="#e10600" size="large" /> : (
          <Ionicons name={estado === 'ok' ? 'shield-checkmark' : 'alert-circle'} size={72} color={estado === 'ok' ? '#22c55e' : '#f59e0b'} />
        )}
        <Text style={s.titulo}>{estado === 'erro' ? 'LINK EXPIRADO OU JÁ USADO' : 'E-MAIL CONFIRMADO'}</Text>
        <Text style={s.txt}>
          {estado === 'erro'
            ? 'Sem problema: volte para o cadastro e toque de novo em CRIAR com o mesmo e-mail e senha.'
            : 'Seu e-mail foi confirmado com segurança. Volte para o cadastro e toque em CRIAR para terminar.'}
        </Text>
      </View>
      <BotaoVermelho titulo="CONTINUAR O CADASTRO" icone="arrow-forward" onPress={continuar} />
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  txt: { color: '#cfcfcf', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
