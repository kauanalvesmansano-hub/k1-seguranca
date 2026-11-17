import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class K1PanicoModule extends NativeModule<{}> {
  iniciar(url: string, anonKey: string, token: string): Promise<void>;
  parar(): Promise<void>;
  ativo(): boolean;
}

// Opcional: no Expo Go o módulo nativo não existe (precisa de development build).
export default requireOptionalNativeModule<K1PanicoModule>('K1Panico');
