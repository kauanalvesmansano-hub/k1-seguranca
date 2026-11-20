import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, s as k } from '../../../components/k1';
import { traduzErro } from '../../../lib/supabase';
import * as mon from '../../../lib/monitor';
import { centralDisponivel, statusCentral } from '../../../lib/central';

const OBS_RAPIDAS = ['Falso alarme / teste.', 'Confirmado com a pessoa: está bem.', 'Polícia acionada.'];

/** Fila única de alertas de TODAS as contas: atende e resolve um por um (ou vários de uma vez). */
export default function AlertasMonitor() {
  const [lista, setLista] = useState<mon.MonAlerta[]>([]);
  const [res, setRes] = useState<Record<string, number>>({});
  const [atualizando, setAtualizando] = useState(false);
  const [soCrit, setSoCrit] = useState(false);
  const [varios, setVarios] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [resolvendo, setResolvendo] = useState<mon.MonAlerta | 'varios' | null>(null);
  const [obs, setObs] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async (mostrar = false) => {
    if (mostrar) setAtualizando(true);
    try {
      const [a, r] = await Promise.all([mon.alertas(false), mon.resumo()]);
      setLista(a ?? []); setRes(r ?? {});
    } catch (e) {
      if (String((e as Error)?.message).includes('sem_permissao')) router.replace('/monitor/login');
    }
    setAtualizando(false);
  }, []);

  useFocusEffect(useCallback(() => {
    carregar(true);
    timer.current = setInterval(() => carregar(), 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [carregar]));

  async function atender(a: mon.MonAlerta) {
    try { await mon.atender(a.id); carregar(); } catch (e) { Alert.alert('Erro', traduzErro(e)); }
  }
  async function confirmarResolver() {
    try {
      if (resolvendo === 'varios') { await mon.resolverVarios([...sel], obs); setSel(new Set()); setVarios(false); }
      else if (resolvendo) await mon.resolver(resolvendo.id, obs);
      setResolvendo(null); setObs(''); carregar();
    } catch (e) { Alert.alert('Erro', traduzErro(e)); }
  }

  const abertos = lista.filter(a => a.status !== 'resolvido' && (!soCrit || mon.CRITICOS.includes(a.tipo)))
    .sort((a, b) => (a.status === 'aberto' ? 0 : 1) - (b.status === 'aberto' ? 0 : 1)
      || (mon.CRITICOS.includes(a.tipo) ? 0 : 1) - (mon.CRITICOS.includes(b.tipo) ? 0 : 1)
      || new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime());

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={() => carregar(true)} tintColor={K1.vermelho} />}>
      <Text style={st.logo}>K1 <Text style={{ color: K1.vermelho }}>MONITORAMENTO</Text></Text>
      {centralDisponivel && !statusCentral().ativa && (
        <Pressable onPress={() => router.push('/monitor/ajustes')} style={st.ligar}>
          <Ionicons name="alarm" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>Ligar o alarme na tela: tocar como ligação, com voz, a cada disparo (tocar aqui)</Text>
        </Pressable>
      )}
      <View style={st.numeros}>
        <Numero rot="Em turno" v={res.em_turno} />
        <Numero rot="Sem sinal" v={res.sem_sinal} cor={K1.amarelo} />
        <Numero rot="Alertas" v={res.alertas_abertos} cor="#ef4444" />
        <Numero rot="Ao vivo" v={res.sos_ao_vivo} cor={K1.vermelho} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable onPress={() => setSoCrit(!soCrit)} style={[st.chip, soCrit && st.chipOn]}><Text style={st.chipTxt}>Só críticos</Text></Pressable>
        <Pressable onPress={() => { setVarios(!varios); setSel(new Set()); }} style={[st.chip, varios && st.chipOn]}><Text style={st.chipTxt}>{varios ? 'Cancelar seleção' : 'Selecionar vários'}</Text></Pressable>
        {varios && sel.size > 0 && (
          <Pressable onPress={() => { setObs('Falso alarme / teste.'); setResolvendo('varios'); }} style={[st.chip, { backgroundColor: '#15803d', borderColor: '#15803d' }]}>
            <Text style={st.chipTxt}>Resolver {sel.size}</Text>
          </Pressable>
        )}
      </View>

      {abertos.length === 0 && (
        <CardK1 style={{ alignItems: 'center', gap: 8 }}>
          <Ionicons name="shield-checkmark" size={48} color={K1.verde} />
          <Text style={k.titulo}>Nenhum alerta aberto</Text>
          <Text style={k.mut}>Atualiza sozinho a cada 5 segundos.</Text>
        </CardK1>
      )}
      {abertos.map(a => {
        const t = mon.tipo(a.tipo), p = mon.plano(a.plano), vivo = (a.tipo === 'panico' || a.tipo === 'coacao') && (a.sos_gravando || a.trechos > 0);
        const marcado = sel.has(a.id);
        return (
          <CardK1 key={a.id} style={{ gap: 5, borderColor: a.status === 'em_atendimento' ? '#1d4ed8' : t.cor, ...(marcado ? { backgroundColor: '#1f2937' } : {}) }}
            onPress={varios ? () => { const n = new Set(sel); if (marcado) n.delete(a.id); else n.add(a.id); setSel(n); } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexShrink: 1 }}>
                {varios && <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={22} color="#fff" />}
                <Text style={[st.tag, { backgroundColor: t.cor }]}>{t.txt}</Text>
              </View>
              <Text style={[st.tag, { backgroundColor: a.status === 'aberto' ? '#7f1d1d' : '#1e3a8a' }]}>{a.status === 'aberto' ? 'ABERTO' : 'EM ATENDIMENTO'}</Text>
            </View>
            <Text style={k.titulo}>{a.pessoa}{a.profissao === 'caminhoneiro' ? ' 🚚' : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={[st.tag, { backgroundColor: p.cor }]}>{p.txt}</Text>
              <Text style={k.mut}>{a.empresa}{a.local ? ' · ' + a.local : ''}</Text>
            </View>
            <Text style={k.mut}>{mon.ha(a.criado_em)} · {dataHora(a.criado_em)}{a.bateria != null ? ` · 🔋 ${a.bateria}%` : ''}</Text>
            {!!a.detalhe && <Text style={{ color: '#fbbf24' }}>{a.detalhe}</Text>}
            {!!a.atendido_por && <Text style={k.mut}>Atendido por {a.atendido_por}</Text>}
            {!varios && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {a.status === 'aberto' && <Botao txt="ATENDER" cor="#1d4ed8" onPress={() => atender(a)} />}
                <Botao txt="RESOLVER" cor="#15803d" onPress={() => { setObs(''); setResolvendo(a); }} />
                {vivo && <Botao txt="● AO VIVO" cor={K1.vermelho} onPress={() => router.push({ pathname: '/sos/[id]', params: { id: a.id, modo: 'monitor' } })} />}
                {a.lat != null && <Botao txt="MAPA" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${a.lat},${a.lng}`)} />}
                {!!a.telefone && <Botao txt="LIGAR" onPress={() => Linking.openURL(`tel:${a.telefone}`)} />}
                <Botao txt="CONTA" onPress={() => router.push({ pathname: '/monitor/conta/[id]', params: { id: a.empresa_id } })} />
              </View>
            )}
          </CardK1>
        );
      })}

      <Modal visible={!!resolvendo} transparent animationType="fade" onRequestClose={() => setResolvendo(null)}>
        <View style={st.fundoModal}>
          <View style={st.modal}>
            <Text style={k.titulo}>{resolvendo === 'varios' ? `Resolver ${sel.size} alerta(s)` : 'Resolver alerta'}</Text>
            {resolvendo && resolvendo !== 'varios' && <Text style={k.mut}>{mon.tipo(resolvendo.tipo).txt} — {resolvendo.pessoa} · {resolvendo.empresa}</Text>}
            <Text style={[k.mut, { marginTop: 8 }]}>O que aconteceu / o que foi feito (fica no histórico):</Text>
            <TextInput value={obs} onChangeText={setObs} multiline style={st.input} placeholderTextColor="#666" placeholder="Ex.: falso alarme / PM acionada" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {OBS_RAPIDAS.map(o => <Pressable key={o} onPress={() => setObs(o)} style={st.chip}><Text style={st.chipTxt}>{o}</Text></Pressable>)}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <Botao txt="CANCELAR" onPress={() => setResolvendo(null)} />
              <Botao txt="RESOLVER" cor="#15803d" onPress={confirmarResolver} />
            </View>
          </View>
        </View>
      </Modal>
    </FundoK1>
  );
}

function Numero({ rot, v, cor = '#fff' }: { rot: string; v?: number; cor?: string }) {
  return (
    <View style={st.num}>
      <Text style={{ color: cor, fontSize: 22, fontWeight: '900' }}>{v ?? '—'}</Text>
      <Text style={{ color: K1.mutado, fontSize: 11 }}>{rot}</Text>
    </View>
  );
}
function Botao({ txt, cor = '#2a2d35', onPress }: { txt: string; cor?: string; onPress: () => void }) {
  return <Pressable style={[st.btn, { backgroundColor: cor }]} onPress={onPress}><Text style={st.btnTxt}>{txt}</Text></Pressable>;
}

const st = StyleSheet.create({
  ligar: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#991b1b', borderRadius: 10, padding: 12 },
  logo: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  numeros: { flexDirection: 'row', gap: 8 },
  num: { flex: 1, backgroundColor: K1.card, borderWidth: 1, borderColor: '#27272a', borderRadius: 10, padding: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: '#3f3f46', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  chipTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  tag: { color: '#fff', fontWeight: '900', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  btn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  fundoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: '#0b0c0f', borderRadius: 14, borderWidth: 1.5, borderColor: K1.vermelhoBorda, padding: 16, gap: 6 },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#3f3f46', borderRadius: 10, color: '#fff', padding: 10, textAlignVertical: 'top' },
});
