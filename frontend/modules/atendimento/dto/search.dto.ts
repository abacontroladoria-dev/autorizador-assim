type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] }

const VALID_TYPES = ['contacts', 'conversations', 'all'] as const
export type SearchType = typeof VALID_TYPES[number]

export interface SearchQuery {
  q:     string
  type:  SearchType
  limit: number
}

export function parseSearchQuery(p: URLSearchParams): ParseResult<SearchQuery> {
  const errors: string[] = []

  const q = (p.get('q') ?? '').trim()
  if (q.length < 2)   errors.push('q deve ter pelo menos 2 caracteres')
  if (q.length > 200) errors.push('q excede 200 caracteres')

  const typeRaw = p.get('type') ?? 'all'
  if (!VALID_TYPES.includes(typeRaw as SearchType)) {
    errors.push(`type deve ser: ${VALID_TYPES.join(', ')}`)
  }

  const limit = Math.min(20, Math.max(1, parseInt(p.get('limit') ?? '10', 10) || 10))

  if (errors.length) return { ok: false, errors }
  return { ok: true, data: { q, type: typeRaw as SearchType, limit } }
}
