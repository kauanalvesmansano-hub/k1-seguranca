import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, s as k } from '../../../components/k1';
import { supabase } from '../../../lib/supabase';
import { RESULTADO, type Checkin } from '../../../lib/empresa';

/** Relatório dos últimos 30 dias + todas as comunicações recentes. */
export default function Relatorios() {
  const [lista, setLista] = useState<Checkin[]>([]);
  const [panicos, setPanicos] = useState(0);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    const desde = new Date(Date.now() - 30 * 86400000).toISOString();
    const [c, p] = await Promise.all([
      supabase.from('checkins').select('id,vigilante_id,resultado,criado_em,vigilantes(nome,posto)').gte('criado_em', desde)
        .order('criado_em', { ascending: false }).limit(1000),
      supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('tipo', 'panico').gte('criado_em', desde),
    ]);
    setLista((c.data as unknown as Checkin[]) ?? []);
    setPanicos(p.count ?? 0);
    setAtualizando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const conta = (r: Checkin['resultado']) => lista.filter(c => c.resultado === r).length;
  const total = lista.length || 1;
  const pct = Math.round((conta('ok') / total) * 100);

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <Text style={[k.titulo, { fontSize: 22 }]}>Relatórios — últimos 30 dias</Text>

      <View style={st.grade}>
        {([
          ['Senhas OK', conta('ok'), K1.verde],
          ['Senha incorreta', conta('senha_errada'), '#ef4444'],
          ['Sem resposta', conta('sem_resposta'), K1.amarelo],
          ['Coação', conta('coacao'), '#ef4444'],
          ['Pânico', panicos, '#ef4444'],
          ['Confiabilidade', `${lista.length ? pct : 0}%`, '#fff'],
        ] as const).map(([rotulo, valor, cor]) => (
          <CardK1 key={rotulo} style={st.item}>
            <Text style={[st.num, { color: cor }]}>{valor}</Text>
            <Text style={k.mut}>{rotulo}</Text>
          </CardK1>
        ))}
      </View>

      <CardK1 style={{ gap: 12 }}>
        <Text style={[k.titulo, { fontSize: 16 }]}>Todas as comunicações</Text>
        {lista.length === 0 && <Text style={k.mut}>Nenhum registro no período.</Text>}
        {lista.slice(0, 200).map(c => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name={RESULTADO[c.resultado].icone} size={20} color={RESULTADO[c.resultado].cor} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#e5e5e5' }} numberOfLines={1}>{RESULTADO[c.resultado].txt} – {c.vigilantes?.posto || 'Posto'}</Text>
              <Text style={[k.mut, { fontSize: 12 }]} numberOfLines={1}>{c.vigilantes?.nome}</Text>
            </View>
            <Text style={k.mut}>{dataHora(c.criado_em)}</Text>
          </View>
        ))}
      </CardK1>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: '31%', flexGrow: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6 },
  num: { fontSize: 26, fontWeight: '800' },
});
