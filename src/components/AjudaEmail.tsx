import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { esqueciSenha, reenviarConfirmacao, traduzErro } from '../lib/supabase';

/** "Reenviar e-mail de confirmação" e "Esqueci a senha", com espera de 60 s entre pedidos. */
export function AjudaEmail({ email }: { email: string }) {
  const [msg, setMsg] = useState<{ txt: string; ok: boolean } | null>(null);
  const [espera, setEspera] = useState(0);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function rodar(acao: (e: string) => Promise<void>, ok: string) {
    if (espera > 0) return;
    setMsg(null);
    try { await acao(email); setMsg({ txt: ok, ok: true }); setEspera(60); }
    catch (e) { setMsg({ txt: traduzErro(e), ok: false }); }
  }

  return (
    <View style={s.caixa}>
      <View style={s.linha}>
        <Pressable onPress={() => rodar(reenviarConfirmacao, 'E-mail de confirmação reenviado. Veja a caixa de entrada e o Spam.')} hitSlop={8} disabled={espera > 0}>
          <Text style={[s.link, espera > 0 && s.off]}>Reenviar e-mail de confirmação</Text>
        </Pressable>
        <Pressable onPress={() => rodar(esqueciSenha, 'Enviamos um e-mail para você criar uma senha nova.')} hitSlop={8} disabled={espera > 0}>
          <Text style={[s.link, espera > 0 && s.off]}>Esqueci a senha</Text>
        </Pressable>
      </View>
      {espera > 0 && <Text style={s.espera}>Pode pedir outro e-mail em {espera} s</Text>}
      {msg && <Text style={[s.msg, { color: msg.ok ? '#4ade80' : '#ff6b66' }]}>{msg.txt}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { gap: 6, alignItems: 'center' },
  linha: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18 },
  link: { color: '#60a5fa', fontWeight: '700', fontSize: 14, textDecorationLine: 'underline' },
  off: { color: '#64748b' },
  espera: { color: '#8d939c', fontSize: 12 },
  msg: { fontSize: 13, textAlign: 'center' },
});
