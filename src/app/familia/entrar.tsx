import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { TelaK1, Campo, BotaoVermelho, BotaoContorno, Erro } from '../../components/ui';
import { entrarComCodigo, FAMILIA_ADICIONAL, FAMILIA_PRIMEIRO } from '../../lib/familia';
import { traduzErro } from '../../lib/supabase';

/** K1 Família: entrar com o código de convite OU criar/gerenciar como responsável. */
export default function EntrarFamilia() {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro('');
    const c = codigo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (c.length !== 8) { setErro('O código tem 8 letras e números (ex.: AB3K-9QXZ).'); return; }
    setCarregando(true);
    try {
      await entrarComCodigo(c);
      router.replace('/familia/termo');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  return (
    <TelaK1>
      <Text style={s.titulo}>K1 FAMÍLIA · PROTEÇÃO PESSOAL</Text>
      <Text style={s.sub}>Mapa da família ao vivo, botão de socorro e aviso de chegada.</Text>

      <Text style={s.secao}>RECEBI UM CÓDIGO DE CONVITE</Text>
      <Campo icone="key-outline" placeholder="CÓDIGO (EX.: AB3K-9QXZ)" autoCapitalize="characters" autoCorrect={false}
        maxLength={9} value={codigo} onChangeText={setCodigo} />
      <BotaoVermelho titulo="ENTRAR NA FAMÍLIA" icone="people-outline" onPress={entrar} carregando={carregando} />
      <Erro texto={erro} />

      <View style={s.linha} />
      <Text style={s.secao}>SOU O RESPONSÁVEL</Text>
      <Text style={s.preco}>30 dias grátis · depois R$ {FAMILIA_PRIMEIRO},00/mês a 1ª pessoa + R$ {FAMILIA_ADICIONAL},00 cada pessoa a mais</Text>
      <BotaoContorno titulo="CRIAR MINHA FAMÍLIA" icone="add-circle-outline" onPress={() => router.push('/familia/cadastro')} />
      <BotaoContorno titulo="JÁ TENHO CONTA" icone="log-in-outline" onPress={() => router.push('/empresa/login')} />
      <Pressable onPress={() => router.back()} hitSlop={10}><Text style={s.voltar}>VOLTAR</Text></Pressable>
    </TelaK1>
  );
}

const s = StyleSheet.create({
  titulo: { color: '#fff', textAlign: 'center', letterSpacing: 2, fontSize: 16, fontWeight: '900' },
  sub: { color: '#9aa0aa', textAlign: 'center', fontSize: 13, marginBottom: 6 },
  secao: { color: '#cfcfcf', letterSpacing: 2, fontSize: 12, fontWeight: '800', marginTop: 6 },
  preco: { color: '#4ade80', fontSize: 13, textAlign: 'center' },
  linha: { height: 1, backgroundColor: '#2a2d35', marginVertical: 8 },
  voltar: { color: '#9aa0aa', textAlign: 'center', marginTop: 10, letterSpacing: 2 },
});
