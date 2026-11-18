import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BotaoVermelho, BotaoContorno, Erro } from '../../components/ui';
import { lerSessao } from '../../lib/vigilante';
import { aceitarTermoFamilia, sairDaFamilia } from '../../lib/familia';
import { traduzErro } from '../../lib/supabase';

/** Consentimento da pessoa antes de compartilhar a localização com a família. */
export default function TermoFamilia() {
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function aceitar() {
    setCarregando(true); setErro('');
    try {
      const s = await lerSessao();
      if (!s) { router.replace('/'); return; }
      await aceitarTermoFamilia(s);
      router.replace('/familia/mapa');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }
  async function recusar() { await sairDaFamilia(); router.replace('/'); }

  return (
    <SafeAreaView style={s.tela}>
      <Text style={s.titulo}>VOCÊ CONCORDA EM COMPARTILHAR?</Text>
      <ScrollView style={s.caixa} contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={s.p}>Você foi convidado(a) para um círculo do <Text style={s.b}>K1 Família</Text>.</Text>
        <Text style={s.p}><Text style={s.b}>Quem vê:</Text> só as pessoas do seu círculo e o responsável pela conta. Você também vê todos eles.</Text>
        <Text style={s.p}><Text style={s.b}>O que é compartilhado:</Text> sua localização, nível de bateria, se está carregando e se está no Wi-Fi ou nos dados.</Text>
        <Text style={s.p}><Text style={s.b}>O que NÃO é coletado:</Text> mensagens, fotos, áudio, contatos ou o que você faz no celular.</Text>
        <Text style={s.p}><Text style={s.b}>Você controla:</Text> pode pausar o compartilhamento a qualquer momento em "Ajustes" (o círculo vê que está pausado) e pode sair do círculo quando quiser.</Text>
        <Text style={s.p}><Text style={s.b}>Socorro:</Text> segurar o botão SOS por 2 segundos ou apertar o botão Power 4 vezes seguidas avisa o círculo com a sua localização.</Text>
        <Text style={s.p}>Menores de 18 anos: o responsável legal autoriza o uso. O K1 Família não substitui o 190 (Polícia) nem o 192 (SAMU). Dados tratados conforme a LGPD (Lei 13.709/2018) para proteção da vida e da segurança.</Text>
      </ScrollView>
      <View style={{ gap: 12 }}>
        <BotaoVermelho titulo="CONCORDO E QUERO COMPARTILHAR" icone="checkmark-circle-outline" onPress={aceitar} carregando={carregando} />
        <BotaoContorno titulo="NÃO CONCORDO" onPress={recusar} />
        <Erro texto={erro} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000', padding: 20, gap: 16 },
  titulo: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginTop: 10 },
  caixa: { flex: 1, borderWidth: 1, borderColor: '#3a3d45', borderRadius: 10, backgroundColor: '#0e0f12' },
  p: { color: '#d0d4da', fontSize: 15, lineHeight: 22 },
  b: { color: '#fff', fontWeight: '700' },
});
