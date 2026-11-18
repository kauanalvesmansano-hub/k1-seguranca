import { Tabs } from 'expo-router';
import { useOpcoesAbas, icone } from '../../../components/abas';

export default function AbasFamilia() {
  const opcoes = useOpcoesAbas();
  return (
    <Tabs screenOptions={opcoes}>
      <Tabs.Screen name="mapa" options={{ title: 'Família', tabBarIcon: icone('people') }} />
      <Tabs.Screen name="acompanhe" options={{ title: 'Me acompanhe', tabBarIcon: icone('walk') }} />
      <Tabs.Screen name="sos" options={{ title: 'SOS', tabBarIcon: icone('shield-outline') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icone('settings-outline') }} />
    </Tabs>
  );
}
