"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Loader2, UserPlus, X } from "lucide-react"
import { maskCpfCnpj, maskMoedaBR, onlyDigits, parseNumeroBR, validarCpfCnpj } from "@/lib/remuneracao/formatacao"
import { ESPECIALIDADES_AGENDA } from "@/lib/remuneracao/especialidades"

export type NovoProfissionalPayload = {
  profissional_nome: string
  documento_tipo: string | null
  cpf: string | null
  cnpj: string | null
  // Sem `observacoes` no nível do profissional: a nota é do CONTRATO desde a
  // migration 20260803120000, e mandar a chave aqui sobrescreveria a coluna que
  // ficou como backup congelado.
  contratos: Array<{
    numero: string
    funcao: string
    valorPA: number
    vigente: boolean
    modeloFaturamento: "atendimento" | "banco_horas"
    valorTotal: number
    // Por último: a assinatura do rascunho no useDraftRow é JSON.stringify, e
    // ordem de chave importa.
    observacoes: string
  }>
}

// Mesma escala de 3 tamanhos da lista: 15px título, 13px valores, 11px rótulos.
// No modal sobra espaço, então os campos ganham <label> de verdade em vez de
// depender de placeholder — placeholder some no primeiro caractere digitado, o
// que é aceitável numa grade densa e não é numa tela de cadastro.
const campo =
  "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-foreground " +
  "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
const rotulo = "block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
const foco = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const VAZIO = {
  nome: "",
  cpf: "",
  cnpj: "",
  observacoes: "",
  numero: "",
  funcao: "",
  modeloFaturamento: "atendimento" as "atendimento" | "banco_horas",
  valor: "",
  vigente: true,
}

/**
 * Montado só quando aberto (o pai renderiza condicionalmente), então o estado
 * já nasce limpo a cada abertura — sem efeito de reset, que a regra de hooks
 * do projeto proíbe e que renderizaria uma vez com os valores da abertura
 * anterior antes de limpar.
 */
