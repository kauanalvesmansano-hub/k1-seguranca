import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, s as k } from '../../../components/k1';
import { MapaPontos } from '../../../components/MapaPontos';
import { LinhaPessoa } from '../../../components/MonLinhaPessoa';
import * as mon from '../../../lib/monitor';

/** Uma conta (empresa, individual ou família) com as pessoas DENTRO dela, o mapa e os alertas de 24 h. */
export default function ContaMonitor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conta, setConta] = useState<mon.MonConta | null>(null);
  const [pes, setPes] = useState<mon.MonPessoa[]>([]);
  const [als, setAls] = useState<mon.MonAlerta[]>([]);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      const [c, p, a] = await Promise.all([mon.contas(), mon.pessoas(id), mon.alertas(true, id, 100)]);
      setConta((c ?? []).find(x => x.id === id) ?? null); setPes(p ?? []);
      const lim = Date.now() - 24 * 3600000;
      setAls((a ?? []).filter(x => new Date(x.criado_em).getTime() > lim));
    } catch { /* sem internet */ }
    setAtualizando(false);
  }, [id]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const p = conta ? mon.plano(conta.tipo) : null;
  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
        <Text style={[k.titulo, { fontSize: 20, flex: 1 }]}>{conta?.nome ?? '…'}</Text>
      </View>
      {conta && p && (
        <CardK1 style={{ gap: 4 }}>
          <Text style={[st.tag, { backgroundColor: p.cor }]}>{p.txt}</Text>
          <Text style={k.mut}>👮 {conta.pessoas} de {conta.vagas} vagas · <Text style={{ color: K1.verde }}>{conta.em_turno} em turno</Text></Text>
          <Text style={k.mut}>Plano {conta.plano_status} · cliente desde {new Date(conta.criado_em).toLocaleDateString('pt-BR')}</Text>
          {!!conta.email && <Text style={k.mut}>{conta.email}</Text>}
          {!!conta.cnpj && <Text style={k.mut}>CNPJ {conta.cnpj}</Text>}
        </CardK1>
      )}
      <MapaPontos pontos={mon.pontosDe(pes, false)} altura={280} onAbrir={pid => router.push({ pathname: '/monitor/pessoa/[id]', params: { id: pid } })} />
      <Text style={k.titulo}>Pessoas ({pes.length})</Text>
      {pes.map(x => <LinhaPessoa key={x.id} p={x} />)}
      <Text style={k.titulo}>Alertas das últimas 24 h ({als.length})</Text>
      {als.length === 0 && <Text style={k.mut}>Nenhum alerta.</Text>}
      {als.map(a => (
        <CardK1 key={a.id} style={{ gap: 3, paddingVertical: 12, borderColor: a.status === 'resolvido' ? '#27272a' : mon.tipo(a.tipo).cor }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[st.tag, { backgroundColor: mon.tipo(a.tipo).cor }]}>{mon.tipo(a.tipo).txt}</Text>
            <Text style={k.mut}>{dataHora(a.criado_em)}</Text>
          </View>
          <Text style={{ color: '#fff' }}>{a.pessoa} · {a.status === 'resolvido' ? 'resolvido' : a.status === 'aberto' ? 'ABERTO' : 'em atendimento'}</Text>
          {!!a.observacao && <Text style={k.mut}>{a.observacao}</Text>}
          {a.lat != null && <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps?q=${a.lat},${a.lng}`)}><Text style={{ color: '#93c5fd' }}>Ver no mapa</Text></Pressable>}
        </CardK1>
      ))}
    </FundoK1>
  );
}
const st = StyleSheet.create({
  tag: { color: '#fff', fontWeight: '900', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', alignSelf: 'flex-start' },
});
