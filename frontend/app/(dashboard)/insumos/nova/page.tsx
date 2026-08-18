"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import toast from "react-hot-toast"
import { useHeader } from "@/contexts/HeaderContext"
import { SolicitacaoForm, type SolicitacaoFormValues } from "@/components/insumos/SolicitacaoForm"
import { criarSolicitacao } from "@/services/insumos.service"

// Link ArrowLeft + rótulo no rightContent do header, mesmo padrão do botão
// "voltar" do CentralTopbar (components/central/workspace/CentralTopbar.tsx) —
// o layout compartilhado (app/(dashboard)/layout.tsx) só expõe title/subtitle/
// rightContent, sem slot dedicado à esquerda.
function VoltarParaLista() {
  return (
    <Link
      href="/insumos"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Voltar
    </Link>
  )
}

export default function NovaSolicitacaoPage() {
  const { setHeader, setRightContent } = useHeader()
  const router = useRouter()

  useEffect(() => {
    setHeader("Nova solicitação", "O item entra na fila de cotação automática")
    setRightContent(<VoltarParaLista />)
    return () => {
      setHeader("", "")
      setRightContent(null)
    }
  }, [setHeader, setRightContent])

  async function enviar(valores: SolicitacaoFormValues, empresaId?: string) {
    await criarSolicitacao(valores, empresaId)
    // Vai para a lista, não para /insumos/[id]: essa tela de detalhe ainda não
    // existe (só a lista e este formulário foram portados). replace, não push:
    // voltar para um formulário já enviado convida a criar a solicitação duas vezes.
    toast.success("Solicitação criada.")
    router.replace("/insumos")
  }

  return <SolicitacaoForm rotuloEnviar="Criar solicitação" onEnviar={enviar} />
}
