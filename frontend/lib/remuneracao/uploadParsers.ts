// Parsers de arquivos de upload da remuneração, compartilhados entre
// RemuneracaoUploadBadges (aba rp) e TratativasUploadBadge (Análise de
// Tratativas) — evita cópias divergentes da leitura/validação da grade.

import Papa from "papaparse"
import { validarModeloRelatorio, getCol, type CsvGradeRow } from "./relatorio"
import { rotulosDeExecucaoDesconhecidos } from "./rotulosExecucao"

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
        // Duas formas de o arquivo "mudar", e as duas recusam a carga: mudou o
        // MODELO (coluna que sumiu, acima) ou mudou o VOCABULÁRIO (rótulo de
        // execução que este código não sabe ler, aqui). A segunda é a mais
        // perigosa das duas justamente porque o arquivo continua bem formado:
        // em 24/08/2026 a TiTa renomeou 'Cancelado' para 'Não realizado — …', e
        // um rótulo ilegível faz sessão não realizada passar por realizada — e
        // gerar diária, ETA e PA. Ver rotulosExecucao.ts.
        //
        // O caminho do banco tem a mesma guarda em avaliarCoberturaGrade(); o
        // CSV é a saída de emergência das telas, e uma saída sem a guarda seria
        // um jeito de contornar a proteção sem perceber.
        const desconhecidos = rotulosDeExecucaoDesconhecidos(
          data.map(r => getCol(r, ["Status"])),
        ).slice(0, 5)
        if (desconhecidos.length) {
          reject(new Error(
            "Vocabulário do arquivo mudou. A coluna \"Status\" traz "
            + `${desconhecidos.length === 1 ? "um rótulo" : "rótulos"} que o sistema não sabe ler: `
            + `${desconhecidos.map(r => `"${r}"`).join(", ")}. Sem entender o rótulo não se sabe se a `
            + "sessão aconteceu. Avise o time técnico — o rótulo novo precisa ser ensinado ao sistema.",
          ))
          return
        }
        resolve(data)
      },
      error: (err: Error) => reject(err),
    })
  })
}
