export async function getMachineId() {

  try {

    const res = await fetch(
      'http://127.0.0.1:3010/machine-id'
    )

    if (!res.ok) {
      return null
    }

    const data = await res.json()

    return data.machine_id || null

  } catch (err) {

    console.error(
      'Erro ao obter machine_id:',
      err
    )

    return null
  }
}