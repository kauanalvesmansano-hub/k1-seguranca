import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

export type PontoMapa = { lat: number; lng: number };
export type PontoRondaMapa = { nome: string; lat: number; lng: number; visitado: boolean; hora?: string | null };

/**
 * Mapa ao vivo no estilo de app de entrega: mapa claro e limpo, o vigilante como um
 * "boneco" com as iniciais que desliza suavemente até a nova posição, o caminho
 * percorrido no turno, a cerca do posto e os pontos de ronda (verde = já passou).
 */
export function MapaVigilante({
  posicao, precisao, trajeto, cor = '#22c55e', altura = 360, posto, nome = '', pontos = [], cheio = false,
}: {
  posicao: PontoMapa | null; precisao?: number | null; trajeto: PontoMapa[]; cor?: string; altura?: number;
  posto?: { lat: number; lng: number; raio: number } | null; nome?: string; pontos?: PontoRondaMapa[];
  /** Ocupa a tela toda (sem borda nem cantos). */
  cheio?: boolean;
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
.vig{position:relative;width:52px;height:52px}
.vig .pulso{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:var(--c);opacity:.35;animation:p 1.8s ease-out infinite}
@keyframes p{0%{transform:scale(.5);opacity:.5}100%{transform:scale(1.9);opacity:0}}
.vig .bola{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#111;border:3px solid var(--c);
  color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35)}
.vig .seta{position:absolute;left:50%;top:50%;width:0;height:0;margin:-34px 0 0 -7px;border-left:7px solid transparent;border-right:7px solid transparent;
  border-bottom:11px solid var(--c);transform-origin:7px 34px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))}
.nomevig{position:absolute;top:50px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#111;color:#fff;font-size:11px;font-weight:700;
  padding:3px 8px;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.pin{width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff}
.pin span{transform:rotate(45deg);color:#fff;font-size:12px;font-weight:800}
.inicio{width:14px;height:14px;border-radius:50%;background:#fff;border:4px solid #111;box-shadow:0 1px 4px rgba(0,0,0,.4)}
.btn{position:absolute;right:12px;z-index:999;width:44px;height:44px;border-radius:22px;background:#fff;border:0;box-shadow:0 2px 8px rgba(0,0,0,.25);
  font-size:20px;display:flex;align-items:center;justify-content:center}
#seguir{bottom:16px}#tudo{bottom:68px}
#seguir.on{background:#111;color:#fff}
</style>
</head><body><div id="m"></div>
<button class="btn on" id="seguir" title="Seguir o vigilante">◎</button>
<button class="btn" id="tudo" title="Ver o caminho todo">⤢</button>
<script>
var mapa = L.map('m', { zoomControl: false, attributionControl: true }).setView([-15.78, -47.93], 4);
// Mapa limpo no estilo de app de entrega (OpenFreeMap: grátis, sem chave). Sem WebGL, usa o OpenStreetMap comum.
try {
  if (!window.maplibregl || !maplibregl.supported()) throw 0;
  L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty', attribution: '© OpenFreeMap © OpenStreetMap' }).addTo(mapa);
} catch (e) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
}

var vig = null, precisaoC = null, contorno = null, linha = null, inicio = null, cerca = null, grupoPontos = L.layerGroup().addTo(mapa);
var atual = null, anim = null, seguir = true, primeiro = true, ultimoDados = null;
var bSeguir = document.getElementById('seguir'), bTudo = document.getElementById('tudo');
function setSeguir(v){ seguir = v; bSeguir.className = 'btn' + (v ? ' on' : ''); if (v && atual) mapa.panTo(atual); }
bSeguir.onclick = function(){ setSeguir(true); if (atual) mapa.setView(atual, Math.max(mapa.getZoom(), 17)); };
bTudo.onclick = function(){ setSeguir(false); enquadrar(); };
mapa.on('dragstart', function(){ setSeguir(false); });

function iniciais(n){ var p = (n || '').trim().split(/\\s+/); return ((p[0]||'')[0]||'V').toUpperCase() + ((p.length>1 ? p[p.length-1][0] : '')||'').toUpperCase(); }
function rumo(a, b){
  var r = Math.PI/180, y = Math.sin((b[1]-a[1])*r)*Math.cos(b[0]*r),
      x = Math.cos(a[0]*r)*Math.sin(b[0]*r) - Math.sin(a[0]*r)*Math.cos(b[0]*r)*Math.cos((b[1]-a[1])*r);
  return (Math.atan2(y, x)*180/Math.PI + 360) % 360;
}
function iconeVig(d, ang){
  return L.divIcon({ className: '', iconSize: [52, 52], iconAnchor: [26, 26], html:
    '<div class="vig" style="--c:' + d.cor + '"><div class="pulso"></div>' +
    (ang == null ? '' : '<div class="seta" style="transform:rotate(' + ang + 'deg)"></div>') +
    '<div class="bola">' + iniciais(d.nome) + '</div>' +
    (d.nome ? '<div class="nomevig">' + d.nome.split(' ')[0] + '</div>' : '') + '</div>' });
}
function enquadrar(){
  var pts = [];
  if (ultimoDados) {
    (ultimoDados.trajeto || []).forEach(function(p){ pts.push([p.lat, p.lng]); });
    (ultimoDados.pontos || []).forEach(function(p){ pts.push([p.lat, p.lng]); });
    if (ultimoDados.posto) pts.push([ultimoDados.posto.lat, ultimoDados.posto.lng]);
  }
  if (atual) pts.push(atual);
  if (pts.length > 1) mapa.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 18 });
  else if (pts.length === 1) mapa.setView(pts[0], 17);
}
// Desliza o boneco até a nova posição (como o entregador no app)
function mover(para, ang, d){
  if (anim) cancelAnimationFrame(anim);
  var de = atual || para, t0 = performance.now(), dur = atual ? 1400 : 0;
  vig.setIcon(iconeVig(d, ang));
  function passo(t){
    var k = dur ? Math.min(1, (t - t0) / dur) : 1, e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2)/2;
    var ll = [de[0] + (para[0]-de[0])*e, de[1] + (para[1]-de[1])*e];
    vig.setLatLng(ll); if (precisaoC) precisaoC.setLatLng(ll);
    if (seguir && !primeiro) mapa.panTo(ll, { animate: false });
    if (k < 1) anim = requestAnimationFrame(passo); else { atual = para; anim = null; }
  }
  anim = requestAnimationFrame(passo);
}

