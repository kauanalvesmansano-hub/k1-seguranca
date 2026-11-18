import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, Vibration, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CabecalhoK1, CardK1, K1, horaCurta, s as k } from '../../../components/k1';
import { lerSessao, pontosRonda, registrarPonto, type PontoRonda } from '../../../lib/vigilante';
import { traduzErro } from '../../../lib/supabase';

/** Ronda: o vigilante lê o QR code de cada ponto; a empresa vê hora e local de cada leitura. */
export default function Ronda() {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [lendo, setLendo] = useState(false);
  const [pontos, setPontos] = useState<PontoRonda[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; cor: string } | null>(null);
  const travado = useRef(false);

  const carregar = useCallback(async () => {
    const s = await lerSessao(); if (!s) return;
    setCarregando(true);
    try { setPontos(await pontosRonda(s)); } catch (e) { setMsg({ txt: traduzErro(e), cor: '#ff6b66' }); }
    setCarregando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); return () => setLendo(false); }, [carregar]));

  async function abrirLeitor() {
    setMsg(null);
    if (!permissao?.granted) {
      const r = await pedirPermissao();
      if (!r.granted) { setMsg({ txt: 'Permita o uso da câmera para ler os pontos de ronda.', cor: '#ff6b66' }); return; }
    }
    travado.current = false;
    setLendo(true);
  }

  async function aoLer(r: BarcodeScanningResult) {
    if (travado.current) return;
    travado.current = true;
    setLendo(false);
    Vibration.vibrate(80);
    const s = await lerSessao(); if (!s) return;
    try {
      const res = await registrarPonto(s, r.data);
      setMsg({ txt: `✓ ${res.ponto} registrado às ${horaCurta(res.hora)}`, cor: K1.verde });
      carregar();
    } catch (e) { setMsg({ txt: traduzErro(e), cor: '#ff6b66' }); }
  }

  const feitos = pontos.filter(p => p.ultima_leitura).length;

  return (
    <FundoK1 refresh={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <CabecalhoK1 tipo="vigilante" />

      {lendo ? (
        <CardK1 style={{ padding: 0, overflow: 'hidden' }}>
          <CameraView
            style={{ width: '100%', aspectRatio: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={aoLer}
          />
          <View style={st.mira} pointerEvents="none" />
          <Pressable onPress={() => setLendo(false)} style={st.cancelar}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Cancelar</Text>
          </Pressable>
        </CardK1>
      ) : (
        <Pressable onPress={abrirLeitor} style={({ pressed }) => [st.botao, pressed && { opacity: 0.85 }]}>
          <Ionicons name="qr-code" size={28} color="#fff" />
          <Text style={st.botaoTxt}>Ler ponto de ronda</Text>
        </Pressable>
      )}
      {msg && <Text style={{ color: msg.cor, textAlign: 'center', fontWeight: '700', fontSize: 15 }}>{msg.txt}</Text>}

      <CardK1 style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[k.titulo, { fontSize: 16 }]}>Pontos deste turno</Text>
          <Text style={{ color: feitos === pontos.length && pontos.length ? K1.verde : K1.mutado, fontWeight: '700' }}>
            {feitos}/{pontos.length}
          </Text>
        </View>
        {carregando && pontos.length === 0 && <ActivityIndicator color={K1.vermelho} />}
        {!carregando && pontos.length === 0 && (
          <Text style={k.mut}>A empresa ainda não cadastrou pontos de ronda. Eles são criados no painel da empresa.</Text>
        )}
        {pontos.map(p => (
          <View key={p.id} style={st.ponto}>
            <Ionicons name={p.ultima_leitura ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={p.ultima_leitura ? K1.verde : '#777'} />
            <Text style={{ color: '#fff', flex: 1 }}>{p.nome}</Text>
            <Text style={k.mut}>{p.ultima_leitura ? horaCurta(p.ultima_leitura) : 'pendente'}</Text>
          </View>
        ))}
      </CardK1>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  botao: {
    height: 64, borderRadius: 12, backgroundColor: K1.vermelho, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    borderWidth: 1, borderColor: '#ff4d47',
  },
  botaoTxt: { color: '#fff', fontSize: 19, fontWeight: '800' },
  mira: { position: 'absolute', top: '20%', left: '20%', width: '60%', height: '60%', borderWidth: 3, borderColor: K1.vermelho, borderRadius: 16 },
  cancelar: { position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  ponto: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10 },
});
