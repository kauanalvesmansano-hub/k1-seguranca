import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FundoK1, CabecalhoK1, CardK1, Online, K1, s as k } from '../../../components/k1';
import { checkin, lerSessao, meuPlano, meusContatos, sairVigilante, status, turno, type ContatoEmergencia, type MeuPlano, type SessaoVigilante } from '../../../lib/vigilante';
import { traduzErro } from '../../../lib/supabase';
import { ativarPanicoPower, desativarPanicoPower, panicoPowerDisponivel } from '../../../lib/panicoNativo';
import K1Panico from '../../../../modules/k1-panico/src/K1PanicoModule';

function contagem(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

/** Tela inicial do vigilante (modelo: Próxima Senha + Confirmar Senha + Rádio). */
export default function InicioVigilante() {
  const [plano, setPlano] = useState<MeuPlano | null>(null);
  const [contatos, setContatos] = useState<ContatoEmergencia[]>([]);
  useFocusEffect(useCallback(() => {
    (async () => {
      const s = await lerSessao(); if (!s) return;
      try {
        const p = await meuPlano(s); setPlano(p);
        if (p.tipo === 'autonomo') setContatos(await meusContatos(s));
      } catch { /* sem internet */ }
    })();
  }, []));
  const [sessao, setSessao] = useState<SessaoVigilante | null>(null);
  const [online, setOnline] = useState(true);
  const [emTurno, setEmTurno] = useState(false);
  const [proximo, setProximo] = useState<Date | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; cor: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [powerAtivo, setPowerAtivo] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const ultimaVibracao = useRef(0);

  const tratarErro = useCallback(async (e: unknown) => {
    const m = traduzErro(e);
    if (m.includes('encerrado pela empresa')) { Alert.alert('Acesso encerrado', m); router.replace('/'); return; }
    if (m.includes('Acesso suspenso')) { setBloqueado(true); return; }
    if (m.includes('Sem internet')) setOnline(false);
    setMsg({ txt: m, cor: '#ff6b66' });
  }, []);

  const atualizar = useCallback(async () => {
    const s = await lerSessao();
    if (!s) { router.replace('/'); return; }
    setSessao(s);
    try {
      const st = await status(s);
      setOnline(true); setBloqueado(false);
      setEmTurno(st.em_turno);
      setProximo(st.proximo_checkin ? new Date(st.proximo_checkin) : null);
      // Garante que a vigilância do botão Power está ligada durante o turno
      if (st.em_turno) setPowerAtivo(await ativarPanicoPower(s.token, st.homem_caido_min ?? 0).catch(() => false));
      else { await desativarPanicoPower(); setPowerAtivo(false); }
    } catch (e) { tratarErro(e); }
  }, [tratarErro]);

  useFocusEffect(useCallback(() => { atualizar(); }, [atualizar]));
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);

  const restante = proximo ? proximo.getTime() - agora : 0;
  const devido = emTurno && proximo !== null && restante <= 0;

  // Hora da senha: vibra a cada 20 s até confirmar
  useEffect(() => {
    if (devido && agora - ultimaVibracao.current > 20000) {
      ultimaVibracao.current = agora;
      Vibration.vibrate([0, 700, 300, 700, 300, 700]);
      input.current?.focus();
    }
  }, [devido, agora]);

  async function confirmar() {
    if (!sessao || !senha || enviando) return;
    setEnviando(true); setMsg(null);
    try {
      const r = await checkin(sessao, senha, null, null);
      setOnline(true); setSenha('');
      if (r.resultado === 'tentar_novamente') {
        setMsg({ txt: 'Senha incorreta. Tente novamente.', cor: '#ff6b66' });
        input.current?.focus();
      } else {
        // Mesma resposta para senha certa, coação ou erro no limite (o bandido não percebe)
        setMsg({ txt: 'Senha confirmada ✓', cor: K1.verde });
        if (r.proximo_checkin) setProximo(new Date(r.proximo_checkin));
        setTimeout(() => setMsg(null), 3000);
      }
    } catch (e) { tratarErro(e); } finally { setEnviando(false); }
  }

  async function alternarTurno() {
    if (!sessao) return;
    try {
      const r = await turno(sessao, !emTurno);
      setEmTurno(r.em_turno); setProximo(r.proximo_checkin ? new Date(r.proximo_checkin) : null); setOnline(true);
      if (r.em_turno) {
        const st = await status(sessao).catch(() => null);
        setPowerAtivo(await ativarPanicoPower(sessao.token, st?.homem_caido_min ?? 0).catch(() => false));
      }
      else { await desativarPanicoPower(); setPowerAtivo(false); }
    } catch (e) { tratarErro(e); }
  }

  function menu() {
    Alert.alert('Opções', sessao?.empresa, [
      ...(emTurno ? [{ text: 'Encerrar turno', style: 'destructive' as const, onPress: alternarTurno }] : []),
      { text: 'Sair do app', onPress: async () => {
        if (emTurno) { Alert.alert('Encerre o turno antes de sair.'); return; }
        await desativarPanicoPower(); await sairVigilante(); router.replace('/');
      } },
      { text: 'Fechar', style: 'cancel' },
    ]);
  }

  if (!sessao) return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><ActivityIndicator color={K1.vermelho} /></View>;

  return (
    <FundoK1>
      <CabecalhoK1 tipo="vigilante" direita={
        <Pressable onPress={menu} hitSlop={12}><Ionicons name="settings-sharp" size={26} color="#cfcfcf" /></Pressable>
      } />

      <CardK1 style={st.linha}>
        <Ionicons name="person" size={34} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={k.titulo} numberOfLines={1}>{sessao.nome}</Text>
          <Text style={k.mut}>Matrícula: {sessao.matricula}</Text>
        </View>
        <Online online={online} />
      </CardK1>

      {bloqueado ? (
        <CardK1 style={{ alignItems: 'center', gap: 8 }}>
          <Ionicons name="lock-closed" size={42} color={K1.vermelho} />
          <Text style={k.titulo}>Acesso suspenso</Text>
          <Text style={[k.mut, { textAlign: 'center' }]}>O plano da sua empresa está suspenso. Procure seu encarregado.</Text>
        </CardK1>
      ) : !emTurno ? (
        <CardK1 style={{ gap: 12, alignItems: 'center' }}>
          <Ionicons name="time-outline" size={36} color="#fff" />
          <Text style={k.titulo}>Turno não iniciado</Text>
          <Text style={[k.mut, { textAlign: 'center' }]}>Inicie o turno para ativar o monitoramento e a confirmação de senha.</Text>
          <Pressable onPress={alternarTurno} style={{ alignSelf: 'stretch' }}>
            <LinearGradient colors={['#ff1a10', '#b00400']} style={st.botao}>
              <Ionicons name="play" size={22} color="#fff" /><Text style={st.botaoTxt}>Iniciar Turno</Text>
            </LinearGradient>
          </Pressable>
        </CardK1>
      ) : (
        <CardK1 style={{ gap: 14 }}>
          <View style={[st.relogio, devido && { borderColor: K1.vermelho }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="time-outline" size={26} color="#fff" />
              <Text style={[k.titulo, { fontSize: 18 }]}>Próxima Senha</Text>
            </View>
            <Text style={st.contagem}>{devido ? 'AGORA' : contagem(restante)}</Text>
            <Text style={[k.mut, { color: '#e5e5e5', fontSize: 15 }]}>
              {devido ? 'Digite sua senha agora' : 'Digite sua senha na próxima hora'}
            </Text>
          </View>

          <View style={st.campo}>
            <Ionicons name="lock-closed" size={22} color="#e5e5e5" />
            <View style={st.divisor} />
            <TextInput
              ref={input} value={senha} onChangeText={setSenha} placeholder="Digite a senha" placeholderTextColor="#8d939c"
              secureTextEntry={!verSenha} keyboardType="number-pad" maxLength={8} style={st.input} onSubmitEditing={confirmar}
            />
            <Pressable onPress={() => setVerSenha(!verSenha)} hitSlop={10}>
              <Ionicons name={verSenha ? 'eye-outline' : 'eye-off-outline'} size={22} color="#9aa0aa" />
            </Pressable>
          </View>
          <Pressable onPress={confirmar} disabled={enviando}>
            <LinearGradient colors={['#ff1a10', '#b00400']} style={st.botao}>
              {enviando ? <ActivityIndicator color="#fff" /> : <>
                <Ionicons name="checkmark" size={24} color="#fff" /><Text style={st.botaoTxt}>Confirmar Senha</Text>
              </>}
            </LinearGradient>
          </Pressable>
          {msg && <Text style={{ color: msg.cor, textAlign: 'center', fontWeight: '600' }}>{msg.txt}</Text>}
        </CardK1>
      )}

      <CardK1 style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: '#b00400' }}>
        <Ionicons name="power" size={34} color={K1.vermelho} />
        <View style={{ flex: 1 }}>
          <Text style={k.titulo}>Pânico silencioso</Text>
          <Text style={k.mut}>{plano?.tipo === 'autonomo'
            ? 'Aperte o botão Power 4 vezes seguidas. Seus contatos de emergência e a sua empresa recebem a mensagem no WhatsApp, com a sua localização.'
            : 'Aperte o botão Power 4 vezes seguidas. O monitoramento da empresa recebe o alarme na hora, sem aparecer nada no seu celular.'}</Text>
          <Text style={{ fontSize: 12, marginTop: 4, color: !panicoPowerDisponivel ? K1.amarelo : powerAtivo ? K1.verde : K1.mutado }}>
            {!panicoPowerDisponivel ? 'Indisponível nesta versão do app (use o botão SOS)'
              : powerAtivo ? '● Ativo neste turno' : 'Ativa ao iniciar o turno'}
          </Text>
        </View>
      </CardK1>

      {panicoPowerDisponivel && K1Panico && !K1Panico.podeTelaCheia() && (
        <CardK1 style={{ flexDirection: 'row', gap: 10, alignItems: 'center', borderColor: K1.amarelo }} onPress={() => K1Panico?.abrirPermissaoTelaCheia()}>
          <Ionicons name="videocam" size={22} color={K1.amarelo} />
          <Text style={{ color: '#fde68a', flex: 1, fontSize: 13 }}>Toque aqui e permita "tela cheia" para o K1: assim a câmera consegue ligar sozinha no pânico, mesmo com a tela bloqueada.</Text>
        </CardK1>
      )}

      {plano?.tipo === 'autonomo' && (
        <CardK1 style={{ gap: 8 }} onPress={() => router.push('/funcionario/contatos')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="people" size={28} color={contatos.some(c => c.tipo === 'emergencia') ? K1.verde : K1.amarelo} />
            <View style={{ flex: 1 }}>
              <Text style={k.titulo}>Meus contatos de emergência</Text>
              <Text style={k.mut}>{contatos.length ? contatos.map(c => c.nome).join(', ') : 'Nenhum ainda — toque para cadastrar'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={K1.mutado} />
          </View>
          <Text style={{ color: K1.mutado, fontSize: 12 }}>
            Plano do vigilante: R$ {Number(plano.valor).toFixed(2).replace('.', ',')}/mês
            {plano.teste_ate && new Date(plano.teste_ate) > new Date() ? ` · grátis até ${new Date(plano.teste_ate).toLocaleDateString('pt-BR')}` : ''}
          </Text>
        </CardK1>
      )}

      {emTurno && !bloqueado && (
        <Pressable
          onPress={() => Alert.alert('Encerrar turno?', 'O monitoramento, a localização e o pânico pelo Power serão desligados.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Encerrar turno', style: 'destructive', onPress: alternarTurno },
          ])}
          style={({ pressed }) => [st.encerrar, pressed && { opacity: 0.8 }]}>
          <Ionicons name="stop-circle-outline" size={24} color="#fff" />
          <Text style={st.botaoTxt}>Encerrar Turno</Text>
        </Pressable>
      )}
    </FundoK1>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  relogio: { borderWidth: 1, borderColor: '#5a5d65', borderRadius: 12, padding: 14, alignItems: 'center', gap: 4, backgroundColor: '#050506' },
  contagem: { color: K1.vermelho, fontSize: 44, fontWeight: '800', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  campo: {
    flexDirection: 'row', alignItems: 'center', height: 54, borderRadius: 10, borderWidth: 1, borderColor: '#5a5d65',
    backgroundColor: '#111317', paddingHorizontal: 14,
  },
  divisor: { width: 1, height: 26, backgroundColor: '#555a63', marginHorizontal: 12 },
  input: { flex: 1, color: '#fff', fontSize: 17 },
  botao: {
    height: 54, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: '#ff4d47',
  },
  botaoTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  encerrar: {
    height: 54, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#7a0a06', backgroundColor: '#1a0605',
  },
});
