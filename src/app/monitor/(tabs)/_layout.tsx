import { useCallback, useState } from 'react';
import { Tabs, router, useFocusEffect } from 'expo-router';
import { useOpcoesAbas, icone } from '../../../components/abas';
import { supabase } from '../../../lib/supabase';
import * as mon from '../../../lib/monitor';

export default function AbasMonitor() {
  const opcoes = useOpcoesAbas();
  const [abertos, setAbertos] = useState(0);
  useFocusEffect(useCallback(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace('/monitor/login');
    })();
    const contar = async () => { try { const r = await mon.resumo(); if (vivo) setAbertos(r?.alertas_abertos ?? 0); } catch { /* sem internet */ } };
    contar();
    const t = setInterval(contar, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []));
  return (
    <Tabs screenOptions={opcoes}>
      <Tabs.Screen name="mapa" options={{ title: 'Mapa', tabBarIcon: icone('location') }} />
      <Tabs.Screen name="alertas" options={{ title: 'Alertas', tabBarIcon: icone('notifications'), tabBarBadge: abertos > 0 ? abertos : undefined, tabBarBadgeStyle: { backgroundColor: '#e10600' } }} />
      <Tabs.Screen name="contas" options={{ title: 'Empresas', tabBarIcon: icone('shield-checkmark') }} />
      <Tabs.Screen name="relatorios" options={{ title: 'Eventos', tabBarIcon: icone('bar-chart') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Config.', tabBarIcon: icone('settings-sharp') }} />
    </Tabs>
  );
}
