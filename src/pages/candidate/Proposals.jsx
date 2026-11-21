// Propuestas y autorizaciones: el asesor/a solo presenta a quien lo autorizó, y la empresa ve el perfil solo si la persona acepta
import { Screen, TopBar } from '../../components/ui'
import { ProposalsInbox } from '../../components/Attribution'
import { CandidateAuthorizations } from '../../components/Network'

export default function Proposals() {
  return (
    <Screen>
      <TopBar back="/" title="Propuestas de tu asesor/a" />
      <div className="flex flex-col gap-4 px-5 pb-8">
        <CandidateAuthorizations />
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Propuestas</h2>
          <ProposalsInbox />
        </section>
      </div>
    </Screen>
  )
}
