import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { FundoK1, CardK1, K1, brl, s as k } from '../../components/k1';
import { carregarPlano, dataBR, mesAno, responderRenovacao, type Plano } from '../../lib/empresa';
import { supabase, traduzErro } from '../../lib/supabase';

const STATUS_FATURA = {
  aberta: { txt: 'Aguardando pagamento', cor: K1.amarelo },
  vencida: { txt: 'Vencida', cor: '#ef4444' },
  paga: { txt: 'Paga', cor: K1.verde },
  cancelada: { txt: 'Cancelada', cor: '#888' },
} as const;

/** Plano e pagamento: fatura do mês, Pix, renovação e tela de bloqueio. */
export default function PlanoEmpresa() {
  const [p, setP] = useState<Plano | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [obrigado, setObrigado] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setP(await carregarPlano());
    setCarregando(false);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function responder(renovar: boolean) {
    if (!p?.fatura) return;
    if (!renovar) {
      const ok = await new Promise<boolean>(res => Alert.alert('Não continuar o plano?',
        'Todo o acesso (painel e app dos vigilantes) será encerrado no fim do mês.',
        [{ text: 'Voltar', style: 'cancel', onPress: () => res(false) }, { text: 'Não continuar', style: 'destructive', onPress: () => res(true) }]));
      if (!ok) return;
    }
    setRespondendo(true);
    try {
      const r = await responderRenovacao(p.fatura.id, renovar);
      if (renovar) setObrigado(r.mensagem); else Alert.alert('Plano não renovado', r.mensagem);
      await carregar();
    } catch (e) { Alert.alert('Erro', traduzErro(e)); } finally { setRespondendo(false); }
  }

  async function copiar(texto: string, oque: string) {
    await Clipboard.setStringAsync(texto);
    Alert.alert('Copiado!', `${oque} copiado. Cole no app do seu banco.`);
  }

  function enviarComprovante() {
    if (!p?.whatsapp_k1 || !p.fatura) return;
    const msg = `Olá! Segue o comprovante do Pix K1 Segurança — fatura ${mesAno(p.fatura.competencia)} — ${brl(p.fatura.valor_total)}.`;
    Linking.openURL(`https://wa.me/${p.whatsapp_k1}?text=${encodeURIComponent(msg)}`);
  }

  async function sair() { await supabase.auth.signOut(); router.replace('/'); }

  if (carregando && !p) return <FundoK1><ActivityIndicator color={K1.vermelho} style={{ marginTop: 60 }} /></FundoK1>;
  if (!p) return <FundoK1><Text style={k.mut}>Não foi possível carregar o plano.</Text></FundoK1>;

  const f = p.fatura;
  const bloqueado = p.plano_status !== 'ativo';
  const pendente = f && (f.status === 'aberta' || f.status === 'vencida');

  return (
    <FundoK1 refresh={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <View style={st.topo}>
        {!bloqueado && <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>}
        <Text style={[k.titulo, { fontSize: 22 }]}>Plano e pagamento</Text>
      </View>

      {p.plano_status === 'bloqueado' && (
        <CardK1 style={{ borderColor: '#ef4444', alignItems: 'center', gap: 8 }}>
          <Ionicons name="lock-closed" size={44} color="#ef4444" />
          <Text style={[k.titulo, { color: '#ef4444' }]}>Acesso bloqueado</Text>
          <Text style={[k.mut, { textAlign: 'center' }]}>
            A fatura venceu sem pagamento. O painel e o app dos vigilantes estão bloqueados. Pague o Pix abaixo: o acesso volta assim que o pagamento for confirmado.
          </Text>
        </CardK1>
      )}
      {p.plano_status === 'encerrado' && (
        <CardK1 style={{ alignItems: 'center', gap: 8 }}>
          <Ionicons name="pause-circle" size={44} color={K1.amarelo} />
          <Text style={k.titulo}>Plano encerrado</Text>
          <Text style={[k.mut, { textAlign: 'center' }]}>Sua empresa optou por não continuar. Deseja reativar o plano?</Text>
          {f && <Pressable style={st.btnVerde} onPress={() => responder(true)}><Text style={st.btnTxt}>SIM, REATIVAR O PLANO</Text></Pressable>}
        </CardK1>
      )}

      {p.em_teste && p.teste_ate && (
        <CardK1 style={{ borderColor: '#16a34a', backgroundColor: '#052e16', gap: 4 }}>
          <Text style={{ color: '#4ade80', fontWeight: '900', fontSize: 16 }}>🎁 TESTE GRÁTIS</Text>
          <Text style={{ color: '#d1fae5' }}>
            {(() => { const d = Math.max(0, Math.ceil((new Date(p.teste_ate).getTime() - Date.now()) / 86400000)); return d <= 1 ? 'Último dia de teste' : `Faltam ${d} dias`; })()}
            {' '}(até {new Date(p.teste_ate).toLocaleDateString('pt-BR')}). Depois, a 1ª fatura sai proporcional ao mês.
          </Text>
        </CardK1>
      )}

      <CardK1 style={{ gap: 6 }}>
        <Text style={k.mut}>Seu plano</Text>
        <Text style={[k.titulo, { fontSize: 20 }]}>
          {p.vigilantes_contratados} vigilantes × {brl(p.valor_por_vigilante)} = {brl(p.previa_total)}/mês
        </Text>
        <Text style={k.mut}>{p.vigilantes_ativos} com acesso ativo no momento</Text>
        <Text style={[k.mut, { fontSize: 12 }]}>Até 15 vigilantes: R$ 25,00 cada · mais de 15: R$ 20,00 cada.</Text>
      </CardK1>

      {!f ? (
        <CardK1><Text style={k.mut}>Nenhuma fatura ainda. A fatura do mês é gerada no fechamento (a partir do dia 25).</Text></CardK1>
      ) : (
        <CardK1 style={{ gap: 12 }}>
          <View style={st.linha}>
            <Text style={k.titulo}>Fatura de {mesAno(f.competencia)}</Text>
            <Text style={{ color: STATUS_FATURA[f.status].cor, fontWeight: '700' }}>{STATUS_FATURA[f.status].txt}</Text>
          </View>
          <View style={st.conta}>
            <Text style={st.contaTxt}>{f.qtd_vigilantes} vigilantes × {brl(f.valor_unitario)}</Text>
            <Text style={st.total}>{brl(f.valor_total)}</Text>
            <Text style={k.mut}>Vencimento: {dataBR(f.vencimento)}</Text>
          </View>

          {pendente && (
            <>
              <View style={{ alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 12, alignSelf: 'center' }}>
                <QRCode value={f.pix_copia_cola} size={190} />
              </View>
              <Text style={[k.mut, { textAlign: 'center' }]}>Pague com o QR code ou com o Pix copia e cola. Favorecido: {p.pix_nome}</Text>
              <Pressable style={st.btnVermelho} onPress={() => copiar(f.pix_copia_cola, 'Pix copia e cola')}>
                <Ionicons name="copy" size={20} color="#fff" /><Text style={st.btnTxt}>COPIAR PIX COPIA E COLA</Text>
              </Pressable>
              <Pressable style={st.btnContorno} onPress={() => copiar(f.pix_chave, 'Chave Pix')}>
                <Text style={{ color: '#ddd' }}>Chave Pix: <Text style={{ color: '#fff', fontWeight: '700' }}>{f.pix_chave}</Text></Text>
                <Ionicons name="copy-outline" size={18} color="#ddd" />
              </Pressable>
              {!!p.whatsapp_k1 && (
                <Pressable style={st.btnContorno} onPress={enviarComprovante}>
                  <Ionicons name="logo-whatsapp" size={20} color={K1.verde} /><Text style={{ color: '#fff', fontWeight: '700' }}>Enviar comprovante</Text>
                </Pressable>
              )}
            </>
          )}
        </CardK1>
      )}

      {f && f.status !== 'cancelada' && p.plano_status === 'ativo' && (
        <CardK1 style={{ gap: 12 }}>
          <Text style={[k.titulo, { textAlign: 'center' }]}>Deseja continuar o plano no próximo mês?</Text>
          {f.renovar === null ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={[st.btnVerde, { flex: 1 }]} disabled={respondendo} onPress={() => responder(true)}>
                <Text style={st.btnTxt}>SIM, CONTINUAR</Text>
              </Pressable>
              <Pressable style={[st.btnContorno, { flex: 1 }]} disabled={respondendo} onPress={() => responder(false)}>
                <Text style={{ color: '#ddd', fontWeight: '700' }}>NÃO</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[k.mut, { textAlign: 'center', color: f.renovar ? K1.verde : K1.amarelo }]}>
              {f.renovar ? '✓ Plano renovado para o próximo mês.' : 'Você escolheu não continuar. O acesso encerra no fim do mês.'}
            </Text>
          )}
          {f.renovar === false && (
            <Pressable onPress={() => responder(true)}><Text style={{ color: K1.vermelho, textAlign: 'center', fontWeight: '700' }}>Mudei de ideia, quero continuar</Text></Pressable>
          )}
        </CardK1>
      )}

      {bloqueado && (
        <Pressable onPress={sair} style={st.btnContorno}><Text style={{ color: '#ddd', fontWeight: '700' }}>Sair da conta</Text></Pressable>
      )}

      <Modal visible={!!obrigado} transparent animationType="fade" onRequestClose={() => setObrigado(null)}>
        <View style={st.modalFundo}>
          <CardK1 style={{ alignItems: 'center', gap: 14, width: '100%' }}>
            <Ionicons name="shield-checkmark" size={70} color={K1.verde} />
            <Text style={[k.titulo, { fontSize: 22, textAlign: 'center' }]}>Plano renovado!</Text>
            <Text style={{ color: '#e5e5e5', fontSize: 17, textAlign: 'center', lineHeight: 25 }}>{obrigado}</Text>
            <Pressable style={[st.btnVermelho, { alignSelf: 'stretch' }]} onPress={() => setObrigado(null)}>
              <Text style={st.btnTxt}>OK</Text>
            </Pressable>
          </CardK1>
        </View>
      </Modal>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conta: { alignItems: 'center', gap: 4, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#222' },
  contaTxt: { color: '#e5e5e5', fontSize: 16 },
  total: { color: '#fff', fontSize: 38, fontWeight: '900' },
  btnVermelho: { height: 52, borderRadius: 10, backgroundColor: K1.vermelho, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnVerde: { height: 52, borderRadius: 10, backgroundColor: '#15803d', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnContorno: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#444', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 12 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 },
});
