import { useCallback, useState } from 'react';
import { Alert, Image, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, horaCurta, s as k } from '../../../components/k1';
import { supabase, traduzErro } from '../../../lib/supabase';

type Registro = {
  id: string; assunto: string; hora_fato: string; descricao: string; lat: number | null; lng: number | null;
  foto_base64: string | null; vigilantes?: { nome: string } | null;
};
type Envio = { id: string; turno_inicio: string; turno_fim: string; status: 'pendente' | 'enviado' | 'erro' | 'sem_contato'; resposta: string | null; vigilantes?: { nome: string } | null };
const ST_ENVIO = {
  pendente: { txt: 'Aguardando o K1-WhatsApp', cor: K1.amarelo }, enviado: { txt: 'PDF enviado', cor: K1.verde },
  erro: { txt: 'Erro no envio', cor: '#ef4444' }, sem_contato: { txt: 'Sem WhatsApp de monitoramento', cor: '#ef4444' },
};

/** Livro de ocorrências digital: o que os vigilantes registraram nos turnos (últimos 7 dias). */
export default function LivroEmpresa() {
  const [lista, setLista] = useState<Registro[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [atualizando, setAtualizando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    const [l, e] = await Promise.all([
      supabase.from('livro_registros').select('id,assunto,hora_fato,descricao,lat,lng,foto_base64,vigilantes(nome)')
        .gte('hora_fato', desde).order('hora_fato', { ascending: false }).limit(300),
      supabase.from('livro_envios').select('id,turno_inicio,turno_fim,status,resposta,vigilantes(nome)').order('turno_fim', { ascending: false }).limit(10),
    ]);
    setLista((l.data as unknown as Registro[]) ?? []);
    setEnvios((e.data as unknown as Envio[]) ?? []);
    setAtualizando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  function remover(r: Registro) {
    Alert.alert('Remover este registro do livro?', 'Ele será apagado de vez. Não dá para desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('livro_registros').delete().eq('id', r.id);
        if (error) Alert.alert('Erro', traduzErro(error)); else setLista(x => x.filter(y => y.id !== r.id));
      } },
    ]);
  }

  // agrupa por dia
  const dias: { dia: string; itens: Registro[] }[] = [];
  for (const r of lista) {
    const d = new Date(r.hora_fato).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    const g = dias.find(x => x.dia === d); if (g) g.itens.push(r); else dias.push({ dia: d, itens: [r] });
  }

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <Text style={[k.titulo, { fontSize: 22 }]}>Livro de ocorrências</Text>
      <Text style={k.mut}>
        Os vigilantes registram na aba Livro do app. Ao encerrar o turno, o livro vira PDF e vai sozinho para o WhatsApp do Monitoramento.
      </Text>

      {envios.length > 0 && (
        <CardK1 style={{ gap: 8 }}>
          <Text style={[k.titulo, { fontSize: 16 }]}>PDFs dos turnos</Text>
          {envios.map(e => (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="document-text" size={18} color={ST_ENVIO[e.status].cor} />
              <Text style={{ color: '#e5e5e5', flex: 1 }} numberOfLines={1}>{e.vigilantes?.nome} · {dataHora(e.turno_inicio)} → {horaCurta(e.turno_fim)}</Text>
              <Text style={{ color: ST_ENVIO[e.status].cor, fontSize: 12, fontWeight: '700' }}>{ST_ENVIO[e.status].txt}</Text>
            </View>
          ))}
        </CardK1>
      )}

      {lista.length === 0 && <CardK1><Text style={k.mut}>Nenhum registro nos últimos 7 dias.</Text></CardK1>}
      {dias.map(g => (
        <View key={g.dia} style={{ gap: 8 }}>
          <Text style={{ color: K1.mutado, fontWeight: '800', textTransform: 'capitalize', marginTop: 4 }}>{g.dia}</Text>
          {g.itens.map(r => (
            <CardK1 key={r.id} style={{ gap: 6 }} onPress={() => setAberto(aberto === r.id ? null : r.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: K1.vermelho, fontWeight: '900', fontSize: 16 }}>{horaCurta(r.hora_fato)}</Text>
                <Text style={[k.titulo, { fontSize: 15, flex: 1 }]} numberOfLines={1}>{r.assunto}</Text>
                {!!r.foto_base64 && <Ionicons name="camera" size={16} color={K1.mutado} />}
              </View>
              <Text style={k.mut}>{r.vigilantes?.nome}</Text>
              <Text style={{ color: '#e5e5e5', lineHeight: 20 }} numberOfLines={aberto === r.id ? undefined : 3}>{r.descricao}</Text>
              {aberto === r.id && !!r.foto_base64 && (
                <Image source={{ uri: 'data:image/jpeg;base64,' + r.foto_base64 }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} resizeMode="cover" />
              )}
              {aberto === r.id && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {r.lat != null && (
                    <Pressable style={st.btn} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${r.lat},${r.lng}`)}><Text style={st.btnTxt}>MAPA</Text></Pressable>
                  )}
                  <Pressable style={[st.btn, { backgroundColor: '#7f1d1d' }]} onPress={() => remover(r)}><Text style={st.btnTxt}>REMOVER</Text></Pressable>
                </View>
              )}
            </CardK1>
          ))}
        </View>
      ))}
    </FundoK1>
  );
}

const st = StyleSheet.create({
  btn: { backgroundColor: '#2a2d35', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
