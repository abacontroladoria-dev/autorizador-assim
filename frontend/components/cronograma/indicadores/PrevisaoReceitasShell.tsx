"use client"

// PrevisaoReceitasShell — cruza as sessões reais (csv_grades_profissionais, via
// useOcupacaoSalas) com os valores cadastrados em Cadastro de Valores
// (useConvenioValores) pra projetar receita semanal/mensal por convênio. Ver
// resolverValorSessao/calcularPrevisaoReceita em lib/cronograma/faturamentoProjecao.ts
// pra entender a regra de prioridade (paciente > critério ABA > terapia >
// geral) — todo valor vem de valor_sessao, o sistema não trabalha mais com
// valor por hora — e o cálculo "dia a dia" da receita mensal (mesmo padrão de
// "Dias trabalhados" em
// Relacionamento Prestador: sessões/semana daquele dia × quantas vezes esse
// dia ocorre no mês de referência).
//
// Duas tabelas "Por convênio" — Multidisciplinar e Processo Diagnóstico —
// mesma separação do Dashboard de Pacientes (tab=pacientes), senão o nº de
// pacientes por convênio aqui não bateria com o de lá (um paciente cuja
// agenda é só avaliação/triagem não soma no Multidisciplinar).
//
// Perf: convênios como ASSIM Saúde têm ~1800 sessões em "Por sessão". Cada
// linha é um componente memoizado (SessaoRow) e a lista ordenada é useMemo —
// clicar pra selecionar/ordenar só re-renderiza as poucas linhas cujo estado
// realmente mudou, em vez de recriar a tabela inteira a cada clique.

import { Fragment, memo, useCallback, useMemo, useState } from "react"
import { Loader2, Wallet, AlertTriangle, CalendarDays, ChevronDown, ChevronRight } from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { SegmentedTabs } from "@/components/cronograma/ui/SegmentedTabs"
import { SortableTh, ordenarPor, type SortDir } from "@/components/cronograma/ui/SortableTh"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import { useConvenioValores } from "@/hooks/useConvenioValores"
import {
  calcularPrevisaoReceita,
  type PrevisaoReceitaConvenio, type PrevisaoReceitaSessao, type PrevisaoReceitaSegmento,
} from "@/lib/cronograma/faturamentoProjecao"

type VisaoDetalhe = "dia" | "terapia" | "sessao"
const SORT_PADRAO_SESSAO = { key: "pacienteNome" as keyof PrevisaoReceitaSessao, dir: "asc" as SortDir }

function fmtReal(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
}

