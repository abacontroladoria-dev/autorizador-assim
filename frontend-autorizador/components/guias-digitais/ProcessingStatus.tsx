interface ProcessingStatusProps {
  logs: string[]
  progress: number
  active: boolean
}

export default function ProcessingStatus({ logs, progress, active }: ProcessingStatusProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Status do processamento</p>
          <p className="text-xs text-slate-500">Acompanhe cada etapa enquanto o PDF é processado.</p>
        </div>
        <div className="text-sm font-semibold text-slate-700">{Math.round(progress)}%</div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#3A8FB7] transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-5 max-h-52 overflow-y-auto rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
        {logs.length === 0 ? (
          <p className="text-slate-500">Aguardando upload do PDF...</p>
        ) : (
          logs.map((log, index) => (
            <div key={`${log}-${index}`} className="mb-2 last:mb-0">
              <span className="font-medium text-slate-700">•</span> {log}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 text-xs text-slate-500">
        {active ? "Processamento ativo. Não feche a aba." : "Pronto para iniciar."}
      </div>
    </div>
  )
}
