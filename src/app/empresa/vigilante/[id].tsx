import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, dataHora, horaCurta, s as k } from '../../../components/k1';
import { MapaVigilante } from '../../../components/MapaVigilante';
import { useVigilanteAoVivo, percorrido, type VigilanteAoVivo } from '../../../lib/aoVivo';
import { supabase, traduzErro } from '../../../lib/supabase';
import { RESULTADO } from '../../../lib/empresa';

type Vigilante = VigilanteAoVivo;

const minutosDesde = (d: string | null) => (d ? Math.round((Date.now() - new Date(d).getTime()) / 60000) : null);
const tempo = (min: number | null) =>
  min == null ? '—' : min < 1 ? 'agora' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

/** Informações de UM vigilante: mapa, bateria, Wi-Fi, confirmações e ações. */
export default function DetalheVigilante() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { v, trajeto, pontos, rondaFeitos, rondaTotal, checkins, alertaAberto, atualizando, carregar } = useVigilanteAoVivo(id);
  const [, setRelogio] = useState(0);
  const [trocarSenha, setTrocarSenha] = useState(false);
  useEffect(() => { const t = setInterval(() => setRelogio(x => x + 1), 30000); return () => clearInterval(t); }, []);

  if (!v) return <FundoK1><Text style={[k.mut, { marginTop: 40, textAlign: 'center' }]}>Carregando…</Text></FundoK1>;

  const min = minutosDesde(v.ultima_atualizacao);
  const semSinal = v.em_turno && (min == null || min > 10);
  const status = alertaAberto ? { txt: `ALERTA: ${alertaAberto.replace('_', ' ').toUpperCase()}`, cor: '#ef4444' }
    : !v.ativo ? { txt: 'Desativado', cor: '#64748b' }
    : !v.em_turno ? { txt: 'Fora de turno', cor: '#64748b' }
    : semSinal ? { txt: 'Sem sinal', cor: K1.amarelo }
    : v.fora_do_posto ? { txt: 'Fora do posto', cor: K1.amarelo }
    : { txt: 'Em turno — OK', cor: K1.verde };
  const posicao = v.ultima_lat != null && v.ultima_lng != null ? { lat: v.ultima_lat, lng: v.ultima_lng } : null;
  const bat = v.ultima_bateria;
  const corBat = bat == null ? K1.mutado : bat < 20 ? '#ef4444' : bat < 50 ? K1.amarelo : K1.verde;
  const iconeBat = bat == null ? 'battery-dead-outline' : v.ultimo_carregando ? 'battery-charging' : bat < 20 ? 'battery-dead' : bat < 60 ? 'battery-half' : 'battery-full';

  async function definirPosto(raio: number | null) {
    if (!v) return;
    const { error } = await supabase.rpc('definir_posto', {
      p_vigilante_id: v.id, p_lat: raio ? v.ultima_lat : null, p_lng: raio ? v.ultima_lng : null, p_raio_m: raio ?? 150,
    });
    if (error) Alert.alert('Erro', traduzErro(error)); else carregar();
  }

  async function acao(nome: 'desconectar' | 'ativo') {
    if (!v) return;
    if (nome === 'desconectar') {
      const { error } = await supabase.rpc('revogar_dispositivo', { p_vigilante_id: v.id });
      if (error) Alert.alert('Erro', traduzErro(error)); else carregar();
    } else {
      const { error } = await supabase.from('vigilantes').update({ ativo: !v.ativo }).eq('id', v.id);
      if (error) Alert.alert('Erro', traduzErro(error)); else carregar();
    }
  }

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <View style={st.topo}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[k.titulo, { fontSize: 20 }]} numberOfLines={1}>{v.nome}</Text>
          <Text style={k.mut} numberOfLines={1}>{v.posto || 'Sem posto'} · Matrícula {v.matricula_acesso}</Text>
        </View>
      </View>

      <View style={[st.status, { borderColor: status.cor }]}>
        <View style={[st.bolinha, { backgroundColor: status.cor }]} />
        <Text style={{ color: status.cor, fontWeight: '800', letterSpacing: 0.5 }}>{status.txt}</Text>
        {v.em_turno && v.turno_iniciado_em && <Text style={[k.mut, { marginLeft: 'auto' }]}>desde {horaCurta(v.turno_iniciado_em)}</Text>}
      </View>

      <MapaVigilante posicao={v.em_turno ? posicao : null} precisao={v.ultima_precisao_m} trajeto={v.em_turno ? trajeto : []} cor={status.cor}
        nome={v.nome} pontos={pontos}
        posto={v.posto_lat != null && v.posto_lng != null ? { lat: v.posto_lat, lng: v.posto_lng, raio: v.posto_raio_m } : null} />

      <Pressable style={st.aoVivo} onPress={() => router.push({ pathname: '/empresa/ao-vivo/[id]', params: { id: v.id } })}>
        <Ionicons name="expand" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Acompanhar ao vivo (tela cheia)</Text>
      </Pressable>

      <View style={st.grade}>
        <CardK1 style={st.item}>
          <Ionicons name="walk" size={26} color="#fff" />
          <Text style={[st.valor, { fontSize: 18 }]}>{v.em_turno ? `${(percorrido(trajeto) / 1000).toFixed(2)} km` : '—'}</Text>
          <Text style={k.mut}>No turno</Text>
        </CardK1>
        <CardK1 style={st.item}>
          <Ionicons name="qr-code" size={26} color={rondaTotal && rondaFeitos === rondaTotal ? K1.verde : '#fff'} />
          <Text style={[st.valor, { fontSize: 18 }]}>{rondaTotal ? `${rondaFeitos}/${rondaTotal}` : '—'}</Text>
          <Text style={k.mut}>Pontos de ronda</Text>
        </CardK1>
      </View>

      <CardK1 style={{ gap: 10 }}>
        <View style={st.linha}>
          <Text style={[k.titulo, { fontSize: 16 }]}>Cerca virtual do posto</Text>
          <Text style={{ color: v.posto_lat == null ? K1.mutado : v.fora_do_posto ? K1.amarelo : K1.verde, fontWeight: '700' }}>
            {v.posto_lat == null ? 'Desligada' : v.fora_do_posto ? 'FORA' : `${v.posto_raio_m} m`}
          </Text>
        </View>
        <Text style={k.mut}>Se o vigilante sair da área do posto, a empresa recebe o alerta "Fora do posto".</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[100, 200, 500].map(r => (
            <Pressable key={r} style={st.btn} disabled={!posicao} onPress={() => definirPosto(r)}>
              <Text style={[st.btnTxt, !posicao && { opacity: 0.4 }]}>Posto aqui · {r} m</Text>
            </Pressable>
          ))}
          {v.posto_lat != null && (
            <Pressable style={[st.btn, { backgroundColor: '#3f3f46' }]} onPress={() => definirPosto(null)}><Text style={st.btnTxt}>Desligar</Text></Pressable>
          )}
        </View>
        {!posicao && <Text style={[k.mut, { fontSize: 12 }]}>Para definir, o vigilante precisa estar no posto com o turno iniciado.</Text>}
      </CardK1>

      <View style={st.grade}>
        <CardK1 style={st.item}>
          <Ionicons name={iconeBat} size={28} color={corBat} />
          <Text style={[st.valor, { color: corBat }]}>{bat != null ? `${bat}%` : '—'}</Text>
          <Text style={k.mut}>{v.ultimo_carregando ? 'Carregando' : 'Bateria'}</Text>
        </CardK1>
        <CardK1 style={st.item}>
          <Ionicons name={v.ultimo_wifi ? 'wifi' : v.ultimo_wifi === false ? 'cellular' : 'help-circle-outline'} size={28} color="#fff" />
          <Text style={st.valor} numberOfLines={1}>{v.ultimo_wifi ? 'Wi-Fi' : v.ultimo_wifi === false ? 'Dados' : '—'}</Text>
          <Text style={k.mut} numberOfLines={1}>{v.ultimo_wifi ? v.ultimo_wifi_nome || 'Conectado' : v.ultimo_wifi === false ? 'Rede móvel' : 'Conexão'}</Text>
        </CardK1>
        <CardK1 style={st.item}>
          <Ionicons name="pulse" size={28} color={semSinal ? K1.amarelo : '#fff'} />
          <Text style={[st.valor, { fontSize: 16 }]}>{tempo(min)}</Text>
          <Text style={k.mut}>Último sinal</Text>
        </CardK1>
      </View>

      <CardK1 style={{ gap: 8 }}>
        <View style={st.linha}><Text style={k.mut}>Última senha correta</Text><Text style={st.forte}>{v.ultimo_checkin_ok ? dataHora(v.ultimo_checkin_ok) : '—'}</Text></View>
        <View style={st.linha}><Text style={k.mut}>Próxima senha</Text><Text style={st.forte}>{v.em_turno ? horaCurta(v.proximo_checkin) : '—'}</Text></View>
        <View style={st.linha}><Text style={k.mut}>Precisão do GPS</Text><Text style={st.forte}>{v.ultima_precisao_m != null ? `${Math.round(v.ultima_precisao_m)} m` : '—'}</Text></View>
        <View style={st.linha}><Text style={k.mut}>Celular</Text><Text style={st.forte}>{v.dispositivo_ativo ? 'Conectado ao app' : 'Não entrou no app'}</Text></View>
      </CardK1>

      <CardK1 style={{ gap: 10 }}>
        <Text style={[k.titulo, { fontSize: 16 }]}>Últimas confirmações</Text>
        {checkins.length === 0 && <Text style={k.mut}>Nenhuma confirmação ainda.</Text>}
        {checkins.map(c => (
          <View key={c.id} style={[st.linha, { gap: 10 }]}>
            <Ionicons name={RESULTADO[c.resultado].icone} size={20} color={RESULTADO[c.resultado].cor} />
            <Text style={{ color: '#e5e5e5', flex: 1 }}>{RESULTADO[c.resultado].txt}</Text>
            <Text style={k.mut}>{dataHora(c.criado_em)}</Text>
          </View>
        ))}
      </CardK1>

      <View style={st.acoes}>
        {posicao && (
          <Pressable style={st.btn} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${posicao.lat},${posicao.lng}`)}>
            <Ionicons name="navigate" size={18} color="#fff" /><Text style={st.btnTxt}>Google Maps</Text>
          </Pressable>
        )}
        {!!v.telefone && (
          <Pressable style={st.btn} onPress={() => Linking.openURL(`tel:${v.telefone}`)}>
            <Ionicons name="call" size={18} color="#fff" /><Text style={st.btnTxt}>Ligar</Text>
          </Pressable>
        )}
        <Pressable style={st.btn} onPress={() => setTrocarSenha(true)}>
          <Ionicons name="key" size={18} color="#fff" /><Text style={st.btnTxt}>Trocar senhas</Text>
        </Pressable>
        {v.dispositivo_ativo && (
          <Pressable style={st.btn} onPress={() => Alert.alert('Desconectar celular?', 'Ele terá que entrar no app de novo.', [
            { text: 'Cancelar', style: 'cancel' }, { text: 'Desconectar', style: 'destructive', onPress: () => acao('desconectar') }])}>
            <Ionicons name="phone-portrait" size={18} color="#fff" /><Text style={st.btnTxt}>Desconectar</Text>
          </Pressable>
        )}
        <Pressable style={[st.btn, { backgroundColor: v.ativo ? '#7f1d1d' : '#15803d' }]} onPress={() => acao('ativo')}>
          <Ionicons name={v.ativo ? 'person-remove' : 'person-add'} size={18} color="#fff" /><Text style={st.btnTxt}>{v.ativo ? 'Desativar' : 'Reativar'}</Text>
        </Pressable>
      </View>

      <ModalSenhas visivel={trocarSenha} vigilanteId={v.id} onFechar={() => setTrocarSenha(false)} />
    </FundoK1>
  );
}

function ModalSenhas({ visivel, vigilanteId, onFechar }: { visivel: boolean; vigilanteId: string; onFechar: () => void }) {
  const [senha, setSenha] = useState('');
  const [coacao, setCoacao] = useState('');
  const [erro, setErro] = useState('');
  useEffect(() => { if (visivel) { setSenha(''); setCoacao(''); setErro(''); } }, [visivel]);
  async function salvar() {
    const { error } = await supabase.rpc('alterar_senhas_vigilante', { p_vigilante_id: vigilanteId, p_senha: senha, p_senha_coacao: coacao });
    if (error) { setErro(traduzErro(error)); return; }
    onFechar(); Alert.alert('Senhas alteradas', 'Avise o vigilante pessoalmente.');
  }
  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={st.modalFundo}>
        <CardK1 style={{ gap: 12, width: '100%' }}>
          <Text style={[k.titulo, { fontSize: 18 }]}>Trocar senhas</Text>
          <TextInput style={st.input} placeholder="Senha normal (4 a 8 números)" placeholderTextColor="#777" keyboardType="number-pad" secureTextEntry maxLength={8} value={senha} onChangeText={setSenha} />
          <TextInput style={st.input} placeholder="Senha de coação (4 a 8 números)" placeholderTextColor="#777" keyboardType="number-pad" secureTextEntry maxLength={8} value={coacao} onChangeText={setCoacao} />
          {!!erro && <Text style={{ color: '#ff6b66' }}>{erro}</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={[st.btn, { flex: 1, justifyContent: 'center' }]} onPress={onFechar}><Text style={st.btnTxt}>Cancelar</Text></Pressable>
            <Pressable style={[st.btn, { flex: 1, justifyContent: 'center', backgroundColor: K1.vermelho }]} onPress={salvar}><Text style={st.btnTxt}>Salvar</Text></Pressable>
          </View>
        </CardK1>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 10, padding: 12, backgroundColor: '#0b0c0f' },
  bolinha: { width: 12, height: 12, borderRadius: 6 },
  grade: { flexDirection: 'row', gap: 10 },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, paddingHorizontal: 6 },
  valor: { color: '#fff', fontSize: 22, fontWeight: '800' },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  forte: { color: '#fff', fontWeight: '700' },
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aoVivo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 12, backgroundColor: K1.vermelho },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2a2d35', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10 },
  btnTxt: { color: '#fff', fontWeight: '700' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 },
  input: { height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#444', color: '#fff', paddingHorizontal: 12, fontSize: 16, backgroundColor: '#111317' },
});
