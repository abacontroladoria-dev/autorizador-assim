'use client'

import type { LinhaGrade } from '../types'
import CartaoAtendimento from './CartaoAtendimento'
import { formatarDia } from './datas'

const DIA_CURTO = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

function rotuloColuna(iso: string): { nome: string; data: string } {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(ano, (mes ?? 1) - 1, dia ?? 1)
  return { nome: DIA_CURTO[d.getDay()] ?? '', data: formatarDia(iso) }
}

/**
 * A semana do paciente como agenda: horários nas linhas, dias úteis nas colunas.
 *
 * É o elemento principal do modal, e por isso é o único que rola. A coluna do
 * horário fica grudada na esquerda porque, com rolagem lateral, uma célula sem a
 * escala ao lado deixa de dizer a que hora aquele atendimento pertence — e a
 * hora é justamente o eixo.
 *
 * Largura mínima de 11rem por dia é medida, não estética: abaixo disso o nome da
 * terapia quebra em três linhas e o cartão deixa de ser lido de relance, que é a
 * única razão de ele existir. Onde a coluna é larga (telas grandes), dois
 * atendimentos da mesma faixa cabem lado a lado; onde é estreita, eles
 * empilham — encolher o cartão até caber seria trocar legibilidade por simetria.
 *
 * Célula vazia fica VAZIA. Numa agenda o vazio é a maioria das células, e
 * escrever "sem sessão" em cada uma faz o ruído crescer com o tamanho da tela; o
 * dia inteiro sem nada, esse sim, é dito uma vez no cabeçalho da coluna.
 */
export default function GradeSemana({
  linhas,
  dias,
  hoje,
  codigosGlosa,
  podeVincular,
  onVincularGuia,
}: {
  linhas: LinhaGrade[]
  dias: string[]
  /** Data local de hoje, para destacar a coluna do dia. */
  hoje: string
  codigosGlosa: Map<string, string>
  podeVincular: boolean
  onVincularGuia: (guia: string) => void
}) {
  const diasVazios = new Set(
    dias.filter((dia) => linhas.every((linha) => (linha.celulas[dia] ?? []).length === 0))
  )

  return (
    // `relative` mantém a rolagem lateral aqui dentro: sem contêiner
    // posicionado, a largura mínima das colunas escapa do `overflow-x-auto` e é
    // o documento que rola de lado (medido em 390px).
    <div className="relative overflow-x-auto">
      {/*
        As larguras mínimas das colunas somam ~59,5rem. Abaixo disso a grade
        transborda e o contêiner rola de lado, em vez de espremer os cartões até
        a ilegibilidade; acima, o `1fr` distribui a sobra pelos cinco dias.

        Sem roles de tabela: com `display: contents` nas linhas, `role="row"` é
        descartado por parte dos navegadores e a tabela chega ao leitor de tela
        pela metade — pior que não prometer tabela nenhuma. O resumo da semana
        logo acima é anunciado por `aria-live`, e cada cartão carrega o estado
        escrito.
      */}
      <div className="grid w-full grid-cols-[4.5rem_repeat(5,minmax(11rem,1fr))]">
        {/* Cabeçalho */}
        <div className="sticky left-0 z-20 border-b border-slate-200 bg-white px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500">
          Horário
        </div>
        {dias.map((dia) => {
          const { nome, data } = rotuloColuna(dia)
          const ehHoje = dia === hoje
          return (
            <div
              key={dia}
              className={`border-b border-l border-slate-200 px-3 py-2.5 text-[11px] font-semibold tracking-wide ${
                ehHoje ? 'bg-brand-surface text-brand-fg' : 'bg-white text-slate-500'
              }`}
            >
              {nome} <span className="tabular-nums">{data}</span>
              {ehHoje && <span className="ml-1 font-medium normal-case">· hoje</span>}
              {/* Dito uma vez, no alto da coluna: repetir isso em cada faixa
                  encheria o dia mais vazio de texto. */}
              {diasVazios.has(dia) && (
                <span className="mt-0.5 block font-normal text-slate-400 normal-case">
                  Nenhum atendimento
                </span>
              )}
            </div>
          )
        })}

        {/* A escala de horários */}
        {linhas.map((linha) => {
          const semHora = linha.hora === '—'
          return (
            <div key={linha.hora} className="contents">
              <div className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-3 text-right">
                {semHora ? (
                  <span className="text-[10px] leading-tight font-semibold text-slate-400">
                    sem horário
                  </span>
                ) : (
                  <span className="text-[12px] leading-none font-semibold tabular-nums text-slate-500">
                    {linha.hora}
                  </span>
                )}
              </div>

              {dias.map((dia) => {
                const cartoes = linha.celulas[dia] ?? []
                return (
                  <div
                    key={dia}
                    className={`min-h-14 border-b border-l border-slate-100 p-2 ${
                      dia === hoje ? 'bg-brand-surface/40' : ''
                    }`}
                  >
                    {cartoes.length > 0 && (
                      <div className="flex flex-wrap items-start gap-1.5">
                        {cartoes.map((cartao) => (
                          <div key={cartao.chave} className="min-w-0 grow basis-34">
                            <CartaoAtendimento
                              cartao={cartao}
                              codigosGlosa={codigosGlosa}
                              podeVincular={podeVincular}
                              onVincular={onVincularGuia}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
