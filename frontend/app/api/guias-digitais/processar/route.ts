import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import type { NextRequest } from "next/server"
import { splitPdf } from "@/lib/guias-digitais/splitPdf"
import { extractGuiaNumberFromPage } from "@/lib/guias-digitais/extractGuiaNumber"
import { generateVerso } from "@/lib/guias-digitais/generateVerso"
import { mergePdf } from "@/lib/guias-digitais/mergePdf"
import { supabaseService } from "@/lib/supabase/service"

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado. Faça login para processar guias." },
        { status: 401 }
      )
    }

    const contentType = request.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Conteúdo inválido. Envie um PDF usando multipart/form-data." },
        { status: 400 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Arquivo PDF obrigatório." },
        { status: 400 }
      )
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Somente arquivos PDF são aceitos." },
        { status: 400 }
      )
    }

    const rawBytes = new Uint8Array(await file.arrayBuffer())
    const pages = await splitPdf(rawBytes)

    if (pages.length === 0) {
      return NextResponse.json(
        { error: "O arquivo PDF não contém páginas válidas." },
        { status: 400 }
      )
    }

    const results: any[] = []

    for (const page of pages) {
      const guiaNumero = extractGuiaNumberFromPage(page.bytes)

      const terapiasResult = guiaNumero
        ? await supabaseService
            .from("guia_terapias")
            .select("id,guia_numero,terapia_nome,terapeuta_id")
            .eq("guia_numero", guiaNumero)
        : { data: [], error: null }

      const terapias = terapiasResult.data ?? []
      const terapeutaIds = Array.from(
        new Set(terapias.map((item) => item.terapeuta_id).filter(Boolean))
      )

      const terapeutas =
        terapeutaIds.length > 0
          ? (await supabaseService
              .from("terapeutas")
              .select("id,nome,carimbo_digital")
              .in("id", terapeutaIds)).data ?? []
          : []

      const versoBytes = await generateVerso({
        guiaNumero,
        pageIndex: page.index + 1,
        terapias,
        terapeutas,
      })

      const finalBytes = await mergePdf([page.bytes, versoBytes])

      await supabaseService.from("guias_processadas").insert({
        guia_numero: guiaNumero,
        status: "processado",
        page_count: 2,
        metadata: {
          pageIndex: page.index + 1,
          terapias: terapias.length,
          terapeutas: terapeutas.length,
        },
        created_at: new Date().toISOString(),
      })

      results.push({
        pageIndex: page.index + 1,
        guiaNumero,
        status: "success",
        originalPdf: Buffer.from(page.bytes).toString("base64"),
        versoPdf: Buffer.from(versoBytes).toString("base64"),
        finalPdf: Buffer.from(finalBytes).toString("base64"),
        terapias,
        terapeutas,
      })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Erro ao processar guias digitais:", error)
    return NextResponse.json(
      { error: "Falha no processamento do arquivo. Verifique o PDF e tente novamente." },
      { status: 500 }
    )
  }
}
