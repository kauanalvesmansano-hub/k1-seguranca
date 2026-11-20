import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CardK1, K1, s as k } from './k1';
import * as mon from '../lib/monitor';

/** Uma pessoa no K1 Monitoramento: turno, bateria, último sinal e alerta aberto. */
export function LinhaPessoa({ p }: { p: mon.MonPessoa }) {
  const sinal = mon.semSinal(p);
  return (
    <CardK1 onPress={() => router.push({ pathname: '/monitor/pessoa/[id]', params: { id: p.id } })}
      style={{ gap: 3, borderColor: p.alerta ? '#ef4444' : K1.vermelhoBorda, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={[k.titulo, { flex: 1 }]}>{p.profissao === 'caminhoneiro' ? '🚚 ' : ''}{p.nome}</Text>
        <Text style={[st.tag, { backgroundColor: p.em_turno ? '#15803d' : '#334155' }]}>{p.em_turno ? 'EM TURNO' : 'FOLGA'}</Text>
      </View>
      {!!p.local && <Text style={k.mut}>{p.local}</Text>}
      <Text style={k.mut}>
        🔋 <Text style={{ color: p.bateria == null ? K1.mutado : p.bateria < 20 ? '#ef4444' : p.bateria < 40 ? K1.amarelo : K1.verde }}>{p.bateria ?? '—'}%</Text>
        {'  '}· sinal <Text style={{ color: sinal ? K1.amarelo : K1.mutado }}>{mon.ha(p.atualizado)}</Text>
      </Text>
      {p.alerta && <Text style={{ color: '#fca5a5', fontWeight: '700' }}>⚠ {mon.tipo(p.alerta.tipo).txt} · {mon.ha(p.alerta.criado_em)}</Text>}
    </CardK1>
  );
}

const st = StyleSheet.create({
  tag: { color: '#fff', fontWeight: '900', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', alignSelf: 'flex-start' },
});
