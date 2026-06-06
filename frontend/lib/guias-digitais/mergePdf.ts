import { PDFDocument } from "pdf-lib"

export async function mergePdf(items: Uint8Array[]) {
  const merged = await PDFDocument.create()

  for (const item of items) {
    const document = await PDFDocument.load(item)
    const pages = await merged.copyPages(
      document,
      document.getPageIndices()
    )
    pages.forEach(page => merged.addPage(page))
  }

  return merged.save()
}
