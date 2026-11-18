import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export type PessoaMapa = {
  id: string; nome: string; lat: number; lng: number; cor: string; eu?: boolean; bateria?: number | null;
  area?: { lat: number; lng: number; raio: number } | null;
};

/**
 * Mapa da família: todo mundo no mesmo mapa, com bolinha de iniciais, nome e bateria.
 * Toque numa pessoa (focoId) para centralizar nela.
 */
export function MapaFamilia({ pessoas, focoId, altura = 380, cheio = false }: {
  pessoas: PessoaMapa[]; focoId?: string | null; altura?: number; cheio?: boolean;
}) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const pronto = useRef(false);

  const html = useMemo(() => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.3/leaflet-maplibre-gl.js"></script>
<style>
html,body,#m{margin:0;height:100%;background:#eef0f3;font-family:-apple-system,Roboto,Arial,sans-serif}
.leaflet-control-attribution{font-size:8px;opacity:.7}
.p{position:relative;width:50px;height:50px}
.p .pulso{position:absolute;left:50%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;background:var(--c);opacity:.3;animation:pp 2s ease-out infinite}
@keyframes pp{0%{transform:scale(.5);opacity:.5}100%{transform:scale(1.8);opacity:0}}
.p .bola{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#111;border:3px solid var(--c);
  color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35)}
.p .nm{position:absolute;top:48px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#111;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px}
.p .bt{position:absolute;top:-6px;right:-10px;background:#fff;color:#111;font-size:10px;font-weight:800;padding:1px 5px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.3)}
</style></head><body><div id="m"></div><script>
var mapa = L.map('m', { zoomControl: false }).setView([-15.78, -47.93], 4);
try { if (!window.maplibregl || !maplibregl.supported()) throw 0;
  L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty', attribution: '© OpenFreeMap © OpenStreetMap' }).addTo(mapa);
} catch (e) { L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa); }
var marc = {}, areas = L.layerGroup().addTo(mapa), primeiro = true, focoAnt = null;
function ini(n){ var p=(n||'').trim().split(/\\s+/); return ((p[0]||'?')[0] + (p.length>1 ? p[p.length-1][0] : '')).toUpperCase(); }
function icone(p){ return L.divIcon({ className:'', iconSize:[50,50], iconAnchor:[25,25], html:
  '<div class="p" style="--c:'+p.cor+'"><div class="pulso"></div><div class="bola">'+ini(p.nome)+'</div>' +
  (p.bateria!=null ? '<div class="bt">'+p.bateria+'%</div>' : '') + '<div class="nm">'+(p.eu?'Você':p.nome.split(' ')[0])+'</div></div>' }); }
function deslizar(m, para){ var de=m.getLatLng(), t0=performance.now();
  function f(t){ var k=Math.min(1,(t-t0)/1200), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; m.setLatLng([de.lat+(para[0]-de.lat)*e, de.lng+(para[1]-de.lng)*e]); if(k<1) requestAnimationFrame(f); }
  requestAnimationFrame(f); }
window.atualizar = function(d){
  var vistos = {};
  areas.clearLayers();
  d.pessoas.forEach(function(p){
    vistos[p.id] = 1; var ll = [p.lat, p.lng];
    if (!marc[p.id]) marc[p.id] = L.marker(ll, { icon: icone(p), zIndexOffset: p.eu ? 500 : 1000 }).addTo(mapa);
    else { marc[p.id].setIcon(icone(p)); deslizar(marc[p.id], ll); }
    if (p.area) L.circle([p.area.lat, p.area.lng], { radius: p.area.raio, color: '#2563eb', weight: 2, dashArray: '6 6', fillColor: '#3b82f6', fillOpacity: .06 }).addTo(areas);
  });
  Object.keys(marc).forEach(function(id){ if(!vistos[id]){ marc[id].remove(); delete marc[id]; } });
  if (d.foco && marc[d.foco] && d.foco !== focoAnt) { mapa.setView(marc[d.foco].getLatLng(), 17); }
  focoAnt = d.foco;
  if (primeiro && d.pessoas.length) {
    if (d.pessoas.length === 1) mapa.setView([d.pessoas[0].lat, d.pessoas[0].lng], 16);
    else mapa.fitBounds(L.latLngBounds(d.pessoas.map(function(p){ return [p.lat, p.lng]; })), { padding: [60, 60], maxZoom: 16 });
    primeiro = false;
  }
};
</script></body></html>`, []);

  const dados = JSON.stringify({ pessoas, foco: focoId ?? null });
  useEffect(() => { if (pronto.current) ref.current?.injectJavaScript(`window.atualizar(${dados}); true;`); }, [dados]);

  return (
    <View style={cheio ? { flex: 1 } : { height: altura, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2d35' }}>
      <WebView ref={ref} source={{ html }} originWhitelist={['*']} style={{ flex: 1, backgroundColor: '#eef0f3' }}
        onLoadEnd={() => { pronto.current = true; ref.current?.injectJavaScript(`window.atualizar(${dados}); true;`); }}
        setSupportMultipleWindows={false} />
    </View>
  );
}
