"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { ClipboardList, PackageSearch, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PrioridadeChip } from "@/components/insumos/chips"
import {
  CampoChips,
  CampoSelecao,
  CampoTexto,
  CampoTextoLongo,
  Linha,
  Secao,
} from "@/components/insumos/campos"
import {
  CATEGORIA_LABEL,
  ORDEM_PRIORIDADE_EXIBICAO,
  PRIORIDADE_LABEL,
  SETORES_COMPRA,
  UNIDADES_MEDIDA,
  sugerirCategoria,
} from "@/lib/insumos/rotulos"
import { CATEGORIAS_COMPRA, type CategoriaCompra, type Prioridade } from "@/lib/insumos/tipos"
import { listarEmpresas, type EmpresaVinculada } from "@/services/insumos.service"

// Formulário interno de solicitação de compra (o de dentro do sistema, com
// login — o do link público é outra peça e depende de API ainda não portada).
// Porta components/compras/SolicitacaoForm.tsx do AXIUM.

const OUTRO_SETOR = "Outro"
const OUTRO_UNIDADE = "Outra"

// Descrição e marca são digitadas como chips e concatenadas com "; " antes de ir
// ao servidor, que só vê uma string. Não é cosmético: `descricao_detalhada`
// alimenta calcularScoreCompatibilidade, que compara TERMOS — parágrafo corrido
// dilui o score com stopwords. Mantido idêntico ao AXIUM porque o score portado
// e seus testes assumem este formato.
const SEPARADOR_CHIPS = "; "

function paraChips(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(SEPARADOR_CHIPS)
    .map((v) => v.trim())
    .filter(Boolean)
}

export type SolicitacaoFormValues = {
  setor: string
  categoria: CategoriaCompra
  categoriaOutro?: string
  prioridade: Prioridade
  justificativaCompra: string
  nomeItem: string
  descricaoDetalhada: string
  quantidade: number
  unidadeMedida: string
  marcaDesejada?: string
  modeloDesejado?: string
  cor?: string
  tamanhoMedidaCapacidade?: string
  material?: string
  linkReferencia: string
  marketplacePermitido: string
  prazoMaximoEntregaDias: number
}

type Estado = Omit<SolicitacaoFormValues, "categoria"> & { categoria: CategoriaCompra | "" }

const PADROES: Estado = {
  // Vazio de propósito: a tela deve abrir sem setor pré-marcado, para não
  // deixar passar uma escolha que ninguém fez.
  setor: "",
  categoria: "",
  prioridade: "NORMAL",
  justificativaCompra: "",
  nomeItem: "",
  descricaoDetalhada: "",
  quantidade: 1,
  unidadeMedida: UNIDADES_MEDIDA[0],
  linkReferencia: "",
  marketplacePermitido: "Mercado Livre",
  prazoMaximoEntregaDias: 7,
}

