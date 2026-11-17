import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, s as k } from '../../components/k1';
import { supabase, traduzErro } from '../../lib/supabase';

type Ocorrencia = {
  id: string; tipo: string; descricao: string; status: 'nova' | 'vista' | 'resolvida';
  lat: number | null; lng: number | null; criado_em: string;
  vigilantes?: { nome: string; posto: string | null } | null;
};
const TIPO: Record<string, string> = {
  suspeito: 'Suspeito', invasao: 'Invasão', furto: 'Furto/Roubo', dano: 'Dano',
  acidente: 'Acidente', incendio: 'Incêndio', ronda: 'Ronda', outros: 'Outros',
};
const STATUS = { nova: { txt: 'NOVA', cor: K1.amarelo }, vista: { txt: 'Vista', cor: '#60a5fa' }, resolvida: { txt: 'Resolvida', cor: K1.verde } };

/** Ocorrências registradas pelos vigilantes. */
export default function OcorrenciasEmpresa() {
  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    const { data } = await supabase.from('ocorrencias').select('*, vigilantes(nome,posto)').order('criado_em', { ascending: false }).limit(100);
    setLista((data as unknown as Ocorrencia[]) ?? []);
    setAtualizando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => {
    const canal = supabase.channel('k1-oc-app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ocorrencias' }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [carregar]);

  async function mudar(o: Ocorrencia, status: Ocorrencia['status']) {
    const { error } = await supabase.from('ocorrencias').update({ status }).eq('id', o.id);
    if (error) Alert.alert('Erro', traduzErro(error)); else carregar();
  }

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
        <Text style={[k.titulo, { fontSize: 22 }]}>Ocorrências</Text>
      </View>
      {lista.length === 0 && <CardK1><Text style={k.mut}>Nenhuma ocorrência registrada.</Text></CardK1>}
      {lista.map(o => (
        <CardK1 key={o.id} style={{ gap: 6, borderColor: o.status === 'nova' ? K1.amarelo : K1.vermelhoBorda }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[k.titulo, { fontSize: 16 }]}>{TIPO[o.tipo] ?? o.tipo}</Text>
            <Text style={{ color: STATUS[o.status].cor, fontWeight: '800', fontSize: 12 }}>{STATUS[o.status].txt}</Text>
          </View>
          <Text style={k.mut}>{o.vigilantes?.nome ?? 'Vigilante'} · {o.vigilantes?.posto ?? 'Sem posto'} · {dataHora(o.criado_em)}</Text>
          <Text style={{ color: '#e5e5e5', fontSize: 15, lineHeight: 21 }}>{o.descricao}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {o.lat != null && (
              <Pressable style={st.btn} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${o.lat},${o.lng}`)}>
                <Text style={st.btnTxt}>MAPA</Text>
              </Pressable>
            )}
            {o.status === 'nova' && (
              <Pressable style={[st.btn, { backgroundColor: '#1d4ed8' }]} onPress={() => mudar(o, 'vista')}><Text style={st.btnTxt}>MARCAR VISTA</Text></Pressable>
            )}
            {o.status !== 'resolvida' && (
              <Pressable style={[st.btn, { backgroundColor: '#15803d' }]} onPress={() => mudar(o, 'resolvida')}><Text style={st.btnTxt}>RESOLVIDA</Text></Pressable>
            )}
          </View>
        </CardK1>
      ))}
    </FundoK1>
  );
}

const st = StyleSheet.create({
  btn: { backgroundColor: '#2a2d35', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
