import { FundoK1, CabecalhoK1, EmBreve } from '../../../components/k1';

export default function Mensagens() {
  return (
    <FundoK1>
      <CabecalhoK1 tipo="vigilante" />
      <EmBreve icone="chatbubbles-outline" titulo="Mensagens" texto="Converse com a central da empresa e receba avisos e escalas." />
    </FundoK1>
  );
}
