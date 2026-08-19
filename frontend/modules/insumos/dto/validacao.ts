// Validação de entrada do módulo de insumos.
//
// O AXIUM usava class-validator com decorators (@IsString, @IsPositive, …), que
// depende de `reflect-metadata` e de um pipe do Nest — nada disso existe em route
// handler do Next. Aqui é validação explícita, no mesmo formato de retorno que os
// DTOs da Central usam (`{ ok, data } | { ok: false, errors }`), para os handlers
// ficarem iguais aos de lá.

export type Validado<T> = { ok: true; data: T } | { ok: false; errors: string[] }

export class Coletor {
  readonly erros: string[] = []

  private bruto: Record<string, unknown>

  constructor(corpo: unknown) {
    this.bruto = typeof corpo === "object" && corpo !== null ? (corpo as Record<string, unknown>) : {}
  }

  texto(campo: string, { obrigatorio = false, min = 1 } = {}): string | undefined {
    const valor = this.bruto[campo]
    if (valor === undefined || valor === null || valor === "") {
      if (obrigatorio) this.erros.push(`${campo} é obrigatório`)
      return undefined
    }
    if (typeof valor !== "string") {
      this.erros.push(`${campo} deve ser texto`)
      return undefined
    }
    const limpo = valor.trim()
    if (limpo.length < min) {
      this.erros.push(`${campo} deve ter ao menos ${min} caractere(s)`)
      return undefined
    }
    return limpo
  }

  numero(
    campo: string,
    { obrigatorio = false, positivo = false, minimo }: { obrigatorio?: boolean; positivo?: boolean; minimo?: number } = {}
  ): number | undefined {
    const valor = this.bruto[campo]
    if (valor === undefined || valor === null || valor === "") {
      if (obrigatorio) this.erros.push(`${campo} é obrigatório`)
      return undefined
    }
    const n = typeof valor === "number" ? valor : Number(valor)
    if (!Number.isFinite(n)) {
      this.erros.push(`${campo} deve ser um número`)
      return undefined
    }
    if (positivo && n <= 0) {
      this.erros.push(`${campo} deve ser maior que zero`)
      return undefined
    }
    if (minimo !== undefined && n < minimo) {
      this.erros.push(`${campo} deve ser no mínimo ${minimo}`)
      return undefined
    }
    return n
  }

  inteiro(campo: string, opcoes: { obrigatorio?: boolean; positivo?: boolean; minimo?: number } = {}): number | undefined {
    const n = this.numero(campo, opcoes)
    if (n === undefined) return undefined
    if (!Number.isInteger(n)) {
      this.erros.push(`${campo} deve ser inteiro`)
      return undefined
    }
    return n
  }

  booleano(campo: string, padrao?: boolean): boolean | undefined {
    const valor = this.bruto[campo]
    if (valor === undefined || valor === null) return padrao
    if (typeof valor !== "boolean") {
      this.erros.push(`${campo} deve ser booleano`)
      return padrao
    }
    return valor
  }

  opcao<T extends string>(campo: string, permitidos: readonly T[], { obrigatorio = false } = {}): T | undefined {
    const valor = this.bruto[campo]
    if (valor === undefined || valor === null || valor === "") {
      if (obrigatorio) this.erros.push(`${campo} é obrigatório`)
      return undefined
    }
    if (typeof valor !== "string" || !permitidos.includes(valor as T)) {
      this.erros.push(`${campo} deve ser um de: ${permitidos.join(", ")}`)
      return undefined
    }
    return valor as T
  }

  uuid(campo: string, { obrigatorio = false } = {}): string | undefined {
    const valor = this.texto(campo, { obrigatorio })
    if (valor === undefined) return undefined
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) {
      this.erros.push(`${campo} deve ser um UUID`)
      return undefined
    }
    return valor
  }

  /** String vazia vira `undefined` antes de validar — o AXIUM fazia o mesmo com @Transform. */
  url(campo: string, { obrigatorio = false } = {}): string | undefined {
    const valor = this.texto(campo, { obrigatorio })
    if (valor === undefined) return undefined
    try {
      const u = new URL(valor)
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocolo")
      return valor
    } catch {
      this.erros.push(`${campo} deve ser uma URL válida`)
      return undefined
    }
  }

  /** Data ISO (YYYY-MM-DD ou timestamp completo). */
  data(campo: string, { obrigatorio = false } = {}): string | undefined {
    const valor = this.texto(campo, { obrigatorio })
    if (valor === undefined) return undefined
    if (Number.isNaN(Date.parse(valor))) {
      this.erros.push(`${campo} deve ser uma data válida`)
      return undefined
    }
    return valor
  }

  finalizar<T>(dados: T): Validado<T> {
    return this.erros.length > 0 ? { ok: false, errors: this.erros } : { ok: true, data: dados }
  }
}
