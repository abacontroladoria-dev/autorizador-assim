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
        // MODELO (coluna que sumiu, acima) ou mudou o VOCABULÁRIO de `Status`
        // (rótulo de execução que este código não sabe ler, aqui). Reforço para
        // um vocabulário confirmado fechado (ver rotulosExecucao.ts) — sem caso
        // conhecido até hoje, mas mantido porque, se `Status` algum dia trouxer
        // algo ilegível, a sessão passaria por realizada e geraria diária, ETA e
        // PA indevidos.
        //
        // A mudança real de vocabulário de 24/08/2026 foi em `Justificativa`, não
        // em `Status` — e não decide pagamento, só a exibição de "Presença
        // TiTa" (ver justificativaDesconhecida em rotulosExecucao.ts). Por isso
        // NÃO tem guarda equivalente aqui: recusar o upload inteiro por uma
        // coluna que não move dinheiro seria desproporcional, e o caminho do
        // banco já avisa (sem bloquear) via avaliarCoberturaGrade().
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
