import { useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../lib/supabase';

/** Se já estiver logado, o novo plano fica na mesma conta: troca os campos de e-mail/senha por um aviso. */
export function ContaAtual({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);
  if (email === undefined) return null;
  if (!email) return <>{children}</>;
  return (
    <View style={{ borderWidth: 1, borderColor: '#22c55e', borderRadius: 10, padding: 12, gap: 4 }}>
      <Text style={{ color: '#22c55e', fontWeight: '800' }}>Este plano vai ficar na sua conta</Text>
      <Text style={{ color: '#f2f2f2' }}>{email}</Text>
      <Text style={{ color: '#a3a8b0', fontSize: 12 }}>Cada plano tem o seu teste grátis e a sua própria mensalidade.</Text>
    </View>
  );
}
