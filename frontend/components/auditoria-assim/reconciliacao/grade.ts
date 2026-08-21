import type {
  AuditoriaAssimItem,
  AutorizacaoAssimSemana,
  CartaoGrade,
  LinhaGrade,
  PlacarTuss,
} from '../types'
import type { EstadoAutorizacao } from './LinhaAutorizacao'
import { diaDoTimestamp, horaDoTimestamp } from './datas'

/**
 * A semana do paciente como grade: TUSS nas linhas, dias úteis nas colunas.
 *
 * Por que a grade e não duas listas lado a lado — que foi o desenho anterior:
 * a pergunta que a tela responde é "a cota desta terapia bateu nesta semana?", e
 * a cota é por TUSS. Duas colunas cronológicas obrigavam a pessoa a cruzar
 * mentalmente sessão e guia linha a linha; a grade põe as duas na MESMA célula.
 *
 * As duas espécies de cartão convivem de propósito, e não medem a mesma coisa:
 *
 * - a SESSÃO é posicionada pela `data_atendimento` — quando o paciente foi;
 * - a AUTORIZAÇÃO sem par é posicionada pelo dia de `data_execucao`, que é o
 *   instante em que a ASSIM a registrou no portal e **não** a data do
 *   atendimento (ver `reference_data_execucao_assim`). Uma guia autorizada na
 *   quarta pode cobrir a sessão de segunda — por isso o cartão diz "autorizada
 *   em", e por isso escolher a sessão que ela cobre continua sendo um ato
 *   manual, no modal de vínculo.
 *
 * Guia PAREADA não vira cartão próprio: ela já está impressa no cartão da sessão
 * que cobriu. Repeti-la faria a mesma autorização aparecer duas vezes na semana
 * e inflaria visualmente uma cota que está correta.
 */
export function montarGrade(
  sessoes: AuditoriaAssimItem[],
  autorizacoes: AutorizacaoAssimSemana[],
  estadoDaGuia: (guia: string) => EstadoAutorizacao,
  dias: string[],
  placar: PlacarTuss[]
): LinhaGrade[] {
  const diasValidos = new Set(dias)
  const terapiaDoTuss = new Map(placar.map((p) => [p.codigo_tuss, p.terapias]))

  const linhas = new Map<string, LinhaGrade & { porDia: Map<string, number> }>()

  const abrir = (codigo: string | null) => {
    const chave = codigo ?? '—'
    let atual = linhas.get(chave)
    if (!atual) {
      atual = {
        codigo_tuss: chave,
        terapias: terapiaDoTuss.get(chave) ?? '',
        sessoesPorDia: 0,
        celulas: Object.fromEntries(dias.map((d) => [d, [] as CartaoGrade[]])),
        porDia: new Map<string, number>(),
      }
      linhas.set(chave, atual)
    }
    return atual
  }

  for (const s of sessoes) {
    const dia = s.data_atendimento ?? ''
    if (!diasValidos.has(dia)) continue
    const linha = abrir(s.codigo_tuss)
    if (!linha.terapias && s.terapias) linha.terapias = s.terapias
    linha.celulas[dia].push({
      tipo: 'sessao',
      chave: s.bloco_id ?? `${dia}-${s.hora_inicial}-${s.codigo_tuss}`,
      hora: s.hora_inicial?.slice(0, 5) ?? '—',
      codigo_tuss: s.codigo_tuss,
      guia: s.guia,
      situacao: s.situacao,
      terapia: s.terapias,
      legenda: s.profissionais ?? s.observacao ?? null,
      teve_token: s.teve_token,
      token: s.token,
    })
    linha.porDia.set(dia, (linha.porDia.get(dia) ?? 0) + 1)
  }

  for (const a of autorizacoes) {
    const estado = estadoDaGuia(a.guia)
    if (estado === 'pareada') continue
    const dia = diaDoTimestamp(a.data_execucao) ?? ''
    if (!diasValidos.has(dia)) continue
    const linha = abrir(a.codigo_tuss)
    linha.celulas[dia].push({
      tipo: 'autorizacao',
      chave: `guia-${a.guia}-${a.data_execucao ?? ''}`,
      hora: horaDoTimestamp(a.data_execucao),
      codigo_tuss: a.codigo_tuss,
      guia: a.guia,
      estado,
      status: a.status,
      descricao_erro: a.descricao_erro,
      teve_token: a.teve_token,
      token: a.token,
    })
  }

  return [...linhas.values()]
    .map(({ porDia, ...linha }) => {
      for (const dia of dias) linha.celulas[dia].sort((a, b) => a.hora.localeCompare(b.hora))
      return { ...linha, sessoesPorDia: Math.max(0, ...porDia.values()) }
    })
    // Terapia primeiro (é o que a pessoa lê), TUSS como desempate estável.
    .sort(
      (a, b) =>
        (a.terapias || 'zzz').localeCompare(b.terapias || 'zzz', 'pt-BR') ||
        a.codigo_tuss.localeCompare(b.codigo_tuss)
    )
}
