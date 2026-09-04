"use client"

import { useEffect, useState } from "react"
import {
  AlertCircle,
  BadgeCheck,
  Clock,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  ShieldQuestion,
  User,
} from "lucide-react"
import {
  listarDadosEscolares,
  type DadosEscolares,
} from "@/services/pacienteDadosEscolares.service"
import { foco } from "../ui/campos"

// Dados escolares declarados pelo responsável no formulário público.
//
// A tela é SOMENTE LEITURA, e isso é a decisão central: ninguém da equipe edita
// aqui. O que está registrado é o que a família enviou, e corrigir por dentro
// apagaria a diferença entre "a escola informou" e "alguém achou que era assim".
// Correção se faz com um novo envio — o histórico guarda os dois.
//
// O selo de conferência precisa ser lido com cuidado, e a tela é redigida para
// isso: "confere" e "verificar", nunca "suspeito". O telefone cadastrado em
// `responsaveis` é texto livre e o cadastro tem buracos, então "não confere"
// significa "vale uma olhada", não "é fraude".

export function AbaEscola({ pacienteId }: { pacienteId: number }) {
  const [envios, setEnvios] = useState<DadosEscolares[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      setEnvios(await listarDadosEscolares(pacienteId))
    } catch {
      // Deliberadamente explícito sobre ser FALHA DE LEITURA. Se esta mensagem
      // parecesse "não há registros", a equipe concluiria que a família não
      // preencheu — e cobraria de novo um formulário já enviado.
      setErro(
        "Não foi possível consultar as informações escolares. Isto é uma falha de leitura, não quer dizer que o paciente não tenha registro."
      )
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [pacienteId])

  if (carregando) {
    return (
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-4">
        <div className="space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-4">
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{erro}</span>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            className={`mt-3 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted ${foco}`}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // Vazio é um FATO sobre este paciente ("a família ainda não preencheu"), não
  // uma falha de leitura. Os dois estados chegam aqui por caminhos separados e
  // precisam continuar assim: um erro disfarçado de "nenhum registro" faria a
  // equipe cobrar um formulário que talvez já tenha sido enviado.
  if (envios.length === 0) {
    return (
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-10">
        <div className="mx-auto max-w-sm text-center">
          <GraduationCap
            className="mx-auto h-8 w-8 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium text-foreground">
            Este paciente ainda não tem informações escolares
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nada foi recebido pelo formulário até agora. Envie o link ao responsável
            para que ele preencha.
          </p>
        </div>
      </div>
    )
  }

  const [atual, ...anteriores] = envios

  return (
    <div className="min-w-0 flex-1 space-y-4">
      {/* Quando os dados foram atualizados é a primeira pergunta de quem abre
          esta aba: informação escolar de dois anos atrás não descreve mais a
          criança. Fica acima do conteúdo, não escondida num rodapé. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
        <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">Última atualização:</span>
        <span className="font-medium text-foreground">{formatarDataHora(atual.criado_em)}</span>
        <span className="text-muted-foreground">({tempoDecorrido(atual.criado_em)})</span>
      </div>

      <EnvioAtual envio={atual} />

      {anteriores.length > 0 && (
        <details className="rounded-lg border border-border bg-card">
          <summary
            className={`cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground hover:bg-muted ${foco}`}
          >
            Envios anteriores ({anteriores.length})
            <span className="ml-2 font-normal text-muted-foreground">
              — a escola pode ter mudado
            </span>
          </summary>
          <div className="space-y-3 border-t border-border px-4 py-4">
            {anteriores.map((envio) => (
              <EnvioAnterior key={envio.id} envio={envio} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function EnvioAtual({ envio }: { envio: DadosEscolares }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{envio.escola_nome}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Informado em {formatarData(envio.criado_em)}
          </p>
        </div>
        <SeloConferencia confere={envio.telefone_confere} />
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Item icone={<MapPin className="h-3.5 w-3.5" />} rotulo="Endereço" valor={envio.escola_endereco} />
        <Item icone={<Phone className="h-3.5 w-3.5" />} rotulo="Telefone" valor={envio.escola_telefone} />
        <Item icone={<Mail className="h-3.5 w-3.5" />} rotulo="E-mail" valor={envio.escola_email} />
        <Item icone={<User className="h-3.5 w-3.5" />} rotulo="Coordenador(a)" valor={envio.coordenador_nome} />
        <Item rotulo="Turma" valor={envio.turma} />
        <Item rotulo="Turno" valor={envio.turno} />
      </dl>

      <div className="mt-5 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          Preenchido por{" "}
          <span className="font-medium text-foreground">{envio.preenchido_por_nome}</span>
          {envio.preenchido_por_parentesco && ` (${envio.preenchido_por_parentesco})`}
          {envio.preenchido_por_telefone && ` — ${envio.preenchido_por_telefone}`}
        </p>
      </div>
    </div>
  )
}

function EnvioAnterior({ envio }: { envio: DadosEscolares }) {
  const detalhes = [envio.turma, envio.turno].filter(Boolean).join(" · ")

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-foreground">{envio.escola_nome}</span>
        {detalhes && <span className="ml-2 text-muted-foreground">{detalhes}</span>}
      </div>
      <span className="text-xs text-muted-foreground">
        {formatarData(envio.criado_em)} · {envio.preenchido_por_nome}
      </span>
    </div>
  )
}

/**
 * Indício de que o envio veio mesmo da família — telefone informado batendo com
 * o de algum responsável cadastrado.
 *
 * Os três estados são distintos de propósito. `null` (não deu para comparar) NÃO
 * é o mesmo que `false`, e mostrá-los igual acusaria injustamente as famílias de
 * pacientes cujo cadastro não tem telefone.
 */
function SeloConferencia({ confere }: { confere: boolean | null }) {
  if (confere === true) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Telefone confere
      </span>
    )
  }

  if (confere === false) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
        title="O telefone informado não bate com nenhum responsável cadastrado. Pode ser um número novo — vale confirmar."
      >
        <ShieldQuestion className="h-3.5 w-3.5" aria-hidden="true" />
        Verificar telefone
      </span>
    )
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
      title="Não havia telefone cadastrado para comparar."
    >
      Sem comparação
    </span>
  )
}

function Item({
  icone,
  rotulo,
  valor,
}: {
  icone?: React.ReactNode
  rotulo: string
  valor: string | null
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icone}
        {rotulo}
      </dt>
      <dd
        className={`mt-1 text-sm ${valor ? "text-foreground" : "text-muted-foreground"}`}
        // `break-words` porque endereço é texto livre digitado no celular e vem
        // sem quebras próprias.
        style={{ overflowWrap: "anywhere" }}
      >
        {valor || "Não informado"}
      </dd>
    </div>
  )
}

function formatarData(iso: string): string {
  const data = new Date(iso)

  if (Number.isNaN(data.getTime())) return "—"

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatarDataHora(iso: string): string {
  const data = new Date(iso)

  if (Number.isNaN(data.getTime())) return "—"

  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * "há 3 meses", "hoje" — o que responde de fato se o dado ainda vale.
 *
 * Uma data absoluta obriga quem lê a fazer a conta de cabeça; a idade do
 * registro é a informação que decide se vale confiar no que está na tela.
 */
function tempoDecorrido(iso: string): string {
  const data = new Date(iso)

  if (Number.isNaN(data.getTime())) return "—"

  const dias = Math.floor((Date.now() - data.getTime()) / 86_400_000)

  if (dias < 0) return "data futura"
  if (dias === 0) return "hoje"
  if (dias === 1) return "ontem"
  if (dias < 30) return `há ${dias} dias`

  const meses = Math.floor(dias / 30)

  if (meses < 12) return meses === 1 ? "há 1 mês" : `há ${meses} meses`

  const anos = Math.floor(dias / 365)

  return anos === 1 ? "há 1 ano" : `há ${anos} anos`
}
