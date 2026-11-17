import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, s as k } from '../../components/k1';
import { supabase, traduzErro } from '../../lib/supabase';

type Alerta = {
  id: string; tipo: 'panico' | 'coacao' | 'senha_errada' | 'sem_resposta'; lat: number | null; lng: number | null;
  bateria: number | null; status: 'aberto' | 'em_atendimento' | 'resolvido'; criado_em: string;
  vigilantes?: { nome: string; posto: string | null; telefone: string | null } | null;
};
const TIPO = {
  panico: { txt: 'PÂNICO', cor: '#ef4444' }, coacao: { txt: 'COAÇÃO', cor: '#ef4444' },
  senha_errada: { txt: 'SENHA ERRADA', cor: K1.amarelo }, sem_resposta: { txt: 'SEM RESPOSTA', cor: K1.amarelo },
};

/** Alertas em aberto (sino do painel). */
export default function Alertas() {
  const [lista, setLista] = useState<Alerta[]>([]);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    const { data } = await supabase.from('alertas').select('*, vigilantes(nome,posto,telefone)')
      .neq('status', 'resolvido').order('criado_em', { ascending: false });
    setLista((data as unknown as Alerta[]) ?? []);
    setAtualizando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function mudar(a: Alerta, status: Alerta['status']) {
    const upd = status === 'resolvido' ? { status, resolvido_em: new Date().toISOString() } : { status };
    const { error } = await supabase.from('alertas').update(upd).eq('id', a.id);
    if (error) Alert.alert('Erro', traduzErro(error)); else carregar();
  }

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
        <Text style={[k.titulo, { fontSize: 22 }]}>Alertas em aberto</Text>
      </View>
      {lista.length === 0 && (
        <CardK1 style={{ alignItems: 'center', gap: 8 }}>
          <Ionicons name="shield-checkmark" size={48} color={K1.verde} />
          <Text style={k.titulo}>Nenhum alerta em aberto</Text>
        </CardK1>
      )}
      {lista.map(a => (
        <CardK1 key={a.id} style={{ gap: 6, borderColor: TIPO[a.tipo].cor }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[st.tag, { backgroundColor: TIPO[a.tipo].cor }]}>{TIPO[a.tipo].txt}</Text>
            <Text style={k.mut}>{dataHora(a.criado_em)}</Text>
          </View>
          <Text style={k.titulo}>{a.vigilantes?.nome ?? 'Vigilante'}</Text>
          <Text style={k.mut}>{a.vigilantes?.posto ?? 'Sem posto'} · 🔋 {a.bateria ?? '—'}% · {a.status === 'em_atendimento' ? 'Em atendimento' : 'Aberto'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {a.lat != null && <Pressable style={st.btn} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${a.lat},${a.lng}`)}><Text style={st.btnTxt}>MAPA</Text></Pressable>}
            {!!a.vigilantes?.telefone && <Pressable style={st.btn} onPress={() => Linking.openURL(`tel:${a.vigilantes?.telefone}`)}><Text style={st.btnTxt}>LIGAR</Text></Pressable>}
            {a.status === 'aberto' && <Pressable style={[st.btn, { backgroundColor: '#1d4ed8' }]} onPress={() => mudar(a, 'em_atendimento')}><Text style={st.btnTxt}>ATENDER</Text></Pressable>}
            <Pressable style={[st.btn, { backgroundColor: '#15803d' }]} onPress={() => mudar(a, 'resolvido')}><Text style={st.btnTxt}>RESOLVER</Text></Pressable>
          </View>
        </CardK1>
      ))}
    </FundoK1>
  );
}

const st = StyleSheet.create({
  tag: { color: '#fff', fontWeight: '900', fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  btn: { backgroundColor: '#2a2d35', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
