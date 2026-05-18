import { PDFDocument } from "pdf-lib"

export type PdfPageSegment = {
  index: number
  bytes: Uint8Array
}

export async function splitPdf(pdfData: Uint8Array) {
  const document = await PDFDocument.load(pdfData)
  const pageCount = document.getPageCount()
  const pages: PdfPageSegment[] = []

  for (let index = 0; index < pageCount; index += 1) {
    const pageDocument = await PDFDocument.create()
    const [page] = await pageDocument.copyPages(document, [index])
    pageDocument.addPage(page)
    const bytes = await pageDocument.save()

    pages.push({
      index,
      bytes: new Uint8Array(bytes),
    })
  }

  return pages
}
