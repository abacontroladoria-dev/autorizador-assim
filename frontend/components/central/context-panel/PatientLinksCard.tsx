import { User, ChevronRight } from 'lucide-react'
import SectionHeader from './SectionHeader'

interface Patient {
  id:       string
  name:     string
  age:      string
  relation: string
  initials: string
  palette:  string
}

const MOCK_PATIENTS: Patient[] = [
  { id: '1', name: 'Lucas Silva',   age: '7 anos', relation: 'Filho', initials: 'LS', palette: 'bg-emerald-100 text-emerald-700' },
  { id: '2', name: 'Beatriz Silva', age: '5 anos', relation: 'Filha', initials: 'BS', palette: 'bg-sky-100 text-sky-600'    },
]

export default function PatientLinksCard() {
  return (
    <div className="px-5 py-4 border-b border-border/60">
      <SectionHeader icon={User} title="Pacientes vinculados" count={MOCK_PATIENTS.length} />
      <div className="space-y-0.5">
        {MOCK_PATIENTS.map(p => (
          <PatientRow key={p.id} patient={p} />
        ))}
      </div>
    </div>
  )
}

function PatientRow({ patient }: { patient: Patient }) {
  return (
    <button className="w-full flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-black/[0.04] transition-colors group text-left">
      <div className={`size-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${patient.palette}`}>
        {patient.initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-tight">{patient.name}</p>
        <p className="text-[10px] text-muted-foreground">{patient.age} · {patient.relation}</p>
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
