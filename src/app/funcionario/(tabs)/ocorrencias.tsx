import { FundoK1, CabecalhoK1, EmBreve } from '../../../components/k1';

export default function Ocorrencias() {
  return (
    <FundoK1>
      <CabecalhoK1 tipo="vigilante" />
      <EmBreve icone="clipboard-outline" titulo="Ocorrências" texto="Registre ocorrências do posto com texto, hora e local, direto para a empresa." />
    </FundoK1>
  );
}
