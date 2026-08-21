'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, UserSearch,
} from 'lucide-react'
import { diasUteisDe, type useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import type { AuditoriaAssimItem, AutorizacaoAssimSemana } from '../types'
import ChipTuss from './ChipTuss'
import FiltrosEstado from './FiltrosEstado'
import LinhaAutorizacao from './LinhaAutorizacao'
import LinhaSessao from './LinhaSessao'
import SeletorPaciente from './SeletorPaciente'
import { diaDoTimestamp, formatarDia, formatarDiaComNome } from './datas'

type Props = {
  analise: ReturnType<typeof useAnaliseReincidencia>
  podeVincular: boolean
  codigosGlosa: Map<string, string>
  /** Abre a escolha de sessão para esta guia sem vínculo. */
  onVincularGuia: (guia: string) => void
}

const ROTULO_FILTRO: Record<string, string> = {
  'sem-vinculo': 'sem vínculo',
  glosa: 'glosas',
  cancelada: 'canceladas',
}

function TituloColuna({ children, contagem }: { children: ReactNode; contagem: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2.5 backdrop-blur">
      <h3 className="text-[13px] font-semibold text-brand-fg">{children}</h3>
      <span className="text-xs tabular-nums text-slate-500">{contagem}</span>
    </div>
  )
}

function RotuloDia({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 pt-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
      {children}
    </p>
  )
}

/**
 * A semana do paciente: o que a clínica agendou × o que a ASSIM registrou.
 *
 * Não é painel de consulta. A glosa 1601 diz que a autorização passou da cota da
 * semana, e a Conferência é diária — pior, é dirigida pela SESSÃO, então a
 * autorização excedente não casa com nada e não aparece em tela nenhuma. Aqui ela
 * aparece, na coluna da direita, e é ali mesmo que se age sobre ela.
 *
 * O eixo horizontal da tela é a comparação; o vertical é o tempo. Os controles do
 * topo são os dois recortes que a comparação aceita — por TUSS (a cota) e por
 * estado da guia (o trabalho) —, e ambos são contadores antes de serem filtros.
 */
export default function PainelSemana({ analise, podeVincular, codigosGlosa, onVincularGuia }: Props) {
  // A busca cede o topo ao nome assim que há um paciente: o nome é o assunto da
  // tela, o campo é só como se chega nele.
  const [trocandoPaciente, setTrocandoPaciente] = useState(false)

  const dias = useMemo(() => diasUteisDe(analise.semanaInicio), [analise.semanaInicio])

  const sessoesPorDia = useMemo(() => {
    const mapa = new Map<string, AuditoriaAssimItem[]>()
    for (const s of analise.sessoesVisiveis) {
      const dia = s.data_atendimento ?? '—'
      const atual = mapa.get(dia)
      if (atual) atual.push(s)
      else mapa.set(dia, [s])
    }
    return mapa
  }, [analise.sessoesVisiveis])

  const autorizacoesPorDia = useMemo(() => {
    const mapa = new Map<string, AutorizacaoAssimSemana[]>()
    for (const a of analise.autorizacoesVisiveis) {
      const dia = diaDoTimestamp(a.data_execucao) ?? '—'
      const atual = mapa.get(dia)
      if (atual) atual.push(a)
      else mapa.set(dia, [a])
    }
    return mapa
  }, [analise.autorizacoesVisiveis])

  const labelSemana = `${formatarDia(analise.semanaInicio)} a ${formatarDia(analise.semanaFim)}`
  const semPaciente = !analise.pacienteNome
  const mostrarBusca = semPaciente || trocandoPaciente
  const totalSessoes = analise.sessoesVisiveis.length
  const totalAutorizacoes = analise.autorizacoesVisiveis.length
  const carteirinha = analise.carteirinhaDoPaciente

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
      aria-label="Semana do paciente"
    >
      {/* As duas colunas mudam em silêncio quando se troca de semana ou de filtro. */}
      <p className="sr-only" role="status" aria-live="polite">
        {analise.loading
          ? 'Carregando a semana.'
          : analise.erro
            ? analise.erro
            : semPaciente
              ? `${analise.pacientesDaSemana.length} paciente(s) com sessão ASSIM em ${labelSemana}. Escolha um para comparar.`
              : `${analise.pacienteNome}, semana de ${labelSemana}. ${totalSessoes} terapia(s) agendada(s), ${totalAutorizacoes} guia(s). ${analise.ledger.semVinculo} sem vínculo, ${analise.ledger.glosas} glosa(s), ${analise.ledger.canceladas} cancelada(s). ${
                  analise.totalExcedente > 0
                    ? `${analise.totalExcedente} autorização(ões) além do agendado.`
                    : 'Nenhum excedente.'
                }`}
      </p>

      {/* Identidade + semana */}
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        {mostrarBusca ? (
          <SeletorPaciente
            pacientes={analise.pacientesDaSemana}
            valor={analise.pacienteNome}
            onEscolher={(nome) => {
              analise.escolherPaciente(nome)
              setTrocandoPaciente(false)
            }}
          />
        ) : (
          <div className="flex min-w-0 items-baseline gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900" title={analise.pacienteNome ?? undefined}>
                {analise.pacienteNome}
              </h2>
              <p className="truncate text-xs text-slate-500">
                {carteirinha ? <span className="tabular-nums">{carteirinha}</span> : 'sem carteirinha'}
                {analise.idsDoPaciente.length > 1 && (
                  /* Nome não é identidade. Dizer que são dois cadastros é melhor
                     que escolher um em silêncio e mostrar meia semana como se
                     fosse toda. */
                  <span className="text-amber-800">
                    {' '}· dois cadastros ({analise.idsDoPaciente.join(', ')}), somados aqui
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTrocandoPaciente(true)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-fg transition hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            >
              trocar
            </button>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => analise.irParaSemana(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            aria-label="Semana anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="w-32 text-center text-sm font-semibold text-slate-700 tabular-nums">
            {labelSemana}
          </span>
          <button
            type="button"
            onClick={() => analise.irParaSemana(1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
            aria-label="Próxima semana"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Os dois recortes: cota por TUSS e estado da guia */}
      {!semPaciente && !analise.erro && analise.placar.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {analise.placar.map((p) => (
              <ChipTuss
                key={p.codigo_tuss}
                item={p}
                ativa={analise.tussFiltro === p.codigo_tuss}
                onToggle={analise.setTussFiltro}
              />
            ))}
            <span className="shrink-0 pl-2 text-xs text-slate-500">
              {analise.totalExcedente > 0
                ? `${analise.totalExcedente} ${analise.totalExcedente === 1 ? 'autorização' : 'autorizações'} além do agendado`
                : 'nenhum excedente na semana'}
            </span>
          </div>

          <FiltrosEstado
            ledger={analise.ledger}
            valor={analise.estadoFiltro}
            onEscolher={analise.setEstadoFiltro}
          />
        </div>
      )}

      {/* Corpo */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50 lg:grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200 lg:overflow-hidden">
        {analise.erro ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center lg:col-span-2">
            <AlertTriangle size={24} className="text-rose-600" />
            <p className="text-sm font-medium text-slate-700">{analise.erro}</p>
            <button
              onClick={analise.recarregar}
              className="mt-1 inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-brand hover:bg-brand-hover hover:text-brand-fg focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <RefreshCw size={13} />
              Tentar novamente
            </button>
          </div>
        ) : analise.carregandoSemana ? (
          <div className="space-y-2 px-3 py-4 sm:px-6 lg:col-span-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : semPaciente ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center lg:col-span-2">
            <UserSearch size={22} className="text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-600">Escolha um paciente</p>
              <p className="text-xs text-slate-500">
                {analise.pacientesDaSemana.length > 0
                  ? `${analise.pacientesDaSemana.length} com sessão ASSIM em ${labelSemana} — ou clique numa guia da fila.`
                  : `Nenhuma sessão ASSIM em ${labelSemana}.`}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Terapias agendadas — a cota */}
            <div className="lg:min-h-0 lg:overflow-y-auto">
              {/* "linhas" e não "sessões": a contagem inclui a falta, que aparece
                  aqui mas não conta como cota. O número que conta é o das chips. */}
              <TituloColuna contagem={`${totalSessoes} linhas`}>Terapias agendadas na semana</TituloColuna>
              <div className="px-3 pb-4 sm:px-6">
                {dias.map((dia) => {
                  const doDia = sessoesPorDia.get(dia) ?? []
                  return (
                    <div key={dia}>
                      <RotuloDia>{formatarDiaComNome(dia)}</RotuloDia>
                      {doDia.length === 0 ? (
                        <p className="px-1 py-1 text-xs text-slate-400">sem sessão</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {doDia.map((s) => (
                            <LinhaSessao key={s.bloco_id} item={s} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Guias — o que a ASSIM registrou, pareado ou não */}
            <div className="lg:min-h-0 lg:overflow-y-auto">
              <TituloColuna
                contagem={
                  analise.estadoFiltro
                    ? `${totalAutorizacoes} · ${ROTULO_FILTRO[analise.estadoFiltro]}`
                    : `${totalAutorizacoes} guias`
                }
              >
                Guias da semana
              </TituloColuna>
              <div className="px-3 pb-4 sm:px-6">
                {totalAutorizacoes === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-1 py-20 text-center">
                    <CheckCircle2 size={22} className="text-slate-400" />
                    <p className="text-sm font-medium text-slate-600">
                      {analise.estadoFiltro ? 'Nada neste estado' : 'Nenhuma guia nesta semana'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {analise.estadoFiltro
                        ? 'Limpe o filtro para ver as outras guias da semana.'
                        : analise.tussFiltro
                          ? 'Nada para este TUSS — limpe o filtro para ver os outros.'
                          : 'A ASSIM não registrou nada de seg a sex para este paciente.'}
                    </p>
                  </div>
                ) : (
                  [...autorizacoesPorDia.entries()].map(([dia, doDia]) => (
                    <div key={dia}>
                      <RotuloDia>{dia === '—' ? 'sem data' : formatarDiaComNome(dia)}</RotuloDia>
                      <ul className="space-y-1.5">
                        {doDia.map((a) => (
                          <LinhaAutorizacao
                            key={a.guia}
                            item={a}
                            estado={analise.estadoDaGuia(a.guia)}
                            podeVincular={podeVincular}
                            codigosGlosa={codigosGlosa}
                            onVincular={() => onVincularGuia(a.guia)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
