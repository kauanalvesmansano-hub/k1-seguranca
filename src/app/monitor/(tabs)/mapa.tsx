import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FundoK1, K1 } from '../../../components/k1';
import { MapaSatelite, type MapaSateliteRef } from '../../../components/MapaSatelite';
import { LinhaPessoa } from '../../../components/MonLinhaPessoa';
import { supabase } from '../../../lib/supabase';
import * as mon from '../../../lib/monitor';

const INICIO = Date.now(); // "Tempo online" desde que o monitoramento foi aberto

function relogio(ms: number) {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

/** Painel do K1 MONITORAMENTO (visual da central K1): status, mapa de satélite, dispositivo selecionado e números. */
export default function PainelMonitor() {
  const mapa = useRef<MapaSateliteRef>(null);
  const [pes, setPes] = useState<mon.MonPessoa[]>([]);
  const [res, setRes] = useState<Record<string, number>>({});
  const [modo, setModo] = useState<'mapa' | 'lista'>('mapa');
  const [sel, setSel] = useState<string | null>(null);
  const [conexao, setConexao] = useState<number | null>(null); // 100 / 70 / 40 / 0
  const [end, setEnd] = useState('');
  const [agora, setAgora] = useState(Date.now());
  const [atualizando, setAtualizando] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    const t0 = Date.now();
    try {
      const [p, r] = await Promise.all([mon.pessoas(), mon.resumo()]);
      const ms = Date.now() - t0;
      setConexao(ms < 900 ? 100 : ms < 2500 ? 70 : 40);
      setPes(p ?? []); setRes(r ?? {});
    } catch (e) {
      setConexao(0);
      if (String((e as Error)?.message).includes('sem_permissao')) router.replace('/monitor/login');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar();
    timer.current = setInterval(carregar, 15000);
    const rel = setInterval(() => setAgora(Date.now()), 1000);
    return () => { if (timer.current) clearInterval(timer.current); clearInterval(rel); };
  }, [carregar]));

  // quem aparece no mapa: em turno ou com alerta, com posição
  const visiveis = useMemo(() => pes.filter(p => p.lat != null && p.lng != null && (p.em_turno || p.alerta)), [pes]);
  const pinos = useMemo(() => visiveis.map(p => ({
    id: p.id, lat: p.lat as number, lng: p.lng as number, online: mon.online(p), alerta: !!p.alerta,
    nome: (p.profissao === 'caminhoneiro' ? '🚚 ' : '') + p.nome, quando: mon.ha(p.atualizado),
  })), [visiveis]);

  // seleciona sozinho: quem tem alerta primeiro, senão o primeiro online
  useEffect(() => {
    if (sel && visiveis.some(p => p.id === sel)) return;
    const s = visiveis.find(p => p.alerta) ?? visiveis.find(p => mon.online(p)) ?? visiveis[0];
    setSel(s?.id ?? null);
  }, [visiveis, sel]);

  const d = pes.find(p => p.id === sel) ?? null;
  useEffect(() => {
    setEnd('');
    if (d?.lat != null && d?.lng != null) mon.endereco(d.lat, d.lng).then(setEnd);
  }, [d?.id, d?.lat, d?.lng]);

  async function sair() { await supabase.auth.signOut(); router.replace('/'); }
  async function atualizar() { setAtualizando(true); await carregar(); setAtualizando(false); }

  const conTxt = conexao == null ? 'Verificando…' : conexao === 0 ? 'Sem conexão' : conexao === 100 ? 'Conexão Estável' : 'Conexão lenta';
  const conCor = conexao === 0 ? '#ef4444' : conexao === 100 || conexao == null ? K1.verde : K1.amarelo;
  const ativos = res.em_turno ?? 0, total = res.pessoas ?? 0, alertas = res.alertas_abertos ?? 0;
  const parado = d?.movimento_em ? Date.now() - new Date(d.movimento_em).getTime() > 10 * 60000 : true;
  const turno = pes.filter(p => p.em_turno || p.alerta).sort((a, b) => Number(!!b.alerta) - Number(!!a.alerta));

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={K1.vermelho} />}>
      {/* Logo + ações */}
      <View style={st.topo}>
        <Image source={require('../../../../assets/k1-mon-lobo.jpg')} style={st.lobo} resizeMode="cover" />
        <View style={{ flex: 1 }}>
          <Text style={st.marca}>K1 <Text style={{ color: K1.vermelho }}>SEGURANÇA</Text></Text>
          <Text style={st.marcaSub}>MONITORAMENTO INTELIGENTE{'\n'}EM TEMPO REAL</Text>
        </View>
        <Pressable onPress={() => router.push('/monitor/ajustes')} style={st.iconeBtn} hitSlop={6}><Ionicons name="settings-sharp" size={22} color="#d4d4d8" /></Pressable>
        <Pressable onPress={sair} style={st.iconeBtn} hitSlop={6}><Ionicons name="power" size={22} color="#d4d4d8" /></Pressable>
      </View>

      {/* Barra de status */}
      <View style={[st.card, st.status]}>
        <View style={st.statusItem}>
          <View style={[st.bola, { backgroundColor: conexao === 0 ? '#ef4444' : K1.verde }]} />
          <View><Text style={[st.stTit, { color: conexao === 0 ? '#ef4444' : '#4ade80' }]}>{conexao === 0 ? 'Monitoramento Parado' : 'Monitoramento Ativo'}</Text><Text style={st.stSub}>{conexao === 0 ? 'Sistema offline' : 'Sistema Online'}</Text></View>
        </View>
        <View style={st.divisor} />
        <View style={st.statusItem}>
          <MaterialCommunityIcons name="wifi" size={24} color={K1.vermelho} />
          <View><Text style={st.stTit}>{conTxt}</Text><Text style={[st.stSub, { color: conCor, fontWeight: '800' }]}>{conexao == null ? '—' : `${conexao}%`}</Text></View>
        </View>
      </View>

      {/* Mapa / Lista */}
      <View style={[st.card, { padding: 0, overflow: 'hidden' }, modo === 'mapa' ? { height: 400 } : null]}>
        <View style={st.abasMapa}>
          <Pressable onPress={() => setModo('mapa')} style={[st.abaMapa, modo === 'mapa' && st.abaOn]}><Ionicons name="map" size={16} color="#fff" /><Text style={st.abaTxt}>Mapa</Text></Pressable>
          <Pressable onPress={() => setModo('lista')} style={[st.abaMapa, modo === 'lista' && st.abaOn]}><Ionicons name="list" size={18} color="#fff" /><Text style={st.abaTxt}>Lista</Text></Pressable>
        </View>
        {modo === 'mapa' ? (
          <>
            <MapaSatelite ref={mapa} pinos={pinos} selecionado={sel} onSelecionar={setSel} />
            <View style={st.zoom}>
              <Pressable style={st.zoomBtn} onPress={() => mapa.current?.zoom(1)}><Ionicons name="add" size={24} color="#fff" /></Pressable>
              <Pressable style={st.zoomBtn} onPress={() => mapa.current?.zoom(-1)}><Ionicons name="remove" size={24} color="#fff" /></Pressable>
              <Pressable style={st.zoomBtn} onPress={() => mapa.current?.centralizar()}><MaterialCommunityIcons name="crosshairs-gps" size={22} color="#fff" /></Pressable>
            </View>
            {pinos.length === 0 && <View style={st.vazio} pointerEvents="none"><Text style={st.vazioTxt}>Ninguém em turno com localização agora.</Text></View>}
          </>
        ) : (
          <View style={{ padding: 12, paddingTop: 58, gap: 10 }}>
            {turno.length === 0 && <Text style={st.stSub}>Ninguém em turno agora.</Text>}
            {turno.map(p => <LinhaPessoa key={p.id} p={p} />)}
          </View>
        )}
      </View>

      {/* Dispositivo selecionado */}
      <View style={st.card}>
        <View style={st.cardTitulo}>
          <MaterialCommunityIcons name="cellphone" size={24} color={K1.vermelho} /><Text style={st.cardTit}>Dispositivo</Text>
          {d && <Pressable onPress={() => router.push({ pathname: '/monitor/pessoa/[id]', params: { id: d.id } })} style={{ marginLeft: 'auto' }}><Text style={{ color: '#f87171', fontWeight: '700' }}>Abrir ›</Text></Pressable>}
        </View>
        {!d ? <Text style={st.stSub}>Toque num pino do mapa para ver o dispositivo.</Text> : (
          <>
            <Text style={[st.linhaVal, { fontWeight: '800', marginBottom: 2 }]}>{d.profissao === 'caminhoneiro' ? '🚚 ' : ''}{d.nome}</Text>
            <Text style={[st.stSub, { marginBottom: 6 }]}>{d.empresa}{d.local ? ' · ' + d.local : ''}</Text>
            <Linha rot="Status" val={d.alerta ? mon.tipo(d.alerta.tipo).txt : mon.online(d) ? 'Online' : 'Sem sinal'}
              cor={d.alerta ? '#ef4444' : mon.online(d) ? '#4ade80' : '#a1a1aa'} bola />
            <Linha rot="Bateria" val={d.bateria != null ? `${d.bateria}%${d.carregando ? ' ⚡' : ''}` : '—'}
              cor={d.bateria == null ? '#a1a1aa' : d.bateria < 20 ? '#ef4444' : d.bateria < 40 ? K1.amarelo : '#4ade80'} icone="battery-high" />
            <Linha rot="Última conexão" val={mon.ha(d.atualizado).replace(/^agora$/, 'Agora')} />
            <Text style={[st.linhaRot, { marginTop: 6 }]}>Endereço:</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Ionicons name="location" size={16} color={K1.vermelho} />
              <Text style={st.linhaVal}>{end || (d.lat != null ? 'buscando…' : 'sem localização')}</Text>
            </View>
          </>
        )}
      </View>

      {d && (
        <View style={st.card}>
          <View style={st.cardTitulo}><MaterialCommunityIcons name="chart-bar" size={24} color={K1.vermelho} /><Text style={st.cardTit}>Movimentação</Text></View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <MaterialCommunityIcons name={parado ? 'human-male' : 'run-fast'} size={34} color={K1.vermelho} />
            <View>
              <Text style={st.linhaVal}>{d.movimento_em ? (parado ? 'Parado' : 'Movimento detectado') : 'Sem movimento nas últimas 6 h'}</Text>
              {!!d.movimento_em && <Text style={{ color: '#4ade80', fontWeight: '700' }}>{parado ? 'último movimento ' : ''}{mon.ha(d.movimento_em)}</Text>}
            </View>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable style={st.btnContorno} onPress={() => { setModo('mapa'); setTimeout(() => mapa.current?.centralizar(), 300); }}>
          <MaterialCommunityIcons name="crosshairs-gps" size={22} color={K1.vermelho} /><Text style={st.btnTxt}>Centralizar</Text>
        </Pressable>
        <Pressable style={st.btnContorno} onPress={atualizar}>
          <Ionicons name="refresh" size={22} color={K1.vermelho} /><Text style={st.btnTxt}>Atualizar Mapa</Text>
        </Pressable>
      </View>

      {/* Números */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Numero icone="shield-check" rot="Dispositivos Ativos" val={`${ativos} / ${total}`} />
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/monitor/alertas')}>
          <Numero icone="alert" rot="Alertas Recentes" val={String(alertas)} cor={alertas ? '#ef4444' : '#fff'} />
        </Pressable>
        <Numero icone="timer-outline" rot="Tempo Online" val={relogio(agora - INICIO)} />
      </View>

      <View style={st.rodape}>
        <Text style={st.lema}>SUA SEGURANÇA,{'\n'}<Text style={{ color: K1.vermelho }}>NOSSO COMPROMISSO!</Text></Text>
        <Image source={require('../../../../assets/k1-cyber.jpg')} style={{ width: 150, height: 51 }} resizeMode="contain" />
      </View>
    </FundoK1>
  );
}

function Linha({ rot, val, cor = '#fff', bola, icone }: { rot: string; val: string; cor?: string; bola?: boolean; icone?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  return (
    <View style={st.linha}>
      <Text style={st.linhaRot}>{rot}:</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
        {bola && <View style={[st.bola, { width: 12, height: 12, backgroundColor: cor }]} />}
        {icone && <MaterialCommunityIcons name={icone} size={18} color={cor} />}
        <Text style={[st.linhaVal, { color: cor, fontWeight: '700' }]}>{val}</Text>
      </View>
    </View>
  );
}
function Numero({ icone, rot, val, cor = '#fff' }: { icone: keyof typeof MaterialCommunityIcons.glyphMap; rot: string; val: string; cor?: string }) {
  return (
    <View style={[st.card, st.numero]}>
      <MaterialCommunityIcons name={icone} size={26} color={K1.vermelho} />
      <Text style={st.numRot} numberOfLines={2}>{rot}</Text>
      <Text style={[st.numVal, { color: cor }]} adjustsFontSizeToFit numberOfLines={1}>{val}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lobo: { width: 64, height: 64, borderRadius: 12, borderWidth: 1, borderColor: K1.vermelhoBorda },
  marca: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 1, fontStyle: 'italic' },
  marcaSub: { color: '#d4d4d8', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  iconeBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#111114', borderWidth: 1, borderColor: '#27272a', alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: 'rgba(10,10,12,0.94)', borderWidth: 1.5, borderColor: '#4a0b08', borderRadius: 14, padding: 14,
    shadowColor: '#ff1a1a', shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  status: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  statusItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  divisor: { width: 1, height: 34, backgroundColor: '#3f3f46', marginHorizontal: 8 },
  bola: { width: 16, height: 16, borderRadius: 8 },
  stTit: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stSub: { color: '#a1a1aa', fontSize: 12 },
  abasMapa: { position: 'absolute', top: 10, left: 10, zIndex: 10, flexDirection: 'row', backgroundColor: 'rgba(10,10,12,0.9)', borderRadius: 10, overflow: 'hidden' },
  abaMapa: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
  abaOn: { backgroundColor: K1.vermelho },
  abaTxt: { color: '#fff', fontWeight: '800' },
  zoom: { position: 'absolute', left: 10, top: 70, gap: 8, zIndex: 10 },
  zoomBtn: { width: 42, height: 42, borderRadius: 8, backgroundColor: 'rgba(10,10,12,0.9)', alignItems: 'center', justifyContent: 'center' },
  vazio: { position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' },
  vazioTxt: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  cardTitulo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardTit: { color: '#fff', fontWeight: '900', fontSize: 17 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: 10 },
  linhaRot: { color: '#d4d4d8', fontSize: 15 },
  linhaVal: { color: '#fff', fontSize: 15, flexShrink: 1 },
  btnContorno: { flex: 1, height: 52, borderRadius: 10, borderWidth: 1.5, borderColor: K1.vermelho, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(10,10,12,0.9)' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  numero: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 12 },
  numRot: { color: '#d4d4d8', fontSize: 11, textAlign: 'center' },
  numVal: { fontSize: 20, fontWeight: '900' },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10 },
  lema: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
