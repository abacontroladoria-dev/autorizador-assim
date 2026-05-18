import type { ProcessedGuiaItem } from "@/lib/guias-digitais/types"

interface ResultadoListaProps {
  results: ProcessedGuiaItem[]
  onPreview: (item: ProcessedGuiaItem) => void
  onDownload: (item: ProcessedGuiaItem) => void
}

export default function ResultadoLista({ results, onPreview, onDownload }: ResultadoListaProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Sem resultados para exibir ainda. Faça upload de um PDF para iniciar o processamento.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {results.map((item) => (
        <div key={`guia-${item.pageIndex}`} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Guia página {item.pageIndex}</p>
              <p className="text-sm text-slate-500">Número identificado: {item.guiaNumero ?? "Não localizado"}</p>
              <p className="text-xs text-slate-500">Terapias: {item.terapias.length}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPreview(item)}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Visualizar PDF
              </button>
              <button
                type="button"
                onClick={() => onDownload(item)}
                className="rounded-full bg-[#3A8FB7] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2f7790]"
              >
                Baixar PDF final
              </button>
            </div>
          </div>

          {item.error && (
            <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              Erro: {item.error}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
