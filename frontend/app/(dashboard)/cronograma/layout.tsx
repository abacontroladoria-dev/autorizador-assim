"use client"

import { CronogramaDataProvider, useCronogramaData } from "@/contexts/CronogramaDataContext"
import { DadosUploadPanel } from "@/components/cronograma/solicitacoes/DadosUploadPanel"

function CronogramaLayoutInner({ children }: { children: React.ReactNode }) {
  const { cRows, lRows, dispRows, setCRows, setLRows, setDispRows, onImport } = useCronogramaData()

  return (
    <div className="space-y-6">
      <DadosUploadPanel
        cRows={cRows}
        lRows={lRows}
        dispRows={dispRows}
        onCRows={setCRows}
        onLRows={setLRows}
        onDispRows={setDispRows}
        onImport={onImport}
      />
      {children}
    </div>
  )
}

export default function CronogramaLayout({ children }: { children: React.ReactNode }) {
  return (
    <CronogramaDataProvider>
      <CronogramaLayoutInner>{children}</CronogramaLayoutInner>
    </CronogramaDataProvider>
  )
}
