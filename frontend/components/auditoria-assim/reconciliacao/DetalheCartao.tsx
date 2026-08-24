'use client'

import type { ReactNode } from 'react'
import { KeySquare, Link2, X } from 'lucide-react'
import { autorizacaoCancelada, autorizacaoLiberada } from '@/hooks/useAnaliseReincidencia'
import { completarMotivoGlosa, lerMotivoGlosa } from '@/lib/glosa'
import SituacaoBadge from '../SituacaoBadge'
import type { NotaManual, TokenConferencia } from '@/services/auditoria-assim.service'
import type { CartaoGrade } from '../types'
import { dataHoraCurta, formatarDiaComNome } from './datas'

/**
 * Tudo o que se sabe sobre um atendimento — sem sair da semana.
 *
 * Substituiu a seção "histórico de autorizações" que vivia no pé do modal
 * (2026-08-24). O histórico repetia, em lista cronológica, guias que a grade já
 * mostrava; a única coisa que ele acrescentava era o motivo da recusa por
 * extenso, e custava uma seção inteira mais um botão no rodapé para isso.
 *
 * Nada aqui é buscado. A semana inteira da clínica já está em memória e o cartão
 * carrega a linha de origem (`origem`), então todo campo abaixo é leitura de
 * objeto — nenhuma requisição, nem ao abrir a gaveta nem ao trocar de cartão.
 *
 * ── Gaveta, e não um quarto modal ─────────────────────────────────────────
 *
 * É um painel DENTRO do modal da semana, não um `createPortal` com foco próprio.
 * Dois `useModalDialog` ativos brigam pelo Tab e fazem o Escape fechar os dois —
 * é o motivo de os três diálogos desta aba nunca empilharem. Quem fecha esta
 * gaveta no Escape é o `fechar` do modal da semana, que a consulta antes de
 * fechar a si mesmo.
 *
 * A grade continua visível ao lado de propósito: a pergunta que traz alguém aqui
 * ("esta guia cobre o quê?") se responde comparando com os vizinhos da semana, e
 * uma gaveta que tapa a evidência obriga a fechar e reabrir para conferir.
 * Abaixo de `sm` ela ocupa a largura toda, porque ali não há espaço para os dois.
 */

/** Um par rótulo/valor. Valor ausente vira travessão — a linha nunca some. */
function Campo({ rotulo, children }: { rotulo: string; children?: ReactNode }) {
  const vazio = children === null || children === undefined || children === ''
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[11px] text-slate-500">{rotulo}</dt>
      <dd className="min-w-0 text-right text-[12px] font-medium text-slate-800">
        {vazio ? <span className="font-normal text-slate-400">—</span> : children}
      </dd>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-4 py-2 sm:px-5">
      <h4 className="pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-brand-fg uppercase">
        {titulo}
      </h4>
      <dl className="divide-y divide-slate-50">{children}</dl>
    </section>
  )
}

/** Só imprime a seção quando algum campo existe — evita um bloco de travessões. */
function temAlgum(...valores: unknown[]): boolean {
  return valores.some((v) => v !== null && v !== undefined && v !== '')
}

