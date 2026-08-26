"use client"

import { maskCpfCnpj } from "@/lib/remuneracao/formatacao"
import { formatarMatricula } from "@/types/paciente"
import type { CorRaca, EstadoCivil, Paciente, SexoPaciente } from "@/types/paciente"
import type { PacienteForm } from "@/hooks/usePacienteDetalhe"
import {
  Campo,
  CampoCheckbox,
  CampoSelect,
  CampoSomenteLeitura,
  CampoToggleSimNao,
  Secao,
} from "../ui/campos"

const SEXOS: { valor: SexoPaciente; rotulo: string }[] = [
  { valor: "F", rotulo: "Feminino" },
  { valor: "M", rotulo: "Masculino" },
  { valor: "outro", rotulo: "Outro" },
]

// Vocabulário IBGE (PNAD) — os valores gravados são snake_case sem acento; o
// rótulo bonito vive aqui, no frontend. Ver o CHECK em 20260826100000.
const CORES_RACA: { valor: CorRaca; rotulo: string }[] = [
  { valor: "branca", rotulo: "Branca" },
  { valor: "preta", rotulo: "Preta" },
  { valor: "parda", rotulo: "Parda" },
  { valor: "amarela", rotulo: "Amarela" },
  { valor: "indigena", rotulo: "Indígena" },
  { valor: "nao_declarada", rotulo: "Não declarada" },
]

const ESTADOS_CIVIS: { valor: EstadoCivil; rotulo: string }[] = [
  { valor: "solteiro", rotulo: "Solteiro(a)" },
  { valor: "casado", rotulo: "Casado(a)" },
  { valor: "divorciado", rotulo: "Divorciado(a)" },
  { valor: "viuvo", rotulo: "Viúvo(a)" },
  { valor: "separado", rotulo: "Separado(a)" },
  { valor: "uniao_estavel", rotulo: "União estável" },
]

export function DadosPessoais({
  paciente,
  form,
  set,
  disabled,
}: {
  paciente: Paciente
  form: PacienteForm
  set: (patch: Partial<PacienteForm>) => void
  disabled: boolean
}) {
  return (
    <Secao titulo="Dados pessoais" descricao="Informações básicas do paciente">
      <CampoCheckbox
        label="Possui diferença entre Nome Social e Nome Civil?"
        checked={form.tem_nome_civil ?? false}
        onChange={(v) => set({ tem_nome_civil: v, nome_civil: v ? form.nome_civil : null })}
        disabled={disabled}
        dica="O campo Nome continua sendo o nome de tratamento — o que aparece na agenda e nos relatórios."
      />

      <Campo
        label="Nome"
        value={form.nome}
        onChange={(v) => set({ nome: v })}
        disabled={disabled}
      />
      <CampoSomenteLeitura
        label="ID"
        value={formatarMatricula(paciente.matricula)}
        dica={
          paciente.matricula === null
            ? "Sem ID: paciente sincronizado do TiTa."
            : "Gerado pelo sistema."
        }
      />

      {form.tem_nome_civil && (
        <Campo
          label="Nome civil"
          value={form.nome_civil ?? ""}
          onChange={(v) => set({ nome_civil: v || null })}
          disabled={disabled}
          largo
        />
      )}

      <CampoSelect
        label="Sexo"
        value={form.sexo}
        onChange={(v) => set({ sexo: v })}
        disabled={disabled}
        opcoes={SEXOS}
      />
      <CampoSelect
        label="Cor ou raça"
        value={form.cor_raca}
        onChange={(v) => set({ cor_raca: v })}
        disabled={disabled}
        opcoes={CORES_RACA}
      />

      <CampoSelect
        label="Estado civil"
        value={form.estado_civil}
        onChange={(v) => set({ estado_civil: v })}
        disabled={disabled}
        opcoes={ESTADOS_CIVIS}
      />
      <Campo
        label="Data de nascimento"
        type="date"
        value={form.data_nascimento ?? ""}
        onChange={(v) => set({ data_nascimento: v || null })}
        disabled={disabled}
      />

      <Campo
        label="CPF"
        value={form.cpf ? maskCpfCnpj(form.cpf) : ""}
        // Grava só dígitos: a string mascarada no banco quebraria qualquer
        // cruzamento por documento.
        onChange={(v) => set({ cpf: v.replace(/\D/g, "") || null })}
        disabled={disabled}
        inputMode="numeric"
        placeholder="000.000.000-00"
      />
      <Campo
        label="RG"
        value={form.rg ?? ""}
        onChange={(v) => set({ rg: v || null })}
        disabled={disabled}
      />

      <Campo
        label="Órgão emissor"
        value={form.rg_orgao_emissor ?? ""}
        onChange={(v) => set({ rg_orgao_emissor: v || null })}
        disabled={disabled}
        placeholder="SSP"
      />
      <Campo
        label="UF do órgão emissor"
        value={form.rg_uf ?? ""}
        // Maiúsculas e no máximo 2 letras: o CHECK do banco é ^[A-Z]{2}$, e
        // deixar minúscula chegar lá só produz erro no fim do preenchimento.
        onChange={(v) =>
          set({ rg_uf: v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || null })
        }
        disabled={disabled}
        maxLength={2}
        placeholder="RJ"
      />

      <Campo
        label="Data de emissão"
        type="date"
        value={form.rg_data_emissao ?? ""}
        onChange={(v) => set({ rg_data_emissao: v || null })}
        disabled={disabled}
      />
      <Campo
        label="Celular"
        value={form.telefone ?? ""}
        onChange={(v) => set({ telefone: v || null })}
        disabled={disabled}
        inputMode="tel"
        placeholder="(21) 99999-9999"
      />

      <Campo
        label="E-mail"
        type="email"
        value={form.email ?? ""}
        onChange={(v) => set({ email: v || null })}
        disabled={disabled}
        inputMode="email"
        largo
      />

      <CampoCheckbox
        label="Paciente falecido"
        checked={form.falecido}
        onChange={(v) => set({ falecido: v })}
        disabled={disabled}
        dica="Independente da situação do cadastro — um paciente pode estar inativo por alta e continuar vivo."
      />

      <CampoToggleSimNao
        label="Paciente fictício"
        value={form.ficticio}
        onChange={(v) => set({ ficticio: v })}
        disabled={disabled}
        dica="Ex.: Horário Administrativo, Notificação Prévia, pacientes de teste — não é uma pessoa real. Fica fora das listas por padrão."
      />
    </Secao>
  )
}
