import { serve } from "https://deno.land/std@0.203.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4"
import { PDFDocument } from "npm:pdf-lib"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment")
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function toBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

  return btoa(binary)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  })
}

function parseBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || ""
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

async function verifyAuthenticatedUser(token: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: "not_authenticated", status: 401 }
  }

  const { data: perfil, error: perfilError } = await supabase
    .from("usuarios")
    .select("role, ativo")
    .eq("id", user.id)
    .single()

  if (perfilError) {
    const fallback = await supabase
      .from("usuarios")
      .select("role, ativo")
      .eq("email", user.email)
      .single()

    if (fallback.error) {
      return { error: "profile_error", status: 500, message: fallback.error.message }
    }

    return { supabase, perfil: fallback.data }
  }

  if (!perfil) {
    return { error: "profile_not_found", status: 404 }
  }

  if (!perfil.ativo) {
    return { error: "user_inactive", status: 403, message: "Usuário desativado" }
  }

  return { supabase, perfil }
}

export async function splitPdf(pdfData: Uint8Array) {
  const document = await PDFDocument.load(pdfData)
  const pageCount = document.getPageCount()
  const pages = [] as Array<{ index: number; bytes: Uint8Array }>

  for (let index = 0; index < pageCount; index += 1) {
    const pageDocument = await PDFDocument.create()
    const [page] = await pageDocument.copyPages(document, [index])
    pageDocument.addPage(page)
    const bytes = await pageDocument.save()
    pages.push({ index, bytes: new Uint8Array(bytes) })
  }

  return pages
}

export function extractGuiaNumber(text: string): string | null {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/\r|\n/g, " ")
    .toLowerCase()

  const patterns = [
    /guia\s*[:\-]?\s*(\d{5,})/i,
    /n\.?\s*guia\s*[:\-]?\s*(\d{5,})/i,
    /protocolo\s*[:\-]?\s*(\d{5,})/i,
    /cobertura\s*[:\-]?\s*(\d{5,})/i,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(normalized)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  const fallback = normalized.match(/(\d{6,12})/)
  return fallback ? fallback[1] : null
}

export function extractGuiaNumberFromPage(pageBytes: Uint8Array): string | null {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(pageBytes)
  return extractGuiaNumber(decoded)
}

export async function generateVerso(params: {
  guiaNumero: string | null
  pageIndex: number
  terapias: Array<{ guia_numero: string; terapia_nome: string; terapeuta_id: string | null }>
  terapeutas: Array<{ id: string; nome: string; carimbo_digital: string | null }>
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

export async function mergePdf(items: Uint8Array[]) {
  const merged = await PDFDocument.create()

  for (const item of items) {
    const document = await PDFDocument.load(item)
    const pages = await merged.copyPages(document, document.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }

  return merged.save()
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405)
  }

  const token = parseBearerToken(req)
  if (!token) {
    return jsonResponse({ error: "not_authenticated" }, 401)
  }

  const authResult = await verifyAuthenticatedUser(token)
  if (authResult.error) {
    return jsonResponse({ error: authResult.error, message: authResult.message }, authResult.status)
  }

  try {
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse(
        { error: "invalid_content_type", message: "Conteúdo inválido. Envie um PDF usando multipart/form-data." },
        400
      )
    }

    const formData = await req.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return jsonResponse({ error: "file_required", message: "Arquivo PDF obrigatório." }, 400)
    }

    if (file.type !== "application/pdf") {
      return jsonResponse({ error: "invalid_file_type", message: "Somente arquivos PDF são aceitos." }, 400)
    }

    const rawBytes = new Uint8Array(await file.arrayBuffer())
    const pages = await splitPdf(rawBytes)

    if (pages.length === 0) {
      return jsonResponse({ error: "empty_pdf", message: "O arquivo PDF não contém páginas válidas." }, 400)
    }

    const results = [] as Array<{
      pageIndex: number
      guiaNumero: string | null
      status: string
      originalPdf: string
      versoPdf: string
      finalPdf: string
      terapias: Array<{ guia_numero: string; terapia_nome: string; terapeuta_id: string | null }>
      terapeutas: Array<{ id: string; nome: string; carimbo_digital: string | null }>
    }>

    for (const page of pages) {
      const guiaNumero = extractGuiaNumberFromPage(page.bytes)
      const terapiasResult = guiaNumero
        ? await authResult.supabase
            .from("guia_terapias")
            .select("id,guia_numero,terapia_nome,terapeuta_id")
            .eq("guia_numero", guiaNumero)
        : { data: [], error: null }

      const terapias = terapiasResult.data ?? []
      const terapeutaIds = Array.from(new Set(terapias.map((item) => item.terapeuta_id).filter(Boolean)))

      const terapeutas =
        terapeutaIds.length > 0
          ? (await authResult.supabase
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

      const finalBytes = await mergePdf([page.bytes, new Uint8Array(versoBytes)])

      await authResult.supabase.from("guias_processadas").insert({
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
        originalPdf: toBase64(page.bytes),
        versoPdf: toBase64(new Uint8Array(versoBytes)),
        finalPdf: toBase64(new Uint8Array(finalBytes)),
        terapias,
        terapeutas,
      })
    }

    return jsonResponse({ results })
  } catch (error) {
    console.error("Erro ao processar guias digitais:", error)
    return jsonResponse(
      { error: "processing_failed", message: "Falha no processamento do arquivo. Verifique o PDF e tente novamente." },
      500
    )
  }
})
