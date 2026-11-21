import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, brl, s as k } from '../components/k1';
import { supabase, traduzErro } from '../lib/supabase';
import { lerSessao } from '../lib/vigilante';
import { meusPlanos, trocarPlano, NOME_TIPO, type MeuPlanoConta, type TipoPlano } from '../lib/planos';

const ICONE: Record<TipoPlano, keyof typeof Ionicons.glyphMap> = {
  seguranca: 'business', autonomo: 'shield-checkmark', familia: 'people',
};

function situacao(p: MeuPlanoConta): { t: string; cor: string } {
  if (p.plano_status === 'bloqueado') return { t: 'BLOQUEADO — falta pagar', cor: K1.vermelho };
  if (p.plano_status !== 'ativo') return { t: 'ENCERRADO', cor: K1.mutado };
  if (p.em_teste && p.teste_ate) return { t: `Teste grátis até ${new Date(p.teste_ate).toLocaleDateString('pt-BR')}`, cor: K1.verde };
  if (p.fatura_aberta) return { t: `Fatura ${brl(p.fatura_aberta.valor)} vence ${new Date(p.fatura_aberta.vencimento + 'T12:00').toLocaleDateString('pt-BR')}`, cor: K1.amarelo };
  return { t: 'Em dia', cor: K1.verde };
}

/** Meus planos: a mesma conta pode ter empresa, vigilante individual e família — cada um pago separado. */
export default function Planos() {
  const [lista, setLista] = useState<MeuPlanoConta[] | null>(null);
  const [logado, setLogado] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setLogado(false); setLista([]); return; }
      setLogado(true);
      try { setLista(await meusPlanos()); } catch (e) { Alert.alert('Não deu para carregar', traduzErro(e)); setLista([]); }
    })();
  }, []));

  async function abrir(p: MeuPlanoConta) {
    if (p.tipo === 'autonomo') {
      // o plano individual é usado no app do vigilante (matrícula + senha do app)
      const vig = await lerSessao();
      router.replace(vig ? '/funcionario/inicio' : '/funcionario/login');
      return;
    }
    setOcupado(p.empresa_id);
    try { await trocarPlano(p.empresa_id); router.replace(p.plano_status === 'bloqueado' ? '/empresa/plano' : '/empresa/painel'); }
    catch (e) { Alert.alert('Não deu para abrir', traduzErro(e)); }
    finally { setOcupado(null); }
  }

  const tem = (t: TipoPlano) => !!lista?.some(p => p.tipo === t);

  return (
    <FundoK1>
      <Text style={[k.titulo, { fontSize: 22 }]}>Meus planos</Text>
      <Text style={k.mut}>Com o mesmo e-mail você pode ter vários planos. Cada plano tem o seu teste grátis de 30 dias e a sua própria mensalidade.</Text>

      {lista === null && <ActivityIndicator color={K1.vermelho} />}

      {!logado && (
        <CardK1 onPress={() => router.push('/empresa/login')} style={st.linha}>
          <Ionicons name="log-in" size={26} color={K1.vermelho} />
          <View style={{ flex: 1 }}><Text style={k.titulo}>Entrar com meu e-mail</Text><Text style={k.mut}>Para ver e contratar planos</Text></View>
          <Ionicons name="chevron-forward" size={22} color="#888" />
        </CardK1>
      )}

      {lista?.map(p => {
        const sit = situacao(p);
        return (
          <CardK1 key={p.empresa_id} style={{ gap: 8, borderColor: p.atual ? K1.vermelho : undefined }}>
            <View style={st.linha}>
              <Ionicons name={ICONE[p.tipo]} size={28} color={K1.vermelho} />
              <View style={{ flex: 1 }}>
                <Text style={k.titulo}>{p.nome}</Text>
                <Text style={k.mut}>{NOME_TIPO[p.tipo]}{p.atual && p.tipo !== 'autonomo' ? ' · aberto agora' : ''}</Text>
              </View>
            </View>
            <Text style={{ color: sit.cor, fontWeight: '800' }}>{sit.t}</Text>
            <Pressable style={st.btn} disabled={!!ocupado} onPress={() => abrir(p)}>
              {ocupado === p.empresa_id ? <ActivityIndicator color="#fff" />
                : <Text style={st.btnTxt}>{p.plano_status === 'bloqueado' && p.tipo !== 'autonomo' ? 'ABRIR E PAGAR' : 'ABRIR ESTE PLANO'}</Text>}
            </Pressable>
          </CardK1>
        );
      })}

      {logado && lista !== null && (
        <>
          <Text style={[k.titulo, { marginTop: 8 }]}>Contratar outro plano</Text>
          <CardK1 onPress={() => router.push('/empresa/cadastro')} style={st.linha}>
            <Ionicons name="business-outline" size={26} color={K1.vermelho} />
            <View style={{ flex: 1 }}><Text style={k.titulo}>Empresa de segurança</Text><Text style={k.mut}>Vigilantes, central, ronda e relatórios</Text></View>
            <Ionicons name="add-circle" size={24} color="#888" />
          </CardK1>
          {!tem('autonomo') && (
            <CardK1 onPress={() => router.push('/autonomo/cadastro')} style={st.linha}>
              <Ionicons name="shield-checkmark-outline" size={26} color={K1.vermelho} />
              <View style={{ flex: 1 }}><Text style={k.titulo}>Vigilante individual</Text><Text style={k.mut}>R$ 20,00/mês depois do teste</Text></View>
              <Ionicons name="add-circle" size={24} color="#888" />
            </CardK1>
          )}
          {!tem('familia') && (
            <CardK1 onPress={() => router.push('/familia/cadastro')} style={st.linha}>
              <Ionicons name="people-outline" size={26} color={K1.vermelho} />
              <View style={{ flex: 1 }}><Text style={k.titulo}>Pessoal / Família</Text><Text style={k.mut}>Proteja quem você ama</Text></View>
              <Ionicons name="add-circle" size={24} color="#888" />
            </CardK1>
          )}
        </>
      )}

      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
        <Text style={{ color: K1.mutado, textAlign: 'center', letterSpacing: 2, marginTop: 8 }}>VOLTAR</Text>
      </Pressable>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  btn: { backgroundColor: K1.vermelho, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '900', letterSpacing: 1 },
});
