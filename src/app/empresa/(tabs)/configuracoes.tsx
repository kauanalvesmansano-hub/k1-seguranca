import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, brl, s as k } from '../../../components/k1';
import { supabase, traduzErro } from '../../../lib/supabase';

type Empresa = {
  id: string; nome: string; cnpj: string | null; qtd_vigilantes_contratados: number;
  intervalo_checkin_min: number; prazo_resposta_min: number; tentativas_senha: number;
};

function Opcao<T extends number>({ rotulo, valor, opcoes, onChange }: {
  rotulo: string; valor: T; opcoes: { v: T; t: string }[]; onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={k.mut}>{rotulo}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opcoes.map(o => (
          <Pressable key={o.v} onPress={() => onChange(o.v)} style={[st.chip, valor === o.v && st.chipOn]}>
            <Text style={{ color: '#fff', fontWeight: valor === o.v ? '800' : '400' }}>{o.t}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Configuracoes() {
  const [e, setE] = useState<Empresa | null>(null);
  const [qtd, setQtd] = useState('');
  const [salvando, setSalvando] = useState(false);

  useFocusEffect(useCallback(() => {
    supabase.from('empresas').select('*').maybeSingle().then(({ data }) => {
      if (data) { setE(data as Empresa); setQtd(String(data.qtd_vigilantes_contratados)); }
    });
  }, []));

  async function salvar() {
    if (!e) return;
    const n = parseInt(qtd, 10);
    if (!(n >= 1)) { Alert.alert('Quantidade inválida'); return; }
    setSalvando(true);
    const { error } = await supabase.from('empresas').update({
      qtd_vigilantes_contratados: n, intervalo_checkin_min: e.intervalo_checkin_min,
      prazo_resposta_min: e.prazo_resposta_min, tentativas_senha: e.tentativas_senha,
    }).eq('id', e.id);
    setSalvando(false);
    if (error) Alert.alert('Erro', traduzErro(error)); else Alert.alert('Salvo!');
  }

  async function sair() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (!e) return <FundoK1><Text style={k.mut}>Carregando…</Text></FundoK1>;

  return (
    <FundoK1>
      <Text style={[k.titulo, { fontSize: 22 }]}>Configurações</Text>

      <CardK1 onPress={() => router.push('/empresa/plano')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ionicons name="card" size={30} color={K1.vermelho} />
        <View style={{ flex: 1 }}>
          <Text style={k.titulo}>Plano e pagamento</Text>
          <Text style={k.mut}>Fatura do mês, Pix e renovação</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#888" />
      </CardK1>

      <CardK1 style={{ gap: 16 }}>
        <Text style={k.titulo}>{e.nome}</Text>
        <View style={{ gap: 6 }}>
          <Text style={k.mut}>Vigilantes contratados (R$ 20,00 cada)</Text>
          <TextInput value={qtd} onChangeText={setQtd} keyboardType="number-pad" style={st.input} />
          <Text style={k.mut}>Valor mensal estimado: {brl((parseInt(qtd, 10) || 0) * 20)}</Text>
        </View>
        <Opcao rotulo="Pedir senha a cada" valor={e.intervalo_checkin_min} onChange={v => setE({ ...e, intervalo_checkin_min: v })}
          opcoes={[{ v: 30, t: '30 min' }, { v: 60, t: '1 hora' }, { v: 90, t: '1h30' }, { v: 120, t: '2 horas' }]} />
        <Opcao rotulo="Prazo para responder" valor={e.prazo_resposta_min} onChange={v => setE({ ...e, prazo_resposta_min: v })}
          opcoes={[{ v: 3, t: '3 min' }, { v: 5, t: '5 min' }, { v: 10, t: '10 min' }]} />
        <Opcao rotulo="Senha errada gera alerta" valor={e.tentativas_senha} onChange={v => setE({ ...e, tentativas_senha: v })}
          opcoes={[{ v: 1, t: 'No 1º erro' }, { v: 2, t: 'No 2º erro' }]} />
        <Pressable onPress={salvar} disabled={salvando} style={st.salvar}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
        </Pressable>
      </CardK1>

      <Pressable onPress={sair} style={[st.salvar, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#444' }]}>
        <Text style={{ color: '#ddd', fontWeight: '700' }}>Sair da conta</Text>
      </Pressable>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  input: { height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#444', color: '#fff', paddingHorizontal: 12, fontSize: 17, backgroundColor: '#111317' },
  salvar: { height: 50, borderRadius: 10, backgroundColor: K1.vermelho, alignItems: 'center', justifyContent: 'center' },
});
