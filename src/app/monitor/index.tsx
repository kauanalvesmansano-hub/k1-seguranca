import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { souDono } from '../../lib/monitor';

/** Entrada do K1 Monitoramento (cadeado oculto do rodapé): já logado como dono → alertas; senão → login. */
export default function EntradaMonitor() {
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      router.replace(data.session && (await souDono()) ? '/monitor/mapa' : '/monitor/login');
    })();
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><ActivityIndicator color="#e10600" /></View>;
}
