import { useCallback } from 'react';
import { Tabs, router, useFocusEffect } from 'expo-router';
import { useOpcoesAbas, icone } from '../../../components/abas';
import { supabase } from '../../../lib/supabase';

export default function AbasMonitor() {
  const opcoes = useOpcoesAbas();
  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace('/monitor/login');
    })();
  }, []));
  return (
    <Tabs screenOptions={opcoes}>
      <Tabs.Screen name="alertas" options={{ title: 'Alertas', tabBarIcon: icone('notifications') }} />
      <Tabs.Screen name="contas" options={{ title: 'Contas', tabBarIcon: icone('business') }} />
      <Tabs.Screen name="mapa" options={{ title: 'Mapa', tabBarIcon: icone('map') }} />
      <Tabs.Screen name="relatorios" options={{ title: 'Relatórios', tabBarIcon: icone('bar-chart') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icone('settings-sharp') }} />
    </Tabs>
  );
}
