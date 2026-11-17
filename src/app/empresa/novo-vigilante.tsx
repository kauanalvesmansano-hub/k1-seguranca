import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Campo, BotaoVermelho, BotaoContorno, Erro } from '../../components/ui';
import { supabase, traduzErro } from '../../lib/supabase';

/** A empresa cria o acesso do funcionário. O sistema gera a MATRÍCULA de acesso. */
export default function NovoVigilante() {
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [telefone, setTelefone] = useState('');
  const [posto, setPosto] = useState('');
  const [senha, setSenha] = useState('');
  const [coacao, setCoacao] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [criado, setCriado] = useState<{ nome: string; matricula_acesso: string } | null>(null);

  async function salvar() {
    setErro('');
    if (!nome.trim() || !matricula.trim()) { setErro('Informe nome e matrícula interna.'); return; }
    setCarregando(true);
    try {
      const { data, error } = await supabase.rpc('criar_vigilante', {
        p_nome: nome, p_matricula: matricula, p_telefone: telefone, p_posto: posto, p_senha: senha, p_senha_coacao: coacao,
      });
      if (error) throw error;
      setCriado({ nome: nome.trim(), matricula_acesso: (data as { matricula_acesso: string }).matricula_acesso });
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  if (criado) {
    return (
      <SafeAreaView style={[s.tela, { justifyContent: 'center' }]}>
        <Ionicons name="checkmark-circle" size={80} color="#22c55e" style={{ alignSelf: 'center' }} />
        <Text style={s.titulo}>Acesso criado para {criado.nome}</Text>
        <View style={s.cartao}>
          <Text style={s.mut}>MATRÍCULA (para entrar no app)</Text>
          <Text style={s.matricula}>{criado.matricula_acesso}</Text>
          <Text style={s.mut}>SENHA: a senha normal que você cadastrou</Text>
        </View>
        <Text style={[s.mut, { textAlign: 'center' }]}>
          Entregue esses dados pessoalmente. Combine também a senha de coação com o vigilante e explique quando usar.
        </Text>
        <BotaoVermelho titulo="CONCLUIR" icone="checkmark" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.tela}>
      <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={s.topo}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Ionicons name="arrow-back" size={26} color="#fff" /></Pressable>
          <Text style={s.titulo}>NOVO VIGILANTE</Text>
          <View style={{ width: 26 }} />
        </View>
        <Campo icone="person" placeholder="NOME COMPLETO" autoCapitalize="words" value={nome} onChangeText={setNome} />
        <Campo icone="id-card" placeholder="MATRÍCULA INTERNA DA EMPRESA" value={matricula} onChangeText={setMatricula} />
        <Campo icone="call" placeholder="TELEFONE" keyboardType="phone-pad" value={telefone} onChangeText={setTelefone} />
        <Campo icone="location" placeholder="POSTO" autoCapitalize="words" value={posto} onChangeText={setPosto} />
        <Campo icone="lock-closed" placeholder="SENHA NORMAL (4 A 8 NÚMEROS)" senha keyboardType="number-pad" maxLength={8} value={senha} onChangeText={setSenha} />
        <Campo icone="warning" placeholder="SENHA DE COAÇÃO (4 A 8 NÚMEROS)" senha keyboardType="number-pad" maxLength={8} value={coacao} onChangeText={setCoacao} />
        <Text style={s.mut}>
          A senha de coação é usada se o vigilante estiver rendido: o celular mostra "Confirmado" e o monitoramento recebe um alerta silencioso.
        </Text>
        <BotaoVermelho titulo="CRIAR ACESSO" icone="person-add-outline" onPress={salvar} carregando={carregando} />
        <BotaoContorno titulo="CANCELAR" onPress={() => router.back()} />
        <Erro texto={erro} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000', padding: 20, gap: 16 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  titulo: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  mut: { color: '#9aa0aa', fontSize: 13, lineHeight: 19 },
  cartao: { backgroundColor: '#0e0f12', borderWidth: 1, borderColor: '#e10600', borderRadius: 12, padding: 20, alignItems: 'center', gap: 8 },
  matricula: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 6 },
});
