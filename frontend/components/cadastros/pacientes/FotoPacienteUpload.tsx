"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import { getAvatarColor } from "@/lib/admin/avatar-color"
import {
  getFotoUrlAssinada,
  removerFotoPaciente,
  uploadFotoPaciente,
  validarArquivoFoto,
} from "@/services/pacientesFoto.service"
import { atualizarFotoPaciente } from "@/services/pacientes.service"
import { refetchPacientes } from "@/hooks/usePacientes"

// O upload é IMEDIATO e fica fora do dirty do formulário: o arquivo já subiu
// para o Storage, e deixá-lo pendente de um "Salvar tudo" criaria objeto órfão
// caso o usuário cancelasse a edição.
//
// O bucket é privado, então a exibição usa URL ASSINADA — que expira. Por isso o
// banco guarda o path, e a URL é resolvida a cada montagem.

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export function FotoPacienteUpload({
  idPaciente,
  fotoPath,
  nome,
  podeEditar,
  onFotoAlterada,
}: {
  idPaciente: number
  fotoPath: string | null
  nome: string
  podeEditar: boolean
  onFotoAlterada: (path: string | null) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let ativo = true
    if (!fotoPath) {
      setUrl(null)
      return
    }
    getFotoUrlAssinada(fotoPath).then((assinada) => {
      // Path órfão (objeto apagado por fora) devolve null: cai no fallback de
      // iniciais em vez de mostrar imagem quebrada.
      if (ativo) setUrl(assinada)
    })
    return () => {
      ativo = false
    }
  }, [fotoPath])

  async function selecionar(file: File) {
    const problema = validarArquivoFoto(file)
    if (problema) {
      toast.error(problema)
      return
    }

    setEnviando(true)
    const anterior = fotoPath
    const { path, error } = await uploadFotoPaciente(idPaciente, file)

    if (error || !path) {
      setEnviando(false)
      toast.error("Não foi possível enviar a foto.")
      return
    }

    if (!(await atualizarFotoPaciente(idPaciente, path))) {
      setEnviando(false)
      toast.error("A foto subiu, mas não foi possível vinculá-la ao paciente.")
      return
    }

    onFotoAlterada(path)
    await refetchPacientes()

    // A foto antiga só sai depois que a nova já está gravada. Falhar aqui deixa
    // um órfão no bucket, mas não pode derrubar a troca, que já deu certo.
    if (anterior) void removerFotoPaciente(anterior)

    setEnviando(false)
    toast.success("Foto atualizada.")
  }

  const corFallback = getAvatarColor(String(idPaciente))

  return (
    <div className="relative shrink-0">
      <div className="h-20 w-20 overflow-hidden rounded-full border border-border bg-muted">
        {url ? (
          // <img> cru: o projeto não usa next/image, e a URL assinada é dinâmica.
          <img src={url} alt={`Foto de ${nome}`} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-lg font-semibold text-white"
            style={{ backgroundColor: corFallback }}
            aria-hidden="true"
          >
            {iniciais(nome)}
          </div>
        )}
      </div>

      {enviando && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
          <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
        </div>
      )}

      {podeEditar && !enviando && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Alterar foto do paciente"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Zera o input para reenviar o MESMO arquivo disparar onChange de novo.
              e.target.value = ""
              if (file) void selecionar(file)
            }}
          />
        </>
      )}
    </div>
  )
}