export function SolicitacaoForm({
  valoresIniciais,
  incluirSetor = true,
  incluirEmpresa = true,
  rotuloEnviar,
  onEnviar,
}: {
  valoresIniciais?: Partial<SolicitacaoFormValues>
  incluirSetor?: boolean
  /** false ao editar: a solicitação já pertence a uma empresa, e o PATCH não tem como trocá-la. */
  incluirEmpresa?: boolean
  rotuloEnviar: string
  /** Recebe também a empresa escolhida — vira o header x-empresa-id na escrita. */
  onEnviar: (valores: SolicitacaoFormValues, empresaId?: string) => Promise<void>
}) {
  const [valores, setValores] = useState<Estado>({ ...PADROES, ...valoresIniciais })
  const [detalhes, setDetalhes] = useState<string[]>(() => paraChips(valoresIniciais?.descricaoDetalhada))
  const [marcas, setMarcas] = useState<string[]>(() => paraChips(valoresIniciais?.marcaDesejada))
  const [setorLivre, setSetorLivre] = useState(
    Boolean(valoresIniciais?.setor) &&
      !SETORES_COMPRA.includes((valoresIniciais?.setor ?? "") as (typeof SETORES_COMPRA)[number])
  )
  const [unidadeLivre, setUnidadeLivre] = useState(
    Boolean(valoresIniciais?.unidadeMedida) &&
      !UNIDADES_MEDIDA.includes((valoresIniciais?.unidadeMedida ?? "") as (typeof UNIDADES_MEDIDA)[number])
  )
  // Trava a sugestão automática de categoria: depois que a pessoa escolheu à mão,
  // continuar sugerindo sobrescreveria a decisão dela a cada tecla.
  const [categoriaEscolhida, setCategoriaEscolhida] = useState(Boolean(valoresIniciais?.categoria))
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enviandoRef = useRef(false)

  const [empresas, setEmpresas] = useState<EmpresaVinculada[]>([])
  const [empresaId, setEmpresaId] = useState<string>("")

  // O AXIUM não tinha este seletor: lá a unidade ativa vinha do JWT. Aqui, com
  // três empresas, sem escolha explícita toda solicitação cairia na empresa
  // padrão em silêncio — por isso o campo abre vazio, e não pré-marcado com a
  // padrão, no mesmo espírito do Setor logo abaixo.
  useEffect(() => {
    if (!incluirEmpresa) return
    let vivo = true
    listarEmpresas()
      .then((lista) => {
        if (!vivo) return
        setEmpresas(lista)
      })
      .catch(() => {
        // Falha aqui não impede lançar: sem header, o servidor usa a padrão. Só
        // não dá para escolher.
        if (vivo) setEmpresas([])
      })
    return () => {
      vivo = false
    }
  }, [incluirEmpresa])

  function set<K extends keyof Estado>(chave: K, valor: Estado[K]) {
    setValores((prev) => ({ ...prev, [chave]: valor }))
  }

  function sugerir(nome: string, listaDetalhes: string[]) {
    if (categoriaEscolhida) return
    const sugestao = sugerirCategoria(nome, listaDetalhes.join(" "))
    if (sugestao) set("categoria", sugestao)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    // Guarda por ref, não por state: dois cliques rápidos disparam antes do
    // re-render, e o formulário criaria duas solicitações.
    if (enviandoRef.current) return
    setErro(null)

    if (incluirEmpresa && empresas.length > 1 && !empresaId) {
      setErro("Selecione a empresa.")
      return
    }
    if (detalhes.length === 0) {
      setErro('Adicione ao menos um detalhe da especificação (ex.: "8GB RAM") e pressione Enter.')
      return
    }
    if (!valores.categoria) {
      setErro("Selecione a categoria da compra.")
      return
    }
    if (valores.categoria === "OUTROS" && !valores.categoriaOutro?.trim()) {
      setErro("Informe qual é a categoria da compra.")
      return
    }

    enviandoRef.current = true
    setEnviando(true)
    try {
      await onEnviar(
        {
          ...valores,
          categoria: valores.categoria,
          categoriaOutro: valores.categoria === "OUTROS" ? valores.categoriaOutro?.trim() : undefined,
          descricaoDetalhada: detalhes.join(SEPARADOR_CHIPS),
          marcaDesejada: marcas.length > 0 ? marcas.join(SEPARADOR_CHIPS) : undefined,
        },
        empresaId || undefined
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a solicitação. Tente novamente.")
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  return (
    // Sem max-w: dois cartões empilhados numa coluna estreita deixa o resto
    // de uma tela larga vazio (relatado 2026-08-18). Em vez de só alargar a
    // coluna — o que estufaria cada campo além do que um input de formulário
    // aguenta bem —, "Dados do item" (o cartão com mais campos: nome,
    // descrição, quantidade/unidade, modelo/cor, tamanho/material, marca,
    // link) ganha sua própria coluna, e "Dados básicos" (classificação da
    // compra, prioridade, justificativa e a logística de pesquisa/entrega)
    // ocupa a outra. É conteúdo real decidindo a proporção 1:1.3, não estética.
    // Sem items-start: as duas Secao esticam para a mesma altura da linha do
    // grid (Secao ganhou h-full para isso) — com items-start, "Dados básicos"
    // (menos campos) parava mais curta e sobrava um vão em branco embaixo dela
    // (relatado 2026-08-18).
    <form onSubmit={enviar} className="flex flex-col gap-6">
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/60"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Secao titulo="Dados básicos" icone={ClipboardList}>
          {/* Só aparece com mais de uma empresa: com uma só, o seletor seria uma
              escolha falsa. Também some ao editar — ver incluirEmpresa. */}
          {incluirEmpresa && empresas.length > 1 && (
            <CampoSelecao
              label="Empresa"
              valor={empresaId}
              onChange={setEmpresaId}
              obrigatorio
              ajuda="A compra será lançada nesta empresa."
            >
              <option value="" disabled>
                Selecione uma empresa
              </option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nomeFantasia}
                </option>
              ))}
            </CampoSelecao>
          )}

          {/* gap-2, mais apertado que o gap-3 da Secao: Setor, Categoria, os dois
              escapes de texto livre e a frase de ajuda formam um grupo só — a
              frase explica exatamente estes dois campos, não a seção inteira. */}
          <div className="flex flex-col gap-2">
            <Linha>
              {incluirSetor && (
                <CampoSelecao
                  label="Setor"
                  valor={setorLivre ? OUTRO_SETOR : valores.setor}
                  onChange={(v) => {
                    if (v === OUTRO_SETOR) {
                      setSetorLivre(true)
                      set("setor", "")
                    } else {
                      setSetorLivre(false)
                      set("setor", v)
                    }
                  }}
                  obrigatorio
                >
                  <option value="" disabled>
                    Selecione um setor
                  </option>
                  {SETORES_COMPRA.map((setor) => (
                    <option key={setor} value={setor}>
                      {setor}
                    </option>
                  ))}
                  <option value={OUTRO_SETOR}>{OUTRO_SETOR}</option>
                </CampoSelecao>
              )}

              <CampoSelecao
                label="Categoria da compra"
                valor={valores.categoria}
                onChange={(v) => {
                  setCategoriaEscolhida(true)
                  set("categoria", v as CategoriaCompra | "")
                  if (v !== "OUTROS") set("categoriaOutro", undefined)
                }}
                obrigatorio
              >
                <option value="">Selecione uma categoria</option>
                {CATEGORIAS_COMPRA.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_LABEL[c]}
                  </option>
                ))}
              </CampoSelecao>
            </Linha>

            {setorLivre && incluirSetor && (
              <CampoTexto
                label="Qual setor?"
                valor={valores.setor}
                onChange={(v) => set("setor", v)}
                obrigatorio
              />
            )}

            {valores.categoria === "OUTROS" && (
              <CampoTexto
                label="Qual categoria?"
                valor={valores.categoriaOutro ?? ""}
                onChange={(v) => set("categoriaOutro", v)}
                obrigatorio
              />
            )}

            <p className="text-xs text-muted-foreground">
              Setor identifica quem pediu; categoria identifica o tipo do item comprado.
            </p>
          </div>

          {/* O chip reusa o mesmo tom de PrioridadeChip da lista e do detalhe
              (lib/insumos/rotulos.ts) — quem já leu a fila reconhece a cor antes
              de enviar, em vez de só descobrir a urgência depois de salvo. */}
          <CampoSelecao
            label="Prioridade"
            valor={valores.prioridade}
            onChange={(v) => set("prioridade", v as Prioridade)}
            obrigatorio
            ajuda={
              <span className="inline-flex items-center gap-1.5">
                Como vai aparecer na fila: <PrioridadeChip prioridade={valores.prioridade} />
              </span>
            }
          >
            {ORDEM_PRIORIDADE_EXIBICAO.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_LABEL[p]}
              </option>
            ))}
          </CampoSelecao>

          <CampoTextoLongo
            label="Justificativa da compra"
            valor={valores.justificativaCompra}
            onChange={(v) => set("justificativaCompra", v)}
            obrigatorio
          />

          <Linha>
            <CampoSelecao
              label="Onde pesquisar"
              valor={valores.marketplacePermitido}
              onChange={(v) => set("marketplacePermitido", v)}
              obrigatorio
              ajuda="Por enquanto, cotamos apenas no Mercado Livre."
            >
              {/* Só Mercado Livre: é a única fonte que o worker sabe raspar
                  (src/compras/worker/fontes/mercado-livre.ts). */}
              <option value="Mercado Livre">Mercado Livre</option>
            </CampoSelecao>

            <CampoTexto
              label="Prazo máximo de entrega (dias)"
              tipo="number"
              min={1}
              step={1}
              valor={valores.prazoMaximoEntregaDias}
              onChange={(v) => set("prazoMaximoEntregaDias", Number(v))}
              obrigatorio
            />
          </Linha>

          <p className="text-xs text-muted-foreground">
            Pesquisamos apenas itens novos, vendidos no Brasil. Ofertas com prazo de entrega maior que o
            solicitado ficam sinalizadas para revisão.
          </p>
        </Secao>

        <Secao titulo="Dados do item" icone={PackageSearch}>
          <CampoTexto
            label="Nome do item"
            placeholder="ex.: Notebook i5"
            valor={valores.nomeItem}
            onChange={(v) => {
              set("nomeItem", v)
              sugerir(v, detalhes)
            }}
            obrigatorio
          />

          <CampoChips
            label="Descrição detalhada / especificação mínima"
            valores={detalhes}
            onChange={(novos) => {
              setDetalhes(novos)
              sugerir(valores.nomeItem, novos)
            }}
            placeholder='ex.: 8GB RAM ↵ 256GB SSD ↵ Tela 15,6"'
            obrigatorio
            ajuda="Digite um detalhe por vez e pressione Enter — cada um vira um item separado e melhora a precisão da cotação automática."
          />

          <Linha>
            <CampoTexto
              label="Quantidade"
              tipo="number"
              min={0.01}
              step="any"
              valor={valores.quantidade}
              onChange={(v) => set("quantidade", Number(v))}
              obrigatorio
            />
            <CampoSelecao
              label="Unidade de medida"
              valor={unidadeLivre ? OUTRO_UNIDADE : valores.unidadeMedida}
              onChange={(v) => {
                if (v === OUTRO_UNIDADE) {
                  setUnidadeLivre(true)
                  set("unidadeMedida", "")
                } else {
                  setUnidadeLivre(false)
                  set("unidadeMedida", v)
                }
              }}
              obrigatorio
            >
              {UNIDADES_MEDIDA.map((unidade) => (
                <option key={unidade} value={unidade}>
                  {unidade}
                </option>
              ))}
              <option value={OUTRO_UNIDADE}>{OUTRO_UNIDADE}</option>
            </CampoSelecao>
          </Linha>

          {unidadeLivre && (
            <CampoTexto
              label="Qual unidade?"
              valor={valores.unidadeMedida}
              onChange={(v) => set("unidadeMedida", v)}
              obrigatorio
            />
          )}

          <Linha>
            <CampoTexto
              label="Modelo desejado"
              valor={valores.modeloDesejado ?? ""}
              onChange={(v) => set("modeloDesejado", v)}
            />
            <CampoTexto label="Cor" valor={valores.cor ?? ""} onChange={(v) => set("cor", v)} />
          </Linha>

          <Linha>
            <CampoTexto
              label="Tamanho/medida/capacidade"
              valor={valores.tamanhoMedidaCapacidade ?? ""}
              onChange={(v) => set("tamanhoMedidaCapacidade", v)}
            />
            <CampoTexto
              label="Material"
              valor={valores.material ?? ""}
              onChange={(v) => set("material", v)}
            />
          </Linha>

          <CampoChips
            label="Marca desejada"
            valores={marcas}
            onChange={setMarcas}
            placeholder="ex.: Dell ↵ HP ↵ Lenovo (ou deixe em branco)"
            ajuda="Pode citar mais de uma marca aceitável, uma por vez com Enter, ou deixar em branco se qualquer marca serve."
          />

          <CampoTexto
            label="Link de referência"
            tipo="url"
            placeholder="https://..."
            valor={valores.linkReferencia}
            onChange={(v) => set("linkReferencia", v)}
            obrigatorio
            ajuda="Cole um produto parecido ou exato para orientar a pesquisa automática."
          />
        </Secao>
      </div>

      {/* Ficha do pedido: a borda tracejada evoca o canhoto que se destaca de uma
          requisição de papel — aqui é a última leitura antes de virar cotação
          automática, não decoração. Fonte monoespaçada nos dados (quantidade,
          prazo) porque é isso que um canhoto de pedido real usa para número. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Confira antes de enviar</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm">
            <span className="font-semibold text-foreground">
              {valores.nomeItem.trim() || (
                <span className="font-sans text-muted-foreground italic">Item sem nome ainda</span>
              )}
            </span>
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
            <span className="text-muted-foreground">
              {valores.quantidade} {valores.unidadeMedida || "?"}
            </span>
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
            <PrioridadeChip prioridade={valores.prioridade} />
            <span aria-hidden className="text-muted-foreground/50">
              ·
            </span>
            <span className="text-muted-foreground">
              Em até {valores.prazoMaximoEntregaDias} {valores.prazoMaximoEntregaDias === 1 ? "dia" : "dias"}
            </span>
          </div>
        </div>

        <Button type="submit" disabled={enviando} className="shrink-0">
          {enviando ? "Salvando…" : rotuloEnviar}
        </Button>
      </div>
    </form>
  )
}
