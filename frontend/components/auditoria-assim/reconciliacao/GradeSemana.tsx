'use client'

import { iconeTerapia } from '@/lib/cronograma/iconeTerapia'
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
 * A semana do paciente como calendário: TUSS nas linhas, dias úteis nas colunas.
 *
 * É o elemento principal do modal, e por isso é o único que rola. A primeira
 * coluna fica grudada na esquerda porque, com scroll horizontal, uma célula sem
 * o nome da terapia ao lado não diz nada — o horário sozinho não identifica o
 * atendimento.
 *
 * Largura mínima de 9,5rem por dia é medida, não estética: abaixo disso a guia
 * de seis dígitos em tabular-nums quebra em duas linhas e o cartão deixa de ser
 * lido de relance, que é a única razão de ele existir.
 *
 * Célula vazia recebe um travessão, nunca "sem sessão" repetido cinco vezes por
 * linha: o vazio é o estado mais comum de uma grade semanal, e escrevê-lo por
 * extenso faz o ruído crescer justamente com o tamanho da tela.
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
  return (
    // `relative` mantém a rolagem lateral aqui dentro: sem contêiner
    // posicionado, a largura mínima das colunas escapa do `overflow-x-auto` e é
    // o documento que rola de lado (medido em 390px).
    <div className="relative overflow-x-auto">
      {/*
        As larguras mínimas das colunas somam ~57,5rem. Abaixo disso a grade
        transborda e o contêiner rola de lado, em vez de espremer os cartões até
        a ilegibilidade; acima, o `1fr` distribui a sobra pelos cinco dias.

        Sem roles de tabela: com `display: contents` nas linhas, `role="row"` é
        descartado por parte dos navegadores e a tabela chega ao leitor de tela
        pela metade — pior que não prometer tabela nenhuma. O resumo da semana
        logo acima é anunciado por `aria-live`, e cada cartão carrega o estado
        escrito.
      */}
      <div className="grid w-full grid-cols-[minmax(10rem,13rem)_repeat(5,minmax(9.5rem,1fr))]">
        {/* Cabeçalho */}
        <div className="sticky left-0 z-20 border-b border-slate-200 bg-white px-4 py-2.5 text-[11px] font-semibold text-slate-500">
          Terapias
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
            </div>
          )
        })}

        {/* Linhas */}
        {linhas.map((linha) => {
          const Icone = iconeTerapia(linha.terapias || linha.codigo_tuss)
          return (
            <div key={linha.codigo_tuss} className="contents">
              <div className="sticky left-0 z-10 flex items-start gap-2.5 border-b border-slate-100 bg-white px-4 py-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-surface text-brand-fg">
                  <Icone size={14} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p
                    className="text-[13px] leading-tight font-semibold text-slate-800"
                    title={linha.terapias || undefined}
                  >
                    {linha.terapias || 'Terapia não identificada'}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                    {linha.codigo_tuss}
                  </p>
                  {/* A frequência esperada sai da própria semana — é o maior número
                      de sessões desse TUSS num único dia. Sem sessão nenhuma (linha
                      que só tem guia sobrando), não há o que afirmar. */}
                  {linha.sessoesPorDia > 0 && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {linha.sessoesPorDia} {linha.sessoesPorDia === 1 ? 'sessão' : 'sessões'}/dia
                    </p>
                  )}
                </div>
              </div>

              {dias.map((dia) => {
                const cartoes = linha.celulas[dia] ?? []
                return (
                  <div
                    key={dia}
                    className={`border-b border-l border-slate-100 p-2 ${
                      dia === hoje ? 'bg-brand-surface/40' : ''
                    }`}
                  >
                    {cartoes.length === 0 ? (
                      <p className="py-3 text-center text-[11px] text-slate-400">
                        <span aria-hidden>—</span>
                        <span className="sr-only">Nenhum atendimento</span>
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {cartoes.map((cartao) => (
                          <CartaoAtendimento
                            key={cartao.chave}
                            cartao={cartao}
                            codigosGlosa={codigosGlosa}
                            podeVincular={podeVincular}
                            onVincular={onVincularGuia}
                          />
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
