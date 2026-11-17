import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BotaoVermelho, BotaoContorno, Erro } from '../../components/ui';
import { aceitarTermo, lerSessao, sairVigilante } from '../../lib/vigilante';
import { traduzErro } from '../../lib/supabase';

/** Termo que o vigilante aceita antes do primeiro uso. */
export default function TermoFuncionario() {
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function aceitar() {
    setCarregando(true); setErro('');
    try {
      const s = await lerSessao();
      if (!s) { router.replace('/'); return; }
      await aceitarTermo(s);
      router.replace('/funcionario/inicio');
    } catch (e) { setErro(traduzErro(e)); } finally { setCarregando(false); }
  }

  async function recusar() {
    await sairVigilante();
    router.replace('/');
  }

  return (
    <SafeAreaView style={s.tela}>
      <Text style={s.titulo}>TERMO DE CIÊNCIA DO VIGILANTE</Text>
      <ScrollView style={s.caixa} contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={s.p}>O K1 Segurança é uma ferramenta de proteção para você durante o serviço.</Text>
        <Text style={s.p}><Text style={s.b}>Quando funciona:</Text> só entre o "Iniciar turno" e o "Encerrar turno". Fora do turno, nada é enviado.</Text>
        <Text style={s.p}><Text style={s.b}>O que é enviado para a sua empresa:</Text> localização, nível de bateria, se está carregando e a rede Wi-Fi conectada.</Text>
        <Text style={s.p}><Text style={s.b}>O que NÃO é coletado:</Text> fotos, áudio, mensagens, contatos ou qualquer conteúdo pessoal do celular.</Text>
        <Text style={s.p}><Text style={s.b}>Confirmação de presença:</Text> durante o turno, o app pedirá sua senha periodicamente. Senha errada ou falta de resposta gera alerta para o monitoramento.</Text>
        <Text style={s.p}><Text style={s.b}>Senha de coação:</Text> se você estiver rendido, digite a senha de coação. O app mostrará "Confirmado" normalmente e a empresa será avisada em silêncio.</Text>
        <Text style={s.p}><Text style={s.b}>Pânico:</Text> aperte o botão de ligar 4 vezes seguidas para avisar o monitoramento.</Text>
        <Text style={s.p}>Este app não substitui o 190. Seus dados são tratados pela sua empresa conforme a LGPD (Lei 13.709/2018) para proteger sua vida e segurança.</Text>
      </ScrollView>
      <View style={{ gap: 12 }}>
        <BotaoVermelho titulo="LI E ACEITO" icone="checkmark-circle-outline" onPress={aceitar} carregando={carregando} />
        <BotaoContorno titulo="NÃO ACEITO" onPress={recusar} />
        <Erro texto={erro} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000', padding: 20, gap: 16 },
  titulo: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginTop: 10 },
  caixa: { flex: 1, borderWidth: 1, borderColor: '#3a3d45', borderRadius: 10, backgroundColor: '#0e0f12' },
  p: { color: '#d0d4da', fontSize: 15, lineHeight: 22 },
  b: { color: '#fff', fontWeight: '700' },
});
