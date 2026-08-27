// tv //

'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Check,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  History,
  Play,
  Snowflake,
  Sun,
  Volume2,
  WifiOff,
} from 'lucide-react'

// Sem `sala`: a clínica tem uma recepção só, então identificar qual seria ruído
// (e a linha "Dirija-se à recepção Recepção 1" duplicava a palavra). Quando
// existir uma segunda, volta o campo aqui e na rota.
type Chamada = {
  id: string
  nome: string
  agenda_id: string | null
  chamado_em: string
  /** calculado no servidor — ver comentário na rota */
  idade_segundos: number
}

// Abaixo disso a chamada é "agora" e o accent aparece; acima, a tela mostra
// quanto tempo passou. Sem isso quem entra na sala vê um nome de 40 minutos
// atrás com a mesma cara de uma chamada que acabou de sair.
const SEGUNDOS_AGORA = 120

// A tela não usa o client do Supabase de propósito: /tv roda sem conta logada e a
// RLS de chamada_paciente só responde a `authenticated` — o realtime como anon
// nunca entregava nada. Quem lê é /api/tv/chamadas, no servidor. 3s é imperceptível
// numa sala de espera e o poll dá de graça o estado inicial ao (re)abrir a TV.
const POLL_CHAMADAS_MS = 3000
const POLL_CLIMA_MS = 600000

// Chrome às vezes engole o `onend` da fala numa aba aberta há horas; sem isso a
// fila travaria em `falando = true` e a TV ficaria muda pelo resto do dia.
const WATCHDOG_FALA_MS = 15000

// Timbre da chamada. Ficam aqui porque a amostra do seletor precisa usar os
// mesmos valores — amostra com rate diferente da chamada real é propaganda
// enganosa: você escolhe uma voz e ouve outra na hora do aperto.
const FALA_RATE = 0.95
const FALA_PITCH = 1.1

// Teto de segurança pro sino: se `beep.mp3` falhar em carregar/tocar (arquivo
// ausente, áudio bloqueado), o evento `ended` nunca chega e a fala ficaria
// esperando pra sempre. 1800ms é folga generosa pra um beep curto.
const SINO_MAX_MS = 1800

// Quanto tempo o nome fica em destaque na tela central antes de descer
// sozinho pra lateral — não espera a próxima chamada pra abrir espaço.
// 10s (primeira versão) sumia rápido demais: mal dava o sino+fala e o nome já
// tinha ido pra lateral, sem sobrar tempo de leitura pra quem chega olhando.
const DESTAQUE_MS = 25000

// Qual voz usar é escolha da máquina, não do build: cada PC de recepção tem um
// conjunto diferente instalado. Guardado por voiceURI (mais estável que o nome)
// no localStorage do próprio navegador da TV.
const CHAVE_VOZ = 'tv:voz'

// "Teste de som" na frente não é enfeite: sem isso a amostra é indistinguível de
// uma chamada real, e auditar 6 vozes dispara 6 chamadas falsas num saguão
// ocupado — gente levanta e vai até a recepção. O nome continua ali porque é
// justamente ele que revela a pronúncia da voz; fictício, porque a tela fica num
// lugar público.
const FRASE_AMOSTRA =
  'Teste de som. Responsável pelo paciente Ana Paula, dirija-se à recepção'

// `SpeechSynthesisVoice` não expõe gênero — só nome e lang. Então a única forma
// de escolher pelo timbre é reconhecer os nomes que os sistemas usam. A lista
// não precisa ser exaustiva: nome desconhecido fica no meio da classificação,
// entre a masculina reconhecida e a feminina reconhecida.
//
// Além dos nomes do Windows, entram aqui os rótulos que aparecem no Linux: o
// speech-dispatcher nomeia por tipo ("male1", "female2") e as vozes Piper por
// nome de modelo ("faber" é a masculina pt-BR).
const VOZES_PT_FEMININAS = [
  'maria',
  'francisca',
  'thalita',
  'luciana',
  'fernanda',
  'helena',
  'joana',
  'catarina',
  'leticia',
  'letícia',
  'female',
  'female1',
  'female2',
  'female3',
]

const VOZES_PT_MASCULINAS = [
  'daniel',
  'antonio',
  'antônio',
  'felipe',
  'ricardo',
  'faber',
  'edresson',
  'male',
  'male1',
  'male2',
  'male3',
]

// `includes` não serve aqui: "male" é substring de "female", então
// `'female2'.includes('male')` é true e classificaria toda voz feminina do
// speech-dispatcher como masculina — exatamente o erro que este código existe
// pra evitar. O casamento é por limite de palavra.
function temNome(nome: string, tokens: string[]) {
  return tokens.some((t) =>
    new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(nome)
  )
}

// Parte dos motores (Android, algumas builds SAPI) reporta `pt_BR` em vez de
// `pt-BR`. Escrever isso cru no `utterance.lang` monta uma tag malformada, e aí
// há motor que ignora o `voice` e resolve pelo lang — caindo justamente na voz
// default que o resto deste código existe pra evitar. Uma função só, usada
// tanto pra filtrar quanto pra atribuir, pra não divergirem de novo.
function normalizarLang(lang: string) {
  return lang.replace(/_/g, '-')
}

function ehPortugues(v: SpeechSynthesisVoice) {
  return normalizarLang(v.lang).toLowerCase().startsWith('pt')
}

// A nota só ORDENA e escolhe o default — não esconde ninguém do seletor. Se a
// máquina só tiver voz feminina, é ela que fala: idioma pesa muito mais que
// timbre, e voz feminina em português é melhor que masculina lendo
// "Responsável" em inglês.
//
// A preferência é por voz MASCULINA (pedido do usuário em 2026-08-26; antes era
// o contrário). Note que a margem é menor que a de idioma de propósito: o
// timbre é desempate, não critério.
function notaVoz(v: SpeechSynthesisVoice) {
  const nome = v.name.toLowerCase()
  const lang = normalizarLang(v.lang).toLowerCase()

  let nota = 0

  if (lang.startsWith('pt-br')) nota += 100
  else if (lang.startsWith('pt')) nota += 40 // pt-PT: sotaque errado, mas português

  if (temNome(nome, VOZES_PT_MASCULINAS)) nota += 25
  if (temNome(nome, VOZES_PT_FEMININAS)) nota -= 20

  // A voz do Google tem dicção bem melhor que as SAPI da Microsoft. Ela depende
  // de rede, mas isso não é risco aqui: sem rede o poll não traz chamada
  // nenhuma, então não há o que anunciar.
  if (nome.includes('google')) nota += 8

  return nota
}

