import SectionLayout from '../components/workspace/SectionLayout'
import { futureSections } from '../navigation/config'

export default function Projections() {
  return <SectionLayout title="Futuro" description="Esplora le possibilità e dai una direzione ai tuoi risparmi." sections={futureSections} />
}
