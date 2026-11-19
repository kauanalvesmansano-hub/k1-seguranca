import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CabecalhoK1, CardK1, K1, horaCurta, s as k } from '../../../components/k1';
import { lerSessao, listarVisitantes, registrarEntradaVisitante, registrarSaidaVisitante, type Visitante } from '../../../lib/vigilante';
import { traduzErro } from '../../../lib/supabase';

/** Portaria: registra a entrada e a saída de visitantes. A empresa e o cliente veem a lista. */
export default function Portaria() {
  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [destino, setDestino] = useState('');
  const [placa, setPlaca] = useState('');
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; cor: string } | null>(null);
  const [lista, setLista] = useState<Visitante[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    const s = await lerSessao(); if (!s) return;
    setCarregando(true);
    try { setLista(await listarVisitantes(s)); } catch { /* sem internet: mantém a lista */ }
    setCarregando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function tirarFoto() {
    setMsg(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setMsg({ txt: 'Permita o uso da câmera para tirar a foto.', cor: '#ff6b66' }); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (r.canceled || !r.assets?.[0]) return;
    // foto pequena (rosto/documento): ~640 px, leve para enviar
    const img = await manipulateAsync(r.assets[0].uri, [{ resize: { width: 640 } }], { compress: 0.45, format: SaveFormat.JPEG, base64: true });
    setFoto(img.base64 ?? null);
  }

  async function registrar() {
    if (nome.trim().length < 2) { setMsg({ txt: 'Informe o nome do visitante.', cor: '#ff6b66' }); return; }
    const s = await lerSessao(); if (!s) return;
    setEnviando(true); setMsg(null);
    try {
      await registrarEntradaVisitante(s, { nome: nome.trim(), documento, destino, placa, observacao: obs, fotoBase64: foto });
      setNome(''); setDocumento(''); setDestino(''); setPlaca(''); setObs(''); setFoto(null); setAberto(false);
      setMsg({ txt: 'Entrada registrada ✓', cor: K1.verde });
      carregar();
    } catch (e) { setMsg({ txt: traduzErro(e), cor: '#ff6b66' }); }
    finally { setEnviando(false); }
  }

  function saida(v: Visitante) {
    Alert.alert('Registrar saída', `${v.nome} saiu agora?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Saiu', onPress: async () => {
        const s = await lerSessao(); if (!s) return;
        try { await registrarSaidaVisitante(s, v.id); carregar(); } catch (e) { Alert.alert('Erro', traduzErro(e)); }
      } },
    ]);
  }

  const dentro = lista.filter(v => !v.saida_em);
  const sairam = lista.filter(v => v.saida_em);

  return (
    <FundoK1 refresh={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <CabecalhoK1 tipo="vigilante" />

      {!aberto ? (
        <Pressable onPress={() => { setAberto(true); setMsg(null); }} style={({ pressed }) => [st.botao, pressed && { opacity: 0.85 }]}>
          <Ionicons name="person-add" size={26} color="#fff" />
          <Text style={st.botaoTxt}>Registrar entrada</Text>
        </Pressable>
      ) : (
        <CardK1 style={{ gap: 10 }}>
          <View style={st.linha}>
            <Ionicons name="person-add" size={22} color="#fff" />
            <Text style={[k.titulo, { fontSize: 18, flex: 1 }]}>Nova entrada</Text>
            <Pressable onPress={() => setAberto(false)} hitSlop={10}><Ionicons name="close" size={24} color="#aaa" /></Pressable>
          </View>
          <TextInput value={nome} onChangeText={setNome} placeholder="Nome do visitante *" placeholderTextColor="#8d939c" style={st.campo} maxLength={120} autoCapitalize="words" />
          <TextInput value={documento} onChangeText={setDocumento} placeholder="Documento (RG/CPF)" placeholderTextColor="#8d939c" style={st.campo} maxLength={40} />
          <TextInput value={destino} onChangeText={setDestino} placeholder="Vai para (apto, sala, setor)" placeholderTextColor="#8d939c" style={st.campo} maxLength={120} />
          <TextInput value={placa} onChangeText={t => setPlaca(t.toUpperCase())} placeholder="Placa do veículo" placeholderTextColor="#8d939c" style={st.campo} maxLength={10} autoCapitalize="characters" />
          <TextInput value={obs} onChangeText={setObs} placeholder="Observação (ex.: entregador, prestador)" placeholderTextColor="#8d939c" style={st.campo} maxLength={500} />
          {foto ? (
            <View style={{ gap: 6, alignItems: 'center' }}>
              <Image source={{ uri: 'data:image/jpeg;base64,' + foto }} style={st.foto} resizeMode="cover" />
              <Pressable onPress={() => setFoto(null)}><Text style={{ color: '#ff6b66' }}>Remover foto</Text></Pressable>
            </View>
          ) : (
            <Pressable onPress={tirarFoto} style={st.anexo}>
              <Ionicons name="camera" size={20} color="#fff" /><Text style={{ color: '#fff', fontWeight: '600' }}>Tirar foto (opcional)</Text>
            </Pressable>
          )}
          <Pressable onPress={registrar} disabled={enviando} style={st.botao}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={st.botaoTxt}>Registrar entrada</Text>}
          </Pressable>
        </CardK1>
      )}
      {msg && <Text style={{ color: msg.cor, textAlign: 'center', fontWeight: '700' }}>{msg.txt}</Text>}

      <CardK1 style={{ gap: 10 }}>
        <Text style={[k.titulo, { fontSize: 16 }]}>Dentro agora ({dentro.length})</Text>
        {dentro.length === 0 && <Text style={k.mut}>Nenhum visitante dentro.</Text>}
        {dentro.map(v => (
          <View key={v.id} style={st.item}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{v.nome}</Text>
              <Text style={k.mut}>Entrou {horaCurta(v.entrada_em)}{v.destino ? ' · ' + v.destino : ''}{v.placa ? ' · ' + v.placa : ''}</Text>
            </View>
            <Pressable onPress={() => saida(v)} style={st.sair}><Text style={{ color: '#fff', fontWeight: '800' }}>SAIU</Text></Pressable>
          </View>
        ))}
      </CardK1>

      {sairam.length > 0 && (
        <CardK1 style={{ gap: 8 }}>
          <Text style={[k.titulo, { fontSize: 16 }]}>Já saíram (últimas 12 h)</Text>
          {sairam.map(v => (
            <View key={v.id} style={st.item}>
              <Text style={{ color: '#d0d4da', flex: 1 }}>{v.nome}{v.destino ? ' · ' + v.destino : ''}</Text>
              <Text style={k.mut}>{horaCurta(v.entrada_em)} → {horaCurta(v.saida_em)}</Text>
            </View>
          ))}
        </CardK1>
      )}
    </FundoK1>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  botao: { height: 58, borderRadius: 12, backgroundColor: K1.vermelho, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  botaoTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  campo: { backgroundColor: '#0f1115', borderWidth: 1, borderColor: '#2a2f37', borderRadius: 10, color: '#fff', paddingHorizontal: 12, height: 48, fontSize: 16 },
  anexo: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 10, borderWidth: 1, borderColor: '#3a3f47', borderStyle: 'dashed' },
  foto: { width: 160, height: 160, borderRadius: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10 },
  sair: { backgroundColor: '#1d4ed8', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});
