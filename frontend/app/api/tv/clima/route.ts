import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// O `connect-src` da CSP (next.config.ts) só libera 'self' e o Supabase, então o
// fetch direto ao open-meteo era bloqueado no navegador e a TV mostrava sempre
// '--'. Buscar aqui mantém a CSP fechada e ainda compartilha o cache entre telas.

const LATITUDE_PADRAO = '-22.90'
const LONGITUDE_PADRAO = '-43.20'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const latitude = params.get('lat') ?? LATITUDE_PADRAO
  const longitude = params.get('lon') ?? LONGITUDE_PADRAO

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    '&current_weather=true&timezone=America/Sao_Paulo'

  try {
    const res = await fetch(url, { next: { revalidate: 600 } })

    if (!res.ok) {
      throw new Error(`open-meteo respondeu ${res.status}`)
    }

    const data = await res.json()
    const atual = data?.current_weather

    if (typeof atual?.temperature !== 'number') {
      throw new Error('resposta sem current_weather')
    }

    return NextResponse.json({
      temperatura: Math.round(atual.temperature),
      codigo: atual.weathercode ?? null,
    })
  } catch {
    // Clima é enfeite de rodapé: falhar aqui não pode derrubar a tela de chamadas.
    return NextResponse.json(
      { temperatura: null, codigo: null },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
