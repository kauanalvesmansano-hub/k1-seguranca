import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, s as k } from '../../../components/k1';
import { MapaVigilante } from '../../../components/MapaVigilante';
import * as mon from '../../../lib/monitor';

const HORAS = [2, 6, 12, 24];

/** Uma pessoa: onde está agora, por onde passou, bateria, sinal e alerta. */
export default function PessoaMonitor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<mon.MonPessoa | null>(null);
  const [trajeto, setTrajeto] = useState<{ lat: number; lng: number }[]>([]);
  const [horas, setHoras] = useState(6);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      const todas = await mon.pessoas();
      setP((todas ?? []).find(x => x.id === id) ?? null);
      const t = await mon.trilha(id, horas);
      setTrajeto((t ?? []).map(x => ({ lat: x[0], lng: x[1] })));
    } catch { /* sem internet */ }
    setAtualizando(false);
  }, [id, horas]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const posicao = p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng } : null;
  const cor = !p ? K1.verde : p.alerta ? '#ef4444' : mon.semSinal(p) ? '#64748b' : K1.verde;
  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
        <Text style={[k.titulo, { fontSize: 20, flex: 1 }]}>{p ? (p.profissao === 'caminhoneiro' ? '🚚 ' : '') + p.nome : '…'}</Text>
      </View>
      {p && (
        <CardK1 style={{ gap: 4 }}>
          <Text style={k.mut}>{p.empresa} · {mon.plano(p.plano).txt}{p.local ? ' · ' + p.local : ''}</Text>
          <Text style={{ color: '#fff' }}>{p.em_turno ? `Em turno desde ${dataHora(p.turno_iniciado_em)}` : 'Fora de turno'}</Text>
          <Text style={k.mut}>🔋 {p.bateria ?? '—'}%{p.carregando ? ' (carregando)' : ''} · último sinal {mon.ha(p.atualizado)}{p.wifi ? ' · Wi-Fi' : ''}</Text>
          {p.alerta && <Text style={{ color: '#fca5a5', fontWeight: '800' }}>⚠ {mon.tipo(p.alerta.tipo).txt} · {mon.ha(p.alerta.criado_em)}</Text>}
          {!!p.matricula_acesso && <Text style={k.mut}>Matrícula de acesso: {p.matricula_acesso}</Text>}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {!!p.telefone && <Pressable style={st.btn} onPress={() => Linking.openURL(`tel:${p.telefone}`)}><Text style={st.btnTxt}>LIGAR</Text></Pressable>}
            {posicao && <Pressable style={st.btn} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${posicao.lat},${posicao.lng}`)}><Text style={st.btnTxt}>GOOGLE MAPS</Text></Pressable>}
            <Pressable style={st.btn} onPress={() => router.push({ pathname: '/monitor/conta/[id]', params: { id: p.empresa_id } })}><Text style={st.btnTxt}>CONTA</Text></Pressable>
          </View>
        </CardK1>
      )}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={k.mut}>Trajeto:</Text>
        {HORAS.map(h => (
          <Pressable key={h} onPress={() => setHoras(h)} style={[st.chip, horas === h && st.chipOn]}><Text style={st.chipTxt}>{h} h</Text></Pressable>
        ))}
      </View>
      <MapaVigilante posicao={posicao} precisao={p?.precisao} trajeto={trajeto} cor={cor} nome={p?.nome ?? ''} altura={420} />
    </FundoK1>
  );
}
const st = StyleSheet.create({
  btn: { backgroundColor: '#2a2d35', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  chip: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  chipTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
