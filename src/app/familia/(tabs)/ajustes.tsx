import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, s as k } from '../../../components/k1';
import { useFamilia } from '../../../lib/useFamilia';
import { compartilhar, sairDaFamilia } from '../../../lib/familia';
import { panicoPowerDisponivel } from '../../../lib/panicoNativo';
import K1Panico from '../../../../modules/k1-panico/src/K1PanicoModule';
import { supabase, traduzErro } from '../../../lib/supabase';

/** Ajustes da pessoa: pausar o compartilhamento, sair do círculo, ir para a área do responsável. */
export default function AjustesFamilia() {
  const { sessao, dados, atualizar } = useFamilia();
  const [ocupado, setOcupado] = useState(false);
  const eu = dados?.membros.find(m => m.id === dados.eu);

  async function alternar(ligar: boolean) {
    if (!sessao) return;
    setOcupado(true);
    try { await compartilhar(sessao, ligar, dados?.homem_caido_min ?? 0); await atualizar(); }
    catch (e) { Alert.alert('Erro', traduzErro(e)); }
    setOcupado(false);
  }

  async function responsavel() {
    const { data } = await supabase.auth.getSession();
    router.push(data.session ? '/empresa/painel' : '/empresa/login');
  }

  function sair() {
    Alert.alert('Sair do círculo?', 'Você para de compartilhar e precisa de um novo código para voltar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => { await sairDaFamilia(); router.replace('/'); } },
    ]);
  }

  return (
    <FundoK1>
      <Text style={[k.titulo, { fontSize: 22 }]}>Ajustes</Text>
      <CardK1 style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="location" size={26} color={eu?.compartilhando ? K1.verde : K1.amarelo} />
          <View style={{ flex: 1 }}>
            <Text style={k.titulo}>Compartilhar minha localização</Text>
            <Text style={k.mut}>{eu?.compartilhando ? 'Ligado: a família vê você no mapa' : 'Pausado: a família vê que está pausado'}</Text>
          </View>
          <Switch value={!!eu?.compartilhando} disabled={ocupado || !eu} onValueChange={alternar} trackColor={{ true: K1.verde }} />
        </View>
        {!eu?.compartilhando && <Text style={[k.mut, { fontSize: 12 }]}>Com o compartilhamento pausado, o botão Power 4 vezes também fica desligado. O SOS da tela continua funcionando.</Text>}
      </CardK1>

      <CardK1 style={{ gap: 6 }}>
        <Text style={k.titulo}>{dados?.familia ?? '—'}</Text>
        <Text style={k.mut}>Você: {sessao?.nome}</Text>
        <Text style={k.mut}>Botão Power 4x: {panicoPowerDisponivel ? (eu?.compartilhando ? 'ativo' : 'pausado') : 'disponível só no app instalado'}</Text>
        <Text style={k.mut}>Para a localização funcionar com o app fechado, deixe a permissão de localização em "Permitir o tempo todo".</Text>
      </CardK1>

      <CardK1 style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="car-sport" size={26} color={K1.vermelho} />
          <Text style={[k.titulo, { flex: 1 }]}>Detecção de batida</Text>
          <Text style={{ color: eu?.compartilhando ? K1.verde : K1.mutado, fontWeight: '700' }}>{eu?.compartilhando ? 'Ligada' : 'Pausada'}</Text>
        </View>
        <Text style={k.mut}>De carro ou moto a 25 km/h ou mais, se o celular sentir um impacto forte e parar, ele vibra e pergunta "Você está bem?". Sem resposta em 30 s, a família recebe o alerta com a localização.</Text>
        <Pressable style={[st.btn, { height: 44 }]} onPress={() => {
          if (!eu?.compartilhando || !K1Panico?.testarBatida()) Alert.alert('Ligue o compartilhamento', 'A detecção funciona com o compartilhamento ligado.');
          else Alert.alert('Teste iniciado', 'O celular vai vibrar. Toque em ESTOU BEM na notificação para cancelar, ou espere 30 s para ver o alerta (marcado como TESTE) chegar na família.');
        }}>
          <Text style={st.btnTxt}>Testar agora</Text>
        </Pressable>
      </CardK1>

      <Pressable style={st.btn} onPress={responsavel}>
        <Ionicons name="person-circle" size={22} color="#fff" /><Text style={st.btnTxt}>Área do responsável</Text>
      </Pressable>
      <Pressable style={[st.btn, { backgroundColor: '#7f1d1d' }]} onPress={sair}>
        <Ionicons name="exit" size={22} color="#fff" /><Text style={st.btnTxt}>Sair do círculo</Text>
      </Pressable>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  btn: { height: 52, borderRadius: 12, backgroundColor: '#27272a', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
