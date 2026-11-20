import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export type PinoMon = { id: string; lat: number; lng: number; online: boolean; alerta: boolean; nome: string; quando: string };
export type MapaSateliteRef = { centralizar: () => void; zoom: (d: number) => void };

/** Mapa de satélite escuro no estilo da central K1 (pino vermelho com pessoa, ondas pulsando, balão "Dispositivo Online"). */
export const MapaSatelite = forwardRef<MapaSateliteRef, { pinos: PinoMon[]; selecionado: string | null; onSelecionar: (id: string) => void }>(
  function MapaSatelite({ pinos, selecionado, onSelecionar }, ref) {
    const web = useRef<ComponentRef<typeof WebView>>(null);
    const pronto = useRef(false);
    const ultimo = useRef('');

    const html = useMemo(() => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#m{margin:0;height:100%;background:#050505}
.leaflet-tile-pane{filter:brightness(.62) saturate(.75) contrast(1.08)}
.leaflet-control-attribution{background:rgba(0,0,0,.55)!important;color:#999!important;font-size:9px}
.leaflet-control-attribution a{color:#bbb!important}
.pino{position:relative;width:46px;height:58px}
.pino .gota{position:absolute;left:5px;top:0;width:36px;height:36px;background:#e10600;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 0 14px #ff1a1a}
.pino .gota.off{background:#52525b;box-shadow:none}
.pino .ico{position:absolute;left:14px;top:8px;width:18px;height:18px}
.pino .onda{position:absolute;left:3px;top:38px;width:40px;height:16px;border:2px solid #ff2a2a;border-radius:50%;opacity:0;animation:onda 2s infinite}
.pino .onda.b{animation-delay:.7s}.pino .onda.c{animation-delay:1.4s}
@keyframes onda{0%{transform:scale(.3);opacity:.9}100%{transform:scale(2.6);opacity:0}}
.balao{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(10,10,12,.92);border:1.5px solid #e10600;border-radius:8px;padding:6px 10px;font:600 12px system-ui;color:#fff;box-shadow:0 0 12px rgba(225,6,0,.5)}
.balao b{color:#4ade80}.balao.al b{color:#f87171}.balao.off b{color:#a1a1aa}
.balao small{display:block;font-weight:500;color:#e5e5e5;margin-top:2px}
.bussola{position:absolute;right:10px;top:10px;z-index:500;background:rgba(10,10,12,.85);border-radius:8px;padding:4px 7px;text-align:center;color:#fff;font:800 13px system-ui}
.bussola svg{display:block;margin:0 auto 1px}
</style></head><body><div id="m"></div>
<div class="bussola"><svg width="16" height="18" viewBox="0 0 16 18"><path d="M8 0 L16 18 L8 13 L0 18Z" fill="#e10600"/></svg>N</div>
<script>
const m = L.map('m', { zoomControl:false, attributionControl:true }).setView([-15.8, -47.9], 4);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom:19, attribution:'Imagens © Esri' }).addTo(m);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom:19, opacity:.75 }).addTo(m);
const g = L.layerGroup().addTo(m); let lista = [], sel = null, centrou = false;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICO = '<svg class="ico" viewBox="0 0 24 24" style="transform:rotate(45deg)"><circle cx="12" cy="8" r="4.2" fill="#fff"/><path d="M3.5 21c0-4.7 3.8-7.5 8.5-7.5s8.5 2.8 8.5 7.5z" fill="#fff"/></svg>';
function icone(p, ativo){
  const cls = p.alerta ? 'al' : (p.online ? '' : 'off');
  const titulo = p.alerta ? 'ALERTA' : (p.online ? 'Dispositivo Online' : 'Sem sinal');
  return L.divIcon({ className:'', iconSize:[46,58], iconAnchor:[23,52], html:
    '<div class="pino">' + (p.online || p.alerta ? '<div class="onda"></div><div class="onda b"></div><div class="onda c"></div>' : '') +
    '<div class="gota ' + (p.online || p.alerta ? '' : 'off') + '">' + ICO + '</div>' +
    (ativo ? '<div class="balao ' + cls + '"><b>● ' + titulo + '</b> ' + esc(p.nome) + '<small>Última atualização: ' + esc(p.quando) + '</small></div>' : '') + '</div>' });
}
function desenhar(){
  g.clearLayers();
  lista.forEach(p => {
    const mk = L.marker([p.lat, p.lng], { icon:icone(p, p.id === sel), zIndexOffset:p.id === sel ? 1000 : (p.alerta ? 500 : 0) }).addTo(g);
    mk.on('click', () => window.ReactNativeWebView.postMessage(p.id));
  });
}
window.mostrar = function(l, s){
  lista = l; const mudou = s !== sel; sel = s; desenhar();
  if (!centrou && lista.length) { centralizar(); centrou = true; }
  else if (mudou) { const p = lista.find(x => x.id === sel); if (p) m.flyTo([p.lat, p.lng], Math.max(m.getZoom(), 15), { duration:.8 }); }
};
window.centralizar = function(){
  const p = lista.find(x => x.id === sel);
  if (p) m.flyTo([p.lat, p.lng], 16, { duration:.8 });
  else if (lista.length) m.fitBounds(L.latLngBounds(lista.map(x => [x.lat, x.lng])).pad(0.25), { maxZoom:15 });
};
window.zoom = d => d > 0 ? m.zoomIn() : m.zoomOut();
window.ReactNativeWebView.postMessage('pronto');
</script></body></html>`, []);

    const enviar = () => {
      const json = JSON.stringify(pinos);
      const chave = json + '|' + selecionado;
      if (!pronto.current || chave === ultimo.current) return;
      ultimo.current = chave;
      web.current?.injectJavaScript(`window.mostrar(${json}, ${JSON.stringify(selecionado)});true;`);
    };
    useEffect(enviar, [pinos, selecionado]);
    useImperativeHandle(ref, () => ({
      centralizar: () => web.current?.injectJavaScript('window.centralizar();true;'),
      zoom: (d: number) => web.current?.injectJavaScript(`window.zoom(${d});true;`),
    }));

    return (
      <View style={{ flex: 1, backgroundColor: '#050505' }}>
        <WebView ref={web} originWhitelist={['*']} source={{ html }} style={{ backgroundColor: '#050505' }}
          onMessage={e => { const d = e.nativeEvent.data; if (d === 'pronto') { pronto.current = true; ultimo.current = ''; enviar(); } else onSelecionar(d); }} />
      </View>
    );
  });
