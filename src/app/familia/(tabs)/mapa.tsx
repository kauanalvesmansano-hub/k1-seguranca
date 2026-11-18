import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { K1 } from '../../../components/k1';
import { MapaFamilia, type PessoaMapa } from '../../../components/MapaFamilia';
import { useFamilia } from '../../../lib/useFamilia';
import { atenderAlerta, haQuanto, TIPO_ALERTA, type Membro } from '../../../lib/familia';

const CORES = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#eab308', '#ef4444'];

/** Mapa da família ao vivo + lista de pessoas com bateria, último sinal e "a caminho". */
export default function MapaDaFamilia() {
  const ins = useSafeAreaInsets();
  const { sessao, dados, erro, atualizar } = useFamilia();
  const [foco, setFoco] = useState<string | null>(null);

  const membros = dados?.membros ?? [];
  const cor = (m: Membro, i: number) => (dados?.alertas.some(a => a.status !== 'resolvido' && a.nome === m.nome && ['panico', 'sem_movimento', 'atraso_chegada'].includes(a.tipo))
    ? '#ef4444' : CORES[i % CORES.length]);
  const pessoas: PessoaMapa[] = membros.flatMap((m, i) => m.lat != null && m.lng != null ? [{
    id: m.id, nome: m.nome, lat: m.lat, lng: m.lng, cor: cor(m, i), eu: m.id === dados?.eu, bateria: m.bateria,
    area: m.area_lat != null && m.area_lng != null ? { lat: m.area_lat, lng: m.area_lng, raio: m.area_raio ?? 150 } : null,
  }] : []);
  const abertos = (dados?.alertas ?? []).filter(a => a.status !== 'resolvido');

  async function responder(id: string, resolver: boolean) {
    if (!sessao) return;
    try { await atenderAlerta(sessao, id, resolver); atualizar(); } catch { Alert.alert('Sem conexão', 'Tente de novo.'); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1 }}>
        <MapaFamilia cheio pessoas={pessoas} focoId={foco} />
        <View style={[st.topo, { top: ins.top + 8 }]}>
          <Text style={st.topoTxt} numberOfLines={1}>{dados?.familia ?? 'Carregando…'}</Text>
          {!!erro && <Text style={{ color: K1.amarelo, fontSize: 12 }}>{erro}</Text>}
        </View>
        {abertos.slice(0, 2).map(a => (
          <View key={a.id} style={[st.alerta, { top: ins.top + 60 }]}>
            <Text style={st.alertaTit}>⚠ {TIPO_ALERTA[a.tipo] ?? a.tipo} — {a.nome}</Text>
            <Text style={st.alertaSub}>{haQuanto(a.criado_em)}{a.status === 'em_atendimento' ? ' · alguém já está atendendo' : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              {a.lat != null && <Pressable style={st.alertaBtn} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`)}><Text style={st.alertaBtnTxt}>Ir até lá</Text></Pressable>}
              {a.status === 'aberto' && <Pressable style={st.alertaBtn} onPress={() => responder(a.id, false)}><Text style={st.alertaBtnTxt}>Estou indo</Text></Pressable>}
              <Pressable style={[st.alertaBtn, { backgroundColor: '#15803d' }]} onPress={() => responder(a.id, true)}><Text style={st.alertaBtnTxt}>Está tudo bem</Text></Pressable>
            </View>
          </View>
        ))}
      </View>

      <ScrollView style={st.lista} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {membros.map((m, i) => {
          const minutos = m.atualizado ? (Date.now() - new Date(m.atualizado).getTime()) / 60000 : Infinity;
          const situacao = !m.dispositivo_ativo ? 'Ainda não entrou no app'
            : !m.compartilhando ? 'Pausou o compartilhamento'
            : minutos > 30 ? `Sem sinal ${haQuanto(m.atualizado)}` : `Atualizado ${haQuanto(m.atualizado)}`;
          return (
            <Pressable key={m.id} style={st.pessoa} onPress={() => setFoco(m.lat != null ? m.id : null)}>
              <View style={[st.avatar, { borderColor: cor(m, i) }]}><Text style={st.avatarTxt}>{m.nome.slice(0, 1).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={st.nome}>{m.id === dados?.eu ? `${m.nome} (você)` : m.nome}{m.papel ? ` · ${m.papel}` : ''}</Text>
                <Text style={st.sub}>{situacao}{m.fora_da_area ? ' · fora da área segura' : ''}</Text>
                {!!m.acompanhar_ate && <Text style={[st.sub, { color: '#60a5fa' }]}>🚶 A caminho{m.acompanhar_destino ? ` de ${m.acompanhar_destino}` : ''} · chega até {new Date(m.acompanhar_ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>}
              </View>
              {m.bateria != null && (
                <View style={{ alignItems: 'center' }}>
                  <Ionicons name={m.carregando ? 'battery-charging' : m.bateria < 20 ? 'battery-dead' : m.bateria < 60 ? 'battery-half' : 'battery-full'} size={20} color={m.bateria < 20 ? '#ef4444' : '#d4d4d8'} />
                  <Text style={st.sub}>{m.bateria}%</Text>
                </View>
              )}
            </Pressable>
          );
        })}
        {membros.length === 0 && <Text style={st.sub}>Carregando a família…</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  topo: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  topoTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  alerta: { position: 'absolute', left: 12, right: 12, backgroundColor: '#991b1b', borderRadius: 14, padding: 12 },
  alertaTit: { color: '#fff', fontWeight: '900' },
  alertaSub: { color: '#fecaca', fontSize: 12 },
  alertaBtn: { backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  alertaBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  lista: { maxHeight: 260, backgroundColor: '#0b0c0f', borderTopLeftRadius: 18, borderTopRightRadius: 18, marginTop: -16 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#15171c', borderRadius: 12, padding: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 3, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  nome: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sub: { color: '#9aa0aa', fontSize: 12 },
});
