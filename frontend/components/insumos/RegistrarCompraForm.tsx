"use client"

import { useState, type FormEvent } from "react"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CampoTexto, CampoTextoLongo, Linha } from "@/components/insumos/campos"
import type { CotacaoCompra } from "@/services/insumos.service"

// Registro da compra efetivada, depois da aprovação. Porta
// RegistrarCompraForm.tsx do AXIUM — pré-preenche a partir da cotação
// selecionada, mas tudo fica editável: o que foi de fato comprado pode
// divergir da cotação (preço mudou, fornecedor trocou o produto etc.).

export type RegistrarCompraValues = {
  dataCompra: string
  fornecedorEscolhido: string
  produtoComprado: string
  valorUnitarioFinal: number
  freteFinal?: number
  valorTotalFinal: number
  formaPagamento: string
  parcelamentoDescricao?: string
  cartaoUltimosDigitos?: string
  numeroPedido: string
  previsaoEntrega: string
  nfComprovanteUrl?: string
  observacoes?: string
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function valoresIniciais(cotacaoSelecionada: CotacaoCompra | null): RegistrarCompraValues {
  if (!cotacaoSelecionada) {
    return {
      dataCompra: hoje(),
      fornecedorEscolhido: "",
      produtoComprado: "",
      valorUnitarioFinal: 0,
      valorTotalFinal: 0,
      formaPagamento: "",
      numeroPedido: "",
      previsaoEntrega: hoje(),
    }
  }
  return {
    dataCompra: hoje(),
    fornecedorEscolhido: cotacaoSelecionada.fornecedor,
    produtoComprado: cotacaoSelecionada.produto_encontrado,
    valorUnitarioFinal: Number(cotacaoSelecionada.valor_unitario),
    freteFinal: cotacaoSelecionada.frete ? Number(cotacaoSelecionada.frete) : undefined,
    valorTotalFinal: Number(cotacaoSelecionada.valor_total_com_frete),
    formaPagamento: cotacaoSelecionada.forma_pagamento_decisao,
    parcelamentoDescricao: cotacaoSelecionada.parcelamento_descricao ?? undefined,
    numeroPedido: "",
    previsaoEntrega: hoje(),
  }
}

export function RegistrarCompraForm({
  cotacaoSelecionada,
  onSubmit,
}: {
  cotacaoSelecionada: CotacaoCompra | null
  onSubmit: (input: RegistrarCompraValues) => Promise<void>
}) {
  const [valores, setValores] = useState<RegistrarCompraValues>(() => valoresIniciais(cotacaoSelecionada))
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function set<K extends keyof RegistrarCompraValues>(chave: K, valor: RegistrarCompraValues[K]) {
    setValores((prev) => ({ ...prev, [chave]: valor }))
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await onSubmit(valores)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a compra. Tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/60"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <Linha>
        <CampoTexto
          label="Data da compra"
          tipo="date"
          valor={valores.dataCompra}
          onChange={(v) => set("dataCompra", v)}
          obrigatorio
        />
        <CampoTexto
          label="Previsão de entrega"
          tipo="date"
          valor={valores.previsaoEntrega}
          onChange={(v) => set("previsaoEntrega", v)}
          obrigatorio
        />
      </Linha>

      <Linha>
        <CampoTexto
          label="Fornecedor escolhido"
          valor={valores.fornecedorEscolhido}
          onChange={(v) => set("fornecedorEscolhido", v)}
          obrigatorio
        />
        <CampoTexto
          label="Produto comprado"
          valor={valores.produtoComprado}
          onChange={(v) => set("produtoComprado", v)}
          obrigatorio
        />
      </Linha>

      <Linha>
        <CampoTexto
          label="Valor unitário final (R$)"
          tipo="number"
          min={0}
          step="any"
          valor={valores.valorUnitarioFinal}
          onChange={(v) => set("valorUnitarioFinal", Number(v))}
          obrigatorio
        />
        <CampoTexto
          label="Frete final (R$)"
          tipo="number"
          min={0}
          step="any"
          valor={valores.freteFinal ?? ""}
          onChange={(v) => set("freteFinal", v === "" ? undefined : Number(v))}
        />
      </Linha>

      <Linha>
        <CampoTexto
          label="Valor total final (R$)"
          tipo="number"
          min={0}
          step="any"
          valor={valores.valorTotalFinal}
          onChange={(v) => set("valorTotalFinal", Number(v))}
          obrigatorio
        />
        <CampoTexto
          label="Forma de pagamento"
          valor={valores.formaPagamento}
          onChange={(v) => set("formaPagamento", v)}
          obrigatorio
        />
      </Linha>

      <Linha>
        <CampoTexto
          label="Descrição do parcelamento"
          valor={valores.parcelamentoDescricao ?? ""}
          onChange={(v) => set("parcelamentoDescricao", v)}
        />
        <CampoTexto
          label="Últimos 4 dígitos do cartão"
          valor={valores.cartaoUltimosDigitos ?? ""}
          onChange={(v) => set("cartaoUltimosDigitos", v)}
        />
      </Linha>

      <CampoTexto
        label="Número do pedido"
        valor={valores.numeroPedido}
        onChange={(v) => set("numeroPedido", v)}
        obrigatorio
      />
      <CampoTexto
        label="Link do comprovante/NF"
        tipo="url"
        valor={valores.nfComprovanteUrl ?? ""}
        onChange={(v) => set("nfComprovanteUrl", v)}
      />
      <CampoTextoLongo label="Observações" valor={valores.observacoes ?? ""} onChange={(v) => set("observacoes", v)} />

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Registrando…" : "Registrar compra"}
        </Button>
      </div>
    </form>
  )
}
