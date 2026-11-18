import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { BotaoVermelho, BotaoContorno, Erro } from '../../components/ui';
import { K1 } from '../../components/k1';
import { supabase, traduzErro } from '../../lib/supabase';
import { entrarComCodigo } from '../../lib/familia';

const PAPEIS = ['Eu', 'Mãe', 'Pai', 'Filho(a)', 'Esposa', 'Marido', 'Avó', 'Avô', 'Outro'];
const LINK_APP = 'https://github.com/kauanalvesmansano-hub/k1-seguranca/releases/latest/download/K1-Seguranca.apk';
const formatar = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** Responsável adiciona uma pessoa e recebe o código de convite (ou gera um novo código: ?id=...). */
export default function NovaPessoa() {
  const { id, nome: nomeAtual } = useLocalSearchParams<{ id?: string; nome?: string }>();
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState('Filho(a)');
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [convite, setConvite] = useState<{ nome: string; codigo: string } | null>(null);

  async function criar() {
    setErro('');
    setCarregando(true);
    try {
      if (id) {
        const { data, error } = await supabase.rpc('novo_convite', { p_vigilante_id: id });
        if (error) throw error;
        setConvite({ nome: nomeAtual ?? '', codigo: (data as { codigo: string }).codigo });
      } else {
        const n = papel === 'Eu' && !nome.trim() ? 'Eu' : nome.trim();
        if (n.length < 2) throw new Error('Informe o nome da pessoa.');
        const { data, error } = await supabase.rpc('criar_membro', { p_nome: n, p_telefone: telefone, p_papel: papel === 'Eu' ? 'Responsável' : papel });
        if (error) throw error;
        setConvite({ nome: n, codigo: (data as { codigo: string }).codigo });
      }
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  async function compartilhar() {
    if (!convite) return;
    await Share.share({
      message: `${convite.nome}, entre na nossa família no K1 Família (proteção, mapa e botão de socorro).\n\n` +
        `1) Instale o app: ${LINK_APP}\n2) Toque em "Pessoal / Família"\n3) Digite o código: ${formatar(convite.codigo)}\n\nO código vale 7 dias e só funciona uma vez.`,
    });
  }

  async function usarNesteCelular() {
    if (!convite) return;
    try { await entrarComCodigo(convite.codigo); router.replace('/familia/termo'); }
    catch (e) { Alert.alert('Erro', traduzErro(e)); }
  }

  if (convite) {
    return (
      <SafeAreaView style={s.tela}>
        <ScrollView contentContainerStyle={{ gap: 16, padding: 20 }}>
          <Ionicons name="checkmark-circle" size={56} color={K1.verde} style={{ alignSelf: 'center' }} />
          <Text style={s.titulo}>Convite pronto{convite.nome ? ` para ${convite.nome}` : ''}</Text>
          <View style={s.codigoBox}>
            <Text style={s.codigoRot}>CÓDIGO DE CONVITE</Text>
            <Text style={s.codigo} selectable>{formatar(convite.codigo)}</Text>
            <Text style={s.codigoRot}>vale 7 dias · uso único</Text>
          </View>
          <BotaoVermelho titulo="ENVIAR PELO WHATSAPP / OUTRO APP" icone="share-social-outline" onPress={compartilhar} />
          <BotaoContorno titulo="COPIAR CÓDIGO" icone="copy-outline" onPress={async () => { await Clipboard.setStringAsync(formatar(convite.codigo)); Alert.alert('Copiado!'); }} />
          <BotaoContorno titulo="É PARA ESTE CELULAR (EU)" icone="phone-portrait-outline" onPress={usarNesteCelular} />
          <Text style={s.mut}>A pessoa instala o app, toca em "Pessoal / Família", digita o código e concorda em compartilhar. Ninguém é monitorado sem saber.</Text>
          <Pressable onPress={() => router.back()} hitSlop={10}><Text style={s.voltar}>CONCLUIR</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.tela}>
      <ScrollView contentContainerStyle={{ gap: 14, padding: 20 }}>
        <Text style={s.titulo}>{id ? `Novo código para ${nomeAtual ?? ''}` : 'Adicionar pessoa'}</Text>
        {id ? (
          <Text style={s.mut}>Use quando a pessoa trocar de celular ou reinstalar o app. O celular antigo é desconectado.</Text>
        ) : (
          <>
            <Text style={s.mut}>Quem é?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PAPEIS.map(p => (
                <Pressable key={p} onPress={() => setPapel(p)} style={[s.chip, papel === p && s.chipOn]}>
                  <Text style={{ color: '#fff', fontWeight: papel === p ? '800' : '400' }}>{p}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={s.input} placeholder={papel === 'Eu' ? 'Seu nome' : 'Nome da pessoa'} placeholderTextColor="#777" value={nome} onChangeText={setNome} maxLength={60} />
            <TextInput style={s.input} placeholder="Celular (opcional)" placeholderTextColor="#777" keyboardType="phone-pad" value={telefone} onChangeText={setTelefone} maxLength={20} />
          </>
        )}
        <BotaoVermelho titulo={id ? 'GERAR NOVO CÓDIGO' : 'CRIAR CONVITE'} icone="key-outline" onPress={criar} carregando={carregando} />
        <Erro texto={erro} />
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={s.voltar}>VOLTAR</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000' },
  titulo: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  mut: { color: '#9aa0aa', fontSize: 14, textAlign: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  chipOn: { backgroundColor: K1.vermelho, borderColor: K1.vermelho },
  input: { height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#444', color: '#fff', paddingHorizontal: 12, fontSize: 16, backgroundColor: '#111317' },
  codigoBox: { borderWidth: 2, borderColor: K1.vermelho, borderRadius: 16, padding: 18, alignItems: 'center', gap: 6, backgroundColor: '#0e0f12' },
  codigoRot: { color: '#9aa0aa', fontSize: 12, letterSpacing: 2 },
  codigo: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 4 },
  voltar: { color: '#9aa0aa', textAlign: 'center', letterSpacing: 2, marginTop: 6 },
});
