import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { lerSessao, type SessaoVigilante } from './vigilante';
import { carregarFamilia, type Familia } from './familia';

/** Dados do círculo, atualizados a cada 8 s enquanto a tela está aberta. */
export function useFamilia() {
  const [sessao, setSessao] = useState<SessaoVigilante | null>(null);
  const [dados, setDados] = useState<Familia | null>(null);
  const [erro, setErro] = useState('');
  const ativo = useRef(true);

  const atualizar = useCallback(async () => {
    const s = sessao ?? (await lerSessao());
    if (!s) { router.replace('/'); return; }
    if (!sessao) setSessao(s);
    try { setDados(await carregarFamilia(s)); setErro(''); }
    catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      if (m.includes('dispositivo_nao_autorizado')) { router.replace('/'); return; }
      setErro('Sem conexão. Tentando de novo…');
    }
  }, [sessao]);

  useFocusEffect(useCallback(() => {
    ativo.current = true;
    atualizar();
    const t = setInterval(() => { if (ativo.current && AppState.currentState === 'active') atualizar(); }, 8000);
    return () => { ativo.current = false; clearInterval(t); };
  }, [atualizar]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st === 'active') atualizar(); });
    return () => sub.remove();
  }, [atualizar]);

  return { sessao, dados, erro, atualizar };
}
