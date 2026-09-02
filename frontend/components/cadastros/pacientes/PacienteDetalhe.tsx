"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import toast from "react-hot-toast"
import { AlertCircle, User, MapPin, Users, HeartPulse, Stethoscope, ShieldPlus, FileText, Trophy } from "lucide-react"
import { SegmentedTabs } from "@/components/cronograma/ui/SegmentedTabs"
import { useUnsavedChangesGuard } from "@/contexts/UnsavedChangesContext"
import { usePacienteDetalhe } from "@/hooks/usePacienteDetalhe"
import { HistoricoCadastrosModal } from "@/components/cadastros/historico/HistoricoCadastrosModal"
import { PacienteHeaderCard } from "./PacienteHeaderCard"
import { InativarPacienteModal } from "./InativarPacienteModal"
import { SubNavVertical } from "./ui/SubNavVertical"
import { DadosPessoais } from "./secoes/DadosPessoais"
import { Endereco } from "./secoes/Endereco"
import { FiliacaoResponsaveis } from "./secoes/FiliacaoResponsaveis"
import { FichaBasica } from "./secoes/FichaBasica"
import { Doencas } from "./secoes/Doencas"
import { PlanoSaude } from "./secoes/PlanoSaude"
import { AbaLaudo } from "./secoes/AbaLaudo"
import { AbaAltasIndividualidades } from "./secoes/AbaAltasIndividualidades"
import { foco } from "./ui/campos"

type Aba = "cadastro" | "ficha" | "laudo" | "altas"
type SecaoCadastro = "dados" | "endereco" | "filiacao" | "plano"
type SecaoFicha = "basica" | "doencas"

const ICONE = "h-4 w-4"

