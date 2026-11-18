import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class K1PanicoModule extends NativeModule<{}> {
  // Vigilante: pânico pelo Power, GPS e homem caído
  iniciar(url: string, anonKey: string, token: string, homemCaidoMin: number): Promise<void>;
  parar(): Promise<void>;
  ativo(): boolean;
  // Celular da central: toca como ligação quando chega alerta
  centralIniciar(url: string, anonKey: string, token: string): Promise<void>;
  centralParar(): Promise<void>;
  centralAtiva(): boolean;
  centralTestar(): boolean;
  centralSilenciar(): boolean;
  podeTelaCheia(): boolean;
  abrirPermissaoTelaCheia(): boolean;
  semEconomiaBateria(): boolean;
  pedirSemEconomiaBateria(): boolean;
}

// Opcional: no Expo Go o módulo nativo não existe (precisa de development build).
export default requireOptionalNativeModule<K1PanicoModule>('K1Panico');
