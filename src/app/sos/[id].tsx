import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { K1 } from '../../components/k1';
import { lerSessao, rpc } from '../../lib/vigilante';
import { supabase } from '../../lib/supabase';
import { HTML_PLAYER_SOS, type RespostaSos } from '../../lib/sosPlayer';

type Modo = 'membro' | 'central' | 'empresa';

/** Fontes de dados: família (token da pessoa), celular da central (token da central) ou responsável logado. */
async function buscar(modo: Modo, id: string, depois: number): Promise<RespostaSos> {
  if (modo === 'membro') {
    const s = await lerSessao(); if (!s) throw new Error('sem sessão');
    return rpc<RespostaSos>('membro_sos_trechos', { p_token: s.token, p_alerta_id: id, p_depois: depois });
  }
  if (modo === 'central') {
    const t = await SecureStore.getItemAsync('k1_central_token'); if (!t) throw new Error('sem central');
    return rpc<RespostaSos>('central_sos_trechos', { p_token: t, p_alerta_id: id, p_depois: depois });
  }
  const [{ data: a }, { data: tr }] = await Promise.all([
    supabase.from('alertas').select('id, lat, lng, criado_em, sos_gravando, sos_encerrado_em, sos_encerrado_por, vigilantes(nome)').eq('id', id).maybeSingle(),
    supabase.from('sos_midia').select('seq, tipo, mime, dados').eq('alerta_id', id).gt('seq', depois).order('seq').limit(4),
  ]);
  const al = a as unknown as { id: string; lat: number | null; lng: number | null; criado_em: string; sos_gravando: boolean; sos_encerrado_em: string | null; sos_encerrado_por: string | null; vigilantes: { nome: string } | null } | null;
  return {
    alerta: al && { id: al.id, nome: al.vigilantes?.nome ?? '', gravando: al.sos_gravando, encerrado_em: al.sos_encerrado_em, encerrado_por: al.sos_encerrado_por, lat: al.lat, lng: al.lng, criado_em: al.criado_em },
    trechos: (tr ?? []) as RespostaSos['trechos'],
  };
}

async function encerrar(modo: Modo, id: string) {
  if (modo === 'membro') { const s = await lerSessao(); if (s) await rpc('membro_sos_encerrar', { p_token: s.token, p_alerta_id: id }); return; }
  if (modo === 'central') { const t = await SecureStore.getItemAsync('k1_central_token'); if (t) await rpc('central_sos_encerrar', { p_token: t, p_alerta_id: id }); return; }
  const { error } = await supabase.rpc('sos_encerrar', { p_alerta_id: id }); if (error) throw error;
}

/** SOS ao vivo: câmera + áudio de quem pediu socorro, até alguém encerrar. */
export default function SosAoVivo() {
  const { id, modo: m } = useLocalSearchParams<{ id: string; modo?: string }>();
  const modo: Modo = m === 'central' || m === 'empresa' ? m : 'membro';
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const ultimo = useRef(-1);
  const filaPlayer = useRef(0);
  const gravado = useRef(false);
  const [info, setInfo] = useState<RespostaSos['alerta']>(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  const puxar = useCallback(async () => {
    try {
      // pega até 4 de cada vez; se houver mais, busca de novo logo em seguida
      for (let i = 0; i < 3; i++) {
        // gravação já encerrada: só busca mais quando o player estiver quase sem trechos
        if (gravado.current && filaPlayer.current >= 2) break;
        const r = await buscar(modo, id, ultimo.current);
        if (r.alerta) {
          setInfo(r.alerta);
          if (r.alerta.encerrado_em && !gravado.current) { gravado.current = true; web.current?.injectJavaScript('window.setGravado(true); true;'); }
        }
        setErro('');
        if (!r.trechos.length) break;
        ultimo.current = r.trechos[r.trechos.length - 1].seq;
        web.current?.injectJavaScript(`window.addTrechos(${JSON.stringify(r.trechos)}); true;`);
        filaPlayer.current += r.trechos.length;
        if (r.trechos.length < 4) break;
      }
    } catch { setErro('Sem conexão. Tentando de novo…'); }
  }, [modo, id]);

  useEffect(() => {
    if (!pronto) return;
    puxar();
    const t = setInterval(puxar, 3000);
    return () => clearInterval(t);
  }, [pronto, puxar]);

  const encerrado = !!info?.encerrado_em;
  useEffect(() => {
    if (encerrado) web.current?.injectJavaScript(`setTimeout(function(){window.setStatus('Transmissão encerrada · gravação disponível');},6000); true;`);
  }, [encerrado]);

  function confirmarEncerrar() {
    Alert.alert('Encerrar a transmissão?', 'O celular para de gravar e de enviar. O alerta continua aberto até ser resolvido.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', style: 'destructive', onPress: async () => {
        try { await encerrar(modo, id); puxar(); } catch { Alert.alert('Sem conexão', 'Tente de novo.'); }
      } },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={st.topo}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.tit}>SOS — {info?.nome || '…'}</Text>
          <Text style={st.sub}>{encerrado ? `Encerrado por ${info?.encerrado_por ?? '—'}` : 'Câmera e áudio quase ao vivo (atraso de ~6 a 10 s)'}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <WebView
          ref={web}
          source={{ html: HTML_PLAYER_SOS }}
          originWhitelist={['*']}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          onLoadEnd={() => setPronto(true)}
          onMessage={e => { try { filaPlayer.current = JSON.parse(e.nativeEvent.data).fila ?? 0; } catch { /* ignora */ } }}
          style={{ backgroundColor: '#000' }}
        />
        {!pronto && <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" />}
      </View>

      {!!erro && <Text style={[st.sub, { textAlign: 'center', color: K1.amarelo, padding: 6 }]}>{erro}</Text>}
      <View style={st.barra}>
        {info?.lat != null && (
          <Pressable style={st.btn} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${info.lat},${info.lng}`)}>
            <Ionicons name="map" size={20} color="#fff" /><Text style={st.btnTxt}>MAPA</Text>
          </Pressable>
        )}
        {!encerrado && (
          <Pressable style={[st.btn, { backgroundColor: K1.vermelho, flex: 1.4 }]} onPress={confirmarEncerrar}>
            <Ionicons name="stop-circle" size={20} color="#fff" /><Text style={st.btnTxt}>ENCERRAR TRANSMISSÃO</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  tit: { color: '#fff', fontWeight: '900', fontSize: 18 },
  sub: { color: '#a1a1aa', fontSize: 12 },
  barra: { flexDirection: 'row', gap: 10, padding: 12 },
  btn: { flex: 1, height: 52, borderRadius: 12, backgroundColor: '#27272a', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