function vozesEmPortugues(todas: SpeechSynthesisVoice[]) {
  // Chrome no Windows às vezes lista a mesma voz duas vezes, e lá o `voiceURI` é
  // o próprio nome — o que daria key repetida no React e duas linhas marcadas
  // como ativas ao mesmo tempo. Fora que voz repetida no seletor é ruim de ler.
  const unicas = [
    ...new Map(todas.filter(ehPortugues).map((v) => [v.voiceURI, v])).values(),
  ]

  return unicas.sort((a, b) => notaVoz(b) - notaVoz(a))
}

// Sem escolha salva, cai na primeira da lista — que já vem ordenada por
// `notaVoz`. O pin explícito no "Daniel" saiu junto com a inversão da
// preferência: ele existia pra contornar uma nota que penalizava voz masculina,
// e agora a nota já prefere. Continua sendo o Daniel que ganha num Windows
// (única masculina pt-BR das SAPI), só que por regra e não por exceção.
function vozPadrao(disponiveis: SpeechSynthesisVoice[]) {
  return disponiveis[0] ?? null
}

// "Microsoft Maria Desktop - Portuguese(Brazil)" não é rótulo pra ninguém ler a
// 3 m de distância.
function rotuloVoz(v: SpeechSynthesisVoice) {
  const limpo = v.name
    .replace(/^(microsoft|google)\s+/i, '')
    .replace(/\s+(desktop|online|mobile)\b/gi, '')
    .replace(/\s*[-–(]\s*portugu.*$/i, '')
    .replace(/\s*\(natural\)/gi, '')
    .trim()

  return limpo || v.name
}

// Emoji era a única "família de ícones" desta tela — e o resto do app usa
// lucide em 162 arquivos. Além da inconsistência, emoji troca de desenho por
// sistema operacional: num box de sinalização Linux o ⛈️ vira outra coisa.
function IconeClima({ codigo }: { codigo: number | null }) {
  const props = { className: 'w-[1.15em] h-[1.15em]', strokeWidth: 1.75 }

  if (codigo === null) return <CloudSun {...props} />
  if (codigo === 0) return <Sun {...props} /> // céu limpo
  if (codigo <= 3) return <CloudSun {...props} /> // parcialmente nublado
  if (codigo <= 48) return <Cloud {...props} /> // nublado
  if (codigo <= 67) return <CloudRain {...props} /> // chuva
  if (codigo <= 77) return <Snowflake {...props} /> // neve
  if (codigo <= 99) return <CloudLightning {...props} /> // tempestade

  return <CloudSun {...props} />
}

// O horário da chamada vem de chamado_em (timestamptz). Fuso explícito porque a
// TV pode estar num PC com relógio configurado em outro lugar.
const horaDaChamada = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return ''
  }
}

// O relógio mora numa folha própria: com o setState de 1s na raiz, a TV
// re-renderizava a página inteira 3.600x por hora (~43 mil por dia numa jornada
// de 12h) só pra mexer dois dígitos no rodapé. Fuso explícito pelo mesmo motivo
// de horaDaChamada — TV com relógio configurado em outro lugar não pode mostrar
// horário de chamada e horário de parede em fusos diferentes.
function Relogio() {
  const [hora, setHora] = useState('')

  useEffect(() => {
    const atualizar = () => {
      setHora(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        })
      )
    }

    atualizar()

    const interval = setInterval(atualizar, 1000)

    return () => clearInterval(interval)
  }, [])

  return <span className="tabular-nums">{hora}</span>
}

// memo: quando só o clima ou o estado de conexão mudam, as linhas do histórico
// não têm por que re-renderizar.
const LinhaChamada = memo(function LinhaChamada({
  chamada,
  posicao,
}: {
  chamada: Chamada
  posicao: number
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-tv-border last:border-0">
      <div className="w-9 h-9 shrink-0 rounded-full bg-tv-ground flex items-center justify-center text-[clamp(13px,0.9vw,16px)] font-semibold text-tv-ink-muted">
        {posicao}
      </div>

      {/* sem truncate: cortar o nome de quem está sendo chamado é justamente o
          que a lista não pode fazer — o max-w-[160px] recortava 2 de 2 nomes
          até em 1920px */}
      <span className="flex-1 min-w-0 text-[clamp(18px,1.5vw,28px)] font-medium text-tv-ink leading-tight">
        {chamada.nome}
      </span>

      <span className="shrink-0 pt-1 text-[clamp(13px,1vw,18px)] tabular-nums text-tv-ink-muted">
        {horaDaChamada(chamada.chamado_em)}
      </span>
    </div>
  )
})