function fmtData(iso: string): string {
  const [ano, mes, dia] = iso.split("-")
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

const ORIGEM_LABEL: Record<string, string> = {
  paciente: "Exceção paciente",
  criterio_aba: "Critério ABA",
  terapia: "Regra por terapia",
  geral: "Regra geral",
  pacote_avaliacao: "Pacote de sessões",
  sem_valor: "Sem valor",
}

function chaveSessao(convenio: string, s: PrevisaoReceitaSessao): string {
  // agendamentoId é o ID real da fonte (tita_agendamento_id) — único de
  // verdade. Cai pro composto paciente+terapia+dia+hora só se, por algum
  // motivo, a linha não trouxe id nenhum.
  return s.agendamentoId !== null
    ? `${convenio}::agendamento:${s.agendamentoId}`
    : `${convenio}::${s.pacienteId ?? s.pacienteNome}::${s.terapiaId ?? s.terapiaNome}::${s.data}::${s.horaInicial ?? "sem-hora"}`
}

/** Aviso colapsável — mostra só "Atenção" por padrão, expande a mensagem completa ao clicar. */
function AvisoAtencao({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold"
      >
        <AlertTriangle size={14} className="shrink-0" />
        Atenção
        {aberto ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
      </button>
      {aberto && <div className="px-3 pb-2 text-[11px]">{children}</div>}
    </div>
  )
}

interface SessaoRowProps {
  s: PrevisaoReceitaSessao
  chave: string
  selecionada: boolean
  /** Valor à vista cadastrado pra terapia dessa sessão, quando origem é "pacote_avaliacao" (Avaliação Neuropsicológica/Psiquiatra-Neurologista) — só exibição, não é somado por sessão (o pacote é cobrado uma vez por paciente, já contabilizado à parte na receita mensal). */
  valorPacote: number | null
  onSelect: (chave: string) => void
}

/** Memoizado — só re-renderiza quando a PRÓPRIA seleção/dado muda, não a cada clique em qualquer outra linha da tabela. */
const SessaoRow = memo(function SessaoRow({ s, chave, selecionada, valorPacote, onSelect }: SessaoRowProps) {
  const ehPacote = s.origem === "pacote_avaliacao"
  const valorExibido = s.valor !== null ? s.valor : (ehPacote ? valorPacote : null)
  const origemLabel = ehPacote
    ? (valorPacote !== null ? "Pacote de Sessões (À Vista)" : "Pacote de Sessões")
    : (ORIGEM_LABEL[s.origem] ?? s.origem)
  return (
    <tr
      onClick={() => onSelect(chave)}
      className={`cursor-pointer border-t border-border/40 ${selecionada ? "bg-emerald-100 dark:bg-emerald-950/50" : "hover:bg-muted/40"}`}
    >
      <td className="py-1 pr-2 text-muted-foreground">{s.agendamentoId ?? "—"}</td>
      <td className="py-1 pr-2 font-medium text-foreground">
        {s.pacienteNome}{s.pacienteId !== null && <span className="text-muted-foreground"> (ID {s.pacienteId})</span>}
      </td>
      <td className="py-1 px-2 text-muted-foreground">
        {s.terapiaNome}{s.terapiaId !== null && <span> (ID {s.terapiaId})</span>}
      </td>
      <td className="py-1 px-2 text-muted-foreground">{s.diaLabel} · {fmtData(s.data)}</td>
      <td className={`py-1 px-2 text-right tabular-nums font-semibold ${valorExibido === null ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {valorExibido !== null ? fmtReal(valorExibido) : "sem valor"}
      </td>
      <td className="py-1 pl-2 text-left text-muted-foreground">{origemLabel}</td>
    </tr>
  )
})

interface ConvenioRowProps {
  c: PrevisaoReceitaConvenio
  mesReferenciaLabel: string | null
  sessaoSelecionada: string | null
  onSelectSessao: (chave: string) => void
  /** Mostra o aviso de valor médio estimado quando este convênio é "Particular" (só faz sentido no segmento Multidisciplinar). */
  avisoParticular?: boolean
}

function ConvenioRow({ c, mesReferenciaLabel, sessaoSelecionada, onSelectSessao, avisoParticular }: ConvenioRowProps) {
  const [aberto, setAberto] = useState(false)
  const [visao, setVisao] = useState<VisaoDetalhe>("sessao")
  const [sortSessao, setSortSessao] = useState(SORT_PADRAO_SESSAO)

  const sessoesOrdenadas = useMemo(
    () => ordenarPor(c.porSessao, sortSessao.key, sortSessao.dir),
    [c.porSessao, sortSessao.key, sortSessao.dir],
  )

  // Valor à vista cadastrado por terapia (Avaliação Neuropsicológica/Psiquiatra-
  // Neurologista) — pra exibir na coluna "Valor" das sessões de pacote, já que
  // essas sessões não têm valor individual (o pacote é cobrado uma vez por
  // paciente, não por sessão).
  const valorPacotePorTerapia = useMemo(() => {
    const m = new Map<number, number>()
    c.pacotesTerapia.forEach(p => { if (p.valorAVista !== null) m.set(p.terapiaId, p.valorAVista) })
    return m
  }, [c.pacotesTerapia])

  function onSortClick(key: string) {
    setSortSessao(prev => ({
      key: key as keyof PrevisaoReceitaSessao,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }))
  }

  const mostrarAvisoParticular = !!avisoParticular && c.convenio.trim().toLowerCase() === "particular"

  return (
    <Fragment>
      <tr
        className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
        onClick={() => setAberto(v => !v)}
      >
        <td className="py-1.5 pr-2 font-medium text-foreground">
          <span className="inline-flex items-center gap-1">
            {aberto ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
            {c.convenio}
          </span>
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">{c.pacientesUnicos}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">{c.sessoesTotal}</td>
        <td className={`py-1.5 px-2 text-right tabular-nums ${c.sessoesSemValor > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>
          {c.sessoesSemValor > 0 ? c.sessoesSemValor : "—"}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">{fmtReal(c.receitaSemanal)}</td>
        <td className="py-1.5 pl-2 text-right tabular-nums font-semibold">{fmtReal(c.receitaMensalProjetada)}</td>
      </tr>
      {mostrarAvisoParticular && (
        <tr className="border-b border-border/60 last:border-0">
          <td colSpan={6} className="px-2 pb-2 pt-1">
            <AvisoAtencao>
              Para a modalidade "Particular" foi usada uma <strong>média de valor por sessão</strong> como estimativa — não é um valor negociado por sessão objetivamente. O novo modelo de captação de receita (por sessão, mensal, trimestral etc.) ainda está em estágio de definição interna; quando a transição acontecer, isso será configurado e sistematizado corretamente no cadastro.
            </AvisoAtencao>
          </td>
        </tr>
      )}
      {aberto && (
        <tr className="border-b border-border/60 last:border-0 bg-muted/20">
          <td colSpan={6} className="p-0">
            <div className="px-4 py-3">
              <SegmentedTabs
                value={visao}
                onChange={setVisao}
                tabs={[
                  { value: "sessao", label: "Por sessão", count: c.porSessao.length },
                  { value: "dia", label: "Por dia da semana" },
                  { value: "terapia", label: "Por terapia" },
                ]}
                className="mb-3"
              />

              {visao === "dia" && (
                <>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-2 font-semibold">Dia</th>
                        <th className="py-1 px-2 text-right font-semibold">Sessões/sem</th>
                        <th className="py-1 px-2 text-right font-semibold">Ocorr. no mês</th>
                        <th className="py-1 px-2 text-right font-semibold">Sessões/mês</th>
                        <th className="py-1 px-2 text-right font-semibold">Receita/sem</th>
                        <th className="py-1 pl-2 text-right font-semibold">Receita/mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.porDia.length === 0 && (
                        <tr><td colSpan={6} className="py-2 text-center text-muted-foreground">Sem sessões em dia útil pra detalhar.</td></tr>
                      )}
                      {c.porDia.map(d => (
                        <tr key={d.dow} className="border-t border-border/40">
                          <td className="py-1 pr-2 font-medium text-foreground">{d.diaLabel}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{fmtNum(d.sessoesSemana)}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{d.ocorrenciasMes}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{fmtNum(d.sessoesMesProjetadas)}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{fmtReal(d.receitaSemana)}</td>
                          <td className="py-1 pl-2 text-right tabular-nums font-semibold">{fmtReal(d.receitaMesProjetada)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Receita/mês de cada dia = Receita/sem × Ocorr. no mês (quantas segundas/terças/etc. {mesReferenciaLabel ?? "o mês"} tem). A soma dos 5 dias é a Receita mensal projetada da linha acima.
                  </p>
                </>
              )}

              {visao === "terapia" && (
                <>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-2 font-semibold">Terapia</th>
                        <th className="py-1 px-2 text-right font-semibold">% Sessões</th>
                        <th className="py-1 px-2 text-right font-semibold">Sessões/sem</th>
                        <th className="py-1 px-2 text-right font-semibold">Sem valor</th>
                        <th className="py-1 px-2 text-right font-semibold">Valor médio/sessão</th>
                        <th className="py-1 px-2 text-right font-semibold">Receita/sem</th>
                        <th className="py-1 pl-2 text-left font-semibold">Origem da regra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.porTerapia.length === 0 && (
                        <tr><td colSpan={7} className="py-2 text-center text-muted-foreground">Sem sessões pra detalhar.</td></tr>
                      )}
                      {(() => {
                        // % sobre o total de sessões/semana de TODAS as terapias do
                        // convênio (não c.sessoesTotal direto — este é bruto/sem
                        // normalizar por semana, e daria uma razão errada se a janela
                        // buscada cobrisse mais de 1 semana).
                        const totalSessoesSemana = c.porTerapia.reduce((s, t) => s + t.sessoesSemana, 0)
                        return c.porTerapia.map(t => (
                          <tr key={`${t.terapiaId ?? "sem-id"}-${t.terapiaNome}`} className="border-t border-border/40">
                            <td className="py-1 pr-2 font-medium text-foreground">
                              {t.terapiaNome}{t.terapiaId !== null && <span className="text-muted-foreground"> (ID {t.terapiaId})</span>}
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums">
                              {totalSessoesSemana > 0 ? fmtNum((t.sessoesSemana / totalSessoesSemana) * 100) : "—"}%
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums">{fmtNum(t.sessoesSemana)}</td>
                            <td className={`py-1 px-2 text-right tabular-nums ${t.sessoesSemValor > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>
                              {t.sessoesSemValor > 0 ? t.sessoesSemValor : "—"}
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums font-semibold">
                              {t.valorMedioPorSessao !== null ? fmtReal(t.valorMedioPorSessao) : "—"}
                            </td>
                            <td className="py-1 px-2 text-right tabular-nums">{fmtReal(t.receitaSemana)}</td>
                            <td className="py-1 pl-2 text-left text-muted-foreground">
                              {t.origens.map(o => ORIGEM_LABEL[o] ?? o).join(" + ")}
                            </td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    "Origem" com mais de um valor (ex.: "Regra por terapia + Exceção paciente") indica que sessões da MESMA terapia tiveram valor de fontes diferentes — normalmente porque um paciente específico tem exceção cadastrada que se sobrepôs à regra geral/por terapia desse convênio.
                  </p>
                </>
              )}

              {visao === "sessao" && (
                <>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-left text-muted-foreground">
                          <SortableTh label="ID Agend." sortKey="agendamentoId" activeKey={sortSessao.key} dir={sortSessao.dir} onClick={onSortClick} />
                          <SortableTh label="Paciente" sortKey="pacienteNome" activeKey={sortSessao.key} dir={sortSessao.dir} onClick={onSortClick} />
                          <SortableTh label="Terapia" sortKey="terapiaNome" activeKey={sortSessao.key} dir={sortSessao.dir} onClick={onSortClick} />
                          <SortableTh label="Dia" sortKey="data" activeKey={sortSessao.key} dir={sortSessao.dir} onClick={onSortClick} />
                          <SortableTh label="Valor" sortKey="valor" activeKey={sortSessao.key} dir={sortSessao.dir} align="right" onClick={onSortClick} />
                          <SortableTh label="Origem" sortKey="origem" activeKey={sortSessao.key} dir={sortSessao.dir} onClick={onSortClick} />
                        </tr>
                      </thead>
                      <tbody>
                        {sessoesOrdenadas.length === 0 && (
                          <tr><td colSpan={6} className="py-2 text-center text-muted-foreground">Sem sessões pra detalhar.</td></tr>
                        )}
                        {sessoesOrdenadas.map((s, i) => {
                          const chave = chaveSessao(c.convenio, s)
                          return (
                            <SessaoRow
                              // Chave de reconciliação usa o índice como desempate final —
                              // se duas sessões forem idênticas em todos os campos (raro,
                              // mas possível com dado duplicado na agenda), a `chave` de
                              // conteúdo sozinha ainda colidiria.
                              key={`${chave}::${i}`}
                              s={s}
                              chave={chave}
                              selecionada={sessaoSelecionada === chave}
                              valorPacote={s.terapiaId !== null ? valorPacotePorTerapia.get(s.terapiaId) ?? null : null}
                              onSelect={onSelectSessao}
                            />
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Uma linha por sessão da semana de referência (não é projeção mensal) — pra auditar exatamente qual paciente/terapia gerou qual valor. Clique numa linha pra marcar/desmarcar em verde (só um destaque visual pra apresentação, não é salvo). Clique num cabeçalho de coluna pra ordenar.
                  </p>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

interface TabelaPorConvenioProps {
  titulo: string
  segmento: PrevisaoReceitaSegmento
  mesReferenciaLabel: string | null
  /** Mostra o aviso de valor médio estimado na linha do convênio "Particular" — só faz sentido no segmento Multidisciplinar. */
  avisoParticular?: boolean
  /** Mostra o aviso de valor à vista padrão + falta de datas início/fim do processo — só faz sentido no segmento Processo Diagnóstico. */
  avisoPacote?: boolean
}

function TabelaPorConvenio({ titulo, segmento, mesReferenciaLabel, avisoParticular, avisoPacote }: TabelaPorConvenioProps) {
  // Seleção de linha em "Por sessão" — só destaque visual pra apresentação
  // (ex.: marcar em verde o que está sendo mostrado ao vivo), não é gravado em
  // lugar nenhum, some ao dar refresh. Só uma linha por vez em todo o
  // segmento: selecionar outra desmarca a anterior, mesmo em convênio diferente.
  const [sessaoSelecionada, setSessaoSelecionada] = useState<string | null>(null)
  const onSelectSessao = useCallback((chave: string) => {
    setSessaoSelecionada(prev => (prev === chave ? null : chave))
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="text-sm font-bold text-foreground">{titulo}</div>
        {mesReferenciaLabel && (
          <div className="text-[11px] text-muted-foreground">
            Mês de referência da projeção: <strong className="text-foreground">{mesReferenciaLabel}</strong> — clique num convênio pra ver o detalhamento por dia da semana, terapia ou sessão
          </div>
        )}
      </div>
      {avisoPacote && (
        <AvisoAtencao>
          Para todos os convênios abaixo foi utilizado por padrão o <strong>valor à vista</strong> cadastrado, tornando o cálculo uma estimativa. Também seria interessante coletar as <strong>datas de início e fim previstas do processo</strong> para que o valor integral da Avaliação Neuropsicológica não seja imputado na previsão mensal — porque hoje ocorre de o critério ser: constar valor cheio se a semana analisada contém uma sessão daquela especialidade.
        </AvisoAtencao>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-2 font-semibold">Convênio</th>
              <th className="py-1.5 px-2 text-right font-semibold">Pacientes</th>
              <th className="py-1.5 px-2 text-right font-semibold">Sessões/semana</th>
              <th className="py-1.5 px-2 text-right font-semibold">Sem valor</th>
              <th className="py-1.5 px-2 text-right font-semibold">Receita semanal</th>
              <th className="py-1.5 pl-2 text-right font-semibold">Receita mensal projetada</th>
            </tr>
          </thead>
          <tbody>
            {segmento.porConvenio.length === 0 && (
              <tr><td colSpan={6} className="py-3 text-center text-muted-foreground">Sem sessões no período.</td></tr>
            )}
            {segmento.porConvenio.map(c => (
              <ConvenioRow
                key={c.convenio}
                c={c}
                mesReferenciaLabel={mesReferenciaLabel}
                sessaoSelecionada={sessaoSelecionada}
                onSelectSessao={onSelectSessao}
                avisoParticular={avisoParticular}
              />
            ))}
          </tbody>
        </table>
      </div>
      {segmento.sessoesSemValor > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          "Sem valor" = sessões desse segmento sem regra de Valor Sessão cadastrada em <strong>Cadastro de Valores</strong> pra esse convênio/terapia/paciente. Não entram na receita projetada acima.
        </p>
      )}
    </div>
  )
}

export function PrevisaoReceitasShell() {
  const { linhas, loading: loadingSalas, error: errorSalas } = useOcupacaoSalas()
  const { regrasGerais, excecoesPaciente, pacotesAvaliacao, loading: loadingValores, error: errorValores } = useConvenioValores()

  const loading = loadingSalas || loadingValores
  const error = errorSalas || errorValores

  const previsao = useMemo(
    () => calcularPrevisaoReceita(linhas, regrasGerais, excecoesPaciente, pacotesAvaliacao),
    [linhas, regrasGerais, excecoesPaciente, pacotesAvaliacao],
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando sessões e valores cadastrados...
      </div>
    )
  }
  if (error) return <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>

  const receitaMensalTotal = previsao.multidisciplinar.receitaMensalProjetadaTotal + previsao.processoDiagnostico.receitaMensalProjetadaTotal
  const receitaSemanalTotal = previsao.multidisciplinar.receitaSemanalTotal + previsao.processoDiagnostico.receitaSemanalTotal
  const sessoesTotal = previsao.multidisciplinar.sessoesTotal + previsao.processoDiagnostico.sessoesTotal
  const sessoesSemValor = previsao.multidisciplinar.sessoesSemValor + previsao.processoDiagnostico.sessoesSemValor

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="green" icon={<Wallet size={15} />} label="Receita mensal projetada">
          <div className="text-2xl font-black text-foreground">{fmtReal(receitaMensalTotal)}</div>
        </StatCard>
        <StatCard tone="blue" icon={<Wallet size={15} />} label="Receita semanal projetada">
          <div className="text-2xl font-black text-foreground">{fmtReal(receitaSemanalTotal)}</div>
        </StatCard>
        <StatCard tone="slate" icon={<CalendarDays size={15} />} label="Sessões/semana">
          <div className="text-2xl font-black text-foreground">{sessoesTotal}</div>
        </StatCard>
        <StatCard tone="amber" icon={<AlertTriangle size={15} />} label="Sessões sem valor cadastrado">
          <div className="text-2xl font-black text-foreground">{sessoesSemValor}</div>
        </StatCard>
      </div>

      <TabelaPorConvenio
        titulo="Por Convênio (Multidisciplinar)"
        segmento={previsao.multidisciplinar}
        mesReferenciaLabel={previsao.mesReferencia?.label ?? null}
        avisoParticular
      />
      <TabelaPorConvenio
        titulo="Por Convênio (Processo Diagnóstico)"
        segmento={previsao.processoDiagnostico}
        mesReferenciaLabel={previsao.mesReferencia?.label ?? null}
        avisoPacote
      />
    </div>
  )
}