window.atualizar = function (d) {
  ultimoDados = d;
  // Cerca virtual do posto
  if (cerca) { cerca.remove(); cerca = null; }
  if (d.posto) cerca = L.circle([d.posto.lat, d.posto.lng], { radius: d.posto.raio, color: '#2563eb', weight: 2, dashArray: '6 6', fillColor: '#3b82f6', fillOpacity: 0.08 }).addTo(mapa);

  // Caminho percorrido no turno
  var cam = (d.trajeto || []).map(function (p) { return [p.lat, p.lng]; });
  if (d.posicao) cam.push([d.posicao.lat, d.posicao.lng]);
  if (contorno) { contorno.remove(); contorno = null; } if (linha) { linha.remove(); linha = null; } if (inicio) { inicio.remove(); inicio = null; }
  if (cam.length > 1) {
    contorno = L.polyline(cam, { color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(mapa);
    linha = L.polyline(cam, { color: '#e10600', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(mapa);
    inicio = L.marker(cam[0], { icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="inicio"></div>' }) })
      .bindTooltip('Início do turno').addTo(mapa);
  }

  // Pontos de ronda
  grupoPontos.clearLayers();
  (d.pontos || []).forEach(function (p, i) {
    var corP = p.visitado ? '#16a34a' : '#6b7280';
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 26],
      html: '<div class="pin" style="background:' + corP + '"><span>' + (p.visitado ? '✓' : (i + 1)) + '</span></div>' }) })
      .bindTooltip(p.nome + (p.visitado && p.hora ? ' · ' + p.hora : p.visitado ? '' : ' · falta passar'), { direction: 'top', offset: [0, -24] })
      .addTo(grupoPontos);
  });

  // Vigilante
  if (!d.posicao) { if (vig) { vig.remove(); vig = null; atual = null; } if (precisaoC) { precisaoC.remove(); precisaoC = null; } if (primeiro && (d.pontos||[]).length) { enquadrar(); } return; }
  var ll = [d.posicao.lat, d.posicao.lng];
  var ant = cam.length > 1 ? cam[cam.length - 2] : null;
  var ang = ant && (Math.abs(ant[0]-ll[0]) + Math.abs(ant[1]-ll[1]) > 0.00002) ? rumo(ant, ll) : null;
  if (!vig) vig = L.marker(ll, { icon: iconeVig(d, ang), zIndexOffset: 1000 }).addTo(mapa);
  if (d.precisao && d.precisao > 15) {
    if (!precisaoC) precisaoC = L.circle(ll, { radius: d.precisao, color: d.cor, weight: 0, fillOpacity: 0.10 }).addTo(mapa);
    else precisaoC.setRadius(d.precisao);
  } else if (precisaoC) { precisaoC.remove(); precisaoC = null; }
  mover(ll, ang, d);
  if (primeiro) { mapa.setView(ll, 17); primeiro = false; }
};
</script></body></html>`, []);

  const dados = JSON.stringify({ posicao, precisao: precisao ?? null, trajeto, cor, posto: posto ?? null, nome, pontos });
  useEffect(() => {
    if (pronto.current) ref.current?.injectJavaScript(`window.atualizar(${dados}); true;`);
  }, [dados]);

  return (
    <View style={[cheio ? { flex: 1 } : st.caixa, !cheio && { height: altura }]}>
      <WebView
        ref={ref}
        source={{ html }}
        originWhitelist={['*']}
        style={{ flex: 1, backgroundColor: '#eef0f3' }}
        onLoadEnd={() => { pronto.current = true; ref.current?.injectJavaScript(`window.atualizar(${dados}); true;`); }}
        setSupportMultipleWindows={false}
      />
      {!posicao && pontos.length === 0 && (
        <View style={st.vazio} pointerEvents="none">
          <Ionicons name="location-outline" size={36} color="#9aa0aa" />
          <Text style={{ color: '#d0d4da', textAlign: 'center' }}>Sem localização ainda.{'\n'}Aparece quando o vigilante iniciar o turno.</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  caixa: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2d35' },
  vazio: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
