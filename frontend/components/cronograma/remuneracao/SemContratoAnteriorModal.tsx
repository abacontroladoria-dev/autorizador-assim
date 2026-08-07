"use client"

// Quem não tem o contrato ANTERIOR cadastrado.
//
// Começou como painel rose fixo abaixo do card do total. Um bloco de alarme
// permanente para 34 pessoas não é alarme, é ruído: acende todo mês, ninguém
// age, e ainda competia com o vermelho de "Contém Inconsistência", que nesta
// tela significa outra coisa (dinheiro em dúvida). Virou uma linha dentro do
// card, e o peso mora aqui.
//
// A primeira versão deste modal era só a lista, e errava por dois lados:
//
// - repetia o vocabulário de alarme (um 34 gigante em rose) logo depois de
//   afirmar que isto NÃO é alarme;
// - era um beco sem saída. Dizia "cadastre em Cadastros → Contratos" e parava
//   ali, como um relatório. Quem abre isto abre para AGIR.
//
// Agora: cinza (a cor certa para pendência de cadastro), denominador junto do
// número (34 de 111 diz o tamanho do problema; 34 sozinho não diz nada),
// busca para conferir uma pessoa específica, e as duas saídas reais — copiar a
// lista no formato que cola em planilha, e abrir o cadastro em outra aba sem
// perder a grade já carregada.
//
// A ressalva sobre quem entrou no modelo novo não é enfeite: parte destes 34
// não é pendência nenhuma, é gente que nunca teve contrato anterior. Sem dizer
// isso, a lista vira uma fila de trabalho que não existe.

import { useMemo, useState } from "react"
import Link from "next/link"
import { Check, Copy, ExternalLink, FileClock, Search } from "lucide-react"

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { ProfRemunReal } from "@/lib/remuneracao/calculo"

export interface SemContratoAnteriorModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  pendentes: ProfRemunReal[]
  /** Todos os profissionais com remuneração no mês — o denominador de `pendentes`. */
  total: number
  /**
   * O gatilho que abriu isto. Como ele vive fora da árvore do Dialog (não é um
   * DialogTrigger), a devolução automática de foco do radix não o alcança e o
   * Tab recomeça do topo da página ao fechar — medido, não suposto.
   */
  gatilho?: React.RefObject<HTMLButtonElement | null>
}

/** A busca precisa achar "Galvão" digitando "galvao". */
const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

/** Acima disto, procurar um nome na lista é mais rápido que rolar atrás dele. */
const LIMITE_PARA_BUSCA = 10

export function SemContratoAnteriorModal({
  aberto, onOpenChange, pendentes, total, gatilho,
}: SemContratoAnteriorModalProps) {
  const [busca, setBusca] = useState("")
  const [copiado, setCopiado] = useState(false)

  // Reabrir tem de dar a lista inteira de novo — busca antiga presa no campo é
  // a forma mais fácil de alguém concluir que um nome sumiu da pendência. No
  // handler, não em efeito: fechar é evento, e todo caminho de fechamento
  // (Esc, X, clique fora) passa por aqui.
  function mudarAberto(v: boolean) {
    if (!v) { setBusca(""); setCopiado(false) }
    onOpenChange(v)
  }

  const lista = useMemo(
    () => [...pendentes].sort((a, b) => a.prof.localeCompare(b.prof, "pt-BR")),
    [pendentes],
  )

  const filtrada = useMemo(() => {
    const q = norm(busca.trim())
    return q ? lista.filter(p => norm(p.prof).includes(q)) : lista
  }, [lista, busca])

  // Um nome por linha: cola como coluna em planilha, que é onde esta equipe
  // trabalha a lista (a própria página exporta XLSX). Copia o que está na
  // tela — com filtro ativo, copiar os 34 seria contrariar o que se vê.
  async function copiar() {
    const texto = filtrada.map(p => p.prof).join("\n")
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Clipboard negado pelo navegador — melhor nada que um "Copiado" falso.
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={e => {
          if (!gatilho?.current) return
          e.preventDefault()
          gatilho.current.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileClock size={15} className="text-muted-foreground" aria-hidden />
            Sem contrato anterior cadastrado
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold tabular-nums text-foreground">{lista.length}</span>
            {" de "}
            <span className="tabular-nums">{total}</span>
            {" profissionais com remuneração neste mês não têm nenhum contrato anterior com valor em "}
            <span className="text-foreground">Cadastros → Contratos</span>.
          </DialogDescription>
        </DialogHeader>

        {/* A frase que evita o susto vem primeiro e em contraste cheio: quem
            abre uma lista de 34 pendências dentro de uma tela de folha supõe,
            até ler o contrário, que está faltando dinheiro. */}
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Não muda o valor a pagar.</span>{" "}
          Sem o contrato anterior, ficam sem base de comparação a coluna
          <span className="font-medium text-foreground"> Antigo</span> do Histórico e a
          <span className="font-medium text-foreground"> Análise Futura</span>. Quem entrou já no
          modelo novo não tem contrato anterior; nesses casos não há o que cadastrar.
        </p>

        {/* Busca e contagem moram na moldura da lista, não em caixas próprias:
            três retângulos empilhados para uma coisa só é montagem, não
            desenho. Só existe uma coluna de verdade aqui — o nome. O número do
            contrato vigente está preenchido em 5 dos 35 contratos vigentes do
            banco; como coluna fixa seria um "—" repetido 34 vezes, então
            aparece só como sufixo de quem tem. */}
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
            {lista.length > LIMITE_PARA_BUSCA ? (
              <>
                <Search size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                <label htmlFor="busca-sem-contrato-anterior" className="sr-only">
                  Buscar profissional nesta lista
                </label>
                <input
                  id="busca-sem-contrato-anterior"
                  type="search"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar profissional…"
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </>
            ) : (
              <span className="flex-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                Profissional
              </span>
            )}
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
              {busca.trim()
                ? `${filtrada.length} de ${lista.length}`
                : `${lista.length} ${lista.length === 1 ? "nome" : "nomes"}`}
            </span>
          </div>

          {filtrada.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhum nome desta lista corresponde a “{busca.trim()}”.
            </p>
          ) : (
            <div
              tabIndex={0}
              role="group"
              aria-label="Profissionais sem contrato anterior cadastrado"
              className="max-h-[42vh] overflow-y-auto py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <ul>
                {filtrada.map(p => (
                  <li key={p.prof} className="flex items-baseline justify-between gap-3 px-3 py-1 text-xs">
                    <span className="min-w-0 truncate text-foreground" title={p.prof}>{p.prof}</span>
                    {p.contratoNovo && (
                      <span className="shrink-0 tabular-nums text-muted-foreground" title="Contrato vigente">
                        {p.contratoNovo}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={copiar}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60"
          >
            {copiado
              ? <Check size={12} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
              : <Copy size={12} aria-hidden />}
            {copiado ? "Copiado" : "Copiar lista"}
          </button>
          <Link
            href="/cadastros/contratos"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#2A92C0] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#2A92C0]/90"
          >
            <ExternalLink size={12} aria-hidden />
            Abrir Contratos
            <span className="sr-only">(abre em outra aba)</span>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
