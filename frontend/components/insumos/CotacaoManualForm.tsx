"use client"

import { useState, type FormEvent } from "react"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CampoCheckbox, CampoSelecao, CampoTexto, Linha } from "@/components/insumos/campos"
import type { OrigemProduto } from "@/lib/insumos/tipos"

// Cotação lançada à mão, para quando a pesquisa automática não encontra nada
// bom ou o operador já tem uma proposta em mãos. Porta CotacaoManualForm.tsx
// do AXIUM — mesmos campos, mesmo nome de chave (o DTO do servidor,
// modules/insumos/dto/fluxo.dto.ts, espera exatamente este shape).

export type CotacaoManualValues = {
  fornecedor: string
  produtoEncontrado: string
  valorUnitario: number
  quantidade: number
  frete?: number
  parcelamentoDescricao?: string
  condicaoSemJuros: boolean
  valorTotalParcelasSemJuros?: number
  valorTotalParcelasComJuros?: number
  prazoEntregaDescricao?: string
  prazoEntregaOrdemDias?: number
  linkProduto: string
  origem: OrigemProduto
}

const VAZIO: CotacaoManualValues = {
  fornecedor: "",
  produtoEncontrado: "",
  valorUnitario: 0,
  quantidade: 1,
  condicaoSemJuros: true,
  linkProduto: "",
  origem: "NACIONAL",
}

export function CotacaoManualForm({ onSubmit }: { onSubmit: (input: CotacaoManualValues) => Promise<void> }) {
  const [aberto, setAberto] = useState(false)
  const [valores, setValores] = useState<CotacaoManualValues>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  function set<K extends keyof CotacaoManualValues>(chave: K, valor: CotacaoManualValues[K]) {
    setValores((prev) => ({ ...prev, [chave]: valor }))
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await onSubmit(valores)
      setValores(VAZIO)
      setAberto(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a cotação. Tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        Adicionar cotação manual
      </Button>
    )
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-border p-4">
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
        <CampoTexto label="Fornecedor" valor={valores.fornecedor} onChange={(v) => set("fornecedor", v)} obrigatorio />
        <CampoTexto
          label="Produto encontrado"
          valor={valores.produtoEncontrado}
          onChange={(v) => set("produtoEncontrado", v)}
          obrigatorio
        />
      </Linha>

      <Linha>
        <CampoTexto
          label="Valor unitário (R$)"
          tipo="number"
          min={0}
          step="any"
          valor={valores.valorUnitario}
          onChange={(v) => set("valorUnitario", Number(v))}
          obrigatorio
        />
        <CampoTexto
          label="Quantidade"
          tipo="number"
          min={0}
          step="any"
          valor={valores.quantidade}
          onChange={(v) => set("quantidade", Number(v))}
          obrigatorio
        />
      </Linha>

      <Linha>
        <CampoTexto
          label="Frete (R$)"
          tipo="number"
          min={0}
          step="any"
          valor={valores.frete ?? ""}
          onChange={(v) => set("frete", v === "" ? undefined : Number(v))}
        />
        <CampoSelecao
          label="Origem"
          valor={valores.origem}
          onChange={(v) => set("origem", v as OrigemProduto)}
          obrigatorio
        >
          <option value="NACIONAL">Nacional</option>
          <option value="INTERNACIONAL">Internacional</option>
        </CampoSelecao>
      </Linha>

      <CampoCheckbox
        label="Condição sem juros"
        marcado={valores.condicaoSemJuros}
        onChange={(v) => set("condicaoSemJuros", v)}
      />

      <Linha>
        <CampoTexto
          label="Descrição do parcelamento"
          valor={valores.parcelamentoDescricao ?? ""}
          onChange={(v) => set("parcelamentoDescricao", v)}
        />
        {valores.condicaoSemJuros ? (
          <CampoTexto
            label="Total parcelado sem juros (R$)"
            tipo="number"
            min={0}
            step="any"
            valor={valores.valorTotalParcelasSemJuros ?? ""}
            onChange={(v) => set("valorTotalParcelasSemJuros", v === "" ? undefined : Number(v))}
          />
        ) : (
          <CampoTexto
            label="Total parcelado com juros (R$)"
            tipo="number"
            min={0}
            step="any"
            valor={valores.valorTotalParcelasComJuros ?? ""}
            onChange={(v) => set("valorTotalParcelasComJuros", v === "" ? undefined : Number(v))}
          />
        )}
      </Linha>

      <Linha>
        <CampoTexto
          label="Prazo de entrega (descrição)"
          valor={valores.prazoEntregaDescricao ?? ""}
          onChange={(v) => set("prazoEntregaDescricao", v)}
        />
        <CampoTexto
          label="Prazo de entrega (dias)"
          tipo="number"
          min={0}
          step={1}
          valor={valores.prazoEntregaOrdemDias ?? ""}
          onChange={(v) => set("prazoEntregaOrdemDias", v === "" ? undefined : Number(v))}
        />
      </Linha>

      <CampoTexto
        label="Link do produto"
        tipo="url"
        valor={valores.linkProduto}
        onChange={(v) => set("linkProduto", v)}
        obrigatorio
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? "Salvando…" : "Registrar cotação"}
        </Button>
      </div>
    </form>
  )
}
