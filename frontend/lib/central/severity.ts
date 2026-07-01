/**
 * Modelo de severidade da Central de Operações Clínicas.
 *
 * Em vez de pintar cada `status_operacional` com uma cor própria (ruído visual),
 * mapeamos cada status a UMA de quatro severidades. Cor = exceção: num dia
 * saudável a tela fica quase toda neutra, e o olho vai direto ao que precisa de
 * ação. Esta é a fonte única de verdade para rótulo, cor e ícone — StatusBadge,
 * AttendanceCard, a triagem da lista e os chips do cabeçalho consomem daqui.
 */

import {
  CheckCircle2,
  Clock3,
  Loader2,
  AlertTriangle,
  UserMinus,
  UserX,
  type LucideIcon,
} from 'lucide-react'

export type Severidade = 'resolvido' | 'andamento' | 'atencao' | 'critico'

export interface StatusToken {
  /** chave canônica do status_operacional */
  key: string
  /** palavra exibida ao coordenador */
  label: string
  severidade: Severidade
  icon: LucideIcon
  /** anima o ícone (estados transitórios) */
  spin?: boolean
}

/** Severidade → paleta. Quatro cores + tinta, sem roxo. */
export const SEVERIDADE_UI: Record<
  Severidade,
  {
    /** cor sólida do "dot" / barra do pulse */
    solid: string
    /** texto da palavra de status */
    text: string
    /** preenchimento suave do chip/badge */
    soft: string
    /** borda do chip/badge */
    softBorder: string
    /** espinha lateral do card (loud) */
    spine: string
    /** rank para ordenar exceções (maior = mais urgente) */
    rank: number
    /** entra no bloco "Precisa de atenção" */
    exige_acao: boolean
  }
> = {
  critico: {
    solid: 'bg-rose-500',
    text: 'text-rose-700',
    soft: 'bg-rose-50',
    softBorder: 'border-rose-200',
    spine: 'bg-rose-500',
    rank: 3,
    exige_acao: true,
  },
  atencao: {
    solid: 'bg-amber-500',
    text: 'text-amber-700',
    soft: 'bg-amber-50',
    softBorder: 'border-amber-200',
    spine: 'bg-amber-400',
    rank: 2,
    exige_acao: true,
  },
  andamento: {
    solid: 'bg-slate-300',
    text: 'text-slate-500',
    soft: 'bg-slate-100',
    softBorder: 'border-slate-200',
    spine: 'bg-transparent',
    rank: 1,
    exige_acao: false,
  },
  resolvido: {
    solid: 'bg-emerald-500',
    text: 'text-emerald-700',
    soft: 'bg-emerald-50',
    softBorder: 'border-emerald-200',
    spine: 'bg-transparent',
    rank: 0,
    exige_acao: false,
  },
}

const TOKENS: Record<string, StatusToken> = {
  autorizado: {
    key: 'autorizado',
    label: 'Autorizado',
    severidade: 'resolvido',
    icon: CheckCircle2,
  },
  concluido: {
    key: 'autorizado',
    label: 'Autorizado',
    severidade: 'resolvido',
    icon: CheckCircle2,
  },
  presenca_confirmada: {
    key: 'presenca_confirmada',
    label: 'Presença confirmada',
    severidade: 'andamento',
    icon: CheckCircle2,
  },
  processando: {
    key: 'processando',
    label: 'Processando',
    severidade: 'andamento',
    icon: Loader2,
    spin: true,
  },
  executando: {
    key: 'processando',
    label: 'Processando',
    severidade: 'andamento',
    icon: Loader2,
    spin: true,
  },
  pendente: {
    key: 'pendente',
    label: 'Pendente',
    severidade: 'andamento',
    icon: Clock3,
  },
  concluido_sem_guia: {
    key: 'concluido_sem_guia',
    label: 'Aguardando guia',
    severidade: 'andamento',
    icon: Clock3,
  },
  falta_paciente: {
    key: 'falta_paciente',
    label: 'Falta do paciente',
    severidade: 'atencao',
    icon: UserMinus,
  },
  falta: {
    key: 'falta_paciente',
    label: 'Falta do paciente',
    severidade: 'atencao',
    icon: UserMinus,
  },
  falta_terapeuta: {
    key: 'falta_terapeuta',
    label: 'Falta do terapeuta',
    severidade: 'critico',
    icon: UserX,
  },
  erro: {
    key: 'erro',
    label: 'Sem autorização',
    severidade: 'critico',
    icon: AlertTriangle,
  },
}

const FALLBACK: StatusToken = {
  key: 'pendente',
  label: 'Pendente',
  severidade: 'andamento',
  icon: Clock3,
}

/** Resolve o token de um registro a partir do status_operacional. */
export function resolverStatus(item: any): StatusToken {
  const bruto =
    item?.status_operacional ||
    item?.status_assim ||
    item?.status ||
    ''

  const token = TOKENS[String(bruto).toLowerCase()]
  if (token) {
    if (token.key === 'autorizado') {
      const conv = (item?.convenio || item?.convenio_nome || '').toLowerCase()
      if (!conv.includes('assim')) {
        return { ...token, label: 'Presente' }
      }
    }
    return token
  }

  return { ...FALLBACK, label: bruto || 'Sem status' }
}

export function uiDe(item: any) {
  return SEVERIDADE_UI[resolverStatus(item).severidade]
}

/** Quem realizou o atendimento (substituto, se houve; senão o agendado). */
export function realizouPor(item: any): string | null {
  return (
    item?.profissional_realizou_nome ||
    item?.profissional_substituto_nome ||
    item?.profissional_nome ||
    null
  )
}

export function houveSubstituicao(item: any): boolean {
  return (
    item?.is_substituicao === true ||
    (!!item?.profissional_substituto_nome &&
      item?.profissional_substituto_nome !== item?.profissional_nome)
  )
}
