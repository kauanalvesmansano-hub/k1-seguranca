import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FundoK1, K1, s as k } from '../../../components/k1';
import { MapaPontos } from '../../../components/MapaPontos';
import * as mon from '../../../lib/monitor';

/** Mapa geral: todo mundo em turno, de todas as contas. */
export default function MapaMonitor() {
  const [pes, setPes] = useState<mon.MonPessoa[]>([]);
  const [soAlerta, setSoAlerta] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const carregar = useCallback(async () => { try { setPes(await mon.pessoas()); } catch { /* sem internet */ } }, []);
  useFocusEffect(useCallback(() => {
    carregar(); timer.current = setInterval(carregar, 20000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [carregar]));
  const lista = soAlerta ? pes.filter(p => p.alerta) : pes;
  const pontos = mon.pontosDe(lista);
  return (
    <FundoK1 rolar={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[k.titulo, { fontSize: 20 }]}>Mapa geral · {pontos.length}</Text>
        <Pressable onPress={() => setSoAlerta(!soAlerta)} style={[st.chip, soAlerta && st.chipOn]}><Text style={st.chipTxt}>Só com alerta</Text></Pressable>
      </View>
      <Text style={[k.mut, { fontSize: 12 }]}>🟢 ok  🟠 bateria baixa  ⚫ sem sinal  🔴 alerta</Text>
      <View style={{ flex: 1 }}>
        <MapaPontos pontos={pontos} altura="100%" onAbrir={id => router.push({ pathname: '/monitor/pessoa/[id]', params: { id } })} />
      </View>
    </FundoK1>
  );
}
const st = StyleSheet.create({
  chip: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  chipTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
