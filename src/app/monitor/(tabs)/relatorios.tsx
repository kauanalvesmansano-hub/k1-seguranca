import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FundoK1, CardK1, K1, dataHora, s as k } from '../../../components/k1';
import * as mon from '../../../lib/monitor';

type Rel = {
  dias: number; total: number; sem_resolver: number; atendimento_medio_min: number | null; resolucao_media_min: number | null;
  ocorrencias: number; livro: number; por_tipo: Record<string, number>; por_hora: { hora: number; n: number }[];
  por_conta: { id: string; nome: string; tipo: string; total: number; panicos: number; abertos: number; atendimento_min: number | null }[];
};
type Item = { id: string; criado_em?: string; hora?: string; tipo?: string; assunto?: string; descricao: string; pessoa: string; empresa: string; local: string };
const PERIODOS = [1, 7, 30, 90];
type Aba = 'resumo' | 'ocorrencias' | 'livro';

/** Relatórios de todas as contas + ocorrências e livro. */
export default function RelatoriosMonitor() {
  const [dias, setDias] = useState(30);
  const [aba, setAba] = useState<Aba>('resumo');
  const [r, setR] = useState<Rel | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      if (aba === 'resumo') setR(await mon.relatorio(dias) as unknown as Rel);
      else setItens((await (aba === 'ocorrencias' ? mon.ocorrencias(null, dias) : mon.livro(null, dias))) as unknown as Item[]);
    } catch { /* sem internet */ }
    setAtualizando(false);
  }, [aba, dias]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const tipos = Object.entries(r?.por_tipo ?? {}).sort((a, b) => b[1] - a[1]);
  const maxT = Math.max(1, ...tipos.map(t => t[1]));
  const horas = Array.from({ length: 24 }, (_, h) => r?.por_hora?.find(x => x.hora === h)?.n ?? 0);
  const maxH = Math.max(1, ...horas);

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <Text style={[k.titulo, { fontSize: 22 }]}>Relatórios</Text>
      <View style={st.linha}>
        {(['resumo', 'ocorrencias', 'livro'] as Aba[]).map(a => (
          <Pressable key={a} onPress={() => setAba(a)} style={[st.chip, aba === a && st.chipOn]}><Text style={st.chipTxt}>{a === 'resumo' ? 'Resumo' : a === 'ocorrencias' ? 'Ocorrências' : 'Livro'}</Text></Pressable>
        ))}
      </View>
      <View style={st.linha}>
        {PERIODOS.map(d => (
          <Pressable key={d} onPress={() => setDias(d)} style={[st.chip, dias === d && st.chipOn]}><Text style={st.chipTxt}>{d === 1 ? 'Hoje' : `${d} dias`}</Text></Pressable>
        ))}
      </View>

      {aba === 'resumo' && r && (
        <>
          <View style={st.linha}>
            <Num rot="Alertas" v={r.total} /><Num rot="Sem resolver" v={r.sem_resolver} cor="#ef4444" />
            <Num rot="Min. p/ atender" v={r.atendimento_medio_min ?? '—'} /><Num rot="Min. p/ resolver" v={r.resolucao_media_min ?? '—'} />
          </View>
          <View style={st.linha}><Num rot="Ocorrências" v={r.ocorrencias} /><Num rot="Registros no livro" v={r.livro} /></View>
          <CardK1 style={{ gap: 6 }}>
            <Text style={k.titulo}>Alertas por tipo</Text>
            {tipos.length === 0 && <Text style={k.mut}>Nenhum alerta no período.</Text>}
            {tipos.map(([t, n]) => (
              <View key={t} style={{ gap: 2 }}>
                <Text style={k.mut}>{mon.tipo(t).txt} · {n}</Text>
                <View style={[st.barra, { width: `${Math.max(2, Math.round(n / maxT * 100))}%`, backgroundColor: mon.tipo(t).cor }]} />
              </View>
            ))}
          </CardK1>
          <CardK1 style={{ gap: 6 }}>
            <Text style={k.titulo}>Pânico e coação por horário</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 2 }}>
              {horas.map((n, h) => <View key={h} style={{ flex: 1, height: `${Math.max(2, Math.round(n / maxH * 100))}%`, backgroundColor: n ? K1.vermelho : '#27272a', borderRadius: 2 }} />)}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{['0h', '6h', '12h', '18h', '23h'].map(x => <Text key={x} style={[k.mut, { fontSize: 11 }]}>{x}</Text>)}</View>
          </CardK1>
          <Text style={k.titulo}>Por conta</Text>
          {r.por_conta.length === 0 && <Text style={k.mut}>Nenhum alerta no período.</Text>}
          {r.por_conta.map(c => (
            <CardK1 key={c.id} style={{ gap: 3, paddingVertical: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{c.nome} <Text style={k.mut}>· {mon.plano(c.tipo).txt}</Text></Text>
              <Text style={k.mut}>{c.total} alertas · {c.panicos} pânico/coação · {c.abertos} sem resolver · atende em {c.atendimento_min ?? '—'} min</Text>
            </CardK1>
          ))}
        </>
      )}

      {aba !== 'resumo' && (
        <>
          {itens.length === 0 && <Text style={k.mut}>Nada no período.</Text>}
          {itens.map(o => (
            <CardK1 key={o.id} style={{ gap: 3, paddingVertical: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{o.tipo ?? o.assunto}</Text>
              <Text style={k.mut}>{dataHora(o.criado_em ?? o.hora)} · {o.pessoa} · {o.empresa}{o.local ? ' · ' + o.local : ''}</Text>
              <Text style={{ color: '#e5e5e5' }}>{o.descricao}</Text>
            </CardK1>
          ))}
        </>
      )}
    </FundoK1>
  );
}
function Num({ rot, v, cor = '#fff' }: { rot: string; v: number | string; cor?: string }) {
  return (
    <View style={st.num}><Text style={{ color: cor, fontSize: 20, fontWeight: '900' }}>{v}</Text><Text style={{ color: K1.mutado, fontSize: 11, textAlign: 'center' }}>{rot}</Text></View>
  );
}
const st = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  chipTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  num: { flex: 1, minWidth: 70, backgroundColor: K1.card, borderWidth: 1, borderColor: '#27272a', borderRadius: 10, padding: 8, alignItems: 'center' },
  barra: { height: 10, borderRadius: 4 },
});
