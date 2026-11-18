import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, s as k } from '../../../components/k1';
import { useFamilia } from '../../../lib/useFamilia';
import { acompanhar, cheguei } from '../../../lib/familia';
import { traduzErro } from '../../../lib/supabase';

const TEMPOS = [15, 30, 45, 60, 90, 120];

/** "Me acompanhe": a família te segue no mapa e é avisada se você não chegar no horário. */
export default function MeAcompanhe() {
  const { sessao, dados, atualizar } = useFamilia();
  const [destino, setDestino] = useState('');
  const [minutos, setMinutos] = useState(30);
  const [enviando, setEnviando] = useState(false);
  const [, setTique] = useState(0);
  useEffect(() => { const t = setInterval(() => setTique(x => x + 1), 1000); return () => clearInterval(t); }, []);

  const eu = dados?.membros.find(m => m.id === dados.eu);
  const ate = eu?.acompanhar_ate ? new Date(eu.acompanhar_ate).getTime() : null;
  const resta = ate ? Math.max(0, Math.round((ate - Date.now()) / 1000)) : 0;

  async function iniciar() {
    if (!sessao) return;
    setEnviando(true);
    try { await acompanhar(sessao, minutos, destino.trim()); await atualizar(); }
    catch (e) { Alert.alert('Erro', traduzErro(e)); }
    setEnviando(false);
  }
  async function chegou() {
    if (!sessao) return;
    setEnviando(true);
    try { await cheguei(sessao); await atualizar(); Alert.alert('Que bom!', 'A família sabe que você chegou bem.'); }
    catch (e) { Alert.alert('Erro', traduzErro(e)); }
    setEnviando(false);
  }

  if (ate) {
    return (
      <FundoK1>
        <Text style={[k.titulo, { fontSize: 22, textAlign: 'center' }]}>A família está te acompanhando</Text>
        <CardK1 style={{ alignItems: 'center', gap: 6, borderColor: '#2563eb' }}>
          <Ionicons name="walk" size={48} color="#60a5fa" />
          <Text style={k.mut}>{eu?.acompanhar_destino ? `Indo para ${eu.acompanhar_destino}` : 'A caminho'}</Text>
          <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
            {String(Math.floor(resta / 60)).padStart(2, '0')}:{String(resta % 60).padStart(2, '0')}
          </Text>
          <Text style={k.mut}>Se você não tocar em "Cheguei bem" até {new Date(ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}, a família recebe um alerta.</Text>
        </CardK1>
        <Pressable style={[st.grande, { backgroundColor: '#15803d' }]} onPress={chegou} disabled={enviando}>
          <Ionicons name="checkmark-circle" size={26} color="#fff" /><Text style={st.grandeTxt}>CHEGUEI BEM</Text>
        </Pressable>
        <Pressable style={[st.grande, { backgroundColor: '#27272a' }]} onPress={() => { setMinutos(15); iniciar(); }} disabled={enviando}>
          <Ionicons name="time" size={22} color="#fff" /><Text style={st.grandeTxt}>PRECISO DE MAIS 15 MIN</Text>
        </Pressable>
      </FundoK1>
    );
  }

  return (
    <FundoK1>
      <Text style={[k.titulo, { fontSize: 22 }]}>Me acompanhe</Text>
      <Text style={k.mut}>Vai voltar sozinho(a) à noite, pegar um carro de app ou sair para correr? Diga para onde vai e em quanto tempo. A família te vê no mapa e é avisada se você não chegar.</Text>
      <CardK1 style={{ gap: 12 }}>
        <Text style={k.mut}>Para onde você vai? (opcional)</Text>
        <TextInput value={destino} onChangeText={setDestino} placeholder="Ex.: casa, faculdade, trabalho" placeholderTextColor="#666" style={st.input} maxLength={60} />
        <Text style={k.mut}>Tempo para chegar</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TEMPOS.map(t => (
            <Pressable key={t} onPress={() => setMinutos(t)} style={[st.chip, minutos === t && st.chipOn]}>
              <Text style={{ color: '#fff', fontWeight: minutos === t ? '800' : '400' }}>{t < 60 ? `${t} min` : `${t / 60}h${t % 60 ? '30' : ''}`}</Text>
            </Pressable>
          ))}
        </View>
      </CardK1>
      <Pressable style={[st.grande, { backgroundColor: K1.vermelho }]} onPress={iniciar} disabled={enviando}>
        <Ionicons name="navigate" size={24} color="#fff" /><Text style={st.grandeTxt}>COMEÇAR A ME ACOMPANHAR</Text>
      </Pressable>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  input: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#444', color: '#fff', paddingHorizontal: 12, fontSize: 16, backgroundColor: '#111317' },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  grande: { height: 58, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  grandeTxt: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});
