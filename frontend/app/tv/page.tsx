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
  // Neurais da Azure em pt-BR/pt-PT, expostas pelo Edge
  'brenda',
  'elza',
  'giovanna',
  'leila',
  'manuela',
  'yara',
  'raquel',
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
  // Neurais da Azure em pt-BR/pt-PT, expostas pelo Edge
  'donato',
  'fabio',
  'fábio',
  'humberto',
  'julio',
  'júlio',
  'nicolau',
  'valerio',
  'valério',
  'duarte',
  'male',
  'male1',
  'male2',
  'male3',
]

// O espeak-ng publica CADA variante como uma voz: no mini PC da recepção são 110
// em pt-BR e outras 110 em pt-PT. Boa parte é caricatura ou robô de brinquedo —
// nada que possa chamar o responsável de um paciente num saguão de clínica.
// Estas saem da lista antes de qualquer classificação. Substring basta aqui
// (`robosoft` pega Robosoft2..8, `klatt` pega klatt2..6, `whisper` pega também
// female_whisper) e nenhum destes tokens é pedaço de nome legítimo.
const VOZES_NOVIDADE = [
  'robosoft',
  'klatt',
  'whisper',
  'croak',
  'demonic',
  'universalrobot',
  'anikarobot',
  'half-life',
  'ricishaymax',
  'tweaky',
  'storm',
  'mr_serious',
  'fast_test',
  'grandpa',
  'grandma',
  'anxiousandy',
]

// Teto do que o seletor mostra. Não é sobre performance: é que rolar 220 itens
// com o dedo, numa TV que alguém toca uma vez por dia, não é escolher — é
// procurar. A lista já vem ordenada por `notaVoz`, então o corte descarta o
// pior, não o desconhecido.
const LIMITE_SELETOR = 8

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

  // Salto de tecnologia, não de gosto: "natural"/"neural" no nome marca as vozes
  // neurais (as da Azure expostas pelo Edge). O espeak-ng sintetiza por
  // formantes — tecnologia dos anos 80 — e nenhuma das 110 variantes dele soa
  // humana; trocar de variante só muda o timbre do robô. Sem este peso, uma
  // `male3` do espeak empata em 125 com o "Antonio (Natural)" e o desempate
  // vira a ordem de enumeração, ou seja, sorte.
  //
  // Ordem que os pesos produzem, e é deliberada: masculina natural (155) >
  // masculina sintética (125) > feminina natural (110) > feminina sintética
  // (80). Timbre continua pesando mais que naturalidade porque foi o pedido
  // explícito; a melhor voz do outro timbre segue no seletor via
  // `vozesDoSeletor`.
  if (/natural|neural/.test(nome)) nota += 30

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

  const uteis = unicas.filter(
    (v) => !VOZES_NOVIDADE.some((n) => v.name.toLowerCase().includes(n))
  )

  // O descarte só vale se sobrar alguém: numa máquina cujas únicas vozes em
  // português fossem as de brinquedo, calar a TV seria pior que falar feio.
  return (uteis.length > 0 ? uteis : unicas).sort((a, b) => notaVoz(b) - notaVoz(a))
}

const ehMasculina = (v: SpeechSynthesisVoice) =>
  temNome(v.name.toLowerCase(), VOZES_PT_MASCULINAS)

