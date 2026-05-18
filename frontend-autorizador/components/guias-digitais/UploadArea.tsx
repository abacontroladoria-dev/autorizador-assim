"use client"

interface UploadAreaProps {
  onFileSelected: (file: File) => void
  disabled?: boolean
  currentFileName?: string
}

export default function UploadArea({
  onFileSelected,
  disabled,
  currentFileName,
}: UploadAreaProps) {
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onFileSelected(file)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (disabled) return
    const file = event.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
      className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-slate-400 sm:p-8"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <span className="text-2xl">📄</span>
      </div>

      <h2 className="mt-4 text-lg font-semibold text-slate-900">
        Arraste o PDF ou clique para selecionar
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        Cada página do arquivo será processada como uma guia independente.
      </p>

      <label className="mt-6 inline-flex cursor-pointer rounded-full bg-[#3A8FB7] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2f7790] disabled:cursor-not-allowed disabled:opacity-60">
        {currentFileName || "Selecionar arquivo"}
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFile}
          disabled={disabled}
          className="hidden"
        />
      </label>
    </div>
  )
}
