import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import type { Checkin } from './empresa';
import type { PontoMapa, PontoRondaMapa } from '../components/MapaVigilante';

export type VigilanteAoVivo = {
  id: string; nome: string; posto: string | null; telefone: string | null; matricula_acesso: string | null;
  ativo: boolean; em_turno: boolean; dispositivo_ativo: boolean; turno_iniciado_em: string | null;
  proximo_checkin: string | null; ultimo_checkin_ok: string | null;
  ultima_lat: number | null; ultima_lng: number | null; ultima_precisao_m: number | null;
  ultima_bateria: number | null; ultimo_carregando: boolean | null; ultimo_wifi: boolean | null; ultimo_wifi_nome: string | null;
  ultima_atualizacao: string | null;
  posto_lat: number | null; posto_lng: number | null; posto_raio_m: number; fora_do_posto: boolean;
};

type PontoBanco = { id: string; nome: string; lat: number | null; lng: number | null };
type Leitura = { ponto_id: string; criado_em: string };

const hhmm = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function distancia(a: PontoMapa, b: PontoMapa) {
  const r = Math.PI / 180, R = 6371000;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
type Leit = { lat: number | null; lng: number | null; precisao_m?: number | null; criado_em: string };
/** Tira do caminho as leituras ruins do GPS (pouca precisão ou "pulos" impossíveis a pé/de moto). */
export function limparCaminho(lista: Leit[]): PontoMapa[] {
  const ok: { lat: number; lng: number; t: number }[] = [];
  for (const p of lista) {
    if (p.lat == null || p.lng == null) continue;
    if (p.precisao_m != null && p.precisao_m > 40) continue;
    const t = new Date(p.criado_em).getTime();
    const ant = ok[ok.length - 1];
    if (ant) {
      const d = distancia(ant, { lat: p.lat, lng: p.lng });
      const seg = Math.max(1, (t - ant.t) / 1000);
      if (d / seg > 35) continue; // mais de ~125 km/h: leitura errada
      if (d < Math.max(8, (p.precisao_m ?? 10) * 0.8)) continue; // parado: tremidinha do GPS
    }
    ok.push({ lat: p.lat, lng: p.lng, t });
  }
  return tirarPicos(ok.map(({ lat, lng }) => ({ lat, lng })));
}
/** Remove "vai e volta" do GPS: um ponto que foge e o seguinte volta para perto do anterior. */
export function tirarPicos(t: PontoMapa[]): PontoMapa[] {
  let lista = t;
  for (let volta = 0; volta < 3; volta++) {
    const out: PontoMapa[] = [];
    for (let i = 0; i < lista.length; i++) {
      const a = out[out.length - 1], p = lista[i], b = lista[i + 1];
      if (a && b) {
        const ida = distancia(a, p), vinda = distancia(p, b), atalho = distancia(a, b);
        if (ida > 12 && vinda > 12 && atalho < 0.4 * Math.min(ida, vinda)) continue;
      }
      out.push(p);
    }
    if (out.length === lista.length) break;
    lista = out;
  }
  return lista;
}

/** Soma do caminho, ignorando "pulos" do GPS. */
export function percorrido(t: PontoMapa[]) {
  let m = 0;
  for (let i = 1; i < t.length; i++) { const d = distancia(t[i - 1], t[i]); if (d < 500) m += d; }
  return m;
}

/**
 * Tudo que o mapa ao vivo de UM vigilante precisa, atualizado em tempo real:
 * posição, caminho do turno, pontos de ronda (lidos ou não), confirmações e alerta aberto.
 */
export function useVigilanteAoVivo(id: string | undefined) {
  const [v, setV] = useState<VigilanteAoVivo | null>(null);
  const [trajeto, setTrajeto] = useState<PontoMapa[]>([]);
  const [pontosBanco, setPontosBanco] = useState<PontoBanco[]>([]);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [alertaAberto, setAlertaAberto] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setAtualizando(true);
    const { data: vg } = await supabase.from('vigilantes').select('*').eq('id', id).maybeSingle();
    const vig = vg as VigilanteAoVivo | null;
    // Caminho desde o início do turno (no máximo 14 h); fora de turno, as últimas 3 h
    const limite = Date.now() - 14 * 3600000;
    const inicio = vig?.em_turno && vig.turno_iniciado_em ? Math.max(new Date(vig.turno_iniciado_em).getTime(), limite) : Date.now() - 3 * 3600000;
    const desde = new Date(inicio).toISOString();
    const [tl, ck, al, pr, rr] = await Promise.all([
      supabase.from('telemetria').select('lat,lng,precisao_m,criado_em').eq('vigilante_id', id).gte('criado_em', desde).order('criado_em').limit(5000),
      supabase.from('checkins').select('id,vigilante_id,resultado,criado_em').eq('vigilante_id', id).order('criado_em', { ascending: false }).limit(6),
      supabase.from('alertas').select('tipo').eq('vigilante_id', id).neq('status', 'resolvido').order('criado_em', { ascending: false }).limit(1),
      supabase.from('pontos_ronda').select('id,nome,lat,lng').eq('ativo', true).order('nome'),
      supabase.from('rondas_registros').select('ponto_id,criado_em').eq('vigilante_id', id).gte('criado_em', desde).order('criado_em'),
    ]);
    setV(vig);
    setTrajeto(limparCaminho((tl.data as Leit[]) ?? []));
    setCheckins((ck.data as Checkin[]) ?? []);
    setAlertaAberto((al.data?.[0] as { tipo: string } | undefined)?.tipo ?? null);
    setPontosBanco((pr.data as PontoBanco[]) ?? []);
    setLeituras((rr.data as Leitura[]) ?? []);
    setAtualizando(false);
  }, [id]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  useEffect(() => {
    if (!id) return;
    const canal = supabase.channel(`k1-aovivo-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vigilantes', filter: `id=eq.${id}` }, p => {
        const n = p.new as VigilanteAoVivo;
        setV(antes => {
          if (antes && !antes.em_turno && n.em_turno) setTimeout(carregar, 300); // turno começou: caminho novo
          return n;
        });
        if (n.em_turno && n.ultima_lat != null && n.ultima_lng != null && (n.ultima_precisao_m ?? 0) <= 60) {
          setTrajeto(t => {
            const ult = t[t.length - 1];
            if (ult && ult.lat === n.ultima_lat && ult.lng === n.ultima_lng) return t;
            if (ult && distancia(ult, { lat: n.ultima_lat!, lng: n.ultima_lng! }) > 1500) return t; // pulo do GPS
            return [...t, { lat: n.ultima_lat!, lng: n.ultima_lng! }].slice(-5000);
          });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rondas_registros', filter: `vigilante_id=eq.${id}` }, p => {
        setLeituras(l => [...l, p.new as Leitura]);
        // Ponto lido pela primeira vez ganha posição no mapa
        supabase.from('pontos_ronda').select('id,nome,lat,lng').eq('ativo', true).order('nome').then(({ data }) => { if (data) setPontosBanco(data as PontoBanco[]); });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins', filter: `vigilante_id=eq.${id}` }, p =>
        setCheckins(c => [p.new as Checkin, ...c].slice(0, 6)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas', filter: `vigilante_id=eq.${id}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [id, carregar]);

  const ultimaLeitura = new Map<string, string>();
  leituras.forEach(l => ultimaLeitura.set(l.ponto_id, l.criado_em));
  const pontos: PontoRondaMapa[] = pontosBanco
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({ nome: p.nome, lat: p.lat!, lng: p.lng!, visitado: ultimaLeitura.has(p.id), hora: ultimaLeitura.has(p.id) ? hhmm(ultimaLeitura.get(p.id)!) : null }));
  const rondaFeitos = pontosBanco.filter(p => ultimaLeitura.has(p.id)).length;

  return { v, trajeto, pontos, rondaFeitos, rondaTotal: pontosBanco.length, checkins, alertaAberto, atualizando, carregar };
}
