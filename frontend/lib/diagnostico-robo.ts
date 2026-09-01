import { getSupabaseClient } from '@/lib/supabase/client'

import type { MotivoIndisponivel } from '@/lib/machine'

// ============================================================================
// Diagnóstico do robô de autorização — por que a /solicitar não consegue usá-lo
//
// O PROBLEMA QUE ISTO RESOLVE
//
// A tela sabia uma coisa só: "não consegui falar com 127.0.0.1:3010". Disso ela
// concluía "Sistema Offline" e travava o botão Autorizar. Mas essa chamada falha
// por motivos com causas opostas:
//
//   • o robô realmente parou naquele PC;
//   • o robô está VIVO e autorizando, e quem cortou a chamada foi o browser.
//
// Em 01/09/2026 foi o segundo caso — a porta não estava no `connect-src` do CSP
// fora de dev — e a recepção ficou parada com os robôs trabalhando (last_seen de
// 16 e 19 segundos). A tela dizia "abra o sistema no PC onde o robô está
// instalado e em execução", conselho que já estava sendo seguido.
//
// COMO SEPARAR OS DOIS
//
// O robô manda heartbeat a cada 30s para `public.maquinas.last_seen`, por um
// caminho de SAÍDA que não depende de porta aberta nem da política do browser.
// Então: porta local falhou + heartbeat fresco = o robô está bem, o problema é
// esta página. É a única evidência que distingue os casos, e ela vem do banco.
//
// POR QUE PELO user_id, E NÃO PELO id DA PORTA
//
// Quando a porta falha não temos o machine_id — é justamente o que ela serviria.
// A máquina é então encontrada pelo dono, como a Sidebar já faz
// (components/Sidebar.tsx:263). Sem service_role e sem rota nova: o RLS de
// `maquinas` já permite ao usuário ler a própria linha.
// ============================================================================

// Um heartbeat mais velho que isto é tratado como robô parado. Ele bate a cada
// 30s; três janelas perdidas descartam atraso de rede sem deixar o aviso mentir
// por muito tempo.
const HEARTBEAT_FRESCO_MS = 90_000

export type EstadoRobo =
  | 'verificando'      // primeira sonda ainda não voltou
  | 'ok'               // porta respondeu com machine_id
  | 'bloqueado'        // porta falhou, MAS o heartbeat prova que o robô está vivo
  | 'parado'           // porta falhou e o heartbeat está velho (ou nunca houve)
  | 'sem_id'           // robô respondeu sem se identificar
  | 'indeterminado'    // porta falhou e não deu para ler o heartbeat

export type DiagnosticoRobo = {
  pronto: boolean
  estado: EstadoRobo
  /** Segundos desde o último heartbeat, quando conhecido. Alimenta o aviso. */
  vistoHaSegundos?: number
}

export type Heartbeat =
  | { lido: true; lastSeen: string | null }
  | { lido: false }

/** Lê o heartbeat da máquina do usuário logado. Nunca lança: o diagnóstico é
 *  acessório e não pode derrubar a tela de trabalho da recepção. */
export async function lerHeartbeatDaMinhaMaquina(): Promise<Heartbeat> {
  try {
    const supabase = getSupabaseClient()

    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id
    if (!uid) return { lido: false }

    const { data, error } = await supabase
      .from('maquinas')
      .select('last_seen')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) return { lido: false }

    // Sem linha: o usuário não tem máquina registrada. É um fato conhecido —
    // não confundir com falha de leitura.
    return { lido: true, lastSeen: data?.last_seen ?? null }

  } catch {
    return { lido: false }
  }
}

export function montarDiagnostico(
  motivo: MotivoIndisponivel,
  heartbeat: Heartbeat,
): DiagnosticoRobo {
  // O robô respondeu, mas sem id. Não é caso de heartbeat: ele está de pé e
  // errado, e nenhuma leitura do banco muda o que a atendente precisa fazer.
  if (motivo === 'sem_id') return { pronto: false, estado: 'sem_id' }

  if (!heartbeat.lido) return { pronto: false, estado: 'indeterminado' }

  if (!heartbeat.lastSeen) return { pronto: false, estado: 'parado' }

  const idadeMs = Date.now() - new Date(heartbeat.lastSeen).getTime()

  // Relógio adiantado do cliente daria idade negativa; tratar como fresco em vez
  // de acusar "parado" por causa do relógio de quem olha.
  const vistoHaSegundos = Math.max(0, Math.round(idadeMs / 1000))

  if (idadeMs <= HEARTBEAT_FRESCO_MS) {
    // Vivo, mas inalcançável DESTA página: o clássico bloqueio do browser.
    return { pronto: false, estado: 'bloqueado', vistoHaSegundos }
  }

  return { pronto: false, estado: 'parado', vistoHaSegundos }
}

/** Texto do aviso. Cada estado diz o que fazer — genérico foi o que atrasou o
 *  diagnóstico em 01/09. */
export function mensagemDoRobo(d: DiagnosticoRobo): string {
  switch (d.estado) {
    case 'verificando':
      return 'Verificando o robô de autorização neste computador…'

    case 'bloqueado':
      return `O robô deste computador está funcionando (visto há ${d.vistoHaSegundos}s), mas esta página não consegue falar com ele. Recarregue com Ctrl+F5; se continuar, avise a equipe técnica — é bloqueio do navegador, não do robô.`

    case 'parado':
      return d.vistoHaSegundos === undefined
        ? 'Nenhum robô de autorização registrado para este usuário. Abra o sistema no PC onde o robô está instalado.'
        : `O robô deste computador está parado (visto pela última vez há ${formatarIdade(d.vistoHaSegundos)}). Reinicie o robô ou o computador.`

    case 'sem_id':
      return 'O robô respondeu, mas não informou a identificação da máquina. Avise a equipe técnica.'

    case 'indeterminado':
      return 'Não foi possível falar com o robô de autorização deste computador, nem confirmar o estado dele. Recarregue a página; se continuar, avise a equipe técnica.'

    case 'ok':
      return ''
  }
}

function formatarIdade(segundos: number): string {
  if (segundos < 120) return `${segundos}s`
  const minutos = Math.round(segundos / 60)
  if (minutos < 120) return `${minutos} min`
  const horas = Math.round(minutos / 60)
  return horas < 48 ? `${horas}h` : `${Math.round(horas / 24)} dias`
}