// Recorte que o seletor mostra, a partir da lista já ordenada.
function vozesDoSeletor(ordenadas: SpeechSynthesisVoice[]) {
  const topo = ordenadas.slice(0, LIMITE_SELETOR)

  // No mini PC da recepção o espeak-ng empata NOVE variantes masculinas no topo
  // da nota, e o corte de 8 engolia a única voz natural da máquina — a de rede
  // do Google, feminina. Quem achasse o timbre sintético do espeak ruim demais
  // para um saguão não teria como voltar, porque a alternativa não estaria na
  // tela. Preferir masculina é ordenar, não amputar: a melhor voz do outro
  // timbre sempre ganha um lugar.
  if (topo.length > 0 && topo.every(ehMasculina)) {
    const alternativa = ordenadas.find((v) => !ehMasculina(v))
    if (alternativa) topo.push(alternativa)
  }

  return topo
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
    // O espeak-ng nomeia "Portuguese (Brazil)+male1". O idioma já aparece na
    // própria linha do seletor, então repetir "Portuguese (Brazil)" em 110
    // linhas só empurra a parte que distingue uma voz da outra para fora do
    // `truncate`. Só corta havendo variante depois do `+` — a voz base fica
    // com o nome inteiro, senão sobraria rótulo vazio.
    .replace(/^portugu[eê]s[e]?\s*\([^)]*\)\s*\+/i, '')
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
  // DESTAQUE_MS mesmo sem chamada nova (efeito abaixo).
  const [destacadoId, setDestacadoId] = useState<string | null>(null)
  const primeiroId = chamadas[0]?.id ?? null

  useEffect(() => {
    if (!primeiroId) {
      setDestacadoId(null)
      return
    }

    setDestacadoId(primeiroId)

    const t = setTimeout(() => {
      // só limpa se ainda for este: uma chamada nova já reagendou o timer dela
      setDestacadoId((atual) => (atual === primeiroId ? null : atual))
    }, DESTAQUE_MS)

    return () => clearTimeout(t)
  }, [primeiroId])

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

  // A lista de vozes fica fechada por padrão — ver o comentário no diálogo:
  // aberta, ela desloca o botão que o toque sintético do quiosque precisa
  // acertar.
  const [mostrarVozes, setMostrarVozes] = useState(false)

  // Painel de voz do rodapé — a via de acesso depois que o modal de ativação já
  // foi dispensado pelo quiosque.
  const [painelVozAberto, setPainelVozAberto] = useState(false)

  // Precisa repetir a cadeia de fallback de `resolverVoz`: se destacasse
  // `vozEscolhida` cru, uma voz desinstalada apareceria marcada na tela
  // enquanto outra falava de verdade.
  const vozAtivaVoz =
    vozes.find((v) => v.voiceURI === vozEscolhida) ?? vozPadrao(vozes)

  const vozAtiva = vozAtivaVoz?.voiceURI ?? null

  const vozesVisiveis = useMemo(() => vozesDoSeletor(vozes), [vozes])

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

        if (primeiraCarga.current) {
          // Ao abrir/recarregar a TV o que já passou aparece na tela, mas não é
          // anunciado de novo.
          primeiraCarga.current = false
        } else if (novas.length > 0) {
          // A lista vem da mais recente pra mais antiga; falar na ordem em que
          // foram chamadas.
          for (const c of [...novas].reverse()) filaAudio.current.push(c)

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
  }, [processarFila])

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

  // O seletor precisou sair de dentro do modal de ativação. Ele vivia só ali,
  // e o quiosque dispensa esse modal em 20 segundos com um `xdotool key Return`
  // — então a única superfície onde dava pra escolher a voz durava 20s, uma vez
  // por boot. Pior: o Chrome inicializa o speech-dispatcher preguiçosamente, e
  // as vozes locais podem chegar (via `voiceschanged`) DEPOIS que o modal já
  // morreu; a lista atualizava e ninguém mais podia vê-la.
  //
  // Agora o mesmo bloco é renderizado nos dois lugares: no modal, para quem
  // estiver na frente da TV quando ela liga, e no painel do rodapé, alcançável
  // a qualquer momento.
  const blocoVozes =
    vozes.length === 0 ? null : (
      <div className="w-full max-w-[560px] flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium uppercase tracking-wide text-tv-ink-muted">
              Voz das chamadas
            </p>
            <p className="truncate text-base text-tv-ink">
              {vozAtivaVoz ? rotuloVoz(vozAtivaVoz) : '—'}
            </p>
          </div>

          {vozes.length > 1 && (
            <button
              type="button"
              onClick={() => setMostrarVozes((v) => !v)}
              aria-expanded={mostrarVozes}
              className="min-h-[48px] shrink-0 rounded-xl bg-tv-ground px-4 text-base text-tv-ink-muted transition hover:text-tv-ink hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tv-accent/40"
            >
              {mostrarVozes ? 'Fechar' : 'Trocar'}
            </button>
          )}
        </div>

        {/* rolável mesmo com o teto de LIMITE_SELETOR: em tela de 768px 38vh já
            corta o oitavo item, e o diálogo não pode passar da altura da tela */}
        {mostrarVozes && (
          <ul className="flex flex-col gap-2 max-h-[38vh] overflow-y-auto">
            {vozesVisiveis.map((v) => {
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
                    {/* o check some por opacidade, não por condicional: assim o
                        texto não dança de posição ao trocar */}
                    <Check
                      className={`w-5 h-5 shrink-0 ${ativa ? 'opacity-100' : 'opacity-0'}`}
                      strokeWidth={2.5}
                    />
                    <span className="truncate">{rotuloVoz(v)}</span>
                    {/* O "· natural" não é adorno: o espeak-ng publica uma
                        variante chamada Antonio e a Azure publica um Antonio
                        neural, e os dois viram o rótulo "Antonio" depois da
                        limpeza. Sem esta marca o seletor mostra duas linhas
                        idênticas, uma robótica e uma humana. */}
                    <span
                      className={`ml-auto shrink-0 text-xs ${
                        ativa ? 'text-white/70' : 'text-tv-ink-muted'
                      }`}
                    >
                      <span className="tabular-nums">{normalizarLang(v.lang)}</span>
                      {/natural|neural/i.test(v.name) && ' · natural'}
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
        )}

        {/* A contagem é diagnóstico, não enfeite: é ela que diz se o navegador
            está vendo as vozes locais da máquina ou só a voz de rede. Sem isso,
            "a TV fala com voz de mulher" e "o Chrome não conversa com o
            speech-dispatcher" são o mesmo sintoma, e a busca vai pro lugar
            errado. Aparece sempre que houver voz — inclusive com UMA, que é
            justamente o caso que revela o problema. */}
        <p className="text-xs text-tv-ink-muted">
          {vozes.length === 1
            ? '1 voz em português nesta máquina'
            : `${vozes.length} vozes em português nesta máquina` +
              (vozes.length > vozesVisiveis.length
                ? ` — mostrando as ${vozesVisiveis.length} melhores`
                : '')}
        </p>
      </div>
    )

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

            {blocoVozes}

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

      {/* 🔊 painel de voz — a via de acesso ao seletor depois que o quiosque já
          dispensou o modal de ativação. Some por completo quando fechado: numa
          tela de saguão, controle visível é convite pra criança mexer. */}
      {painelVozAberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-voz-titulo"
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <div className="bg-tv-card rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
            <h2 id="tv-voz-titulo" className="text-2xl font-semibold text-tv-ink">
              Voz das chamadas
            </h2>

            {blocoVozes ?? (
              <p className="max-w-[460px] text-center text-sm text-tv-ink-muted">
                Nenhuma voz em português nesta máquina.
              </p>
            )}

            <button
              onClick={() => setPainelVozAberto(false)}
              autoFocus
              className="mt-2 min-h-[56px] px-8 rounded-xl bg-tv-accent text-white text-lg font-medium hover:bg-tv-accent-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tv-accent/40 transition"
            >
              Concluir
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
              // Espera não pode gritar como chamada: antes "Aguardando
              // chamada..." ocupava o slot do nome em 96px extrabold, do mesmo
              // tamanho de um evento real.
              <p className="text-[clamp(28px,3vw,52px)] font-medium text-tv-ink-muted">
                Aguardando chamada
              </p>
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
          {/* Único controle da tela, e de propósito no canto mais discreto: a
              recepção não opera esta TV, mas quem a monta precisa alcançar a
              escolha de voz sem depender dos 20 segundos do modal de ativação.
              Só existe depois do áudio liberado — antes disso o próprio modal
              já mostra o seletor. */}
          {audioLiberado && vozes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMostrarVozes(vozes.length > 1)
                setPainelVozAberto(true)
              }}
              aria-label="Configurar a voz das chamadas"
              className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-tv-bar-muted transition hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-tv-accent/40"
            >
              <Volume2 className="w-[1.15em] h-[1.15em]" strokeWidth={2} />
            </button>
          )}

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
