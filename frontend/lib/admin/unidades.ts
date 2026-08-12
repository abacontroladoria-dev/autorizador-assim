export const UNIDADES_DISPONIVEIS = ['Realengo', 'Fazendinha', 'Padre Miguel'] as const

export type UnidadeDisponivel = (typeof UNIDADES_DISPONIVEIS)[number]
