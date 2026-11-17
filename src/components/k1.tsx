import type { ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export const K1 = {
  vermelho: '#e10600',
  vermelhoBorda: '#7a0a06',
  verde: '#22c55e',
  amarelo: '#f59e0b',
  texto: '#f2f2f2',
  mutado: '#a3a8b0',
  card: '#0b0c0f',
};

/** Fundo preto com brilho vermelho nas bordas + rolagem. */
export function FundoK1({ children, rolar = true, refresh }: { children: ReactNode; rolar?: boolean; refresh?: ReactNode }) {
  const corpo = rolar
    ? <ScrollView contentContainerStyle={s.conteudo} refreshControl={refresh as never} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[s.conteudo, { flex: 1 }]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <LinearGradient colors={['rgba(225,6,0,0.28)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.4 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', 'rgba(225,6,0,0.18)']} start={{ x: 0.4, y: 0.6 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>{corpo}</SafeAreaView>
    </View>
  );
}

/** Cabeçalho com o logo do lobo (versão vigilante ou empresa) e um ícone à direita. */
export function CabecalhoK1({ tipo, direita }: { tipo: 'vigilante' | 'empresa'; direita?: ReactNode }) {
  const img = tipo === 'vigilante' ? require('../../assets/k1-logo-vigilante.png') : require('../../assets/k1-logo-empresa.png');
  return (
    <View style={s.cabecalho}>
      <Image source={img} style={{ width: '100%', aspectRatio: tipo === 'vigilante' ? 346 / 170 : 340 / 182 }} resizeMode="contain" />
      {direita && <View style={s.cabecalhoDireita}>{direita}</View>}
    </View>
  );
}

/** Card escuro com contorno e brilho vermelho. */
export function CardK1({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const inner = <View style={[s.card, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>{inner}</Pressable> : inner;
}

export function Online({ online }: { online: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? K1.verde : '#ef4444' }} />
      <Text style={{ color: online ? '#86efac' : '#fca5a5', fontSize: 14 }}>{online ? 'Online' : 'Offline'}</Text>
    </View>
  );
}

export function EmBreve({ icone, titulo, texto }: { icone: keyof typeof Ionicons.glyphMap; titulo: string; texto: string }) {
  return (
    <CardK1 style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
      <Ionicons name={icone} size={56} color={K1.vermelho} />
      <Text style={[s.titulo, { fontSize: 20 }]}>{titulo}</Text>
      <Text style={[s.mut, { textAlign: 'center' }]}>{texto}</Text>
      <Text style={s.embreve}>EM BREVE</Text>
    </CardK1>
  );
}

export const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const horaCurta = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
export const horaCompleta = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
export const dataHora = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const s = StyleSheet.create({
  conteudo: { padding: 16, gap: 14, paddingBottom: 30 },
  cabecalho: { alignItems: 'center', marginBottom: 2 },
  cabecalhoDireita: { position: 'absolute', right: 2, top: 4 },
  card: {
    backgroundColor: K1.card, borderRadius: 14, borderWidth: 1.5, borderColor: K1.vermelhoBorda, padding: 16,
    shadowColor: K1.vermelho, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  titulo: { color: '#fff', fontSize: 17, fontWeight: '700' },
  mut: { color: K1.mutado, fontSize: 14 },
  embreve: { color: '#fff', backgroundColor: '#3a3d45', fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
});
