'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useImpersonation } from '@/contexts/ImpersonationContext'
import { useAnaliseReincidencia } from '@/hooks/useAnaliseReincidencia'
import { useGlosaCodigos } from '@/hooks/useGlosaCodigos'
import { JANELA_PADRAO, useReconciliacaoAssim } from '@/hooks/useReconciliacaoAssim'
import ModalConfirmarVinculo from '../ModalConfirmarVinculo'
import ListaPendencias from '../reconciliacao/ListaPendencias'
import ModalEscolherSessao from '../reconciliacao/ModalEscolherSessao'
import ModalSemanaPaciente from '../reconciliacao/ModalSemanaPaciente'
import { hojeLocal } from '../reconciliacao/datas'
import type { AlvoAnalise, CandidataVinculo, GuiaOrfa } from '../types'

/** Os papéis que a RPC aceita para escrever. `diretoria` vê, mas não vincula. */
const PAPEIS_QUE_VINCULAM = new Set(['admin', 'autorizacao', 'recepcao'])

/**
 * Os diálogos desta aba, sempre um só de cada vez.
 *
 * `grade` é a semana do paciente; `escolher` é "esta guia cobre qual sessão?";
 * `confirmar` é o aceite. Não empilham porque cada um instala um focus trap
 * próprio, e dois traps ativos ao mesmo tempo brigam pelo Tab e fazem o Escape
 * fechar os dois. A grade volta ao fim do fluxo, já refletindo o vínculo.
 */
type Etapa = 'grade' | 'escolher' | 'confirmar'

type Props = {
  /** Alvo vindo da Conferência (linha em glosa). Nulo na navegação normal. */
  alvo: AlvoAnalise | null
  onAlvoConsumido: () => void
}

/**
 * Autorizações com pendências — a fila da semana, e a semana do paciente dentro dela.
 *
 * O problema que a aba resolve: quando a ASSIM glosa uma solicitação do Pulsar e
 * o setor consegue a liberação depois, direto no portal, o match posicional da
 * Conferência deixa a glosa casada com a sessão e a liberação órfã. A sessão fica
 * GLOSA para sempre e o faturamento vê pendência que não existe.
 *
 * O desenho segue a ordem em que a pergunta é feita de verdade. Primeiro "quem
 * precisa de mim nesta semana?" — a listagem, um paciente por linha, com as
 * cinco espécies de pendência lado a lado. Depois "o que aconteceu com esta
 * pessoa?" — a grade semanal no modal, terapias nas linhas e dias nas colunas,
 * onde a guia sem vínculo aparece no dia em que foi autorizada. E a ação mora na
 * evidência: clicar na guia âmbar é o que abre a escolha da sessão.
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
  const { reabrirEm, escolherPaciente, recarregar: recarregarSemana } = analise

  const fila = useReconciliacaoAssim(recarregarSemana)
  const { selecionarGuia } = fila

  const [etapa, setEtapa] = useState<Etapa>('grade')
  const [candidataEscolhida, setCandidataEscolhida] = useState<CandidataVinculo | null>(null)

  // Haver paciente escolhido JÁ é "a semana está aberta" — não há um segundo
  // estado dizendo a mesma coisa, que é como as duas versões divergem. Durante a
  // escolha da sessão o paciente continua escolhido e só a `etapa` muda: é para
  // a grade dele que o fluxo volta.
  const semanaAberta = !!analise.pacienteNome

  // A ponte vinda da Conferência. Consome o alvo depois de aplicá-lo, senão
  // voltar para esta aba mais tarde ressuscitaria a semana antiga — o erro mais
  // fácil de não notar nesta tela. A `etapa` não precisa ser reposta aqui: o
  // Shell desmonta esta aba ao trocar de aba, então chegar da Conferência é
  // sempre um `grade` recém-nascido.
  useEffect(() => {
    if (!alvo) return
    reabrirEm(alvo.data, alvo.pacienteNome, alvo.carteirinha)
    onAlvoConsumido()
  }, [alvo, reabrirEm, onAlvoConsumido])

  const fecharSemana = useCallback(() => escolherPaciente(null), [escolherPaciente])

  /** Clique em "sem vínculo": seleciona a guia e troca a grade pela escolha da sessão. */
  const vincularGuia = useCallback(
    (guia: string) => {
      void selecionarGuia(guia)
      setEtapa('escolher')
    },
    [selecionarGuia]
  )

  /**
   * A guia em foco. Vem do recorte de órfãs da semana exibida — a mesma lista
   * que classificou o cartão âmbar que foi clicado, então as duas nunca podem
   * discordar sobre o que precisa de vínculo.
   */
  const guiaAtual = useMemo<GuiaOrfa | null>(
    () => (fila.guiaSelecionada ? analise.orfasDaSemana.get(fila.guiaSelecionada) ?? null : null),
    [fila.guiaSelecionada, analise.orfasDaSemana]
  )

  return (
    <div className="flex flex-col gap-4">
      {!podeVincular && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          Seu perfil permite consultar a reconciliação, mas não vincular autorizações.
        </p>
      )}

      <ListaPendencias
        pacientes={analise.pacientesDoMes}
        unidades={analise.unidadesDoMes}
        mesRef={analise.mesRef}
        mesFimEfetivo={analise.mesFimEfetivo}
        mesAtual={analise.mesAtual}
        podeAvancarMes={analise.podeAvancarMes}
        carregando={analise.loading}
        erro={analise.erro}
        onMes={analise.irParaMes}
        onIrParaMesData={analise.irParaMesData}
        onRecarregar={recarregarSemana}
        onAbrir={(paciente) => {
          // A última autorização do paciente no mês, quando existe, posiciona
          // o modal na semana onde a pendência de fato está.
          escolherPaciente(paciente.nome, paciente.carteirinhas, paciente.ultimaAutorizacao)
          setEtapa('grade')
        }}
      />

      <ModalSemanaPaciente
        open={semanaAberta && etapa === 'grade'}
        onClose={fecharSemana}
        analise={analise}
        podeVincular={podeVincular}
        codigosGlosa={codigosGlosa}
        onVincularGuia={vincularGuia}
      />

      <ModalEscolherSessao
        open={etapa === 'escolher'}
        onClose={() => setEtapa('grade')}
        guia={guiaAtual}
        candidatas={fila.candidatas}
        carregando={fila.carregandoCandidatas}
        erro={fila.erroCandidatas}
        janelaDias={JANELA_PADRAO}
        podeVincular={podeVincular}
        onEscolher={(candidata) => {
          setCandidataEscolhida(candidata)
          setEtapa('confirmar')
        }}
        onSemSessao={() => {
          setCandidataEscolhida(null)
          setEtapa('confirmar')
        }}
      />

      <ModalConfirmarVinculo
        open={etapa === 'confirmar'}
        onClose={() => setEtapa('grade')}
        guia={guiaAtual}
        candidata={candidataEscolhida}
        salvando={fila.salvando}
        onConfirmar={async (observacao) => {
          if (!guiaAtual) return
          if (candidataEscolhida) await fila.confirmarVinculo(candidataEscolhida, observacao)
          else await fila.descartarGuia(guiaAtual.guia, observacao)
          // Os dois lados envelhecem juntos: a guia sai da contagem de "sem
          // vínculo" e a sessão vira GLOSA_RESOLVIDA na grade — na mesma tela
          // para onde o fluxo volta.
          recarregarSemana()
          setCandidataEscolhida(null)
          setEtapa('grade')
        }}
      />
    </div>
  )
}
