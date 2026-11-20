import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, s as k } from './k1';
import { lerSessao, planoPagamento, sairVigilante, type PlanoPagamento } from '../lib/vigilante';
import { router } from 'expo-router';

const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Trava o app inteiro (abas) quando o plano não está pago.
 * Plano do vigilante e família: mostra o Pix para pagar. Empresa: manda falar com a empresa.
 * Confere de novo ao voltar para o app e a cada 60 s; quando o pagamento é confirmado, libera sozinho.
 */
export function BloqueioPlano({ children }: { children: ReactNode }) {
  const [p, setP] = useState<PlanoPagamento | null>(null);

  const conferir = useCallback(async () => {
    const s = await lerSessao(); if (!s) return;
    try { setP(await planoPagamento(s)); } catch { /* sem internet: não trava por isso */ }
  }, []);

  useEffect(() => {
    conferir();
    const t = setInterval(conferir, 60000);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') conferir(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [conferir]);

  if (!p || p.plano_status === 'ativo') return <>{children}</>;

  const f = p.fatura;
  const pagaSozinho = p.tipo !== 'seguranca';
  return (
    <FundoK1>
      <CardK1 style={{ alignItems: 'center', gap: 10, borderColor: '#ef4444' }}>
        <Ionicons name="lock-closed" size={54} color="#ef4444" />
        <Text style={[k.titulo, { fontSize: 22, color: '#ef4444' }]}>{p.plano_status === 'encerrado' ? 'Plano encerrado' : 'Aplicativo bloqueado'}</Text>
        <Text style={[k.mut, { textAlign: 'center' }]}>
          {pagaSozinho
            ? 'O teste grátis acabou e a mensalidade não foi paga. O aplicativo fica bloqueado até o pagamento ser confirmado.'
            : 'O plano da sua empresa está sem pagamento. O aplicativo fica bloqueado até a empresa pagar. Procure o seu encarregado.'}
        </Text>
      </CardK1>

      {pagaSozinho && f && (
        <CardK1 style={{ gap: 10 }}>
          <Text style={k.titulo}>Pague com Pix</Text>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{dinheiro(Number(f.valor_total))}</Text>
          <Text style={k.mut}>Vencimento: {new Date(f.vencimento + 'T12:00').toLocaleDateString('pt-BR')}{f.status === 'vencida' ? ' (vencida)' : ''}</Text>
          <Text style={k.mut}>Recebedor: {p.pix_nome}</Text>
          <Pressable style={st.btn} onPress={async () => { await Clipboard.setStringAsync(f.pix_copia_cola); Alert.alert('Pix copiado', 'Abra o app do seu banco, escolha Pix Copia e Cola e cole o código.'); }}>
            <Ionicons name="copy-outline" size={20} color="#fff" /><Text style={st.btnTxt}>COPIAR PIX COPIA E COLA</Text>
          </Pressable>
          <Pressable style={[st.btn, { backgroundColor: '#27272a' }]} onPress={async () => { await Clipboard.setStringAsync(f.pix_chave); Alert.alert('Chave Pix copiada', f.pix_chave); }}>
            <Text style={st.btnTxt}>COPIAR SÓ A CHAVE PIX</Text>
          </Pressable>
          <Text style={[k.mut, { fontSize: 12 }]}>Depois de pagar, o aplicativo volta sozinho assim que o pagamento for confirmado.</Text>
        </CardK1>
      )}
      {pagaSozinho && !f && <CardK1><Text style={k.mut}>A cobrança está sendo gerada. Tente de novo em alguns minutos.</Text></CardK1>}

      {!!p.whatsapp_k1 && (
        <Pressable style={[st.btn, { backgroundColor: '#15803d' }]} onPress={() => Linking.openURL(`https://wa.me/${p.whatsapp_k1}`)}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" /><Text style={st.btnTxt}>FALAR COM A K1 SEGURANÇA</Text>
        </Pressable>
      )}
      <Pressable style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#444' }]} onPress={conferir}>
        <Ionicons name="refresh" size={18} color="#fff" /><Text style={st.btnTxt}>JÁ PAGUEI — VERIFICAR</Text>
      </Pressable>
      <Pressable onPress={async () => { await sairVigilante(); router.replace('/'); }} style={{ alignSelf: 'center', padding: 10 }}>
        <Text style={{ color: K1.mutado }}>Sair deste celular</Text>
      </Pressable>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  btn: { height: 52, borderRadius: 10, backgroundColor: K1.vermelho, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnTxt: { color: '#fff', fontWeight: '800' },
});
