import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { FundoK1, CardK1, s as k } from '../../../components/k1';
import { CardCentral } from '../../../components/CardCentral';
import { supabase } from '../../../lib/supabase';
import { desativarCentral } from '../../../lib/central';

/** Ajustes do K1 Monitoramento: alarme na tela (toca como ligação, com voz) para TODAS as contas. */
export default function AjustesMonitor() {
  async function sair() {
    try { await desativarCentral(); } catch { /* segue */ }
    await supabase.auth.signOut();
    router.replace('/');
  }
  return (
    <FundoK1>
      <Text style={[k.titulo, { fontSize: 22 }]}>Ajustes</Text>
      <CardCentral global />
      <CardK1 style={{ gap: 6 }}>
        <Text style={k.titulo}>Como funciona</Text>
        <Text style={k.mut}>
          Com o alarme ligado, qualquer disparo de qualquer conta (empresa, vigilante individual, caminhoneiro ou família) aparece
          na tela em tela cheia, toca como ligação e a voz fala quem foi, de qual empresa, o posto e o motivo. Para parar, toque em
          Atender ou resolva o alerta na aba Alertas. Vários disparos ao mesmo tempo ficam na fila e você resolve um por um.
        </Text>
      </CardK1>
      <Pressable onPress={sair} style={st.sair}><Text style={{ color: '#fff', fontWeight: '800' }}>Sair do K1 Monitoramento</Text></Pressable>
    </FundoK1>
  );
}
const st = StyleSheet.create({
  sair: { height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#444', alignItems: 'center', justifyContent: 'center' },
});
