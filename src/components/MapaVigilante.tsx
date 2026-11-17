import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

export type PontoMapa = { lat: number; lng: number };

/**
 * Mapa (OpenStreetMap + Leaflet dentro de uma WebView) com a posição do
 * vigilante, o raio de precisão do GPS e o trajeto recente.
 */
export function MapaVigilante({ posicao, precisao, trajeto, cor = '#22c55e', altura = 300 }: {
  posicao: PontoMapa | null; precisao?: number | null; trajeto: PontoMapa[]; cor?: string; altura?: number;
}) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const pronto = useRef(false);

  const html = useMemo(() => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#0b0c0f}.leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="m"></div><script>
var mapa = L.map('m', { zoomControl: true }).setView([-15.78, -47.93], 4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
var marcador = null, circulo = null, linha = null, primeiro = true;
window.atualizar = function (d) {
  if (linha) { linha.remove(); linha = null; }
  if (d.trajeto && d.trajeto.length > 1) {
    linha = L.polyline(d.trajeto.map(function (p) { return [p.lat, p.lng]; }), { color: '#e10600', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(mapa);
  }
  if (!d.posicao) return;
  var ll = [d.posicao.lat, d.posicao.lng];
  if (!marcador) {
    marcador = L.circleMarker(ll, { radius: 10, color: '#fff', weight: 3, fillColor: d.cor, fillOpacity: 1 }).addTo(mapa);
  } else { marcador.setLatLng(ll).setStyle({ fillColor: d.cor }); }
  if (circulo) circulo.remove();
  if (d.precisao) circulo = L.circle(ll, { radius: d.precisao, color: d.cor, weight: 1, fillOpacity: 0.12 }).addTo(mapa);
  if (primeiro) { mapa.setView(ll, 17); primeiro = false; } else { mapa.panTo(ll); }
};
</script></body></html>`, []);

  const dados = JSON.stringify({ posicao, precisao: precisao ?? null, trajeto, cor });
  useEffect(() => {
    if (pronto.current) ref.current?.injectJavaScript(`window.atualizar(${dados}); true;`);
  }, [dados]);

  return (
    <View style={[st.caixa, { height: altura }]}>
      <WebView
        ref={ref}
        source={{ html }}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: '#0b0c0f' }}
        onLoadEnd={() => { pronto.current = true; ref.current?.injectJavaScript(`window.atualizar(${dados}); true;`); }}
        setSupportMultipleWindows={false}
      />
      {!posicao && (
        <View style={st.vazio} pointerEvents="none">
          <Ionicons name="location-outline" size={36} color="#9aa0aa" />
          <Text style={{ color: '#d0d4da', textAlign: 'center' }}>Sem localização ainda.{'\n'}Aparece quando o vigilante iniciar o turno.</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  caixa: { borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#7a0a06' },
  vazio: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
