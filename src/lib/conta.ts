import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type TipoConta = 'seguranca' | 'familia';
let cache: { userId: string; tipo: TipoConta } | null = null;

/** Esquece o tipo guardado (chamar ao trocar de plano). */
export function limparTipoConta() { cache = null; }

/** Tipo da conta logada: empresa de segurança ou família (muda os textos das telas). */
export function useTipoConta() {
  const [tipo, setTipo] = useState<TipoConta | null>(cache?.tipo ?? null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return;
      if (cache?.userId === uid) { setTipo(cache.tipo); return; }
      const { data } = await supabase.from('empresas').select('tipo').maybeSingle();
      const t = ((data as { tipo?: TipoConta } | null)?.tipo ?? 'seguranca') as TipoConta;
      cache = { userId: uid, tipo: t };
      if (vivo) setTipo(t);
    })();
    return () => { vivo = false; };
  }, []);
  return { tipo, familia: tipo === 'familia' };
}
