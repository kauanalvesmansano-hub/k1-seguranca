/**
 * Player do SOS ao vivo (câmera + áudio). Recebe trechos de ~6 s (base64) e toca
 * um atrás do outro. Usado dentro de uma WebView no app; o painel web tem a mesma lógica.
 */
export const HTML_PLAYER_SOS = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;height:100%;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}
video{width:100%;height:100%;object-fit:contain;background:#000}
#st{position:absolute;left:10px;top:10px;padding:5px 10px;border-radius:14px;background:rgba(0,0,0,.6);font-size:13px;font-weight:700}
#st b{display:inline-block;width:9px;height:9px;border-radius:50%;background:#e10600;margin-right:6px;animation:p 1s infinite}
@keyframes p{50%{opacity:.25}}
#aud{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;font-size:15px;color:#ddd}
#aud i{font-style:normal;font-size:64px}
#tap{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-size:18px;font-weight:800}
</style></head><body>
<video id="v" playsinline autoplay></video>
<div id="aud"><i>🎙</i>Só áudio (sem câmera)</div>
<div id="st"><b></b><span id="sx">Aguardando imagem…</span></div>
<div id="tap">Toque para ouvir</div>
<script>
var fila=[],tocando=false,gravado=false,v=document.getElementById('v'),sx=document.getElementById('sx'),aud=document.getElementById('aud'),tap=document.getElementById('tap'),url=null,ultimo=-1;
function b64(s,mime){var bin=atob(s),n=bin.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=bin.charCodeAt(i);return URL.createObjectURL(new Blob([u],{type:mime}));}
function avisa(){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({fila:fila.length}));}catch(_){}}
function prox(){
  if(!fila.length){tocando=false;sx.textContent='Ao vivo · aguardando próximo trecho…';return;}
  tocando=true;var t=fila.shift();avisa();
  if(url)URL.revokeObjectURL(url);url=b64(t.dados,t.mime);
  aud.style.display=t.tipo==='audio'?'flex':'none';
  v.src=url;var p=v.play();
  if(p&&p.catch)p.catch(function(){tap.style.display='flex';});
  sx.textContent='AO VIVO · trecho '+(t.seq+1)+(fila.length>1?' (atrasado '+(fila.length*6)+' s)':'');
}
tap.onclick=function(){tap.style.display='none';v.play();};
v.onended=prox;v.onerror=prox;
window.addTrechos=function(ts){
  ts.forEach(function(t){if(t.seq>ultimo){ultimo=t.seq;fila.push(t);}});
  // ao vivo: se ficou muito atrasado, pula para os mais recentes (gravação encerrada: toca tudo)
  if(!gravado)while(fila.length>4)fila.shift();
  avisa();
  if(!tocando)prox();
};
window.setStatus=function(txt){sx.textContent=txt;};
window.setGravado=function(g){gravado=!!g;};
document.addEventListener('message',function(e){try{var m=JSON.parse(e.data);if(m.trechos)addTrechos(m.trechos);if(m.status)setStatus(m.status);}catch(_){}});
window.addEventListener('message',function(e){try{var m=JSON.parse(e.data);if(m.trechos)addTrechos(m.trechos);if(m.status)setStatus(m.status);}catch(_){}});
</script></body></html>`;

export type TrechoSos = { seq: number; tipo: 'video' | 'audio'; mime: string; dados: string };
export type AlertaSos = {
  id: string; nome: string; gravando: boolean; encerrado_em: string | null; encerrado_por: string | null;
  lat: number | null; lng: number | null; criado_em: string;
};
export type RespostaSos = { alerta: AlertaSos | null; trechos: TrechoSos[] };
