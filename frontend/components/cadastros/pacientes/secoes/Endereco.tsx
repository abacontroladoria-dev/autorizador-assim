"use client"

import type { PacienteForm } from "@/hooks/usePacienteDetalhe"
import { UFS } from "@/lib/cadastros/ufs"
import { Campo, Secao, CampoSelect } from "../ui/campos"

export function Endereco({
  form,
  set,
  disabled,
}: {
  form: PacienteForm
  set: (patch: Partial<PacienteForm>) => void
  disabled: boolean
}) {
  return (
    <Secao titulo="Endereço" descricao="Informações de domicílio habitual">
      <Campo
        label="CEP"
        value={form.cep ?? ""}
        onChange={(v) => set({ cep: v || null })}
        disabled={disabled}
        inputMode="numeric"
        placeholder="00000-000"
      />
      <Campo
        label="Cidade"
        value={form.cidade ?? ""}
        onChange={(v) => set({ cidade: v || null })}
        disabled={disabled}
      />

      <Campo
        label="Logradouro"
        value={form.logradouro ?? ""}
        onChange={(v) => set({ logradouro: v || null })}
        disabled={disabled}
      />
      <Campo
        label="Bairro"
        value={form.bairro ?? ""}
        onChange={(v) => set({ bairro: v || null })}
        disabled={disabled}
      />

      <Campo
        label="Número"
        value={form.numero ?? ""}
        onChange={(v) => set({ numero: v || null })}
        disabled={disabled}
      />
      <CampoSelect
        label="UF"
        value={form.uf ?? null}
        onChange={(v) => set({ uf: v })}
        disabled={disabled}
        vazio="Não informada"
        opcoes={UFS.map(uf => ({ valor: uf, rotulo: uf }))}
      />

      <Campo
        label="Telefone residencial"
        value={form.telefone_residencial ?? ""}
        onChange={(v) => set({ telefone_residencial: v || null })}
        disabled={disabled}
        inputMode="tel"
        placeholder="(21) 3333-3333"
      />
      <Campo
        label="Complemento"
        value={form.complemento ?? ""}
        onChange={(v) => set({ complemento: v || null })}
        disabled={disabled}
      />
    </Secao>
  )
}
