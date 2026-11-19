import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, brl, s as k } from '../../../components/k1';
import { supabase, traduzErro } from '../../../lib/supabase';
import { useTipoConta } from '../../../lib/conta';
import { precoFamilia } from '../../../lib/familia';
import { precoVigilante } from '../../../lib/empresa';
import { ativarCentral, centralDisponivel, desativarCentral, pedirFurarSilencio, pedirSemEconomia, pedirTelaCheia, statusCentral, testarCentral, type StatusCentral } from '../../../lib/central';

function CardCentral() {
  const [s, setS] = useState<StatusCentral>(statusCentral());
  const [ocupado, setOcupado] = useState(false);
  const atualizar = useCallback(() => setS(statusCentral()), []);
  useFocusEffect(atualizar);
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st === 'active') atualizar(); });
    return () => sub.remove();
  }, [atualizar]);

  async function alternar(ligar: boolean) {
    setOcupado(true);
    try {
      if (ligar) await ativarCentral('Celular da central'); else await desativarCentral();
    } catch (err) { Alert.alert('Erro', traduzErro(err)); }
    setOcupado(false);
    setTimeout(atualizar, 600);
  }

  if (!centralDisponivel) return null;
  return (
    <CardK1 style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="call" size={28} color={s.ativa ? K1.verde : K1.vermelho} />
        <View style={{ flex: 1 }}>
          <Text style={k.titulo}>Celular da central</Text>
          <Text style={k.mut}>{s.ativa ? 'Ativo: este celular toca como ligação a cada alerta' : 'Desligado'}</Text>
        </View>
        <Switch value={s.ativa} disabled={ocupado} onValueChange={alternar} trackColor={{ true: K1.verde }} />
      </View>
      <Text style={[k.mut, { fontSize: 13 }]}>
        Ligue no celular que fica com o monitoramento. A cada disparo ele toca no volume máximo, em tela cheia, mesmo bloqueado,
        no silencioso e com o app fechado — e só para quando o alerta for resolvido ou alguém tocar em Silenciar.
        Se o celular ficar sem internet (modo avião), ele avisa que não está recebendo os disparos.
      </Text>
      {s.ativa && (
        <>
          {!s.telaCheia && (
            <Pressable style={st.aviso} onPress={pedirTelaCheia}>
              <Ionicons name="warning" size={18} color={K1.amarelo} />
              <Text style={st.avisoTxt}>Permitir tela cheia com o celular bloqueado (tocar aqui)</Text>
            </Pressable>
          )}
          {!s.furaSilencio && (
            <Pressable style={st.aviso} onPress={pedirFurarSilencio}>
              <Ionicons name="volume-high" size={18} color={K1.amarelo} />
              <Text style={st.avisoTxt}>Tocar mesmo no silencioso e no "Não Perturbe": ative o K1 na lista que vai abrir (tocar aqui)</Text>
            </Pressable>
          )}
          {!s.semEconomia && (
            <Pressable style={st.aviso} onPress={pedirSemEconomia}>
              <Ionicons name="battery-charging" size={18} color={K1.amarelo} />
              <Text style={st.avisoTxt}>Tirar o K1 da economia de bateria, para nunca deixar de tocar (tocar aqui)</Text>
            </Pressable>
          )}
          <Pressable style={st.botao} onPress={() => { if (!testarCentral()) Alert.alert('Aguarde', 'A central ainda está iniciando.'); }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Testar toque agora</Text>
          </Pressable>
        </>
      )}
    </CardK1>
  );
}

type Empresa = {
  id: string; nome: string; cnpj: string | null; qtd_vigilantes_contratados: number;
  intervalo_checkin_min: number; prazo_resposta_min: number; tentativas_senha: number; homem_caido_min: number;
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
  const { familia } = useTipoConta();
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
      prazo_resposta_min: e.prazo_resposta_min, tentativas_senha: e.tentativas_senha, homem_caido_min: e.homem_caido_min,
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

      <CardCentral />

      <CardK1 style={{ gap: 16 }}>
        <Text style={k.titulo}>{e.nome}</Text>
        <View style={{ gap: 6 }}>
          <Text style={k.mut}>{familia ? 'Pessoas no plano (R$ 15,00 a 1ª + R$ 7,00 cada a mais)' : 'Vigilantes contratados (R$ 25,00 cada · mais de 15: R$ 20,00 cada)'}</Text>
          <TextInput value={qtd} onChangeText={setQtd} keyboardType="number-pad" style={st.input} />
          <Text style={k.mut}>Valor mensal estimado: {brl(familia ? precoFamilia(parseInt(qtd, 10) || 0) : (parseInt(qtd, 10) || 0) * precoVigilante(parseInt(qtd, 10) || 0))}</Text>
        </View>
        {!familia && <>
        <Opcao rotulo="Pedir senha a cada" valor={e.intervalo_checkin_min} onChange={v => setE({ ...e, intervalo_checkin_min: v })}
          opcoes={[{ v: 30, t: '30 min' }, { v: 60, t: '1 hora' }, { v: 90, t: '1h30' }, { v: 120, t: '2 horas' }]} />
        <Opcao rotulo="Prazo para responder" valor={e.prazo_resposta_min} onChange={v => setE({ ...e, prazo_resposta_min: v })}
          opcoes={[{ v: 3, t: '3 min' }, { v: 5, t: '5 min' }, { v: 10, t: '10 min' }]} />
        <Opcao rotulo="Senha errada gera alerta" valor={e.tentativas_senha} onChange={v => setE({ ...e, tentativas_senha: v })}
          opcoes={[{ v: 1, t: 'No 1º erro' }, { v: 2, t: 'No 2º erro' }]} />
        </>}
        <Opcao rotulo={familia ? 'Possível queda: avisar a família se o celular ficar parado por' : 'Homem caído: alertar se o celular ficar parado por'} valor={e.homem_caido_min ?? 0} onChange={v => setE({ ...e, homem_caido_min: v })}
          opcoes={[{ v: 0, t: 'Desligado' }, { v: 5, t: '5 min' }, { v: 10, t: '10 min' }, { v: 15, t: '15 min' }, { v: 30, t: '30 min' }]} />
        <Text style={[k.mut, { fontSize: 12 }]}>Antes do alerta, o celular vibra e pergunta "Você está bem?" por 30 s. Vale a partir do próximo início de turno.</Text>
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
  aviso: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: K1.amarelo },
  avisoTxt: { color: K1.amarelo, flex: 1, fontSize: 13 },
  botao: { height: 46, borderRadius: 10, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' },
  salvar: { height: 50, borderRadius: 10, backgroundColor: K1.vermelho, alignItems: 'center', justifyContent: 'center' },
});
