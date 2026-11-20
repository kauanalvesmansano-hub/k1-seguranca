import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, type TextInputProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CORES } from '../lib/config';

/** Tela com a arte K1 no topo e conteúdo embaixo (mesmo visual da tela de login). */
export function TelaK1({ children, rodape = true }: { children: ReactNode; rodape?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: CORES.fundo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View>
          <Image source={require('../../assets/k1-topo.jpg')} style={s.topo} resizeMode="cover" />
          <LinearGradient colors={['transparent', '#000']} style={s.degrade} />
        </View>
        <View style={s.conteudo}>{children}</View>
        {rodape && <Rodape />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Campo({ icone, senha, ...props }: TextInputProps & { icone: keyof typeof Ionicons.glyphMap; senha?: boolean }) {
  const [oculto, setOculto] = useState(true);
  return (
    <View style={s.campo}>
      <Ionicons name={icone} size={22} color="#d6d6d6" style={{ width: 28 }} />
      <View style={s.divisor} />
      <TextInput
        placeholderTextColor="#8d939c"
        style={s.input}
        secureTextEntry={senha && oculto}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      {senha && (
        <Pressable onPress={() => setOculto(!oculto)} hitSlop={12}>
          <Ionicons name={oculto ? 'eye-off-outline' : 'eye-outline'} size={22} color="#9aa0aa" />
        </Pressable>
      )}
    </View>
  );
}

export function BotaoVermelho({ titulo, onPress, carregando, icone = 'log-in-outline' }: {
  titulo: string; onPress: () => void; carregando?: boolean; icone?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable onPress={onPress} disabled={carregando} style={({ pressed }) => [{ opacity: pressed || carregando ? 0.8 : 1 }]}>
      <LinearGradient colors={['#ff1a10', CORES.vermelho, CORES.vermelhoEscuro]} style={s.botao}>
        {carregando ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name={icone} size={24} color="#fff" />
            <Text style={s.botaoTxt}>{titulo}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function BotaoContorno({ titulo, onPress, icone }: { titulo: string; onPress: () => void; icone?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.contorno, pressed && { backgroundColor: '#1a1c22' }]}>
      {icone && <Ionicons name={icone} size={22} color="#fff" />}
      <Text style={s.botaoTxt}>{titulo}</Text>
    </Pressable>
  );
}

export function Erro({ texto }: { texto: string }) {
  return texto ? <Text style={s.erro}>{texto}</Text> : null;
}

function Rodape() {
  const itens: { nome: string; icone: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { nome: 'DISCIPLINA', icone: 'shield-check-outline' },
    { nome: 'COMPROMISSO', icone: 'handshake-outline' },
    { nome: 'SEGURANÇA', icone: 'lock' },
    { nome: 'EXCELÊNCIA', icone: 'star' },
  ];
  return (
    <View style={s.rodape}>
      <View style={s.linhaVermelha} />
      <View style={s.rodapeItens}>
        {itens.map((it, i) => (
          // Cadeado de SEGURANÇA: segurar 5 s abre o K1 Monitoramento (acesso oculto do dono do K1)
          <Pressable key={it.nome} style={[s.rodapeItem, i > 0 && { borderLeftWidth: 1, borderLeftColor: CORES.vermelhoEscuro }]}
            onLongPress={it.icone === 'lock' ? () => router.push('/monitor') : undefined} delayLongPress={5000}>
            <MaterialCommunityIcons name={it.icone} size={22} color="#e8e8e8" />
            <Text style={s.rodapeTxt}>{it.nome}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.rodapeMarca}>K1  S E G U R A N Ç A</Text>
    </View>
  );
}

const s = StyleSheet.create({
  topo: { width: '100%', aspectRatio: 720 / 790 },
  degrade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 },
  conteudo: { flex: 1, paddingHorizontal: 22, paddingTop: 8, gap: 14 },
  campo: {
    flexDirection: 'row', alignItems: 'center', height: 58, borderRadius: 10, borderWidth: 1,
    borderColor: CORES.borda, backgroundColor: 'rgba(20,22,26,0.92)', paddingHorizontal: 16,
  },
  divisor: { width: 1, height: 30, backgroundColor: '#555a63', marginHorizontal: 14 },
  input: { flex: 1, color: CORES.texto, fontSize: 17, letterSpacing: 0.5 },
  botao: {
    height: 58, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    borderWidth: 1, borderColor: '#ff4d47',
  },
  botaoTxt: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  contorno: {
    height: 58, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    borderWidth: 1, borderColor: CORES.borda, backgroundColor: 'rgba(20,22,26,0.92)',
  },
  erro: { color: '#ff6b66', textAlign: 'center', fontSize: 14 },
  rodape: { marginTop: 24, backgroundColor: '#050505', paddingBottom: 10 },
  linhaVermelha: { height: 2, backgroundColor: CORES.vermelho },
  rodapeItens: { flexDirection: 'row', paddingVertical: 12 },
  rodapeItem: { flex: 1, alignItems: 'center', gap: 6 },
  rodapeTxt: { color: '#e8e8e8', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  rodapeMarca: { color: '#cfcfcf', textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 4 },
});
