import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FundoK1, CardK1, K1, s as k } from '../../../components/k1';
import * as mon from '../../../lib/monitor';
import { LinhaPessoa } from '../../../components/MonLinhaPessoa';

type Filtro = 'seguranca' | 'autonomo' | 'familia';
const FILTROS: { v: Filtro; t: string }[] = [
  { v: 'seguranca', t: 'Empresas' }, { v: 'autonomo', t: 'Individuais' }, { v: 'familia', t: 'Família' },
];

/** Todas as contas. Empresa → abre e mostra os vigilantes dela. Individuais (vigilante/caminhoneiro) → lista de pessoas. */
export default function ContasMonitor() {
  const [contas, setContas] = useState<mon.MonConta[]>([]);
  const [pes, setPes] = useState<mon.MonPessoa[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('seguranca');
  const [busca, setBusca] = useState('');
  const [prof, setProf] = useState<'' | 'vigilante' | 'caminhoneiro'>('');
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try { const [c, p] = await Promise.all([mon.contas(), mon.pessoas()]); setContas(c ?? []); setPes(p ?? []); } catch { /* sem internet */ }
    setAtualizando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const q = busca.trim().toLowerCase();
  const lista = contas.filter(c => (filtro === 'seguranca' ? (c.tipo === 'seguranca' || c.tipo === 'transportadora') : c.tipo === filtro) && (!q || c.nome.toLowerCase().includes(q)));
  const individuais = pes.filter(p => p.plano === 'autonomo' && (!prof || p.profissao === prof) && (!q || p.nome.toLowerCase().includes(q)));

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <Text style={[k.titulo, { fontSize: 22 }]}>Contas</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {FILTROS.map(f => (
          <Pressable key={f.v} onPress={() => setFiltro(f.v)} style={[st.chip, filtro === f.v && st.chipOn]}>
            <Text style={st.chipTxt}>{f.t} ({contas.filter(c => f.v === 'seguranca' ? c.tipo === 'seguranca' || c.tipo === 'transportadora' : c.tipo === f.v).length})</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={busca} onChangeText={setBusca} placeholder="Buscar" placeholderTextColor="#666" style={st.busca} />

      {filtro === 'autonomo' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['', 'Todos'], ['vigilante', '👮 Vigilantes'], ['caminhoneiro', '🚚 Caminhoneiros']] as const).map(([v, t]) => (
              <Pressable key={v} onPress={() => setProf(v)} style={[st.chip, prof === v && st.chipOn]}><Text style={st.chipTxt}>{t}</Text></Pressable>
            ))}
          </View>
          {individuais.length === 0 && <Text style={k.mut}>Ninguém no plano individual ainda.</Text>}
          {individuais.map(p => <LinhaPessoa key={p.id} p={p} />)}
        </>
      ) : (
        <>
          {lista.length === 0 && <Text style={k.mut}>Nenhuma conta.</Text>}
          {lista.map(c => (
            <CardK1 key={c.id} onPress={() => router.push({ pathname: '/monitor/conta/[id]', params: { id: c.id } })}
              style={{ gap: 4, borderColor: c.alertas ? '#ef4444' : K1.vermelhoBorda }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[k.titulo, { flex: 1 }]}>{c.nome}</Text>
                {c.alertas > 0 ? <Text style={[st.tag, { backgroundColor: '#b91c1c' }]}>{c.alertas} ALERTA(S)</Text> : <Text style={[st.tag, { backgroundColor: '#15803d' }]}>OK</Text>}
              </View>
              <Text style={k.mut}>👮 {c.pessoas} de {c.vagas} vagas · <Text style={{ color: K1.verde }}>{c.em_turno} em turno</Text>{c.bateria_min != null ? ` · 🔋 mín. ${c.bateria_min}%` : ''}</Text>
              {c.plano_status !== 'ativo' && <Text style={{ color: '#fca5a5' }}>Plano {c.plano_status}</Text>}
            </CardK1>
          ))}
        </>
      )}
    </FundoK1>
  );
}

const st = StyleSheet.create({
  chip: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  chipTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tag: { color: '#fff', fontWeight: '900', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', alignSelf: 'flex-start' },
  busca: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 10, color: '#fff', paddingHorizontal: 12, height: 44 },
});
