import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CabecalhoK1, CardK1, K1, horaCurta, s as k } from '../../../components/k1';
import { excluirDoLivro, lerSessao, livroDoTurno, registrarNoLivro, type RegistroLivro } from '../../../lib/vigilante';
import { traduzErro } from '../../../lib/supabase';

const agoraHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** "07:30" → data de hoje nesse horário (se ficar no futuro, é de ontem: plantão que virou a meia-noite). */
function horaParaData(hhmm: string): Date | null {
  const m = hhmm.match(/^(\d{1,2}):?(\d{2})$/); if (!m) return null;
  const h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return null;
  const d = new Date(); d.setHours(h, mi, 0, 0);
  if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
  return d;
}

/** Livro de ocorrências digital do turno. Ao encerrar o turno vira PDF e vai para o WhatsApp do monitoramento. */
export default function Livro() {
  const [assuntos, setAssuntos] = useState<string[]>([]);
  const [registros, setRegistros] = useState<RegistroLivro[]>([]);
  const [emTurno, setEmTurno] = useState(true);
  const [assunto, setAssunto] = useState('');
  const [hora, setHora] = useState(agoraHHMM());
  const [texto, setTexto] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; cor: string } | null>(null);

  const carregar = useCallback(async () => {
    const s = await lerSessao(); if (!s) return;
    setCarregando(true);
    try { const r = await livroDoTurno(s); setAssuntos(r.assuntos); setRegistros(r.registros); setEmTurno(r.em_turno); } catch { /* sem internet */ }
    setCarregando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); setHora(agoraHHMM()); }, [carregar]));

  async function tirarFoto() {
    setMsg(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setMsg({ txt: 'Permita o uso da câmera para tirar a foto.', cor: '#ff6b66' }); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const img = await manipulateAsync(r.assets[0].uri, [{ resize: { width: 1000 } }], { compress: 0.5, format: SaveFormat.JPEG, base64: true });
    setFoto(img.base64 ?? null);
  }

  async function registrar() {
    if (!assunto) { setMsg({ txt: 'Escolha o assunto.', cor: '#ff6b66' }); return; }
    const quando = horaParaData(hora.trim());
    if (!quando) { setMsg({ txt: 'Horário inválido. Use o formato 14:30.', cor: '#ff6b66' }); return; }
    if (texto.trim().length < 2) { setMsg({ txt: 'Escreva o relato.', cor: '#ff6b66' }); return; }
    const s = await lerSessao(); if (!s) return;
    setEnviando(true); setMsg(null);
    try {
      await registrarNoLivro(s, assunto, quando, texto.trim(), foto);
      setTexto(''); setFoto(null); setAssunto(''); setHora(agoraHHMM());
      setMsg({ txt: 'Registrado no livro ✓', cor: K1.verde });
      carregar();
    } catch (e) { setMsg({ txt: traduzErro(e), cor: '#ff6b66' }); }
    finally { setEnviando(false); }
  }

  function apagar(r: RegistroLivro) {
    Alert.alert('Apagar este registro?', `${horaCurta(r.hora_fato)} · ${r.assunto}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: async () => {
        const s = await lerSessao(); if (!s) return;
        try { await excluirDoLivro(s, r.id); carregar(); } catch (e) { Alert.alert('Erro', traduzErro(e)); }
      } },
    ]);
  }

  return (
    <FundoK1 refresh={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <CabecalhoK1 tipo="vigilante" />

      {!emTurno ? (
        <CardK1><Text style={k.mut}>Inicie o turno na aba Início para escrever no livro de ocorrências.</Text></CardK1>
      ) : (
        <CardK1 style={{ gap: 12 }}>
          <View style={st.linha}>
            <Ionicons name="book" size={22} color="#fff" />
            <Text style={[k.titulo, { fontSize: 18 }]}>Novo registro no livro</Text>
          </View>

          <Text style={st.rotulo}>Assunto</Text>
          <View style={st.chips}>
            {assuntos.map(a => (
              <Pressable key={a} onPress={() => setAssunto(a)} style={[st.chip, assunto === a && st.chipOn]}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: assunto === a ? '800' : '400' }}>{a}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={st.rotulo}>Horário do fato</Text>
          <View style={st.linha}>
            <TextInput value={hora} onChangeText={setHora} keyboardType="numbers-and-punctuation" maxLength={5}
              style={[st.campo, { width: 110, textAlign: 'center', fontSize: 20, fontWeight: '800' }]} />
            <Pressable onPress={() => setHora(agoraHHMM())} style={st.agora}><Text style={{ color: '#fff' }}>Agora</Text></Pressable>
          </View>

          <Text style={st.rotulo}>Relato</Text>
          <TextInput value={texto} onChangeText={setTexto} multiline maxLength={3000} textAlignVertical="top"
            placeholder="O que aconteceu? Quem? Onde? Que providência foi tomada?" placeholderTextColor="#8d939c"
            style={[st.campo, { minHeight: 110, paddingTop: 10 }]} />

          {foto ? (
            <View style={{ gap: 6 }}>
              <Image source={{ uri: 'data:image/jpeg;base64,' + foto }} style={st.foto} resizeMode="cover" />
              <Pressable onPress={() => setFoto(null)}><Text style={{ color: '#ff6b66', textAlign: 'center' }}>Remover foto</Text></Pressable>
            </View>
          ) : (
            <Pressable onPress={tirarFoto} style={st.anexo}>
              <Ionicons name="camera" size={20} color="#fff" /><Text style={{ color: '#fff', fontWeight: '600' }}>Tirar foto (opcional)</Text>
            </Pressable>
          )}

          <Pressable onPress={registrar} disabled={enviando} style={st.botao}>
            {enviando ? <ActivityIndicator color="#fff" /> : <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" /><Text style={st.botaoTxt}>Registrar no livro</Text>
            </>}
          </Pressable>
          {msg && <Text style={{ color: msg.cor, textAlign: 'center', fontWeight: '700' }}>{msg.txt}</Text>}
          <Text style={[k.mut, { fontSize: 12 }]}>Ao encerrar o turno, o livro (e as ocorrências do turno) vira PDF e vai automático para o WhatsApp do monitoramento.</Text>
        </CardK1>
      )}

      {emTurno && (
        <CardK1 style={{ gap: 10 }}>
          <Text style={[k.titulo, { fontSize: 16 }]}>Registros deste turno ({registros.length})</Text>
          {registros.length === 0 && <Text style={k.mut}>Nada registrado ainda.</Text>}
          {registros.map(r => (
            <View key={r.id} style={st.item}>
              <Text style={{ color: K1.vermelho, fontWeight: '900', width: 48 }}>{horaCurta(r.hora_fato)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{r.assunto}{r.tem_foto ? '  📷' : ''}</Text>
                <Text style={{ color: '#cfd3d8' }} numberOfLines={3}>{r.descricao}</Text>
              </View>
              <Pressable onPress={() => apagar(r)} hitSlop={10}><Ionicons name="trash-outline" size={20} color="#888" /></Pressable>
            </View>
          ))}
        </CardK1>
      )}
    </FundoK1>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rotulo: { color: '#9aa3ad', fontSize: 13, fontWeight: '700', marginBottom: -4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#1d2129', borderWidth: 1, borderColor: '#2f343d' },
  chipOn: { backgroundColor: K1.vermelho, borderColor: '#ff4d47' },
  campo: { backgroundColor: '#0f1115', borderWidth: 1, borderColor: '#2a2f37', borderRadius: 10, color: '#fff', paddingHorizontal: 12, minHeight: 48, fontSize: 16 },
  agora: { paddingHorizontal: 16, height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#3a3f47', justifyContent: 'center' },
  anexo: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 10, borderWidth: 1, borderColor: '#3a3f47', borderStyle: 'dashed' },
  foto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10 },
  botao: { height: 56, borderRadius: 12, backgroundColor: K1.vermelho, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  botaoTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10 },
});