export function NovoProfissionalModal({
  nomesExistentes,
  onCancel,
  onSubmit,
}: {
  nomesExistentes: string[]
  onCancel: () => void
  onSubmit: (payload: NovoProfissionalPayload) => Promise<{ ok: boolean; error: string | null }>
}) {
  const [v, setV] = useState(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const set = (patch: Partial<typeof VAZIO>) => setV(prev => ({ ...prev, ...patch }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !salvando && onCancel()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [salvando, onCancel])

  // Nome é a identidade do registro (o upsert casa por `profissional_nome` e
  // troca a lista de contratos inteira). Repetir um nome existente não criaria
  // nada — sobrescreveria o profissional de cima e apagaria os contratos dele.
  const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")
  const existentes = useMemo(() => new Set(nomesExistentes.map(normalizar)), [nomesExistentes])
  const duplicado = !!v.nome.trim() && existentes.has(normalizar(v.nome))
  const bancoHoras = v.modeloFaturamento === "banco_horas"

  async function criar() {
    const nome = v.nome.trim().replace(/\s+/g, " ")
    if (!nome) return setErro("Informe o nome do profissional.")
    if (duplicado) return setErro("Já existe um profissional com esse nome. Edite o bloco dele na lista.")
    if (v.cpf.trim() && !validarCpfCnpj(v.cpf)) return setErro("CPF incompleto — precisa de 11 dígitos, ou deixe em branco.")
    if (v.cnpj.trim() && !validarCpfCnpj(v.cnpj)) return setErro("CNPJ incompleto — precisa de 14 dígitos, ou deixe em branco.")

    // A observação entra no teste: digitar uma nota agora É pedir o item de
    // contrato, porque é nele que a nota mora. Aceitar as teclas e descartar
    // depois seria a perda silenciosa que esta mudança existe para acabar.
    const temContrato = !!(v.numero.trim() || v.funcao.trim() || v.valor.trim() || v.observacoes.trim())
    setSalvando(true)
    setErro(null)
    const { ok, error } = await onSubmit({
      profissional_nome: nome,
      documento_tipo: null,
      cpf: onlyDigits(v.cpf) || null,
      cnpj: onlyDigits(v.cnpj) || null,
      contratos: temContrato
        ? [{
            numero: v.numero.trim(),
            funcao: v.funcao.trim(),
            valorPA: bancoHoras ? 0 : parseNumeroBR(v.valor) ?? 0,
            vigente: v.vigente,
            modeloFaturamento: v.modeloFaturamento,
            valorTotal: bancoHoras ? parseNumeroBR(v.valor) ?? 0 : 0,
            observacoes: v.observacoes.trim(),
          }]
        : [],
    })
    setSalvando(false)
    if (!ok) setErro(error || "Não foi possível criar. Tente novamente.")
  }

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="novo-prof-titulo"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <UserPlus size={16} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
          <h2 id="novo-prof-titulo" className="flex-1 text-md font-semibold text-foreground">
            Novo profissional
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={salvando}
            aria-label="Fechar"
            className={`${foco} inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40`}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div>
            <label htmlFor="np-nome" className={rotulo}>
              Nome do profissional
            </label>
            <input
              id="np-nome"
              autoFocus
              value={v.nome}
              onChange={e => { set({ nome: e.target.value }); setErro(null) }}
              placeholder="Como aparece na escala"
              aria-invalid={duplicado || undefined}
              aria-describedby={duplicado ? "np-nome-dup" : undefined}
              className={`${campo} mt-1 ${duplicado ? "border-rose-600" : ""}`}
            />
            {duplicado && (
              <p id="np-nome-dup" className="mt-1 flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                <AlertCircle size={12} className="mt-px shrink-0" />
                Já existe um profissional com esse nome. Edite o bloco dele na lista.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="np-cpf" className={rotulo}>CPF</label>
              <input
                id="np-cpf"
                value={v.cpf}
                onChange={e => set({ cpf: maskCpfCnpj(e.target.value) })}
                placeholder="000.000.000-00"
                inputMode="numeric"
                className={`${campo} mt-1 tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor="np-cnpj" className={rotulo}>CNPJ</label>
              <input
                id="np-cnpj"
                value={v.cnpj}
                onChange={e => set({ cnpj: maskCpfCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                className={`${campo} mt-1 tabular-nums`}
              />
            </div>
          </div>

          {/* Contrato é opcional: dá para cadastrar só o documento agora e
              registrar o contrato depois, direto no bloco da lista. */}
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Primeiro contrato
            </span>
            <span className="text-xs text-muted-foreground">opcional</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="np-numero" className={rotulo}>Contrato nº</label>
              <input
                id="np-numero"
                value={v.numero}
                onChange={e => set({ numero: e.target.value })}
                className={`${campo} mt-1 tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor="np-funcao" className={rotulo}>Especialidade Agenda</label>
              {/* Mesmo vocabulário fechado da lista — aqui não precisa da opção
                  de "fora da lista" porque o registro está nascendo agora. */}
              <select
                id="np-funcao"
                value={v.funcao}
                onChange={e => set({ funcao: e.target.value })}
                className={`${campo} mt-1 ${v.funcao ? "" : "text-muted-foreground"}`}
              >
                <option value="" className="bg-card text-muted-foreground">
                  Selecione…
                </option>
                {ESPECIALIDADES_AGENDA.map(esp => (
                  <option key={esp} value={esp} className="bg-card text-foreground">
                    {esp}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="np-modelo" className={rotulo}>Modelo</label>
              <select
                id="np-modelo"
                value={v.modeloFaturamento}
                onChange={e => set({ modeloFaturamento: e.target.value as typeof VAZIO.modeloFaturamento })}
                className={`${campo} mt-1`}
              >
                <option value="atendimento" className="bg-card text-foreground">Por atendimento</option>
                <option value="banco_horas" className="bg-card text-foreground">Banco de horas</option>
              </select>
            </div>
            <div>
              <label htmlFor="np-valor" className={rotulo}>
                {bancoHoras ? "Valor total" : "Valor por sessão"}
              </label>
              <div className="mt-1 inline-flex w-full items-center rounded-md border border-border focus-within:ring-2 focus-within:ring-ring">
                <span className="select-none pl-2 text-xs text-muted-foreground">R$</span>
                <input
                  id="np-valor"
                  value={v.valor}
                  onChange={e => set({ valor: maskMoedaBR(e.target.value) })}
                  placeholder="0,00"
                  inputMode="numeric"
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-right text-sm tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
                <span className="w-13 select-none pr-2 text-xs text-muted-foreground">
                  {bancoHoras ? "total" : "/sessão"}
                </span>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={v.vigente}
              onChange={e => set({ vigente: e.target.checked })}
              className="rounded border-border"
            />
            Contrato vigente — a calculadora vai usar este valor
          </label>

          {/* Dentro da seção do contrato, não mais junto do CPF/CNPJ: o dono da
              nota mudou de profissional para contrato, então o rótulo muda com
              ele. Textarea porque é texto livre — o input de uma linha convidava
              a escrever pouco e escondia o resto. */}
          <div>
            <label htmlFor="np-obs" className={rotulo}>
              Observações do contrato
            </label>
            <textarea
              id="np-obs"
              rows={2}
              maxLength={2000}
              value={v.observacoes}
              onChange={e => set({ observacoes: e.target.value })}
              placeholder="Ex.: aguardando assinatura."
              className={`${campo} mt-1 resize-y`}
            />
          </div>

          {erro && !duplicado && (
            <p className="flex items-start gap-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:text-rose-400">
              <AlertCircle size={12} className="mt-px shrink-0" />
              {erro}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={salvando}
            className={`${foco} rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-40`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={criar}
            disabled={salvando || !v.nome.trim() || duplicado}
            className={`${foco} inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-600 dark:hover:bg-emerald-500`}
          >
            {salvando && <Loader2 size={13} className="animate-spin" />}
            Criar profissional
          </button>
        </div>
      </div>
    </div>
  )
}
