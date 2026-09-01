'use client'

import { memo } from 'react'
import { Search } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { rotuloForma } from '@/components/auditoria-assim/formaValidacao'

interface Props {
  busca: string
  setBusca: (v: string) => void

  horario: string
  setHorario: (v: string) => void
  horarioOpcoes: string[]

  unidade: string
  setUnidade: (v: string) => void
  unidadeOpcoes: string[]

  terapia: string
  setTerapia: (v: string) => void
  terapiaOpcoes: string[]

  forma: string
  setForma: (v: string) => void
  formaOpcoes: string[]

  data: string
  setData: (v: string) => void
}

function FiltersBar(props: Props) {
  return (
    <div
      className="
        bg-white/90
        backdrop-blur
        border border-white/50
        rounded-2xl
        p-3
        shadow-sm
      "
    >
      <div className="flex flex-wrap items-center gap-3">

        {/* DATA — o DatePicker de components/ui, o do fim de semana em vermelho.
            É o mesmo componente dos filtros de Laudos, e `classeGatilho` existe
            justamente para ele caber numa barra de filtros sem o `mt-1` e a
            moldura de campo de formulário que o gatilho padrão traz.
            Ganho além do gosto: sábado/domingo saltando aos olhos evita abrir um
            dia sem sessão e ler a lista vazia como se fosse falha do sistema. */}
        <DatePicker
          value={props.data}
          // O "Limpar" do picker devolve string vazia, e aqui a data não é
          // opcional: sem ela a RPC do dia não tem o que buscar e a lista
          // esvaziaria sem gatilho para voltar. Cair em hoje é o mesmo destino
          // do botão "Hoje" ao lado — o estado neutro desta tela é o dia atual.
          onChange={(v) => props.setData(v || new Date().toLocaleDateString('en-CA'))}
          classeGatilho={`${inputClass} inline-flex w-42.5 items-center justify-between gap-2`}
        />

        {/* BUSCA */}
        <div className="relative flex-1 min-w-50">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />

          <input
            placeholder="Buscar paciente ou terapeuta..."
            value={props.busca}
            onChange={(e) => props.setBusca(e.target.value)}
            className={`${inputClass} pl-11 w-full`}
          />
        </div>

        {/* HORÁRIO */}
        <select
          value={props.horario}
          onChange={(e) => props.setHorario(e.target.value)}
          className={`${inputClass} w-32.5`}
        >
          <option value="">Todos horários</option>
          {props.horarioOpcoes.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

        {/* UNIDADE */}
        <select
          value={props.unidade}
          onChange={(e) => props.setUnidade(e.target.value)}
          className={`${inputClass} w-37.5`}
        >
          <option value="">Todas unidades</option>
          {props.unidadeOpcoes.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

        {/* TERAPIA */}
        <select
          value={props.terapia}
          onChange={(e) => props.setTerapia(e.target.value)}
          className={`${inputClass} w-37.5`}
        >
          <option value="">Todas terapias</option>
          {props.terapiaOpcoes.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

        {/* FORMA DE AUTORIZAÇÃO — como a presença do beneficiário foi validada
            na ASSIM (QR Code, biometria, erro de reconhecimento facial...). O
            texto chega literal de `fila_autorizacoes.forma_autorizacao`, escolhido
            pela recepção no modal do robô: o vocabulário NÃO é fechado, então as
            opções vêm dos dados do dia, nunca de uma lista fixa aqui.

            O `value` é sempre o valor GRAVADO e o texto é o rótulo de exibição
            (`rotuloForma`): é o value que o filtro compara com o dado, então
            traduzir os dois quebraria a comparação em silêncio. */}
        <select
          value={props.forma}
          onChange={(e) => props.setForma(e.target.value)}
          className={`${inputClass} w-52`}
        >
          <option value="">Todas as formas</option>
          {props.formaOpcoes.map((op) => (
            <option key={op} value={op}>{rotuloForma(op)}</option>
          ))}
        </select>

      </div>
    </div>
  )
}

export default memo(FiltersBar)

const inputClass = `
  h-10
  rounded-2xl
  border border-slate-200
  bg-white
  px-4
  text-sm
  outline-none
  focus:ring-4
  focus:ring-emerald-100
  focus:border-emerald-300
  transition
`
