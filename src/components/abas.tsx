import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { K1 } from './k1';

/** Estilo da barra de abas inferior (igual ao modelo). */
export function useOpcoesAbas() {
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: K1.vermelho,
    tabBarInactiveTintColor: '#d0d0d0',
    tabBarStyle: {
      backgroundColor: '#050505', borderTopColor: K1.vermelho, borderTopWidth: 1.5,
      height: 72 + insets.bottom, paddingBottom: 12 + insets.bottom, paddingTop: 6,
    },
    tabBarLabelStyle: { fontSize: 12 },
    sceneStyle: { backgroundColor: '#000' },
  } as const;
}

export const icone = (nome: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={nome} color={color as string} size={size} />;
