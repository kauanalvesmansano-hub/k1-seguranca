import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CabecalhoK1, CardK1, K1, dataHora, s as k } from '../../../components/k1';
import { lerSessao, minhasOcorrencias, registrarOcorrencia, type Ocorrencia } from '../../../lib/vigilante';
import { traduzErro } from '../../../lib/supabase';

export const TIPOS_OCORRENCIA: { id: string; nome: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'suspeito', nome: 'Suspeito', icone: 'eye' },
  { id: 'invasao', nome: 'Invasão', icone: 'walk' },
  { id: 'furto', nome: 'Furto/Roubo', icone: 'bag-remove' },
  { id: 'dano', nome: 'Dano', icone: 'hammer' },
  { id: 'acidente', nome: 'Acidente', icone: 'medkit' },
  { id: 'incendio', nome: 'Incêndio', icone: 'flame' },
  { id: 'ronda', nome: 'Ronda', icone: 'footsteps' },
  { id: 'outros', nome: 'Outros', icone: 'ellipsis-horizontal-circle' },
];
const nomeTipo = (id: string) => TIPOS_OCORRENCIA.find(t => t.id === id)?.nome ?? id;
const STATUS = { nova: { txt: 'Enviada', cor: K1.amarelo }, vista: { txt: 'Vista pela empresa', cor: '#60a5fa' }, resolvida: { txt: 'Resolvida', cor: K1.verde } };

/** Ocorrências: o vigilante registra o que aconteceu no posto; a empresa recebe na hora. */
export default function Ocorrencias() {
  const [tipo, setTipo] = useState('suspeito');
  const [descricao, setDescricao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; cor: string } | null>(null);
  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [foto, setFoto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    const s = await lerSessao(); if (!s) return;
    setCarregando(true);
    try { setLista(await minhasOcorrencias(s)); } catch { /* sem internet: mantém a lista */ }
    setCarregando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function tirarFoto() {
    setMsg(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setMsg({ txt: 'Permita o uso da câmera para anexar foto.', cor: '#ff6b66' }); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    // reduz para ~1000 px e JPEG 50% (fica leve para enviar mesmo com sinal fraco)
    const img = await manipulateAsync(r.assets[0].uri, [{ resize: { width: 1000 } }], { compress: 0.5, format: SaveFormat.JPEG, base64: true });
    setFoto(img.base64 ?? null);
  }

  async function enviar() {
    if (descricao.trim().length < 3) { setMsg({ txt: 'Descreva o que aconteceu.', cor: '#ff6b66' }); return; }
    const s = await lerSessao(); if (!s) return;
    setEnviando(true); setMsg(null);
    try {
      await registrarOcorrencia(s, tipo, descricao.trim(), foto);
      setDescricao(''); setFoto(null);
      setMsg({ txt: 'Ocorrência enviada para a empresa ✓', cor: K1.verde });
      carregar();
    } catch (e) { setMsg({ txt: traduzErro(e), cor: '#ff6b66' }); }
    finally { setEnviando(false); }
  }

  return (
    <FundoK1 refresh={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <CabecalhoK1 tipo="vigilante" />

      <CardK1 style={{ gap: 12 }}>
        <View style={st.linha}>
          <Ionicons name="clipboard" size={24} color="#fff" />
          <Text style={[k.titulo, { fontSize: 18 }]}>Nova ocorrência</Text>
        </View>
        <View style={st.tipos}>
          {TIPOS_OCORRENCIA.map(t => (
            <Pressable key={t.id} onPress={() => setTipo(t.id)} style={[st.tipo, tipo === t.id && st.tipoOn]}>
              <Ionicons name={t.icone} size={18} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: tipo === t.id ? '800' : '400', fontSize: 13 }}>{t.nome}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={descricao} onChangeText={setDescricao} multiline maxLength={2000}
          placeholder="O que aconteceu? Onde? Quem estava envolvido?" placeholderTextColor="#8d939c"
          style={st.texto} textAlignVertical="top"
        />
        {foto ? (
          <View style={{ gap: 6 }}>
            <Image source={{ uri: 'data:image/jpeg;base64,' + foto }} style={st.foto} resizeMode="cover" />
            <Pressable onPress={() => setFoto(null)}><Text style={{ color: '#ff6b66', textAlign: 'center' }}>Remover foto</Text></Pressable>
          </View>
        ) : (
          <Pressable onPress={tirarFoto} style={st.anexo}>
            <Ionicons name="camera" size={20} color="#fff" /><Text style={{ color: '#fff', fontWeight: '600' }}>Adicionar foto</Text>
          </Pressable>
        )}
        <Text style={[k.mut, { fontSize: 12 }]}>A hora e a sua localização vão junto automaticamente.</Text>
        <Pressable onPress={enviar} disabled={enviando} style={st.botao}>
          {enviando ? <ActivityIndicator color="#fff" /> : <>
            <Ionicons name="send" size={20} color="#fff" /><Text style={st.botaoTxt}>Registrar ocorrência</Text>
          </>}
        </Pressable>
        {msg && <Text style={{ color: msg.cor, textAlign: 'center', fontWeight: '600' }}>{msg.txt}</Text>}
      </CardK1>

      <CardK1 style={{ gap: 12 }}>
        <Text style={[k.titulo, { fontSize: 16 }]}>Minhas ocorrências</Text>
        {lista.length === 0 && <Text style={k.mut}>Nenhuma ocorrência registrada ainda.</Text>}
        {lista.map(o => (
          <View key={o.id} style={st.item}>
            <View style={[st.linha, { justifyContent: 'space-between' }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{nomeTipo(o.tipo)}</Text>
              <Text style={k.mut}>{dataHora(o.criado_em)}</Text>
            </View>
            <Text style={{ color: '#d0d4da' }} numberOfLines={3}>{o.descricao}</Text>
            <Text style={{ color: STATUS[o.status].cor, fontSize: 12, fontWeight: '700' }}>{STATUS[o.status].txt}{o.tem_foto ? '  ·  📷 com foto' : ''}</Text>
          </View>
        ))}
      </CardK1>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  tipoOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  texto: { minHeight: 110, borderRadius: 10, borderWidth: 1, borderColor: '#5a5d65', backgroundColor: '#111317', color: '#fff', padding: 12, fontSize: 16 },
  botao: { height: 52, borderRadius: 10, backgroundColor: K1.vermelho, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  botaoTxt: { color: '#fff', fontSize: 17, fontWeight: '700' },
  anexo: { height: 46, borderRadius: 10, borderWidth: 1, borderColor: '#5a5d65', borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  foto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10 },
  item: { borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10, gap: 4 },
});
