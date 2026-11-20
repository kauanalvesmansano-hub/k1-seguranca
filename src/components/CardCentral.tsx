import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CardK1, K1, s as k } from './k1';
import { traduzErro } from '../lib/supabase';
import { ativarCentral, centralDisponivel, desativarCentral, pedirFurarSilencio, pedirSemEconomia, pedirTelaCheia, statusCentral, testarCentral, type StatusCentral } from '../lib/central';

/** Liga/desliga o "celular da central": toca como ligação (com voz) a cada disparo. global = K1 Monitoramento (todas as contas). */
export function CardCentral({ global = false }: { global?: boolean }) {
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
      if (ligar) await ativarCentral(global ? 'K1 Monitoramento' : 'Celular da central', global); else await desativarCentral();
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
          <Text style={k.titulo}>{global ? 'Receber ligação de TODAS as contas' : 'Celular da central'}</Text>
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


const st = StyleSheet.create({
  aviso: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: K1.amarelo },
  avisoTxt: { color: K1.amarelo, flex: 1, fontSize: 13 },
  botao: { height: 46, borderRadius: 10, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' },
});
