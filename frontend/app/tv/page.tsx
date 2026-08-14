// tv //

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Chamada = {
  id: string
  nome: string
  sala: string | null
  agenda_id: string | null
  chamado_em: string
}

// A tela não usa o client do Supabase de propósito: /tv roda sem conta logada e a
// RLS de chamada_paciente só responde a `authenticated` — o realtime como anon
// nunca entregava nada. Quem lê é /api/tv/chamadas, no servidor. 3s é imperceptível
// numa sala de espera e o poll dá de graça o estado inicial ao (re)abrir a TV.
const POLL_CHAMADAS_MS = 3000
const POLL_CLIMA_MS = 600000

// Chrome às vezes engole o `onend` da fala numa aba aberta há horas; sem isso a
// fila travaria em `falando = true` e a TV ficaria muda pelo resto do dia.
const WATCHDOG_FALA_MS = 15000

export default function TVPage() {
  const [chamadas, setChamadas] = useState<Chamada[]>([])
  const [hora, setHora] = useState('')
  const [temperatura, setTemperatura] = useState<number | null>(null)
  const [iconeClima, setIconeClima] = useState('🌤️')
  const [animando, setAnimando] = useState(false)
  const [audioLiberado, setAudioLiberado] = useState(false)
  const [online, setOnline] = useState(true)

  const atual = chamadas[0] ?? null
  const historico = chamadas.slice(1)

  const filaAudio = useRef<Chamada[]>([])
  const falando = useRef(false)
  const anunciados = useRef<Set<string>>(new Set())
  const primeiraCarga = useRef(true)
  const audioLiberadoRef = useRef(false)

  const getIcone = (code: number | null): string => {
    if (code === null) return '🌤️'
    if (code === 0) return '☀️' // céu limpo
    if (code <= 3) return '⛅' // parcialmente nublado
    if (code <= 48) return '☁️' // nublado
    if (code <= 67) return '🌧️' // chuva
    if (code <= 77) return '❄️' // neve
    if (code <= 99) return '⛈️' // tempestade

    return '🌤️'
  }

  // VOZ FEMININA
  const getVozFeminina = () => {
    const voices = window.speechSynthesis.getVoices()

    const feminina = voices.find(
      (v) =>
        v.lang === 'pt-BR' &&
        (v.name.includes('Maria') ||
          v.name.includes('Helena') ||
          v.name.includes('Google') ||
          v.name.includes('Microsoft'))
    )

    return feminina || voices.find((v) => v.lang === 'pt-BR') || voices[0]
  }

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

    const nome = c.nome || 'Paciente'
    const sala = c.sala || 'recepção'
    const msg = new SpeechSynthesisUtterance(
      `Responsável pelo paciente ${nome}. Dirija-se à ${sala}`
    )

    msg.lang = 'pt-BR'
    msg.rate = 0.95
    msg.pitch = 1.1

    const voz = getVozFeminina()
    if (voz) msg.voice = voz

    let encerrada = false
    const liberar = () => {
      if (encerrada) return
      encerrada = true
      clearTimeout(watchdog)
      falando.current = false
      processarFila()
    }

    msg.onend = liberar
    msg.onerror = liberar

    const watchdog = setTimeout(liberar, WATCHDOG_FALA_MS)

    // 🔔 beep antes da fala (independente: se falhar, a fala segue)
    const beep = new Audio('/beep.mp3')
    beep.play().catch(() => {})

    setTimeout(() => {
      window.speechSynthesis.speak(msg)
    }, 400)
  }, [])

  // carregar voz — no Chrome getVoices() só popula depois deste evento
  useEffect(() => {
    if (!('speechSynthesis' in window)) return

    const carregarVozes = () => window.speechSynthesis.getVoices()

    carregarVozes()
    window.speechSynthesis.addEventListener('voiceschanged', carregarVozes)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', carregarVozes)
    }
  }, [])

  // ⏰ relógio
  useEffect(() => {
    const atualizar = () => {
      setHora(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      )
    }

    atualizar()

    const interval = setInterval(atualizar, 1000)

    return () => clearInterval(interval)
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
        setChamadas(lista)

        const novas = lista.filter((c) => !anunciados.current.has(c.id))
        for (const c of lista) anunciados.current.add(c.id)

        if (primeiraCarga.current) {
          // Ao abrir/recarregar a TV o que já passou aparece na tela, mas não é
          // anunciado de novo.
          primeiraCarga.current = false
        } else if (novas.length > 0) {
          setAnimando(true)
          setTimeout(() => {
            if (vivo) setAnimando(false)
          }, 1500)

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
        setIconeClima(getIcone(typeof data?.codigo === 'number' ? data.codigo : null))
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

      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    }

    setAudioLiberado(true)
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-[#e2e8f0] text-[#0f172a] overflow-hidden">
      {!audioLiberado && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
            <div className="text-4xl">🔊</div>

            <h2 className="text-xl font-semibold text-slate-800">
              Ativar áudio do sistema
            </h2>

            <p className="text-sm text-slate-500 text-center">
              Toque na tela para ativar as chamadas sonoras
            </p>

            <button
              onClick={liberarAudio}
              className="mt-2 px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
            >
              Ativar som
            </button>
          </div>
        </div>
      )}

      {/* 🔷 HEADER */}
      <div className="h-[90px] flex items-center justify-between px-10 bg-[#334155]">
        <div className="flex items-center gap-4">
          <img
            src="/logo-universo-aba.png"
            alt="Universo ABA"
            className="h-12 object-contain"
          />

          <div className="flex flex-col leading-tight">
            <span className="text-xs tracking-widest text-white/40">
              SISTEMA DE CHAMADA
            </span>

            <h1 className="text-xl font-semibold tracking-wide text-white">
              CLÍNICA UNIVERSO ABA
            </h1>
          </div>
        </div>

        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
          N
        </div>
      </div>

      {/* 🧠 CONTEÚDO */}
      <div className="grid grid-cols-[1fr_380px] gap-6 p-6 flex-1 min-h-0">
        {/* 🟢 CENTRO */}
        <div className="h-full flex items-center justify-center min-w-0">
          <div
            className={`
			  w-full h-full rounded-[36px]
			  bg-[linear-gradient(135deg,#f8fafc,#e2e8f0)]
			  flex flex-col items-center justify-center text-center
			  px-10
			  border border-slate-200
			  shadow-[0_25px_70px_rgba(15,23,42,0.15)]
			  transition-all duration-500
			  ${animando ? 'scale-[1.03] shadow-[0_0_80px_rgba(59,130,246,0.35)]' : ''}
			`}
          >
            <p className="text-bold uppercase tracking-widest text-slate-400 mb-6">
              RESPONSÁVEL PELO PACIENTE
            </p>

            {/* clamp: nome comprido não pode estourar a tela da recepção */}
            <h1 className="text-[clamp(44px,6.5vw,96px)] font-extrabold leading-[0.95] text-[#0f172a] text-balance break-words max-w-full">
              {atual?.nome || 'Aguardando chamada...'}
            </h1>

            {atual && (
              <div className="mt-12 flex items-center gap-6 text-slate-500">
                <div className="h-[2px] w-32 bg-blue-500/50" />

                <span className="text-lg font-medium">
                  Dirija-se à {atual.sala || 'recepção'}
                </span>

                <div className="h-[2px] w-32 bg-blue-500/50" />
              </div>
            )}
          </div>
        </div>

        {/* 🟡 HISTÓRICO */}
        <div
          className="
        h-full
        rounded-[28px]
        bg-[#cbd5e1]
        p-6
        shadow-inner
        flex flex-col
        min-h-0
      "
        >
          <h2 className="text-slate-700 font-semibold mb-6 flex items-center gap-2">
            ⏱ Últimas chamadas
          </h2>

          <div className="space-y-3 overflow-y-auto">
            {historico.length === 0 && (
              <p className="text-slate-600 text-sm">Nenhuma chamada recente</p>
            )}

            {historico.map((h, index) => (
              <div
                key={h.id}
                className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
                    {index + 1}
                  </div>

                  <span className="font-medium text-slate-700 truncate max-w-[160px]">
                    {h.nome}
                  </span>
                </div>

                <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold">
                  {h.sala}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 🔻 RODAPÉ */}
      <div className="h-[70px] flex items-center justify-between px-10 bg-[#334155] text-white">
        {/* 🔻 icone */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shadow-inner">
            <img
              src="/autism.png"
              alt="Símbolo do autismo"
              className="w-5 h-5 object-contain"
            />
          </div>

          {/* 🔻 frase */}
          <span className="text-sm text-white/70">
            Cuidar de você é a nossa missão.
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm text-white/80">
          {/* sinal discreto: ninguém fica olhando o console de uma TV */}
          {!online && (
            <span className="flex items-center gap-2 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
              Sem conexão
            </span>
          )}

          <span>{hora}</span>

          <span>
            {temperatura !== null ? `${temperatura}°C` : '--'} {iconeClima}
          </span>
        </div>
      </div>
    </div>
  )
}
