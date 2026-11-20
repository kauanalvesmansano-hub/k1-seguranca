import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export type PontoMon = { id: string; lat: number; lng: number; cor: string; titulo: string; texto: string; grande?: boolean };

/** Mapa com várias pessoas (K1 Monitoramento). Toque no ponto abre o nome; toque no nome chama onAbrir(id). */
export function MapaPontos({ pontos, altura = 420, onAbrir }: { pontos: PontoMon[]; altura?: number | `${number}%`; onAbrir?: (id: string) => void }) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const pronto = useRef(false);
  const ultimo = useRef('');

  const html = useMemo(() => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#0b0c0f} .leaflet-popup-content{font:14px system-ui} a{color:#e10600;font-weight:700}</style>
</head><body><div id="m"></div><script>
const m = L.map('m', { zoomControl:false }).setView([-15.8, -47.9], 4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(m);
const g = L.layerGroup().addTo(m); let centrou = false;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function abrir(id){ window.ReactNativeWebView.postMessage(id); }
window.mostrar = function(lista){
  g.clearLayers();
  lista.forEach(p => L.circleMarker([p.lat, p.lng], { radius:p.grande ? 11 : 8, color:'#000', weight:1, fillColor:p.cor, fillOpacity:.95 })
    .bindPopup('<b>' + esc(p.titulo) + '</b><br>' + esc(p.texto) + '<br><a href="#" onclick="abrir(\\'' + p.id + '\\');return false">Abrir</a>').addTo(g));
  if (!centrou && lista.length) { m.fitBounds(L.latLngBounds(lista.map(p => [p.lat, p.lng])).pad(0.25), { maxZoom:14 }); centrou = true; }
};
window.ReactNativeWebView.postMessage('pronto');
</script></body></html>`, []);

  const enviar = () => {
    const json = JSON.stringify(pontos);
    if (!pronto.current || json === ultimo.current) return;
    ultimo.current = json;
    ref.current?.injectJavaScript(`window.mostrar(${json});true;`);
  };
  useEffect(enviar, [pontos]);

  return (
    <View style={{ height: altura, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#27272a' }}>
      <WebView ref={ref} originWhitelist={['*']} source={{ html }} style={{ backgroundColor: '#0b0c0f' }}
        onMessage={e => { const d = e.nativeEvent.data; if (d === 'pronto') { pronto.current = true; ultimo.current = ''; enviar(); } else onAbrir?.(d); }} />
    </View>
  );
}
