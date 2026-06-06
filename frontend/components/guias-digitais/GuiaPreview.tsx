interface GuiaPreviewProps {
  base64Pdf: string | null
}

export default function GuiaPreview({ base64Pdf }: GuiaPreviewProps) {
  if (!base64Pdf) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Selecione um resultado para visualizar o PDF gerado.
      </div>
    )
  }

  const src = `data:application/pdf;base64,${base64Pdf}`

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <iframe
        src={src}
        title="Pré-visualização da guia"
        className="h-[520px] w-full rounded-3xl"
      />
    </div>
  )
}
