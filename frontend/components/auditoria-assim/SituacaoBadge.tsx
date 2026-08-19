/**
 * Vocabulário de situação da auditoria ASSIM.
 *
 * Um matiz = um significado. A ordem das entradas segue a `prioridade` que a
 * própria RPC devolve (1 = mais urgente), porque é ela que ordena a tela — a
 * cor codifica a mesma severidade que a lista já usa, em vez de ser arbitrária.
 *
 * Regras que este arquivo mantém:
 *
 * - Nenhum estado repete o par (fundo, texto) de outro. Antes, NAO_SOLICITADA e
 *   FALTA_TERAPEUTA eram os dois `red-50 / red-600 / ring-red-300`, distintos só
 *   por um dot red-600 vs red-500 — dois significados com a mesma aparência.
 * - As faltas não disputam a régua de autorização: sessão que não aconteceu é
 *   outra categoria, então vive em stone (fora da escala) e se diferencia pelo
 *   dot — âmbar quando a falta é do terapeuta, porque aí é lacuna de escala
 *   nossa, não do paciente.
 * - Texto em `-700` sobre fundo `-50`, nunca `-600`. A 11px o par -600/-50 fica
 *   entre 3.4:1 e 3.9:1 e reprova no AA (4.5:1). Medidos aqui: rose 6.5:1,
 *   violet 7.5:1, amber 5.5:1, sky 6.3:1, slate 6.9:1, emerald 6.4:1,
 *   stone 7.3:1.
 * - Violeta é semântico (glosa) e só. Setas de ordenação e focus ring usam o
 *   steel da marca (--color-brand), não violeta — senão o mesmo matiz significa
 *   "glosa" numa célula e "foco" na de cima.
 * - A cor nunca é o único sinal: todo badge carrega rótulo em texto.
 */
type SituacaoConfigEntry = { label: string; dot: string; className: string }

export const SITUACAO_CONFIG: Record<string, SituacaoConfigEntry> = {
  // prioridade 1 — nada foi enviado; a lacuna mais urgente
  NAO_SOLICITADA: {
    label: 'Não Solicitada',
    dot: 'bg-rose-500',
    className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  },
  // prioridade 2 — recusa financeira; exige tratativa, não reenvio
  GLOSA: {
    label: 'Glosa',
    dot: 'bg-violet-500',
    className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  },
  // prioridade 3 — enviado, sem resposta da ASSIM
  RETORNO_NAO_CONFIRMADO: {
    label: 'Retorno Não Confirmado',
    dot: 'bg-amber-500',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  // alias legado — removível após migration aplicada
  AGUARDANDO_RETORNO: {
    label: 'Retorno Não Confirmado',
    dot: 'bg-amber-500',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  // prioridade 4 — em trânsito
  SINCRONIZANDO: {
    label: 'Sincronizando',
    dot: 'bg-sky-500',
    className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  },
  // prioridade 5 — encerrado sem efeito
  CANCELADA: {
    label: 'Cancelada',
    dot: 'bg-slate-400',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-300',
  },
  // prioridade 6 — autorizado
  LIBERADA: {
    label: 'Liberada',
    dot: 'bg-emerald-500',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  // fora da régua de autorização — a sessão não aconteceu
  FALTA: {
    label: 'Falta',
    dot: 'bg-stone-400',
    className: 'bg-stone-100 text-stone-600 ring-1 ring-stone-300',
  },
  FALTA_TERAPEUTA: {
    label: 'Falta Terapeuta',
    dot: 'bg-amber-500',
    className: 'bg-stone-100 text-stone-700 ring-1 ring-stone-300',
  },
}

export default function SituacaoBadge({ situacao }: { situacao: string | null }) {
  if (!situacao) return <span className="text-slate-400">—</span>

  const config: SituacaoConfigEntry = SITUACAO_CONFIG[situacao] ?? {
    label: situacao,
    dot: 'bg-slate-400',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-300',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  )
}
