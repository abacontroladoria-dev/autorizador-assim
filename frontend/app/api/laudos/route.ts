import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { buscarTodosLaudos } from "@/services/laudos/client"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dataInicio = searchParams.get("inicio")
  const dataFim = searchParams.get("fim")

  if (!dataInicio || !dataFim) {
    return NextResponse.json({ ok: false, error: "parametros_obrigatorios_inicio_fim" }, { status: 400 })
  }

  try {
    const rows = await buscarTodosLaudos(dataInicio, dataFim)
    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    console.error("[api/laudos] falha ao buscar laudos", e)
    return NextResponse.json({ ok: false, error: "falha_ao_buscar_laudos" }, { status: 500 })
  }
}
