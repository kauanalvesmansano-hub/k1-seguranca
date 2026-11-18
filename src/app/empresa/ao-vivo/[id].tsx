import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { K1 } from '../../../components/k1';
import { MapaVigilante } from '../../../components/MapaVigilante';
import { percorrido, useVigilanteAoVivo } from '../../../lib/aoVivo';

const iniciais = (n: string) => {
  const p = n.trim().split(/\s+/);
  return ((p[0]?.[0] ?? 'V') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
function haQuanto(d: string | null) {
  if (!d) return 'sem sinal';
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 10) return 'agora mesmo';
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

/** Acompanhamento ao vivo em tela cheia, no estilo de app de entrega. */
export default function AoVivo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ins = useSafeAreaInsets();
  const { v, trajeto, pontos, rondaFeitos, rondaTotal, alertaAberto } = useVigilanteAoVivo(id);
  const [, setTique] = useState(0);
  useEffect(() => { const t = setInterval(() => setTique(x => x + 1), 1000); return () => clearInterval(t); }, []);

  const posicao = v?.em_turno && v.ultima_lat != null && v.ultima_lng != null ? { lat: v.ultima_lat, lng: v.ultima_lng } : null;
  const segSemSinal = v?.ultima_atualizacao ? (Date.now() - new Date(v.ultima_atualizacao).getTime()) / 1000 : Infinity;
  const status = !v ? { txt: 'Carregando…', cor: '#64748b' }
    : alertaAberto ? { txt: `ALERTA: ${alertaAberto.replace(/_/g, ' ').toUpperCase()}`, cor: '#ef4444' }
    : !v.em_turno ? { txt: 'Fora de turno', cor: '#64748b' }
    : segSemSinal > 600 ? { txt: 'Sem sinal', cor: K1.amarelo }
    : v.fora_do_posto ? { txt: 'Fora do posto', cor: K1.amarelo }
    : segSemSinal < 30 ? { txt: 'Em movimento · ao vivo', cor: K1.verde }
    : { txt: 'Em turno', cor: K1.verde };
  const km = percorrido(trajeto) / 1000;
  const bat = v?.ultima_bateria;

  return (
    <View style={{ flex: 1, backgroundColor: '#eef0f3' }}>
      <MapaVigilante cheio posicao={posicao} precisao={v?.ultima_precisao_m} trajeto={v?.em_turno ? trajeto : []}
        cor={status.cor} nome={v?.nome ?? ''} pontos={pontos}
        posto={v && v.posto_lat != null && v.posto_lng != null ? { lat: v.posto_lat, lng: v.posto_lng, raio: v.posto_raio_m } : null} />

      <View style={[st.topo, { top: ins.top + 10 }]}>
        <Pressable style={st.redondo} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </Pressable>
        <View style={[st.pilula, { borderColor: status.cor }]}>
          <View style={[st.ponto, { backgroundColor: status.cor }]} />
          <Text style={{ color: '#111', fontWeight: '800' }} numberOfLines={1}>{status.txt}</Text>
        </View>
      </View>

      {v && (
        <View style={[st.folha, { paddingBottom: ins.bottom + 16 }]}>
          <View style={st.alca} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[st.avatar, { borderColor: status.cor }]}><Text style={st.avatarTxt}>{iniciais(v.nome)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.nome} numberOfLines={1}>{v.nome}</Text>
              <Text style={st.sub} numberOfLines={1}>{v.posto || 'Sem posto'} · atualizado {haQuanto(v.ultima_atualizacao)}</Text>
            </View>
          </View>

          <View style={st.numeros}>
            <View style={st.num}>
              <Text style={st.numValor}>{v.em_turno ? `${km.toFixed(2)} km` : '—'}</Text>
              <Text style={st.numRot}>percorridos</Text>
            </View>
            <View style={st.div} />
            <View style={st.num}>
              <Text style={[st.numValor, rondaTotal > 0 && rondaFeitos === rondaTotal && { color: '#16a34a' }]}>
                {rondaTotal ? `${rondaFeitos}/${rondaTotal}` : '—'}
              </Text>
              <Text style={st.numRot}>pontos de ronda</Text>
            </View>
            <View style={st.div} />
            <View style={st.num}>
              <Text style={[st.numValor, bat != null && bat < 20 && { color: '#dc2626' }]}>{bat != null ? `${bat}%` : '—'}</Text>
              <Text style={st.numRot}>{v.ultimo_carregando ? 'carregando' : v.ultimo_wifi ? 'bateria · Wi-Fi' : 'bateria · dados'}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {!!v.telefone && (
              <Pressable style={[st.acao, { backgroundColor: '#16a34a' }]} onPress={() => Linking.openURL(`tel:${v.telefone}`)}>
                <Ionicons name="call" size={18} color="#fff" /><Text style={st.acaoTxt}>Ligar</Text>
              </Pressable>
            )}
            {posicao && (
              <Pressable style={[st.acao, { backgroundColor: '#111' }]}
                onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${posicao.lat},${posicao.lng}`)}>
                <Ionicons name="navigate" size={18} color="#fff" /><Text style={st.acaoTxt}>Ir até ele</Text>
              </Pressable>
            )}
          </View>
          {!v.em_turno && <Text style={[st.sub, { textAlign: 'center' }]}>O mapa ao vivo aparece quando o vigilante iniciar o turno.</Text>}
        </View>
      )}
    </View>
  );
}

const sombra = { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 };
const st = StyleSheet.create({
  topo: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  redondo: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...sombra },
  pilula: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 14, height: 44, borderWidth: 2, ...sombra },
  ponto: { width: 10, height: 10, borderRadius: 5 },
  folha: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingTop: 8, gap: 14, ...sombra },
  alca: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#d4d4d8', marginBottom: 4 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#111', borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '900', fontSize: 18 },
  nome: { color: '#111', fontSize: 19, fontWeight: '800' },
  sub: { color: '#6b7280', fontSize: 13 },
  numeros: { flexDirection: 'row', backgroundColor: '#f4f4f5', borderRadius: 14, paddingVertical: 12 },
  num: { flex: 1, alignItems: 'center', gap: 2 },
  numValor: { color: '#111', fontSize: 18, fontWeight: '800' },
  numRot: { color: '#6b7280', fontSize: 11 },
  div: { width: 1, backgroundColor: '#e4e4e7' },
  acao: { flex: 1, height: 50, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acaoTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
