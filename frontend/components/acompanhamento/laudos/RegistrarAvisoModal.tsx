"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  History,
  Loader2,
  Save,
} from "lucide-react"
import toast from "react-hot-toast"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { HistoricoCadastrosModal } from "@/components/cadastros/historico/HistoricoCadastrosModal"
import { FotoPacienteUpload } from "@/components/cadastros/pacientes/FotoPacienteUpload"
import { DatePicker } from "@/components/ui/date-picker"
import { campo, foco, rotulo } from "@/components/cadastros/pacientes/ui/campos"
import { isoParaBr } from "@/lib/laudos/acompanhamento"
import { SITUACAO_LAUDO_LABEL, avisoEhPrematuro, diasAteValidade } from "@/lib/laudos/filtros"
import { salvarAcompanhamento } from "@/services/laudosAcompanhamento.service"
import type { ItemAcompanhamentoLaudo } from "@/types/laudosAcompanhamento"

// O registro do contato: "Mensagem enviada em" + observação.
//
// UM CAMPO DE DATA, sobrescrevível — não uma lista de tentativas (decisão do
// usuário em 28/08/2026). A sequência de cobranças não se perde por isso: cada
// alteração entra em `cadastros_auditoria` com usuário, data/hora de Brasília e
// `antes → depois`, e o botão Histórico abre exatamente essa trilha. O card
// mostra o estado atual; a trilha conta a história.
//
// A FOTO é a mesma linha de `public.pacientes` que /cadastros/pacientes edita —
// o componente é literalmente o mesmo, com o mesmo bucket e o mesmo path. Trocar
// aqui aparece lá e vice-versa; não há cópia nem sincronização a manter.

