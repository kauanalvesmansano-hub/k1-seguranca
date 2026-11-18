import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, brl, horaCurta, s as k } from '../../../components/k1';
import { supabase } from '../../../lib/supabase';
import { useTipoConta } from '../../../lib/conta';
import { precoFamilia } from '../../../lib/familia';
import { precoVigilante } from '../../../lib/empresa';

type Vigilante = {
  papel_familia?: string | null;
  id: string; nome: string; posto: string | null; matricula_acesso: string | null; ativo: boolean; em_turno: boolean;
  dispositivo_ativo: boolean; ultima_bateria: number | null; ultimo_wifi: boolean | null; ultimo_wifi_nome: string | null;
  ultimo_checkin_ok: string | null; ultima_atualizacao: string | null;
};

/** Funcionários: lista, criar acesso, desativar, desconectar celular. */
export default function Funcionarios() {
  const [lista, setLista] = useState<Vigilante[]>([]);
  const [contratados, setContratados] = useState(0);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    const [v, e] = await Promise.all([
      supabase.from('vigilantes').select('*').order('nome'),
      supabase.from('empresas').select('qtd_vigilantes_contratados').maybeSingle(),
    ]);
    setLista((v.data as Vigilante[]) ?? []);
    setContratados(e.data?.qtd_vigilantes_contratados ?? 0);
    setAtualizando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => {
    const canal = supabase.channel('k1-func-app')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vigilantes' }, p =>
        setLista(l => l.map(v => (v.id === (p.new as Vigilante).id ? (p.new as Vigilante) : v))))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, []);

  const ativos = lista.filter(v => v.ativo).length;
  const { familia } = useTipoConta();
  const previa = familia ? precoFamilia(contratados) : contratados * precoVigilante(contratados);

  return (
    <View style={{ flex: 1 }}>
      <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
        <Text style={[k.titulo, { fontSize: 22 }]}>{familia ? 'Pessoas da família' : 'Funcionários'}</Text>
        <CardK1 style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={k.mut}>Ativos no plano</Text>
            <Text style={[k.titulo, { fontSize: 22 }]}>{ativos} / {contratados}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={k.mut}>Prévia do mês</Text>
            <Text style={[k.titulo, { fontSize: 22 }]}>{brl(previa)}</Text>
          </View>
        </CardK1>

        {lista.length === 0 && <Text style={[k.mut, { textAlign: 'center', marginTop: 20 }]}>{familia ? 'Ninguém ainda. Toque em + para convidar (inclusive você mesmo).' : 'Nenhum funcionário. Toque em + para criar o acesso.'}</Text>}
        {lista.map(v => (
          <CardK1 key={v.id} onPress={() => router.push(`/empresa/vigilante/${v.id}`)}
            style={{ gap: 4, borderColor: !v.ativo ? '#333' : v.em_turno ? '#166534' : K1.vermelhoBorda, opacity: v.ativo ? 1 : 0.6 }}>
            <View style={st.linha}>
              <Text style={k.titulo} numberOfLines={1}>{v.nome}</Text>
              <Text style={{ color: !v.ativo ? '#888' : v.em_turno ? K1.verde : K1.mutado }}>
                {!v.ativo ? 'Desativado' : v.em_turno ? (familia ? '● Compartilhando' : '● Em turno') : (familia ? 'Pausado' : 'Fora de turno')}
              </Text>
            </View>
            {familia ? <Text style={k.mut}>{v.papel_familia || 'Família'}</Text> :
            <Text style={k.mut}>{v.posto || 'Sem posto'} · Matrícula: <Text style={{ color: '#fff', fontWeight: '800' }}>{v.matricula_acesso}</Text></Text>}
            <Text style={[k.mut, { fontSize: 12 }]}>
              {v.dispositivo_ativo ? '📱 Celular conectado' : '📱 Não entrou no app'}
              {v.em_turno ? `  ·  🔋 ${v.ultima_bateria ?? '—'}%  ·  ${v.ultimo_wifi ? '📶 Wi-Fi' : v.ultimo_wifi === false ? '📱 Dados' : '—'}${familia ? '' : `  ·  ✅ ${horaCurta(v.ultimo_checkin_ok)}`}` : ''}
            </Text>
            <Text style={{ color: K1.vermelho, fontSize: 12, fontWeight: '700' }}>Ver no mapa e detalhes ›</Text>
          </CardK1>
        ))}
        <View style={{ height: 70 }} />
      </FundoK1>
      <Pressable style={st.fab} onPress={() => router.push(familia ? '/familia/nova-pessoa' : '/empresa/novo-vigilante')}>
        <Ionicons name="person-add" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  fab: {
    position: 'absolute', right: 20, bottom: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: K1.vermelho,
    alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: K1.vermelho, shadowOpacity: 0.7, shadowRadius: 10,
  },
});
