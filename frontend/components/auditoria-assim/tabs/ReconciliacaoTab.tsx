'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useImpersonation } from '@/contexts/ImpersonationContext'
import { useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import { useGlosaCodigos } from '@/hooks/useGlosaCodigos'
import { JANELA_PADRAO, useReconciliacaoAssim } from '@/hooks/useReconciliacaoAssim'
import ModalConfirmarVinculo from '../ModalConfirmarVinculo'
import FilaOrfas from '../reconciliacao/FilaOrfas'
import ModalEscolherSessao from '../reconciliacao/ModalEscolherSessao'
import PainelSemana from '../reconciliacao/PainelSemana'
import { diaDoTimestamp, hojeLocal } from '../reconciliacao/datas'
import type { AlvoAnalise, CandidataVinculo, GuiaOrfa } from '../types'

/** Os papéis que a RPC aceita para escrever. `diretoria` vê, mas não vincula. */
const PAPEIS_QUE_VINCULAM = new Set(['admin', 'autorizacao', 'recepcao'])

type Props = {
  /** Alvo vindo da Conferência (linha em glosa). Nulo na navegação normal. */
  alvo: AlvoAnalise | null
  onAlvoConsumido: () => void
}

/**
 * Reconciliação de Autorizações — a semana do paciente, e a ação sobre ela.
 *
 * O problema que ela resolve: quando a ASSIM glosa uma solicitação do Pulsar e o
 * setor consegue a liberação depois, direto no portal, o match posicional da
 * Conferência deixa a glosa casada com a sessão e a liberação órfã. A sessão fica
 * GLOSA para sempre e o faturamento vê pendência que não existe.
 *
 * O desenho segue o modo como o trabalho acontece de verdade: a análise semanal é
 * COMO se descobre que há algo a vincular — não um anexo do fluxo de vínculo. Por
 * isso a fila à esquerda apenas indexa ("quais pacientes merecem uma olhada"), o
 * painel explica (cota por TUSS, cronograma × autorizações), e a ação mora dentro
 * do painel: a guia sem vínculo pede a sessão, e a sessão está ali do lado.
 *
 * Foi medido em produção (2026-08-20) que 39% das órfãs NÃO cobrem sessão
 * nenhuma — são autorizações extras. Por isso "sem sessão correspondente" é ação
 * de primeira classe, e não caso de borda: sem ela essas guias voltariam à fila
 * todo dia.
 */
export default function ReconciliacaoTab({ alvo, onAlvoConsumido }: Props) {
  const { effectiveRole } = useImpersonation()
  const podeVincular = PAPEIS_QUE_VINCULAM.has(effectiveRole ?? '')
  const codigosGlosa = useGlosaCodigos()

  const analise = useAnaliseReincidencia(alvo?.data ?? hojeLocal(), alvo?.pacienteNome ?? null)
  const { reabrirEm, recarregar: recarregarSemana } = analise

  const fila = useReconciliacaoAssim(recarregarSemana)
  const { selecionarGuia } = fila

  const [filaRecolhida, setFilaRecolhida] = useState(false)

  // Dois diálogos em SEQUÊNCIA, nunca empilhados: escolher a sessão e confirmar
  // o vínculo são passos distintos, e dois focus traps ativos ao mesmo tempo
  // quebram a devolução do foco. Abrir um fecha o outro.
  const [escolhendo, setEscolhendo] = useState(false)
  const [modal, setModal] = useState<{ candidata: CandidataVinculo | null } | null>(null)

  // A ponte vinda da Conferência. Consome o alvo depois de aplicá-lo, senão
  // voltar para esta aba mais tarde ressuscitaria a semana antiga — o erro mais
  // fácil de não notar nesta tela.
  useEffect(() => {
    if (!alvo) return
    reabrirEm(alvo.data, alvo.pacienteNome, alvo.carteirinha)
    onAlvoConsumido()
  }, [alvo, reabrirEm, onAlvoConsumido])

  /**
   * Clique na fila: reposiciona a semana no paciente e no período da guia, e
   * NÃO abre o vínculo. A fila é índice — leva a pessoa até a evidência, que é
   * onde ela decide.
   */
  const escolherDaFila = useCallback(
    (g: GuiaOrfa | null) => {
      void selecionarGuia(g?.guia ?? null)
      if (g) reabrirEm(diaDoTimestamp(g.data_execucao) ?? hojeLocal(), g.paciente_nome, g.carteirinha)
    },
    [selecionarGuia, reabrirEm]
  )

  /** Clique em "sem vínculo": seleciona a guia e abre a escolha da sessão. */
  const vincularGuia = useCallback(
    (guia: string) => {
      void selecionarGuia(guia)
      setEscolhendo(true)
    },
    [selecionarGuia]
  )

  /**
   * A guia em foco.
   *
   * `fila.guiaAtual` procura no intervalo de 30 dias da fila; navegando para uma
   * semana fora dele, a guia existe na tela mas não naquela lista. O fallback
   * pela busca da própria semana evita que a faixa de escolha suma justamente
   * quando se escolheu por ali.
   */
  const guiaAtual = useMemo<GuiaOrfa | null>(
    () =>
      fila.guiaAtual ??
      (fila.guiaSelecionada ? analise.orfasDaSemana.get(fila.guiaSelecionada) ?? null : null),
    [fila.guiaAtual, fila.guiaSelecionada, analise.orfasDaSemana]
  )

  return (
    <div className="flex flex-col gap-4">
      {!podeVincular && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          Seu perfil permite consultar a reconciliação, mas não vincular autorizações.
        </p>
      )}

      {/* A fila recolhe para devolver largura às duas colunas: num laptop de
          1280 a sidebar fixa já come 256px, e os 320px dela saem direto de onde
          a leitura acontece. Padrão aberta, sem media query em JS — decidir isso
          por `window.innerWidth` no primeiro render é divergência de hidratação. */}
      <div
        // `min-w-0` nos dois filhos não é zelo: item de grid nasce com
        // `min-width: auto`, então a faixa de datas da fila (que tem largura
        // mínima intrínseca maior que um celular) esticava a trilha e levava a
        // página inteira a rolar de lado — medido, 341px de sobra em 390.
        className={`grid grid-cols-1 gap-4 xl:h-[calc(100dvh-11rem)] ${
          filaRecolhida ? 'xl:grid-cols-[3rem_1fr]' : 'xl:grid-cols-[320px_1fr]'
        }`}
      >
        <FilaOrfas
          de={fila.de}
          ate={fila.ate}
          setDe={fila.setDe}
          setAte={fila.setAte}
          busca={fila.busca}
          setBusca={fila.setBusca}
          pacientes={fila.pacientes}
          total={fila.orfas.length}
          carregando={fila.carregandoOrfas}
          erro={fila.erroOrfas}
          onRecarregar={() => void fila.recarregarOrfas()}
          guiaSelecionada={fila.guiaSelecionada}
          onSelecionar={escolherDaFila}
          recolhida={filaRecolhida}
          onAlternar={() => setFilaRecolhida((v) => !v)}
        />

        <div className="h-[75dvh] min-h-0 min-w-0 xl:h-auto">
          <PainelSemana
            analise={analise}
            podeVincular={podeVincular}
            codigosGlosa={codigosGlosa}
            onVincularGuia={vincularGuia}
          />
        </div>
      </div>

      <ModalEscolherSessao
        open={escolhendo}
        onClose={() => setEscolhendo(false)}
        guia={guiaAtual}
        candidatas={fila.candidatas}
        carregando={fila.carregandoCandidatas}
        erro={fila.erroCandidatas}
        janelaDias={JANELA_PADRAO}
        podeVincular={podeVincular}
        onEscolher={(candidata) => {
          setEscolhendo(false)
          setModal({ candidata })
        }}
        onSemSessao={() => {
          setEscolhendo(false)
          setModal({ candidata: null })
        }}
      />

      <ModalConfirmarVinculo
        open={modal !== null}
        onClose={() => setModal(null)}
        guia={guiaAtual}
        candidata={modal?.candidata ?? null}
        salvando={fila.salvando}
        onConfirmar={async (observacao) => {
          if (!guiaAtual) return
          if (modal?.candidata) await fila.confirmarVinculo(modal.candidata, observacao)
          else await fila.descartarGuia(guiaAtual.guia, observacao)
          // Os dois lados envelhecem juntos: a guia sai da fila e a sessão vira
          // GLOSA_RESOLVIDA no cronograma, na mesma tela onde se clicou.
          recarregarSemana()
          setModal(null)
        }}
      />
    </div>
  )
}