export function RegistrarAvisoModal({
  item,
  hoje,
  onFechar,
  onSalvo,
}: {
  item: ItemAcompanhamentoLaudo
  /** `meta.hoje` do servidor — a mesma base usada em toda a tela para "quantos dias faltam". */
  hoje: string
  onFechar: () => void
  /** Devolve o item atualizado para a lista não precisar recarregar tudo. */
  onSalvo: (atualizado: ItemAcompanhamentoLaudo) => void
}) {
  const [dataAviso, setDataAviso] = useState(item.mensagemEnviadaEm ?? "")
  const [observacao, setObservacao] = useState(item.observacao ?? "")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [verHistorico, setVerHistorico] = useState(false)
  const [fotoPath, setFotoPath] = useState(item.fotoPath)
  // Abre a confirmação vermelha em vez de salvar direto — ver `confirmarSalvar`.
  const [confirmarPrematuro, setConfirmarPrematuro] = useState(false)

  const dataMudou = (item.mensagemEnviadaEm ?? "") !== dataAviso
  const sujo = dataMudou || (item.observacao ?? "") !== observacao

  /**
   * Cedo demais para marcar "avisado"? Só é avaliado quando a MENSAGEM em si
   * mudou para uma data preenchida — regra do usuário (28/08/2026): editar só
   * a observação, ou apagar a data, não é "declarar que avisou cedo demais".
   */
  const prematuro = dataMudou && dataAviso !== "" && avisoEhPrematuro(item.validade, hoje)
  const diasParaVencer = diasAteValidade(item.validade, hoje)

  /** O botão Salvar chama isto: intercepta para confirmar quando prematuro. */
  function confirmarSalvar() {
    if (prematuro) {
      setConfirmarPrematuro(true)
      return
    }
    void salvar()
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)

    const { data, error } = await salvarAcompanhamento(item, {
      mensagemEnviadaEm: dataAviso || null,
      observacao,
    })

    setSalvando(false)

    if (error || !data) {
      // Mostrado NO MODAL, não só em toast: um toast que passa deixaria o
      // usuário achando que salvou. Ver o aviso sobre RLS silenciosa no service.
      setErro(error ?? "Não foi possível salvar.")
      return
    }

    onSalvo({
      ...item,
      fotoPath,
      mensagemEnviadaEm: data.mensagem_enviada_em,
      observacao: data.observacao,
      registradoPorNome: data.atualizado_por_nome,
      registradoEm: data.atualizado_em_brasilia,
    })
    toast.success("Registro salvo.")
    onFechar()
  }

  return (
    <>
      <ScheduleModal
        title={item.nome}
        subtitle={
          <>
            {/* Mesma ordem e mesmas palavras do cartão ("PAC 17795, LAUDO 464"),
                para quem clicou reconhecer que abriu o que mirou. */}
            PAC {item.idFavorecido ?? "—"}, LAUDO {item.idLaudo} ·{" "}
            <span
              className={
                item.situacao === "vencido"
                  ? "font-bold text-rose-600 dark:text-rose-400"
                  : "font-bold text-emerald-600 dark:text-emerald-400"
              }
            >
              {SITUACAO_LAUDO_LABEL[item.situacao]}
            </span>
          </>
        }
        warning={
          item.situacaoDivergente
            ? `O Órbita marca este laudo como ${item.situacaoOrbita || "—"}, mas a validade (${isoParaBr(item.validade)}) diz o contrário.`
            : undefined
        }
        maxWidth={640}
        onClose={onFechar}
        footer={
          <>
            <button
              type="button"
              onClick={() => setVerHistorico(true)}
              className={`mr-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted ${foco}`}
            >
              <History className="h-4 w-4" aria-hidden="true" />
              Histórico
            </button>
            <button
              type="button"
              onClick={onFechar}
              className={`rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted ${foco}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarSalvar}
              disabled={salvando || !sujo}
              className={`inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ${foco}`}
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {erro && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{erro}</span>
            </div>
          )}

          {/* ── Identificação ── */}
          <div className="flex items-start gap-4">
            {item.pacienteId !== null ? (
              <FotoPacienteUpload
                idPaciente={item.pacienteId}
                fotoPath={fotoPath}
                nome={item.nome}
                podeEditar
                onFotoAlterada={setFotoPath}
              />
            ) : (
              // Sem cadastro não há linha em `pacientes` para receber o
              // `foto_path` — o upload não tem onde gravar. Dizer isso é melhor
              // que exibir um botão de câmera que falha ao clicar.
              <div className="shrink-0 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Sem foto: este
                <br />
                paciente não tem
                <br />
                cadastro no Pulsar.
              </div>
            )}

            <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
              <Par rotuloTexto="Data laudo" valor={isoParaBr(item.dataLaudo)} />
              <Par rotuloTexto="Validade" valor={isoParaBr(item.validade)} />
              <Par rotuloTexto="Autorizado em" valor={isoParaBr(item.autorizadoEm)} />
              <Par
                rotuloTexto="Especialidades"
                valor={item.especialidades.join(", ") || "—"}
              />
            </dl>
          </div>

          {item.pacienteId !== null && (
            <Link
              href={`/cadastros/pacientes/${item.pacienteId}`}
              className={`inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary hover:underline ${foco}`}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Abrir cadastro do paciente
            </Link>
          )}

          <hr className="border-border" />

          {/* ── O registro ── */}
          <div>
            <label className={rotulo}>Mensagem enviada em</label>
            {/* O MESMO calendário do "Autorizado em" do laudo, em
                /cadastros/pacientes/[id] — não o `<input type="date">` nativo,
                que muda de desenho a cada navegador e obriga a digitar a data no
                formato que ele quer. Aqui vem com "Hoje" e "Limpar", que são os
                dois cliques que esta tela mais faz. */}
            <DatePicker value={dataAviso} onChange={setDataAviso} />
            <p className="mt-1 text-xs text-muted-foreground">
              O dia em que a recepção avisou o responsável sobre a renovação. Apagar a data
              devolve o laudo à fila de pendências — e a mudança fica no histórico.
            </p>
          </div>

          <div>
            <label className={rotulo} htmlFor="observacao-aviso">
              Observação
            </label>
            <textarea
              id="observacao-aviso"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Por qual canal, com quem falou, o que o responsável respondeu…"
              className={`mt-1 ${campo} resize-y`}
            />
          </div>

          {item.registradoPorNome && (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Último registro por <span className="font-semibold">{item.registradoPorNome}</span>
              {item.registradoEm ? ` em ${item.registradoEm}` : ""}.
            </p>
          )}
        </div>
      </ScheduleModal>

      {verHistorico && (
        <HistoricoCadastrosModal
          titulo="Histórico do acompanhamento"
          subtitulo={`Todas as alterações no acompanhamento do laudo ${item.idLaudo} — mais recentes primeiro.`}
          entidades={["laudo_acompanhamento"]}
          // `registroId` e não `pacienteId`: a trilha é DESTE laudo. O
          // `pacienteId` traria também paciente, responsável e ficha — o que a
          // tela de cadastro já faz, e aqui só afogaria o que se quer ver.
          registroId={item.idLaudo}
          onClose={() => setVerHistorico(false)}
        />
      )}

      {/* Confirmação de aviso PREMATURO — regra do usuário (28/08/2026).
          NÃO bloqueia: a recepção pode ter um motivo que a tela não vê (o
          responsável ligou por conta própria, por exemplo). Só confirma,
          porque o erro mais comum aqui é clicar Salvar sem reparar que a
          validade ainda está longe. "Confirmar mesmo assim" chama o MESMO
          `salvar()` do botão principal — a confirmação intercepta o clique,
          não substitui a gravação. */}
      {confirmarPrematuro && (
        <ScheduleModal
          title="Ainda faltam muitos dias para o laudo vencer"
          maxWidth={460}
          onClose={() => setConfirmarPrematuro(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmarPrematuro(false)}
                className={`rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted ${foco}`}
              >
                Voltar e revisar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmarPrematuro(false)
                  void salvar()
                }}
                disabled={salvando}
                className={`inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 ${foco}`}
              >
                Confirmar mesmo assim
              </button>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              Tem certeza? Ainda faltam <span className="font-bold">{diasParaVencer}</span> dias
              para o laudo vencer. Espere até que faltem 15 dias.
            </p>
          </div>
        </ScheduleModal>
      )}
    </>
  )
}

function Par({ rotuloTexto, valor }: { rotuloTexto: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-muted-foreground">{rotuloTexto}</dt>
      <dd className="min-w-0 font-semibold text-foreground">{valor}</dd>
    </div>
  )
}