// "há 14 min" em vez de um horário: o que interessa a quem está sentado na sala
// é se a chamada é dele agora, não que horas eram.
const tempoDecorrido = (segundos: number) => {
  if (segundos < 60) return 'agora'
  const min = Math.floor(segundos / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return `há ${h} h`
}

// O poll devolve a mesma lista o tempo todo; sem isto cada ciclo de 3s trocava a
// identidade do array e re-renderizava a árvore inteira sem nada ter mudado.
// A idade entra na comparação em granularidade de minuto — é o que a tela
// mostra —, então o re-render acontece 1x por minuto em vez de 1x a cada 3s.
const mesmaLista = (a: Chamada[], b: Chamada[]) =>
  a.length === b.length &&
  a.every((c, i) => c.id === b[i].id) &&
  Math.floor((a[0]?.idade_segundos ?? 0) / 60) ===
    Math.floor((b[0]?.idade_segundos ?? 0) / 60)

export default function TVPage() {
  const [chamadas, setChamadas] = useState<Chamada[]>([])
  const [temperatura, setTemperatura] = useState<number | null>(null)
  const [codigoClima, setCodigoClima] = useState<number | null>(null)
  // Verdadeiro do início do sino até o fim da fala — a janela inteira em que
  // o pai precisa olhar pra tela, não só o segundo do "ding".
  const [chamando, setChamando] = useState(false)
  const [audioLiberado, setAudioLiberado] = useState(false)
  const [online, setOnline] = useState(true)

  // Quem está em destaque no centro da tela — some sozinho depois de
  // DESTAQUE_MS mesmo sem chamada nova (`destacar`, abaixo).
  const [destacadoId, setDestacadoId] = useState<string | null>(null)
  const prazoDestaque = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Destaque é EVENTO ("chamaram alguém agora"), não POSIÇÃO ("quem está no
  // topo"). Era um efeito com deps [primeiroId]: quando a autorização do
  // primeiro era concluída ele saía da lista, a posição 0 passava a ser a
  // chamada ANTERIOR — um valor novo pro efeito — e essa paciente já atendida
  // voltava ao centro em 96px, mandando pra recepção alguém que já tinha ido.
  // Silenciosamente, porque o áudio olha `anunciados` e nunca a repetiu.
  //
  // Quem decide agora é o poll, que já sabe o que é novo pelo mesmo `anunciados`
  // do áudio — uma definição só de "chamada nova" pros dois canais.
  const destacar = useCallback((id: string) => {
    setDestacadoId(id)

    if (prazoDestaque.current) clearTimeout(prazoDestaque.current)
    prazoDestaque.current = setTimeout(() => {
      // só limpa se ainda for este: uma chamada nova já reagendou o timer dela
      setDestacadoId((atual) => (atual === id ? null : atual))
    }, DESTAQUE_MS)
  }, [])

  useEffect(
    () => () => {
      if (prazoDestaque.current) clearTimeout(prazoDestaque.current)
    },
    []
  )

  const atual = useMemo(
    () => (destacadoId ? chamadas.find((c) => c.id === destacadoId) ?? null : null),
    [chamadas, destacadoId]
  )
  // Sem destaque, todo mundo (inclusive quem acabou de sair do centro) mora na
  // lateral — não é mais só "o resto da lista".
  const historico = useMemo(
    () => (destacadoId ? chamadas.filter((c) => c.id !== destacadoId) : chamadas),
    [chamadas, destacadoId]
  )
  // Se a idade não vier (resposta antiga em cache, rota fora do ar), a tela não
  // inventa: fica sem o selo de tempo em vez de escrever "há NaN min".
  const idade =
    typeof atual?.idade_segundos === 'number' ? atual.idade_segundos : null
  const agora = idade !== null && idade < SEGUNDOS_AGORA

  const filaAudio = useRef<Chamada[]>([])
  const falando = useRef(false)
  const anunciados = useRef<Set<string>>(new Set())
  const primeiraCarga = useRef(true)
  const audioLiberadoRef = useRef(false)

  // Já filtrada pra português e ordenada por `notaVoz` — é o que o seletor
  // mostra. O ref espelha a escolha porque `processarFila` é um callback
  // estável e leria um valor congelado se dependesse do state.
  const [vozes, setVozes] = useState<SpeechSynthesisVoice[]>([])
  const [vozEscolhida, setVozEscolhida] = useState<string | null>(null)
  const vozEscolhidaRef = useRef<string | null>(null)

  // Contar as vozes não-português não servia pra saber se a enumeração acabou:
  // o Chrome entrega as locais (em inglês) primeiro e as de rede depois, então
  // numa máquina cuja única voz pt é a do Google a lista fica "não-vazia mas sem
  // português" por um instante — e o aviso de instalação piscava. Só o tempo
  // separa os dois casos.
  const [enumeracaoConcluida, setEnumeracaoConcluida] = useState(false)

  // Precisa repetir a cadeia de fallback de `resolverVoz`: se destacasse
  // `vozEscolhida` cru, uma voz desinstalada apareceria marcada na tela
  // enquanto outra falava de verdade.
  const vozAtiva =
    vozes.find((v) => v.voiceURI === vozEscolhida)?.voiceURI ??
    vozPadrao(vozes)?.voiceURI ??
    null

  // Resolvido na hora de falar, não na render: `getVoices()` costuma vir vazio
  // no primeiro paint e só popula depois do evento `voiceschanged`.
  const resolverVoz = useCallback(() => {
    const disponiveis = vozesEmPortugues(window.speechSynthesis.getVoices())
    const salva = vozEscolhidaRef.current

    // Se a voz salva não existe mais (desinstalada, perfil copiado pra outra
    // máquina), cai na melhor disponível em vez de devolver undefined — que
    // deixaria o navegador escolher sozinho, e o default costuma ser inglês.
    return (
      (salva && disponiveis.find((v) => v.voiceURI === salva)) ||
      vozPadrao(disponiveis)
    )
  }, [])

  const ouvirAmostra = useCallback(
    (voz: SpeechSynthesisVoice) => {
      if (!('speechSynthesis' in window)) return

      // O clique no próprio botão é o gesto que destrava o áudio, então a
      // amostra toca mesmo antes de "Ativar som".
      window.speechSynthesis.cancel()

      const u = new SpeechSynthesisUtterance(FRASE_AMOSTRA)
      u.voice = voz
      u.lang = normalizarLang(voz.lang)
      u.rate = FALA_RATE
      u.pitch = FALA_PITCH

      // `cancel()` é assíncrono por dentro no Chrome: chamar `speak()` no mesmo
      // tick faz a fala ser engolida calada. Trocar de voz em sequência rápida —
      // exatamente o que se faz auditando — cairia nisso, e a pessoa concluiria
      // que a voz está quebrada. O atraso ainda está dentro da janela de
      // ativação do clique, então não custa o gesto que destrava o áudio.
      setTimeout(() => window.speechSynthesis.speak(u), 120)
    },
    []
  )

  const escolherVoz = useCallback(
    (voz: SpeechSynthesisVoice) => {
      setVozEscolhida(voz.voiceURI)
      vozEscolhidaRef.current = voz.voiceURI

      // Perfil de quiosque pode ter storage bloqueado; a escolha então vale só
      // pela sessão em vez de derrubar a tela.
      try {
        localStorage.setItem(CHAVE_VOZ, voz.voiceURI)
      } catch {}

      ouvirAmostra(voz)
    },
    [ouvirAmostra]
  )

  // 🔊 fila de voz
  const processarFila = useCallback(() => {
    // Sem o gesto de "Ativar som" o navegador descarta a fala em silêncio — e o
    // `onend` nunca chega, o que deixaria a fila travada pra sempre.
    if (!audioLiberadoRef.current) return
    if (falando.current) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const c = filaAudio.current.shift()
    if (!c) return

    falando.current = true
    setChamando(true)

    const nome = c.nome || 'Paciente'
    const msg = new SpeechSynthesisUtterance(
      `Responsável pelo paciente ${nome}. Dirija-se à recepção`
    )

    msg.lang = 'pt-BR'
    msg.rate = FALA_RATE
    msg.pitch = FALA_PITCH

    // `lang` acompanha a voz: quando os dois discordam, parte dos motores
    // ignora `voice` e resolve pelo lang, trocando a voz sem avisar.
    const voz = resolverVoz()
    if (voz) {
      msg.voice = voz
      msg.lang = normalizarLang(voz.lang)
    }

    // 🔔 sino sozinho primeiro. A fala (e o watchdog dela) só começa quando ele
    // termina — por `ended` ou, se o áudio falhar, pelo teto de SINO_MAX_MS.
    // `iniciarFala` roda uma vez só: `ended` e o teto podem disparar os dois.
    // `chamando` continua true até a fala acabar — o pulso/laranja cobre a
    // janela inteira do anúncio, não só o "ding" do sino.
    let sinoConcluido = false
    const iniciarFala = () => {
      if (sinoConcluido) return
      sinoConcluido = true
      clearTimeout(prazoSino)

      let falaEncerrada = false
      const liberar = () => {
        if (falaEncerrada) return
        falaEncerrada = true
        clearTimeout(watchdog)
        setChamando(false)
        falando.current = false
        processarFila()
      }

      msg.onend = liberar
      msg.onerror = liberar
      const watchdog = setTimeout(liberar, WATCHDOG_FALA_MS)

      window.speechSynthesis.speak(msg)
    }

    const beep = new Audio('/beep.mp3')
    beep.addEventListener('ended', iniciarFala)
    beep.play().catch(iniciarFala)

    const prazoSino = setTimeout(iniciarFala, SINO_MAX_MS)
  }, [resolverVoz])

  // carregar voz — no Chrome getVoices() só popula depois deste evento
  useEffect(() => {
    if (!('speechSynthesis' in window)) return

    try {
      const salva = localStorage.getItem(CHAVE_VOZ)
      if (salva) {
        setVozEscolhida(salva)
        vozEscolhidaRef.current = salva
      }
    } catch {}

    // Antes o retorno era jogado fora: chamar `getVoices()` só pra provocar o
    // populamento não deixava a lista em lugar nenhum, então não havia como
    // montar o seletor.
    const carregarVozes = () =>
      setVozes(vozesEmPortugues(window.speechSynthesis.getVoices()))

    carregarVozes()
    window.speechSynthesis.addEventListener('voiceschanged', carregarVozes)

    // 2s cobre com folga a chegada das vozes de rede; e este prazo só atrasa o
    // aviso de "nenhuma voz em português", nunca a fala em si.
    const prazoEnumeracao = setTimeout(() => setEnumeracaoConcluida(true), 2000)

    return () => {
      clearTimeout(prazoEnumeracao)
      window.speechSynthesis.removeEventListener('voiceschanged', carregarVozes)
    }
  }, [])

  // 📣 chamadas
  useEffect(() => {
    let vivo = true
    let timer: ReturnType<typeof setTimeout>

    const carregar = async () => {
      try {
        const res = await fetch('/api/tv/chamadas/', { cache: 'no-store' })
        if (!res.ok) throw new Error(`status ${res.status}`)

        const json = await res.json()
        const lista: Chamada[] = json?.chamadas ?? []

        if (!vivo) return

        setOnline(true)
        setChamadas((prev) => (mesmaLista(prev, lista) ? prev : lista))

        const novas = lista.filter((c) => !anunciados.current.has(c.id))
        for (const c of lista) anunciados.current.add(c.id)

        // Quem está no centro saiu da lista (autorização concluída, ou caiu da
        // janela): limpa o destaque em vez de deixar um nome resolvido em 96px.
        // Sem isto o card ficaria preso até o fim do DESTAQUE_MS.
        const ids = new Set(lista.map((c) => c.id))
        setDestacadoId((atual) => (atual && !ids.has(atual) ? null : atual))

        if (primeiraCarga.current) {
          // Ao abrir/recarregar a TV o que já passou aparece na tela, mas não é
          // anunciado de novo — nem destacado: nada aqui é evento desta sessão.
          primeiraCarga.current = false
        } else if (novas.length > 0) {
          // A lista vem da mais recente pra mais antiga; falar na ordem em que
          // foram chamadas.
          for (const c of [...novas].reverse()) filaAudio.current.push(c)

          // A mais recente é quem fica no centro — as outras (raro: duas no
          // mesmo ciclo de 3s) entram no histórico e ainda são faladas.
          destacar(novas[0].id)

          processarFila()
        }
      } catch {
        if (vivo) setOnline(false)
      } finally {
        if (vivo) timer = setTimeout(carregar, POLL_CHAMADAS_MS)
      }
    }

    carregar()

    return () => {
      vivo = false
      clearTimeout(timer)
    }
    // `destacar` é estável (useCallback sem deps), então não remonta o poll.
  }, [processarFila, destacar])

  // CLIMA
  useEffect(() => {
    let vivo = true

    const buscarClima = async () => {
      try {
        const res = await fetch('/api/tv/clima/')
        const data = await res.json()

        if (!vivo) return

        setTemperatura(typeof data?.temperatura === 'number' ? data.temperatura : null)
        setCodigoClima(typeof data?.codigo === 'number' ? data.codigo : null)
      } catch {
        if (vivo) setTemperatura(null)
      }
    }

    buscarClima()

    const interval = setInterval(buscarClima, POLL_CLIMA_MS)

    return () => {
      vivo = false
      clearInterval(interval)
    }
  }, [])

  // 🖥️ a TV não pode apagar sozinha enquanto a sala de espera está cheia
  useEffect(() => {
    if (!audioLiberado) return

    let sentinela: WakeLockSentinel | null = null
    let vivo = true

    const manterAcesa = async () => {
      try {
        sentinela = (await navigator.wakeLock?.request('screen')) ?? null
      } catch {
        // sem Wake Lock (navegador antigo ou aba em background) segue normal
      }
    }

    const reagir = () => {
      if (vivo && document.visibilityState === 'visible' && !sentinela) manterAcesa()
    }

    manterAcesa()
    document.addEventListener('visibilitychange', reagir)

    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', reagir)
      sentinela?.release().catch(() => {})
    }
  }, [audioLiberado])

  const liberarAudio = () => {
    audioLiberadoRef.current = true

    // O clique é o gesto que destrava áudio no navegador; a fila é descartada
    // porque o que estava na tela já foi visto em silêncio.
    filaAudio.current = []
    falando.current = false

    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance('Sistema de chamadas ativado')
      utter.lang = 'pt-BR'

      // Sem isto a confirmação saía na voz default do sistema — que num Windows
      // em inglês lê "Sistema de chamadas ativado" com voz americana, enquanto
      // as chamadas de verdade saem noutra voz. Também serve de teste: é a
      // primeira prova de que a voz escolhida realmente fala.
      const voz = resolverVoz()
      if (voz) {
        utter.voice = voz
        utter.lang = normalizarLang(voz.lang)
      }

      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    }

    setAudioLiberado(true)
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-tv-ground text-tv-ink overflow-hidden">
      {!audioLiberado && (
        // fixed, não absolute: com `absolute` só cobria a tela por acidente,
        // porque a raiz é w-screen/h-screen. E é um dialog de verdade agora.
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-audio-titulo"
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <div className="bg-tv-card rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
            {/* neutro: quem carrega o accent neste modal é o botão, que é a
                ação primária */}
            <Volume2 className="w-10 h-10 text-tv-ink-muted" strokeWidth={1.75} />

            <h2 id="tv-audio-titulo" className="text-2xl font-semibold text-tv-ink">
              Ativar áudio do sistema
            </h2>

            <p className="text-base text-tv-ink-muted text-center">
              Toque na tela para ativar as chamadas sonoras
            </p>

            {/* O seletor mora aqui porque este diálogo já é o momento de setup:
                alguém encosta na tela toda vez que a TV liga. Um seletor
                permanente no painel seria ruído numa tela que ninguém opera.

                Aparece a partir de UMA voz, e não de duas: esconder o caso de
                voz única parecia certo ("não há decisão a tomar") mas escondia
                justamente a informação que faltava quando a TV falou com a voz
                errada — QUAL voz o navegador achou. Com a lista à mostra, quem
                monta a TV vê num relance se o sistema enxerga só a voz de rede
                do Google ou se as vozes locais entraram, sem abrir console. */}
            {vozes.length > 0 && (
              <div className="w-full max-w-[560px] flex flex-col gap-2">
                <p className="text-sm font-medium uppercase tracking-wide text-tv-ink-muted">
                  Voz das chamadas
                </p>

                {/* rolável: há máquina com 6+ vozes em português e o modal não
                    pode passar da altura da tela */}
                <ul className="flex flex-col gap-2 max-h-[38vh] overflow-y-auto">
                  {vozes.map((v) => {
                    const ativa = v.voiceURI === vozAtiva

                    return (
                      <li key={v.voiceURI} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => escolherVoz(v)}
                          aria-pressed={ativa}
                          className={`flex-1 min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-left text-base transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tv-accent/40 ${
                            ativa
                              ? 'bg-tv-accent text-white'
                              : 'bg-tv-ground text-tv-ink hover:brightness-110'
                          }`}
                        >
                          {/* o check some por opacidade, não por condicional:
                              assim o texto não dança de posição ao trocar */}
                          <Check
                            className={`w-5 h-5 shrink-0 ${ativa ? 'opacity-100' : 'opacity-0'}`}
                            strokeWidth={2.5}
                          />
                          <span className="truncate">{rotuloVoz(v)}</span>
                          <span
                            className={`ml-auto shrink-0 text-xs tabular-nums ${
                              ativa ? 'text-white/70' : 'text-tv-ink-muted'
                            }`}
                          >
                            {normalizarLang(v.lang)}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => ouvirAmostra(v)}
                          aria-label={`Ouvir amostra da voz ${rotuloVoz(v)}`}
                          className="min-h-[48px] w-[48px] shrink-0 rounded-xl bg-tv-ground text-tv-ink-muted flex items-center justify-center transition hover:text-tv-ink hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tv-accent/40"
                        >
                          <Play className="w-5 h-5" strokeWidth={2} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Espera a enumeração terminar pra não piscar em toda carga. Vale
                mostrar porque transforma um problema silencioso de pronúncia em
                algo que quem monta a TV consegue resolver. */}
            {enumeracaoConcluida && vozes.length === 0 && (
              <p className="max-w-[460px] text-center text-sm text-tv-ink-muted">
                Nenhuma voz em português instalada nesta máquina — as chamadas
                vão sair com pronúncia de outro idioma. No Windows: Configurações
                → Hora e idioma → Fala. No Linux: instale
                speech-dispatcher-espeak-ng.
              </p>
            )}

            {/* 56px de altura: a TV da recepção é touch e o mínimo do projeto é
                44px (PRODUCT.md) — antes tinha 40px medidos */}
            <button
              onClick={liberarAudio}
              autoFocus
              className="mt-2 min-h-[56px] px-8 rounded-xl bg-tv-accent text-white text-lg font-medium hover:bg-tv-accent-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tv-accent/40 transition"
            >
              Ativar som
            </button>
          </div>
        </div>
      )}

      {/* 🔷 HEADER */}
      <header className="h-[90px] flex items-center justify-between px-10 bg-tv-bar">
        <div className="flex items-center gap-4">
          <img
            src="/logo-universo-aba.png"
            alt="Universo ABA"
            className="h-12 object-contain"
          />

          {/* o eyebrow "SISTEMA DE CHAMADA" saiu: 11px é ilegível a 3 m e ele só
              repetia o que a tela evidentemente é */}
          <h1 className="text-[clamp(20px,1.5vw,28px)] font-semibold tracking-wide text-white">
            CLÍNICA UNIVERSO ABA
          </h1>
        </div>
        {/* o avatar "N" saiu: era um avatar de usuário numa tela sem usuário */}
      </header>

      {/* 🧠 CONTEÚDO
          Painel fluido em vez dos 380px fixos, e coluna única abaixo de lg:
          com 380px cravados o card central caía pra 316px em 768px de largura e
          o nome era recortado pelo overflow-hidden, calado. */}
      <div className="grid grid-cols-1 grid-rows-[1fr_auto] lg:grid-cols-[1fr_clamp(300px,26%,520px)] lg:grid-rows-1 gap-6 p-6 flex-1 min-h-0">
        {/* 🟢 CENTRO — região viva: é o conteúdo que muda, e sem aria-live um
            leitor de tela via a tela como estática */}
        <main
          aria-live="polite"
          aria-atomic="true"
          className="relative h-full flex items-center justify-center min-w-0"
        >
          {/* 🟠 pulso da chamada — auréola + três anéis ecoando pra fora do
              card, como o nome da marca sugere (Pulsar). Laranja
              (--color-tv-signal), não o azul do resto da tela: é a única cor
              nova, usada só aqui, só enquanto `chamando` é true — contraste
              de matiz chama mais atenção de longe que só mais brilho no
              mesmo azul de sempre. Não é strobe: não pisca ligado/desligado,
              cresce e esmaece — sala de espera de clínica ABA tem gente
              sensível a luz piscando. Some junto com o card quando a fala
              termina. z-index do card (abaixo) fica acima disto tudo: a
              auréola/anéis existem pra sangrar ao REDOR do card, não por
              cima do nome. */}
          {chamando && (
            <>
              <div
                aria-hidden="true"
                className="absolute -inset-16 rounded-[64px] pointer-events-none blur-3xl tv-aura"
                style={{
                  background:
                    'radial-gradient(closest-side, rgba(194,65,12,0.65), rgba(194,65,12,0) 72%)',
                }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[36px] border-8 border-tv-signal pointer-events-none tv-pulse-ring"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[36px] border-8 border-tv-signal pointer-events-none tv-pulse-ring"
                style={{ animationDelay: '0.43s' }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[36px] border-8 border-tv-signal pointer-events-none tv-pulse-ring"
                style={{ animationDelay: '0.86s' }}
              />
            </>
          )}

          <div
            className={`
			  relative z-10
			  w-full h-full rounded-[36px]
			  bg-[linear-gradient(135deg,var(--color-tv-card),var(--color-tv-card-edge))]
			  flex flex-col items-center justify-center text-center
			  px-10
			  shadow-[0_25px_70px_rgba(16,27,43,0.15)]
			  transition-[transform,box-shadow,border-color] duration-500 ease-out
			  ${/* largura fixa em 2px: só a cor muda, senão a troca de estado
			       empurraria o layout 1px */ ''}
			  border-2 ${chamando ? 'border-tv-signal' : agora ? 'border-tv-accent' : 'border-tv-border'}
			  ${chamando ? 'tv-heartbeat' : ''}
			`}
          >
            {atual ? (
              <>
                {/* Selo textual, não só cor — "não confiar só na cor" vale
                    pro sinal mais importante da tela. Pop de entrada único
                    (não repete): quem já olhou não precisa de mais um
                    estímulo, o pulso ao redor do card segue sozinho. */}
                {chamando && (
                  <div className="mb-6 inline-flex items-center gap-2.5 rounded-full bg-tv-signal px-6 py-2.5 text-white tv-badge-pop">
                    <Bell className="w-[1.1em] h-[1.1em]" strokeWidth={2.25} />
                    <span className="text-[clamp(15px,1.3vw,22px)] font-semibold tracking-wide">
                      Chamando agora
                    </span>
                  </div>
                )}

                {/* caixa alta + tracking-widest saíram: era eyebrow, e a linha
                    importa — é ela que diz que o nome é do paciente, não de
                    quem está sendo chamado. `text-bold` não existe no Tailwind
                    (era font-bold), então isto nunca foi negrito. */}
                <p className="text-[clamp(20px,1.6vw,30px)] font-medium text-tv-ink-muted mb-6">
                  Responsável pelo paciente
                </p>

                {/* <p> e não <h1>: o h1 da página é o nome da clínica, que é
                    fixo. Antes havia dois h1 na mesma tela. Hierarquia de
                    heading não é tamanho de fonte. */}
                <p className="text-[clamp(44px,6.5vw,96px)] font-extrabold leading-[0.95] text-tv-ink text-balance break-words max-w-full">
                  {atual.nome}
                </p>

                {/* 40px = ~16 mm de altura de caixa numa TV 50" 1080p: é o piso
                    pra se ler a 4 m, a distância das cadeiras. A 17px de antes
                    só se lia a 1,7 m — o nome dava pra ler do fundo da sala e
                    a instrução, não. */}
                <div className="mt-12 flex flex-col items-center gap-3">
                  <div
                    className={`flex items-center gap-6 transition-colors duration-500 ${
                      chamando
                        ? 'text-tv-signal'
                        : agora
                          ? 'text-tv-accent-fg'
                          : 'text-tv-ink-muted'
                    }`}
                  >
                    {/* réguas neutras: eram accent, ou seja accent gasto em
                        enfeite justamente na tela onde ele precisa significar
                        "é agora" */}
                    <div className="h-[2px] w-32 bg-tv-border" />

                    <span className="text-[clamp(24px,2.2vw,40px)] font-medium">
                      Dirija-se à recepção
                    </span>

                    <div className="h-[2px] w-32 bg-tv-border" />
                  </div>

                  {/* a cor nunca carrega o estado sozinha — o texto diz */}
                  {idade !== null && (
                    <span
                      className={`text-[clamp(17px,1.5vw,28px)] tabular-nums transition-colors duration-500 ${
                        agora
                          ? 'text-tv-accent-fg font-medium'
                          : 'text-tv-ink-muted'
                      }`}
                    >
                      chamada {tempoDecorrido(idade)}
                    </span>
                  )}
                </div>
              </>
            ) : (
              // 🟩 ESPERA — estado institucional. Espera não pode gritar como
              // chamada: nada aqui usa o tamanho do nome (96px) nem a cor de
              // sinal, que só significa "é agora". A ilustração é decorativa e
              // fica atrás de aria-hidden — a informação toda está no texto,
              // que é o que o aria-live do <main> anuncia.
              //
              // -mx-10 desfaz o px-10 do card só nesta linha: a ilustração
              // precisa da largura toda pra respirar, e a chamada continua com
              // o padding original intacto.
              <div className="-mx-10 w-full flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-4 px-8">
                {/* 🪑 ilustração — SVG inline, sem requisição: a TV é quiosque
                    e um asset que falha deixaria buraco no layout pro dia
                    inteiro.

                    Cor vem do logo da clínica (tokens tv-brand-*, amostrados do
                    PNG — ver globals.css). Cada cor cai onde ela significa algo,
                    não em rodízio decorativo: verde na planta (literal), azul no
                    cenário — que é o papel do azul no próprio logo, onde ele
                    desenha o sol, o arbusto e o horizonte —, roxo apoiando na
                    mobília. Coral e rosa do logo ficam de fora: coral divide o
                    hue exato do laranja de "chamando agora". */}
                <div
                  aria-hidden="true"
                  className="shrink-0 w-[min(38%,420px)] max-w-[420px]"
                >
                  <svg
                    viewBox="0 0 320 260"
                    fill="none"
                    className="w-full h-auto"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {/* manchas de fundo — os dois hues dominantes do logo, bem
                        lavados: dão profundidade sem virar bloco de cor. Ficam
                        DE PROPÓSITO mais fracas que a mobília: quando estavam
                        na mesma faixa de intensidade, a mancha azul competia
                        com o sofá e ajudava a "apagá-lo". */}
                    <circle cx="232" cy="74" r="62" fill="var(--color-tv-brand-blue)" opacity="0.08" />
                    <circle cx="70" cy="150" r="46" fill="var(--color-tv-brand-purple)" opacity="0.07" />

                    {/* grade de pontos, canto superior esquerdo */}
                    <g fill="var(--color-tv-brand-blue)" opacity="0.4">
                      {[0, 1, 2, 3].map((linha) =>
                        [0, 1, 2, 3].map((coluna) => (
                          <circle
                            key={`${linha}-${coluna}`}
                            cx={14 + coluna * 11}
                            cy={92 + linha * 11}
                            r="1.6"
                          />
                        )),
                      )}
                    </g>

                    {/* luminária pendente — azul, como o traço do "universo".
                        Sem opacidade de grupo: a 0.72 o traço dava 2.33:1 sobre
                        o card e simplesmente desaparecia numa TV a 4 m. Cheio
                        dá 3.37:1, e o strokeWidth subiu junto (2.4 -> 3) porque
                        traço fino perde contraste aparente com a distância. */}
                    <g stroke="var(--color-tv-brand-blue)" strokeWidth="3">
                      <path d="M84 0 L84 58" />
                      <path
                        d="M62 84 Q84 52 106 84 Z"
                        fill="var(--color-tv-brand-blue)"
                        fillOpacity="0.14"
                      />
                    </g>

                    {/* poltrona — roxo é o secundário: a maior massa da cena,
                        então fica no hue de apoio e não no dominante. Mesma
                        correção da luminária: estava em opacity 0.78 (2.88:1,
                        abaixo do piso de 3:1 pra elemento gráfico) e o sofá
                        "sumia" de longe. Cheio dá 4.14:1. */}
                    <g stroke="var(--color-tv-brand-purple)" strokeWidth="3">
                      <path
                        d="M112 172 L112 138 Q112 126 124 126 L214 126 Q226 126 226 138 L226 172"
                        fill="var(--color-tv-brand-purple)"
                        fillOpacity="0.12"
                      />
                      <path
                        d="M104 172 Q96 172 96 182 L96 206 Q96 214 104 214 L234 214 Q242 214 242 206 L242 182 Q242 172 234 172 Z"
                        fill="var(--color-tv-brand-purple)"
                        fillOpacity="0.16"
                      />
                      <path d="M118 214 L118 232 M220 214 L220 232" />
                      <path d="M112 172 L226 172" />
                    </g>

                    {/* planta — verde do logo. É o único lugar onde a cor é
                        literal, então é o único verde da tela. O vaso recua pro
                        contorno neutro com um véu de roxo: cheio de roxo (como
                        estava) ele empastava com a folha e disputava a atenção
                        dela — cerâmica é fundo, folha é o assunto.

                        NOTA: aqui só entram tokens que existem em RUNTIME.
                        --color-tv-ink-muted vive apenas no `@theme inline` e
                        resolve VAZIO num atributo de SVG (a forma desaparece);
                        --color-tv-border e as --color-tv-brand-* são emitidas
                        de verdade. Conferido no CSS servido. */}
                    <g strokeWidth="3">
                      <path
                        d="M40 200 L46 232 Q46 238 52 238 L74 238 Q80 238 80 232 L86 200 Z"
                        stroke="var(--color-tv-brand-purple)"
                        strokeOpacity="0.55"
                        fill="var(--color-tv-brand-purple)"
                        fillOpacity="0.08"
                      />
                      {/* contorno no verde ESCURO (4.6:1) e preenchimento no
                          verde claro do logo: o verde do logo sozinho dava
                          1.36:1 de traço, ou seja folha invisível de longe */}
                      <g stroke="var(--color-tv-brand-green-ink)">
                        <path d="M63 200 L63 158" />
                        <path
                          d="M63 176 Q40 170 42 148 Q62 150 63 176"
                          fill="var(--color-tv-brand-green)"
                          fillOpacity="0.55"
                        />
                        <path
                          d="M63 168 Q86 160 88 140 Q66 144 63 168"
                          fill="var(--color-tv-brand-green)"
                          fillOpacity="0.55"
                        />
                      </g>
                    </g>

                    {/* chão — neutro de propósito: linha de base não é marca */}
                    <path d="M12 238 L308 238" stroke="var(--color-tv-border)" strokeWidth="2.2" />

                    {/* cruzetas — as fagulhas do logo, em azul */}
                    <g stroke="var(--color-tv-brand-blue)" strokeWidth="2.6" opacity="0.62">
                      <path d="M264 118 L264 130 M258 124 L270 124" />
                      <path d="M150 96 L150 106 M145 101 L155 101" />
                    </g>
                  </svg>
                </div>

                {/* 📅 selo calendário+relógio — "atendimento acontecendo
                    agora". Fica junto da ilustração, como no layout aprovado. */}
                <div
                  aria-hidden="true"
                  className="shrink-0 flex items-center justify-center"
                >
                  {/* o azul dominante do logo carrega o selo: é o elemento mais
                      "marca" da composição. O anel tracejado herda o mesmo hue
                      via currentColor em vez do cinza de borda. */}
                  <div className="relative flex items-center justify-center w-[clamp(84px,9vw,132px)] h-[clamp(84px,9vw,132px)] rounded-full bg-(--color-tv-brand-blue-soft) text-(--color-tv-brand-blue)">
                    <span className="absolute inset-[-10px] rounded-full border-2 border-dashed border-current opacity-40" />
                    <svg
                      viewBox="0 0 48 48"
                      fill="none"
                      className="w-[58%] h-[58%]"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="7" y="10" width="34" height="31" rx="5" />
                      <path d="M7 19 L41 19" />
                      <path d="M16 10 L16 5 M32 10 L32 5" />
                      <circle cx="24" cy="30" r="7.5" />
                      <path d="M24 26.5 L24 30 L27 32" />
                    </svg>
                  </div>
                </div>

                {/* 📝 bloco de texto — centro/direita */}
                <div className="min-w-0 flex-1 flex flex-col items-center text-center lg:pl-4">
                  {/* mesmo <p> e não <h1>: o h1 da página segue sendo o nome da
                      clínica. 52px é o teto de propósito — abaixo dos 96px do
                      nome, pra espera nunca competir com chamada. */}
                  <p className="text-[clamp(34px,4vw,64px)] font-extrabold leading-[1.02] text-tv-ink text-balance">
                    Atendimento
                    <br />
                    em andamento
                  </p>

                  {/* a régua é o único traço de marca no bloco de texto — dá o
                      aceno de cor sem tingir palavra nenhuma */}
                  <div className="mt-6 h-[3px] w-24 rounded-full bg-(--color-tv-brand-blue) opacity-60" />

                  <p className="mt-6 max-w-[22ch] text-[clamp(20px,1.8vw,32px)] font-medium leading-snug text-tv-ink-muted text-balance">
                    Chamaremos você quando for necessária uma autorização.
                  </p>

                  {/* pílula informativa: o pedido de ação concreto. Superfície
                      tingida no AZUL do logo, não no verde: verde-limão sobre
                      texto escuro lê como faixa de ADVERTÊNCIA, e isto é uma
                      instrução permanente e calma — além de roubar o olho do
                      título, que é quem deve liderar a tela. Azul é o hue
                      ambiente daqui, então a pílula assenta em vez de gritar.
                      O verde do logo fica onde é literal: a planta.

                      O texto NÃO acompanha a cor — fica em tv-ink e
                      tv-ink-muted, porque cinza claro sobre fundo tingido é
                      justamente o que não se lê a 4 m. O sino é dourado (a
                      pedido) e decorativo — aria-hidden, porque a frase ao lado
                      já diz tudo; o dourado não é cor de estado nesta tela. */}
                  <div className="mt-9 inline-flex items-center gap-4 rounded-full bg-(--color-tv-brand-blue-soft) border border-[color-mix(in_oklch,var(--color-tv-brand-blue)_35%,transparent)] px-7 py-4 text-left text-balance">
                    <Bell
                      aria-hidden="true"
                      className="shrink-0 w-[clamp(24px,2.2vw,38px)] h-[clamp(24px,2.2vw,38px)] text-(--color-tv-brand-gold)"
                      strokeWidth={2.1}
                    />
                    <span className="min-w-0">
                      <span className="block text-[clamp(17px,1.5vw,26px)] font-semibold text-tv-ink">
                        Por favor, permaneça na recepção.
                      </span>
                      <span className="block text-[clamp(15px,1.25vw,22px)] text-tv-ink-muted">
                        Você será chamado(a) quando necessário.
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* 🟡 HISTÓRICO */}
        <aside
          className="
        h-full
        rounded-[28px]
        bg-tv-panel
        border border-tv-border
        p-6
        flex flex-col
        min-h-0
      "
        >
          <h2 className="text-[clamp(16px,1.3vw,24px)] text-tv-ink font-semibold mb-6 flex items-center gap-2.5">
            <History className="w-[1.1em] h-[1.1em] text-tv-ink-muted" strokeWidth={2} />
            Últimas chamadas
          </h2>

          <div className="overflow-y-auto">
            {historico.length === 0 && (
              <p className="text-[clamp(15px,1.1vw,20px)] text-tv-ink-muted">
                Nenhuma chamada recente
              </p>
            )}

            {/* lista dividida, sem card dentro de card */}
            {historico.map((h, index) => (
              <LinhaChamada key={h.id} chamada={h} posicao={index + 1} />
            ))}
          </div>
        </aside>
      </div>

      {/* 🔻 RODAPÉ */}
      <footer className="h-[70px] flex items-center justify-between px-10 bg-tv-bar text-white">
        {/* 🔻 lockup — variante clara gerada a partir de pulsar-lockup-tv.png:
            o original é navy sobre transparente e desapareceria nesta barra
            escura. O recorte é justo (1134x462), então a altura manda. */}
        <img
          src="/pulsar-lockup-tv-light.png"
          alt="Pulsar — sinais que importam"
          className="h-[clamp(30px,4vh,46px)] w-auto object-contain"
        />

        <div className="flex items-center gap-6 text-[clamp(16px,1.2vw,22px)] text-tv-bar-muted">
          {/* sinal discreto: ninguém fica olhando o console de uma TV. Ícone +
              texto + cor: o ponto pulsante saiu, era movimento decorativo numa
              tela pública e a informação já estava nos outros dois canais */}
          {!online && (
            <span className="flex items-center gap-2 text-tv-warn">
              <WifiOff className="w-[1.15em] h-[1.15em]" strokeWidth={2} />
              Sem conexão
            </span>
          )}

          <Relogio />

          <span className="flex items-center gap-2 tabular-nums">
            {temperatura !== null ? `${temperatura}°C` : '--'}
            <IconeClima codigo={codigoClima} />
          </span>
        </div>
      </footer>
    </div>
  )
}
