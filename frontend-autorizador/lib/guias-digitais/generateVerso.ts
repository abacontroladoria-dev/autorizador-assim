import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import type { GuiaTerapia, TerapeutaCarimbo } from "./types"

export async function generateVerso(params: {
  guiaNumero: string | null
  pageIndex: number
  terapias: GuiaTerapia[]
  terapeutas: TerapeutaCarimbo[]
}) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const margin = 48
  const lineHeight = 18
  let top = 780

  page.drawText("VERSO DA GUIA", {
    x: margin,
    y: top,
    size: 18,
    font: fontBold,
    color: rgb(0.12, 0.33, 0.44),
  })

  top -= 32

  page.drawText(`Página original: ${params.pageIndex}`, {
    x: margin,
    y: top,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  })

  top -= 20
  page.drawText(`Guia identificada: ${params.guiaNumero ?? "Não encontrada"}`, {
    x: margin,
    y: top,
    size: 12,
    font,
    color: rgb(0.2, 0.2, 0.2),
  })

  top -= 32
  page.drawText("Terapias vinculadas", {
    x: margin,
    y: top,
    size: 13,
    font: fontBold,
    color: rgb(0.14, 0.35, 0.55),
  })

  top -= 24

  if (params.terapias.length === 0) {
    page.drawText("Nenhuma terapia encontrada para esta guia.", {
      x: margin,
      y: top,
      size: 12,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
    top -= 22
  } else {
    params.terapias.slice(0, 6).forEach((terapia, index) => {
      page.drawText(`- ${terapia.terapia_nome}`, {
        x: margin,
        y: top - index * lineHeight,
        size: 11,
        font,
        color: rgb(0.25, 0.25, 0.25),
      })
    })
    top -= params.terapias.slice(0, 6).length * lineHeight
  }

  top -= 18
  page.drawText("Carimbos digitais dos terapeutas", {
    x: margin,
    y: top,
    size: 13,
    font: fontBold,
    color: rgb(0.14, 0.35, 0.55),
  })

  top -= 24

  if (params.terapeutas.length === 0) {
    page.drawText("Nenhum carimbo disponível.", {
      x: margin,
      y: top,
      size: 12,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })
  } else {
    params.terapeutas.forEach((terapeuta, index) => {
      const stampText = terapeuta.carimbo_digital || "[carimbo digital não cadastrado]"
      page.drawText(`${terapeuta.nome}: ${stampText}`, {
        x: margin,
        y: top - index * lineHeight,
        size: 10,
        font,
        color: rgb(0.25, 0.25, 0.25),
      })
    })
  }

  return pdf.save()
}
