import { Tabs } from 'expo-router';
import { useOpcoesAbas, icone } from '../../../components/abas';
import { BloqueioPlano } from '../../../components/BloqueioPlano';

export default function AbasFuncionario() {
  const opcoes = useOpcoesAbas();
  return (
    <BloqueioPlano>
    <Tabs screenOptions={opcoes}>
      <Tabs.Screen name="inicio" options={{ title: 'Início', tabBarIcon: icone('home') }} />
      <Tabs.Screen name="ronda" options={{ title: 'Ronda', tabBarIcon: icone('qr-code-outline') }} />
 <Tabs.Screen name="portaria" options={{ title: 'Portaria', tabBarIcon: icone('people-outline') }} />
      <Tabs.Screen name="livro" options={{ title: 'Livro', tabBarIcon: icone('book-outline') }} />
      <Tabs.Screen name="ocorrencias" options={{ title: 'Ocorrências', tabBarIcon: icone('clipboard-outline') }} />
      <Tabs.Screen name="sos" options={{ title: 'SOS', tabBarIcon: icone('shield-outline') }} />
    </Tabs>
    </BloqueioPlano>
  );
}
