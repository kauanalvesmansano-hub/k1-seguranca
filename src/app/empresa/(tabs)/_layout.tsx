import { useCallback } from 'react';
import { Tabs, router, useFocusEffect } from 'expo-router';
import { useOpcoesAbas, icone } from '../../../components/abas';
import { carregarPlano } from '../../../lib/empresa';
import { supabase } from '../../../lib/supabase';
import { useTipoConta } from '../../../lib/conta';

export default function AbasEmpresa() {
  const opcoes = useOpcoesAbas();
  const { familia } = useTipoConta();

  // Plano bloqueado ou encerrado: só a tela de pagamento fica acessível
  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/'); return; }
      const p = await carregarPlano();
      if (!p) { router.replace('/empresa/cadastro'); return; }
      if (p.plano_status !== 'ativo') router.replace('/empresa/plano');
    })();
  }, []));

  return (
    <Tabs screenOptions={opcoes}>
      <Tabs.Screen name="painel" options={{ title: 'Painel', tabBarIcon: icone('home') }} />
      <Tabs.Screen name="relatorios" options={{ title: 'Relatórios', tabBarIcon: icone('bar-chart') }} />
      <Tabs.Screen name="funcionarios" options={{ title: familia ? 'Pessoas' : 'Funcionários', tabBarIcon: icone('people') }} />
      <Tabs.Screen name="configuracoes" options={{ title: 'Ajustes', tabBarIcon: icone('settings-sharp') }} />
    </Tabs>
  );
}
