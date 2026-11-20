import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FundoK1, CardK1, K1, s as k } from '../../components/k1';
import { excluirContato, lerSessao, meuPlano, meusContatos, salvarContato, type ContatoEmergencia, type MeuPlano } from '../../lib/vigilante';
import { traduzErro } from '../../lib/supabase';

/** Plano do vigilante: quem recebe o WhatsApp quando ele aperta o Power 4 vezes. */
export default function ContatosEmergencia() {
  const [lista, setLista] = useState<ContatoEmergencia[]>([]);
  const [plano, setPlano] = useState<MeuPlano | null>(null);
  const [nome, setNome] = useState('');
  const [zap, setZap] = useState('');
  const [tipo, setTipo] = useState<'emergencia' | 'empresa'>('emergencia');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ txt: string; cor: string } | null>(null);

  const carregar = useCallback(async () => {
    const s = await lerSessao(); if (!s) return;
    try { setPlano(await meuPlano(s)); setLista(await meusContatos(s)); } catch (e) { setMsg({ txt: traduzErro(e), cor: '#ff6b66' }); }
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function adicionar() {
    const s = await lerSessao(); if (!s) return;
    setSalvando(true); setMsg(null);
    try {
      await salvarContato(s, tipo, nome, zap);
      setNome(''); setZap(''); setTipo('emergencia');
      setMsg({ txt: 'Contato salvo ✓', cor: K1.verde });
      carregar();
    } catch (e) { setMsg({ txt: traduzErro(e), cor: '#ff6b66' }); }
    finally { setSalvando(false); }
  }

  function remover(c: ContatoEmergencia) {
    Alert.alert('Remover contato?', `${c.nome} não vai mais receber os seus pedidos de socorro.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        const s = await lerSessao(); if (!s) return;
        try { await excluirContato(s, c.id); carregar(); } catch (e) { Alert.alert('Erro', traduzErro(e)); }
      } },
    ]);
  }

  const fmt = (n: string) => n.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');

  return (
    <FundoK1>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
        <Text style={[k.titulo, { fontSize: 22 }]}>Contatos de emergência</Text>
      </View>
      <Text style={k.mut}>
        Quando você apertar o Power 4 vezes (ou digitar a senha de coação, cair ou bater o carro), todos estes números recebem
        na hora uma mensagem no WhatsApp com a sua localização. Nada aparece na tela do seu celular.
      </Text>

      {plano && plano.tipo !== 'autonomo' && (
        <CardK1><Text style={k.mut}>Os contatos de alerta da sua conta são cadastrados pela empresa.</Text></CardK1>
      )}

      <CardK1 style={{ gap: 10 }}>
        {lista.length === 0 && <Text style={{ color: K1.amarelo }}>Nenhum contato ainda. Cadastre pelo menos 1.</Text>}
        {lista.map(c => (
          <View key={c.id} style={st.item}>
            <Ionicons name={c.tipo === 'empresa' ? 'business' : 'heart'} size={20} color={c.tipo === 'empresa' ? '#60a5fa' : '#f472b6'} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{c.nome}</Text>
              <Text style={k.mut}>{c.tipo === 'empresa' ? 'Empresa onde trabalho' : 'Emergência'} · {fmt(c.whatsapp)}</Text>
            </View>
            <Pressable onPress={() => remover(c)} hitSlop={10}><Ionicons name="trash-outline" size={20} color="#888" /></Pressable>
          </View>
        ))}
      </CardK1>

      {lista.length < 6 && (
        <CardK1 style={{ gap: 10 }}>
          <Text style={[k.titulo, { fontSize: 16 }]}>Adicionar contato</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['emergencia', 'empresa'] as const).map(t => (
              <Pressable key={t} onPress={() => setTipo(t)} style={[st.chip, tipo === t && st.chipOn]}>
                <Text style={{ color: '#fff', fontWeight: tipo === t ? '800' : '400' }}>{t === 'emergencia' ? 'Família / amigo' : 'Minha empresa'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={nome} onChangeText={setNome} placeholder="Nome (ex.: Esposa, Supervisor)" placeholderTextColor="#8d939c" style={st.campo} maxLength={80} autoCapitalize="words" />
          <TextInput value={zap} onChangeText={setZap} placeholder="WhatsApp com DDD (ex.: 43 99999-1234)" placeholderTextColor="#8d939c" style={st.campo} keyboardType="phone-pad" maxLength={20} />
          <Pressable onPress={adicionar} disabled={salvando} style={st.botao}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Text style={st.botaoTxt}>Salvar contato</Text>}
          </Pressable>
        </CardK1>
      )}
      {msg && <Text style={{ color: msg.cor, textAlign: 'center', fontWeight: '700' }}>{msg.txt}</Text>}
      {plano?.tipo === 'autonomo' && (
        <CardK1 style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => router.push('/empresa/plano')}>
          <Ionicons name="card" size={24} color={K1.verde} />
          <View style={{ flex: 1 }}>
            <Text style={k.titulo}>Meu plano · R$ {Number(plano.valor).toFixed(2).replace('.', ',')}/mês</Text>
            <Text style={k.mut}>{plano.teste_ate && new Date(plano.teste_ate) > new Date() ? `Grátis até ${new Date(plano.teste_ate).toLocaleDateString('pt-BR')}` : 'Ver faturas e pagar por Pix'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={K1.mutado} />
        </CardK1>
      )}
      <Text style={[k.mut, { fontSize: 12 }]}>Avise seus contatos: a mensagem vem do WhatsApp do K1 Segurança. Peça para salvarem o número, para não cair como spam.</Text>
    </FundoK1>
  );
}

const st = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#1d2129', borderWidth: 1, borderColor: '#2f343d' },
  chipOn: { backgroundColor: K1.vermelho, borderColor: '#ff4d47' },
  campo: { backgroundColor: '#0f1115', borderWidth: 1, borderColor: '#2a2f37', borderRadius: 10, color: '#fff', paddingHorizontal: 12, height: 48, fontSize: 16 },
  botao: { height: 52, borderRadius: 12, backgroundColor: K1.vermelho, alignItems: 'center', justifyContent: 'center' },
  botaoTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
