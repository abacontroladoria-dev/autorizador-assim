// Parsers de arquivos de upload da remuneração, compartilhados entre
// RemuneracaoUploadBadges (aba rp) e TratativasUploadBadge (Análise de
// Tratativas) — evita cópias divergentes da leitura/validação da grade.

import Papa from "papaparse"
import { validarModeloRelatorio, type CsvGradeRow } from "./relatorio"

/** Lê e valida o CSV da grade (csv_grade_profissionais). */
export function parseGradeCsv(file: File): Promise<CsvGradeRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvGradeRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const validacao = validarModeloRelatorio("grade", meta?.fields?.length ? meta.fields : data)
        if (!validacao.ok && validacao.faltantes.length) {
          reject(new Error(`Modelo do arquivo mudou. Colunas esperadas não encontradas: ${validacao.faltantes.join(", ")}.`))
          return
        }
        resolve(data)
      },
      error: (err: Error) => reject(err),
    })
  })
}
