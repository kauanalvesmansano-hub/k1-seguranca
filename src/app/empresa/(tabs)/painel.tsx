import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, Vibration, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CabecalhoK1, CardK1, Online, K1, brl, horaCompleta, horaCurta, s as k } from '../../../components/k1';
import { supabase } from '../../../lib/supabase';
import { carregarPlano, RESULTADO, type Checkin, type Plano } from '../../../lib/empresa';

/** Painel da empresa (modelo: Central da Empresa, Última Senha, Status, Comunicações, Rádio). */
export default function PainelEmpresa() {
  const [nome, setNome] = useState('');
  const [online, setOnline] = useState(true);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [abertos, setAbertos] = useState(0);
  const [ocNovas, setOcNovas] = useState(0);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    const [e, c, a, p, oc] = await Promise.all([
      supabase.from('empresas').select('nome').maybeSingle(),
      supabase.from('checkins').select('id,vigilante_id,resultado,criado_em,vigilantes(nome,posto)').order('criado_em', { ascending: false }).limit(5),
      supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('status', 'aberto'),
      carregarPlano(),
      supabase.from('ocorrencias').select('id', { count: 'exact', head: true }).eq('status', 'nova'),
    ]);
    setOcNovas(oc.count ?? 0);
    setOnline(!e.error);
    if (e.data) setNome(e.data.nome);
    setCheckins((c.data as unknown as Checkin[]) ?? []);
    setAbertos(a.count ?? 0);
    setPlano(p);
    setAtualizando(false);
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  useEffect(() => {
    const canal = supabase.channel('k1-painel-app')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins' }, () => carregar())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas' }, () => {
        Vibration.vibrate([0, 800, 300, 800, 300, 800]);
        carregar();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'alertas' }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ocorrencias' }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [carregar]);

  const ultima = checkins[0];
  const f = plano?.fatura;
  const perguntarRenovacao = f && f.status !== 'paga' && f.renovar === null;

  return (
    <FundoK1 refresh={<RefreshControl refreshing={atualizando} onRefresh={carregar} tintColor={K1.vermelho} />}>
      <CabecalhoK1 tipo="empresa" direita={
        <Pressable onPress={() => router.push('/empresa/alertas')} hitSlop={12}>
          <Ionicons name="notifications-outline" size={28} color="#e5e5e5" />
          {abertos > 0 && <View style={st.badge}><Text style={st.badgeTxt}>{abertos}</Text></View>}
        </Pressable>
      } />

      <CardK1 style={st.linha}>
        <Ionicons name="business" size={32} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={k.titulo} numberOfLines={1}>Central da Empresa</Text>
          <Text style={k.mut} numberOfLines={1}>{nome || 'Gestão de Segurança'}</Text>
        </View>
        <Online online={online} />
      </CardK1>

      {plano?.em_teste && plano.teste_ate && (
        <CardK1 onPress={() => router.push('/empresa/plano')} style={{ borderColor: '#16a34a', backgroundColor: '#052e16', gap: 2 }}>
          <Text style={{ color: '#4ade80', fontWeight: '900' }}>🎁 TESTE GRÁTIS · faltam {Math.max(0, Math.ceil((new Date(plano.teste_ate).getTime() - Date.now()) / 86400000))} dia(s)</Text>
          <Text style={k.mut}>Toque para ver o plano e o valor depois do teste.</Text>
        </CardK1>
      )}

      {perguntarRenovacao && (
        <CardK1 onPress={() => router.push('/empresa/plano')} style={{ borderColor: K1.amarelo, gap: 4 }}>
          <Text style={[k.titulo, { color: K1.amarelo }]}>Fechamento do mês: {brl(f.valor_total)}</Text>
          <Text style={k.mut}>{f.qtd_vigilantes} vigilantes × {brl(f.valor_unitario)}. Toque para ver o Pix e escolher se deseja continuar o plano.</Text>
        </CardK1>
      )}

      <CardK1 style={st.linha}>
        <Ionicons name="time-outline" size={32} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={k.mut}>Última Senha</Text>
          <Text style={st.hora}>{horaCompleta(ultima?.criado_em)}</Text>
        </View>
        {ultima && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name={RESULTADO[ultima.resultado].icone} size={24} color={RESULTADO[ultima.resultado].cor} />
            <Text style={{ color: RESULTADO[ultima.resultado].cor, fontSize: 15 }}>
              {ultima.resultado === 'ok' ? 'Senha Correta' : RESULTADO[ultima.resultado].txt}
            </Text>
          </View>
        )}
      </CardK1>

      <CardK1 style={st.linha} onPress={abertos ? () => router.push('/empresa/alertas') : undefined}>
        <Ionicons name={abertos ? 'shield' : 'shield-checkmark'} size={44} color={abertos ? '#ef4444' : K1.verde} />
        <View style={{ flex: 1 }}>
          <Text style={[k.titulo, { fontSize: 15 }]}>Status Atual</Text>
          <Text style={{ color: abertos ? '#ef4444' : K1.verde, fontSize: 20, fontWeight: '700' }}>
            {abertos ? `${abertos} alerta${abertos > 1 ? 's' : ''} em aberto` : 'Tudo Operacional'}
          </Text>
          <Text style={k.mut}>{abertos ? 'Toque para atender' : 'Comunicação ativa com os vigilantes'}</Text>
        </View>
      </CardK1>

      <CardK1 style={st.linha} onPress={() => router.push('/empresa/ocorrencias')}>
        <Ionicons name="clipboard" size={30} color={ocNovas ? K1.amarelo : '#fff'} />
        <View style={{ flex: 1 }}>
          <Text style={[k.titulo, { fontSize: 15 }]}>Ocorrências</Text>
          <Text style={{ color: ocNovas ? K1.amarelo : K1.mutado }}>{ocNovas ? `${ocNovas} nova${ocNovas > 1 ? 's' : ''} para ver` : 'Nenhuma ocorrência nova'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#888" />
      </CardK1>

      <CardK1 style={{ gap: 10 }}>
        <View style={[st.linha, { justifyContent: 'space-between' }]}>
          <View style={st.linha}>
            <Ionicons name="chatbox-ellipses" size={22} color="#fff" />
            <Text style={[k.titulo, { fontSize: 16 }]}>Comunicações</Text>
          </View>
          <Pressable onPress={() => router.push('/empresa/relatorios')} hitSlop={10}>
            <Text style={{ color: '#e5e5e5', textDecorationLine: 'underline' }}>Ver Todas ›</Text>
          </Pressable>
        </View>
        {checkins.length === 0 && <Text style={k.mut}>Nenhuma confirmação ainda.</Text>}
        {checkins.slice(0, 3).map(c => (
          <View key={c.id} style={[st.linha, { gap: 10 }]}>
            <Ionicons name={RESULTADO[c.resultado].icone} size={20} color={RESULTADO[c.resultado].cor} />
            <Text style={{ color: '#e5e5e5', flex: 1 }} numberOfLines={1}>
              {RESULTADO[c.resultado].txt} – {c.vigilantes?.posto || c.vigilantes?.nome || 'Posto'}
            </Text>
            <Text style={k.mut}>{horaCurta(c.criado_em)}</Text>
          </View>
        ))}
      </CardK1>

    </FundoK1>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hora: { color: '#fff', fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  badge: { position: 'absolute', right: -6, top: -6, backgroundColor: K1.vermelho, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
