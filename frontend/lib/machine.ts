export async function getMachineId() {

  try {

    // Timeout curto: se o worker local não responde, consideramos offline rápido
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    const res = await fetch(
      'http://127.0.0.1:3010/machine-id',
      { signal: controller.signal }
    )

    clearTimeout(timeout)

    if (!res.ok) {
      return null
    }

    const data = await res.json()

    return data.machine_id || null

  } catch {

    // Worker local indisponível é um estado esperado (worker parado/não instalado).
    // Não logar como erro para não disparar o overlay de erro do Next.js dev.
    return null
  }
}