export function PacienteDetalhe({ idPaciente }: { idPaciente: number }) {
  const {
    paciente,
    form,
    set,
    setFicha,
    setIndividualidade,
    camposSujos,
    dirtyCount,
    carregando,
    erro,
    salvando,
    erroSalvar,
    limparErroSalvar,
    salvar,
    descartar,
    recarregar,
  } = usePacienteDetalhe(idPaciente)

  const [aba, setAba] = useState<Aba>("cadastro")
  const [secaoCadastro, setSecaoCadastro] = useState<SecaoCadastro>("dados")
  const [secaoFicha, setSecaoFicha] = useState<SecaoFicha>("basica")
  const [editando, setEditando] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)
  const [verInativar, setVerInativar] = useState(false)

  const { registerGuard } = useUnsavedChangesGuard()
  useEffect(() => {
    registerGuard({ isDirty: dirtyCount > 0, save: salvar })
    return () => registerGuard(null)
  }, [dirtyCount, salvar, registerGuard])

  function cancelar() {
    if (dirtyCount > 0 && !window.confirm("Descartar as alterações não salvas?")) return
    descartar()
    setEditando(false)
  }

  async function salvarTudo() {
    if (await salvar()) {
      toast.success("Cadastro salvo.")
      setEditando(false)
    } else {
      toast.error("Não foi possível salvar o cadastro.")
    }
  }

  if (carregando) return <Esqueleto />

  if (erro || !paciente || !form) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{erro ?? "Paciente não encontrado."}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void recarregar()}
              className={`rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted ${foco}`}
            >
              Tentar novamente
            </button>
            <Link
              href="/cadastros/pacientes"
              className={`rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted ${foco}`}
            >
              Voltar para a lista
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Marca a bolinha de "alterado" na sub-nav. `ficha` e `vinculos` contam como
  // um campo cada no hook, então basta perguntar pela chave.
  const cadastroSujo = {
    dados: [...camposSujos].some((c) => !CAMPOS_ENDERECO.has(c) && c !== "vinculos"),
    endereco: [...camposSujos].some((c) => CAMPOS_ENDERECO.has(c)),
    filiacao: camposSujos.has("vinculos"),
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PacienteHeaderCard
        paciente={paciente}
        editando={editando}
        salvando={salvando}
        dirtyCount={dirtyCount}
        onEditar={() => setEditando(true)}
        onCancelar={cancelar}
        onSalvar={() => void salvarTudo()}
        onFotoAlterada={() => void recarregar()}
        onVerHistorico={() => setVerHistorico(true)}
        onAlterarSituacao={() => setVerInativar(true)}
      />

      {/* O motivo da falha de gravação aparece na TELA, não só no console — sem
          isto, uma recusa de RLS chega ao usuário como "não foi possível salvar". */}
      {erroSalvar && (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{erroSalvar}</span>
          </div>
          <button
            type="button"
            onClick={limparErroSalvar}
            className={`shrink-0 text-xs underline ${foco}`}
          >
            Dispensar
          </button>
        </div>
      )}

      <div className="mt-4">
        <SegmentedTabs<Aba>
          value={aba}
          onChange={setAba}
          size="lg"
          ariaLabel="Seções do paciente"
          tabs={[
            { value: "cadastro", label: "Cadastro" },
            { value: "ficha", label: "Ficha médica" },
            { value: "laudo", label: "Laudo" },
            { value: "altas", label: "Altas e Individualidades" },
          ]}
        />
      </div>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        {aba === "cadastro" ? (
          <>
            <SubNavVertical<SecaoCadastro>
              value={secaoCadastro}
              onChange={setSecaoCadastro}
              ariaLabel="Seções do cadastro"
              items={[
                { value: "dados", label: "Dados pessoais", icon: <User className={ICONE} />, alterado: cadastroSujo.dados },
                { value: "endereco", label: "Endereço", icon: <MapPin className={ICONE} />, alterado: cadastroSujo.endereco },
                { value: "filiacao", label: "Filiação e responsáveis", icon: <Users className={ICONE} />, alterado: cadastroSujo.filiacao },
                { value: "plano", label: "Plano de saúde", icon: <ShieldPlus className={ICONE} /> },
              ]}
            />
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-4">
              {secaoCadastro === "dados" && (
                <DadosPessoais paciente={paciente} form={form} set={set} disabled={!editando} />
              )}
              {secaoCadastro === "endereco" && (
                <Endereco form={form} set={set} disabled={!editando} />
              )}
              {secaoCadastro === "filiacao" && (
                <FiliacaoResponsaveis form={form} set={set} disabled={!editando} />
              )}
              {secaoCadastro === "plano" && (
                <PlanoSaude ficha={form.ficha} setFicha={setFicha} disabled={!editando} />
              )}
            </div>
          </>
        ) : aba === "ficha" ? (
          <>
            <SubNavVertical<SecaoFicha>
              value={secaoFicha}
              onChange={setSecaoFicha}
              ariaLabel="Seções da ficha médica"
              items={[
                { value: "basica", label: "Dados básicos", icon: <HeartPulse className={ICONE} />, alterado: camposSujos.has("ficha") },
                { value: "doencas", label: "Doenças", icon: <Stethoscope className={ICONE} /> },
              ]}
            />
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-4">
              {secaoFicha === "basica" && (
                <FichaBasica ficha={form.ficha} setFicha={setFicha} disabled={!editando} />
              )}
              {secaoFicha === "doencas" && (
                <Doencas ficha={form.ficha} setFicha={setFicha} disabled={!editando} />
              )}
            </div>
          </>
        ) : aba === "laudo" ? (
          <AbaLaudo pacienteId={idPaciente} pacienteNome={paciente.nome} />
        ) : (
          <AbaAltasIndividualidades
            pacienteId={idPaciente}
            pacienteNome={paciente.nome}
            individualidade={form.individualidade}
            setIndividualidade={setIndividualidade}
            disabled={!editando}
          />
        )}
      </div>

      {/* Montados condicionalmente para nascerem limpos. */}
      {verHistorico && (
        <HistoricoCadastrosModal
          titulo={`Histórico — ${paciente.nome}`}
          subtitulo="Alterações no cadastro, responsáveis, ficha médica, laudos, altas/individualidades e suspensões temporárias deste paciente."
          entidades={["paciente", "responsavel", "ficha_medica", "laudo", "alta", "alta_individualidade", "suspensao_temporaria"]}
          pacienteId={idPaciente}
          onClose={() => setVerHistorico(false)}
        />
      )}
      {verInativar && (
        <InativarPacienteModal
          paciente={paciente}
          onFechar={() => setVerInativar(false)}
          onConcluido={() => {
            setVerInativar(false)
            void recarregar()
          }}
        />
      )}
    </div>
  )
}

const CAMPOS_ENDERECO = new Set([
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
])

function Esqueleto() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4">
        <div className="h-20 w-20 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="mt-4 h-9 w-56 animate-pulse rounded-full bg-muted" />
      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        <div className="h-32 w-full animate-pulse rounded bg-muted sm:w-56" />
        <div className="h-72 flex-1 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}
