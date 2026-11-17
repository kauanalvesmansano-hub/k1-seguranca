import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, s as k } from '../../../components/k1';
import { lerSessao, panico } from '../../../lib/vigilante';

const SEGURAR_MS = 2000;

/** SOS: segure o botão por 2 segundos para enviar pânico silencioso. */
export default function SOS() {
  const [estado, setEstado] = useState<'pronto' | 'enviando' | 'enviado' | 'erro'>('pronto');
  const progresso = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function iniciar() {
    if (estado === 'enviando') return;
    Animated.timing(progresso, { toValue: 1, duration: SEGURAR_MS, useNativeDriver: false }).start();
    timer.current = setTimeout(disparar, SEGURAR_MS);
  }
  function cancelar() {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(progresso, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }
  async function disparar() {
    setEstado('enviando');
    Vibration.vibrate(80); // vibração curta e discreta
    try {
      const s = await lerSessao();
      if (!s) throw new Error('sem sessão');
      await panico(s, null, null, null); // localização entra na próxima etapa
      setEstado('enviado');
    } catch { setEstado('erro'); }
    progresso.setValue(0);
    setTimeout(() => setEstado('pronto'), 4000);
  }

  const largura = progresso.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <FundoK1 rolar={false}>
      <Text style={[k.titulo, { textAlign: 'center', fontSize: 22, marginTop: 10 }]}>SOS — PÂNICO</Text>
      <Text style={[k.mut, { textAlign: 'center' }]}>Segure o botão por 2 segundos. O alerta é enviado em silêncio para o monitoramento da empresa.</Text>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPressIn={iniciar} onPressOut={cancelar} style={st.anel}>
          <View style={st.botao}>
            <Ionicons name="alert" size={84} color="#fff" />
            <Text style={st.txt}>SEGURE</Text>
          </View>
        </Pressable>
        <View style={st.barra}><Animated.View style={[st.barraCheia, { width: largura }]} /></View>
        <Text style={[k.mut, { marginTop: 14, color: estado === 'erro' ? '#ff6b66' : estado === 'enviado' ? K1.verde : K1.mutado }]}>
          {estado === 'enviando' ? 'Enviando…' : estado === 'enviado' ? 'Enviado.' : estado === 'erro' ? 'Falha ao enviar. Tente de novo.' : ' '}
        </Text>
      </View>

      <CardK1 style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Ionicons name="power" size={26} color={K1.vermelho} />
        <Text style={[k.mut, { flex: 1 }]}>Durante o turno, apertar o botão Power 4 vezes seguidas também envia o pânico, mesmo com o app fechado e a tela bloqueada.</Text>
      </CardK1>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  anel: { width: 230, height: 230, borderRadius: 115, borderWidth: 6, borderColor: 'rgba(225,6,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  botao: {
    width: 200, height: 200, borderRadius: 100, backgroundColor: K1.vermelho, alignItems: 'center', justifyContent: 'center',
    shadowColor: K1.vermelho, shadowOpacity: 0.8, shadowRadius: 24, elevation: 12,
  },
  txt: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  barra: { width: 230, height: 6, borderRadius: 3, backgroundColor: '#222', marginTop: 24, overflow: 'hidden' },
  barraCheia: { height: 6, backgroundColor: K1.vermelho },
});