export default function DetalheCartao({
  cartao,
  codigosGlosa,
  conferencia,
  nota,
  podeVincular,
  onVincular,
  onFechar,
}: {
  cartao: CartaoGrade
  codigosGlosa: Map<string, string>
  /**
   * A conferência da filipeta deste bloco.
   *
   * Vem de fora e NÃO de `cartao.origem`: `get_auditoria_assim` não devolve
   * `token_conferido` embora `AuditoriaAssimItem` o declare — o serviço faz um
   * cast do retorno da RPC, e o campo chega `undefined`. Ler dali dizia "ainda
   * não" numa filipeta conferida. A fonte é `auditoria_token_conferencias`,
   * juntada no cliente (ver `buscarNotasEConferencias`).
   */
  conferencia?: TokenConferencia
  /** A anotação manual deste bloco, de `auditoria_atendimento_notas`. Mesma razão. */
  nota?: NotaManual
  podeVincular: boolean
  onVincular: (guia: string) => void
  onFechar: () => void
}) {
  // Estreitar pelo discriminante em duas variáveis, e não por um booleano: um
  // `const ehSessao = ...` não estreita `cartao` dentro do JSX, e a alternativa
  // seria repetir `cartao.tipo === 'sessao'` em cada bloco.
  const daSessao = cartao.tipo === 'sessao' ? cartao : null
  const daGuia = cartao.tipo === 'autorizacao' ? cartao : null

  // Mesmo parser que a Conferência e a Central usam: numa recusa o texto vem
  // "1601-REINCIDENCIA NO ATEN", cortado em 25 caracteres, e o de-para completa
  // o que a ASSIM truncou. Aqui ele cabe inteiro — era a única coisa que o
  // histórico do rodapé mostrava e o cartão não.
  const motivoBruto = daSessao
    ? daSessao.motivoBruto
    : autorizacaoLiberada(daGuia?.status ?? null) || autorizacaoCancelada(daGuia?.status ?? null)
      ? null
      : (daGuia?.descricao_erro ?? daGuia?.status ?? null)
  const motivo = completarMotivoGlosa(lerMotivoGlosa(motivoBruto), codigosGlosa)

  const origem = cartao.origem
  const titulo = daSessao
    ? `${
        daSessao.origem.data_atendimento
          ? formatarDiaComNome(daSessao.origem.data_atendimento)
          : 'sem data'
      } · ${cartao.hora}`
    : `Guia ${cartao.guia}`

  return (
    <aside
      aria-label="Detalhe do atendimento"
      className="absolute inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-slate-900">{titulo}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {cartao.terapia ?? 'terapia não informada'}
            {cartao.codigo_tuss && (
              <span className="tabular-nums"> · TUSS {cartao.codigo_tuss}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar o detalhe"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <X size={17} />
        </button>
      </header>

      {/* O estado, na mesma pílula que a Conferência usa. As marcas ao lado são
          o que esta tela acrescenta ao vocabulário — e vêm escritas, nunca só
          coloridas. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        {daSessao ? (
          <SituacaoBadge situacao={daSessao.situacao} />
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-300">
            {autorizacaoCancelada(daGuia?.status ?? null)
              ? 'Autorização desfeita'
              : autorizacaoLiberada(daGuia?.status ?? null)
                ? 'Liberada'
                : 'Recusada'}
          </span>
        )}
        {daSessao?.semCobertura && (
          <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
            Sem cobertura
          </span>
        )}
        {daSessao && !daSessao.decorrida && (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
            Ainda não aconteceu
          </span>
        )}
        {daGuia?.estado === 'sem-vinculo' && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
            Sem vínculo
          </span>
        )}
        {daGuia?.excedente && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
            Além do agendado
          </span>
        )}
      </div>

      {daSessao && (
        <Secao titulo="Atendimento">
          <Campo rotulo="Data">
            {daSessao.origem.data_atendimento
              ? formatarDiaComNome(daSessao.origem.data_atendimento)
              : null}
          </Campo>
          <Campo rotulo="Horário">
            <span className="tabular-nums">{cartao.hora}</span>
          </Campo>
          <Campo rotulo="Terapia">{cartao.terapia}</Campo>
          <Campo rotulo="Profissional">{daSessao.origem.profissionais}</Campo>
          <Campo rotulo="Convênio">{daSessao.origem.convenio_nome}</Campo>
          <Campo rotulo="Sessões no bloco">{daSessao.origem.quantidade_sessoes}</Campo>
        </Secao>
      )}

      <Secao titulo="Autorização">
        <Campo rotulo="Guia">
          {cartao.guia ? <span className="font-mono tabular-nums">{cartao.guia}</span> : null}
        </Campo>
        <Campo rotulo="TUSS">
          {cartao.codigo_tuss ? (
            <span className="font-mono tabular-nums">{cartao.codigo_tuss}</span>
          ) : null}
        </Campo>
        {/* O rótulo diz "no portal" porque `data_execucao` é o instante em que a
            ASSIM registrou, e NÃO a data do atendimento. Confundir os dois é o
            erro que este módulo inteiro existe para caçar. */}
        <Campo rotulo="Autorizada em (no portal)">
          {origem.data_execucao ? dataHoraCurta(origem.data_execucao) : null}
        </Campo>
        {daSessao ? (
          <>
            <Campo rotulo="Status na ASSIM">{daSessao.origem.status_assim}</Campo>
            <Campo rotulo="Forma de autorização">{daSessao.origem.forma_autorizacao}</Campo>
            <Campo rotulo="Horário da autorização">{daSessao.origem.horario_autorizacao}</Campo>
            <Campo rotulo="Solicitado por">{daSessao.origem.criado_por}</Campo>
          </>
        ) : (
          <Campo rotulo="Status na ASSIM">{daGuia?.status}</Campo>
        )}
      </Secao>

      {motivo && (
        <Secao titulo="Motivo da recusa">
          <div className="py-1.5">
            {motivo.codigo && (
              <p className="font-mono text-[12px] font-semibold tabular-nums text-violet-700">
                {motivo.codigo}
              </p>
            )}
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-700">{motivo.descricao}</p>
          </div>
        </Secao>
      )}

      {cartao.teve_token && (
        <Secao titulo="Filipeta">
          <Campo rotulo="Token">
            <span className="inline-flex items-center gap-1.5">
              <KeySquare size={12} className="text-amber-600" aria-hidden />
              <span className="font-mono tabular-nums">{cartao.token ?? 'sem número'}</span>
            </span>
          </Campo>
          {daSessao && (
            <>
              <Campo rotulo="Conferida">
                {conferencia?.conferido ? (
                  'sim'
                ) : (
                  <span className="font-normal text-amber-700">ainda não</span>
                )}
              </Campo>
              <Campo rotulo="Conferida por">{conferencia?.conferido_por_nome}</Campo>
              <Campo rotulo="Conferida em">
                {conferencia?.conferido_em ? dataHoraCurta(conferencia.conferido_em) : null}
              </Campo>
            </>
          )}
        </Secao>
      )}

      {/* A nota manual vem de `nota`, não de `origem.observacao_manual`, pela
          mesma razão da conferência: a RPC não a devolve. `origem.observacao` é
          diferente — essa é da agenda e vem na linha. */}
      {daSessao && temAlgum(daSessao.origem.observacao, nota?.texto) && (
        <Secao titulo="Observações">
          {daSessao.origem.observacao && (
            <div className="py-1.5">
              <p className="text-[11px] text-slate-500">Da agenda</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-700">
                {daSessao.origem.observacao}
              </p>
            </div>
          )}
          {nota?.texto && (
            <div className="py-1.5">
              <p className="text-[11px] text-slate-500">Anotada na Conferência</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-700">{nota.texto}</p>
              {nota.atualizado_por_nome && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {nota.atualizado_por_nome}
                  {nota.atualizado_em && <> · {dataHoraCurta(nota.atualizado_em)}</>}
                </p>
              )}
            </div>
          )}
        </Secao>
      )}

      {/* A ação mora onde está a evidência. Só a guia que a fila de órfãs
          reconhece a oferece — um controle que não leva a lugar nenhum ensina a
          ignorar os que levam. */}
      {daGuia?.estado === 'sem-vinculo' && (
        <div className="mt-auto border-t border-slate-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => onVincular(daGuia.guia)}
            disabled={!podeVincular}
            title={podeVincular ? undefined : 'Seu perfil não permite vincular autorizações'}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-fg px-4 text-[12px] font-semibold text-white transition hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 size={14} aria-hidden />
            Ver as sessões que esta guia pode cobrir
          </button>
        </div>
      )}

      {daGuia?.estado === 'fora-da-semana' && !daGuia.excedente && (
        <p className="px-4 py-3 text-[11px] leading-relaxed text-slate-500 sm:px-5">
          Esta guia não casa com nenhuma sessão desta semana e também não está na
          fila de reconciliação — pode estar pareada a uma sessão da semana
          vizinha, já ter sido triada, ou ser guia do próprio Pulsar.
        </p>
      )}
    </aside>
  )
}
