// Tipos da tela Acompanhamento de Laudos (/acompanhamento/laudos).
//
// Vivem AQUI, e não em services/laudos/acompanhamento.ts, porque aquele módulo é
// `server-only` (lê `orbita_laudos_*` com service_role) e os componentes desta
// tela são cliente — importar o tipo de lá arrastaria o módulo de servidor para
// o bundle. Mesma separação já feita por `MetaImportacaoLaudos` em
// types/cronograma.ts.

import type { SituacaoLaudo } from "@/lib/laudos/acompanhamento"

export type { SituacaoLaudo }

/**
 * Situação do paciente no cadastro do Pulsar, do ponto de vista desta tela.
 *
 * `ficticio` são Notificação Prévia, Horário Administrativo e afins — não são
 * pessoas, e /cadastros/pacientes os deixa fora por padrão pelo mesmo motivo.
 * Medido em 28/08/2026: 1 dos 343 laudos do relatório é de paciente fictício
 * (laudo 464, "Notificação Prévia", vigente). Um só, e ainda assim não pode
 * ficar na fila de cobrança: não existe responsável para avisar.
 *
 * `ficticio` VENCE `ativo`/`inativo` quando os dois valem — igual à listagem do
 * cadastro.
 */
export type SituacaoPaciente = "ativo" | "inativo" | "sem_cadastro" | "ficticio"

/**
 * Uma linha da tela: o laudo do Órbita + o cadastro do Pulsar (quando existe) +
 * o registro da recepção (quando existe).
 *
 * Todas as datas em ISO (`AAAA-MM-DD`) — a tela ordena e filtra por elas, e
 * "DD/MM/AAAA" não se compara como string. Formatação BR só no render.
 */
export interface ItemAcompanhamentoLaudo {
  // ─── Do relatório do Órbita (fonte da lista) ───
  /** `ID Laudo`. A chave da linha e a única que sobrevive à troca de importação. */
  idLaudo: string
  /** `ID Favorecido` — o "ID PAC" que a tela mostra. */
  idFavorecido: number | null
  /** Nome do relatório. O do cadastro, quando existe, está em `pacienteNomeCadastro`. */
  nome: string
  dataLaudo: string | null
  validade: string | null
  autorizadoEm: string | null
  /** Calculada por `validade` contra hoje (Brasília), conferida com o Órbita. */
  situacao: SituacaoLaudo
  situacaoOrbita: string
  /** O Órbita e o cálculo por validade discordam — mostrar, nunca engolir. */
  situacaoDivergente: boolean
  especialidades: string[]

  // ─── Do cadastro do Pulsar (enriquecimento; pode faltar) ───
  /** Nulo nos laudos cujo paciente não tem cadastro — 58 de 343 em 28/08/2026. */
  pacienteId: number | null
  pacienteNomeCadastro: string | null
  /** `ativo`/`inativo`/`sem_cadastro` — é o campo "ATIVO (PACIENTE)" da tela. */
  situacaoPaciente: SituacaoPaciente
  /** PATH no bucket privado, não URL. A URL assinada é gerada no cliente. */
  fotoPath: string | null

  // ─── Do acompanhamento da recepção (pode faltar) ───
  /** A data que a recepção digitou. `null` = pendência em aberto. */
  mensagemEnviadaEm: string | null
  observacao: string | null
  /** Quem salvou por último e quando (data/hora de Brasília, já formatada). */
  registradoPorNome: string | null
  registradoEm: string | null
}

/** Metadados da resposta — de onde veio a lista e o que ela deixou de fora. */
export interface MetaAcompanhamentoLaudos {
  /** Importação do robô que originou a lista. */
  importacaoId: string
  arquivoNome: string
  concluidoEm: string | null
  /** Linhas do relatório lidas (uma por laudo × especialidade). */
  linhasLidas: number
  /** Laudos distintos — o número de cartões. */
  laudos: number
  /** Hoje em Brasília, na base do cálculo vigente/vencido. */
  hoje: string
  /** Linhas do relatório sem `ID Laudo`, descartadas. Esperado: 0. */
  descartadas: number
  /** Laudos com campo divergente entre suas linhas. Esperado: 0. */
  comCamposDivergentes: number
  /** Laudos onde o rótulo do Órbita discorda da validade. Esperado: 0. */
  comSituacaoDivergente: number
}

export interface RespostaAcompanhamentoLaudos {
  ok: true
  itens: ItemAcompanhamentoLaudo[]
  meta: MetaAcompanhamentoLaudos
}

/** O que a recepção grava. `null` em `mensagemEnviadaEm` limpa a data. */
export interface EdicaoAcompanhamentoLaudo {
  mensagemEnviadaEm: string | null
  observacao: string | null
}
