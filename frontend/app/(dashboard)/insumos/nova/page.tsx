"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useHeader } from "@/contexts/HeaderContext"
import { SolicitacaoForm, type SolicitacaoFormValues } from "@/components/insumos/SolicitacaoForm"
import { criarSolicitacao } from "@/services/insumos.service"

export default function NovaSolicitacaoPage() {
  const { setHeader } = useHeader()
  const router = useRouter()

  useEffect(() => {
    setHeader("Nova solicitação", "O item entra na fila de cotação automática")
    return () => setHeader("", "")
  }, [setHeader])

  async function enviar(valores: SolicitacaoFormValues, empresaId?: string) {
    const criada = await criarSolicitacao(valores, empresaId)
    // replace, não push: voltar para um formulário já enviado convida a criar
    // a solicitação duas vezes.
    router.replace(`/insumos/${criada.id}`)
  }

  return <SolicitacaoForm rotuloEnviar="Criar solicitação" onEnviar={enviar} />
}
