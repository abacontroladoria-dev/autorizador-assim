// tv //

'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function TVPage() {
  const supabase = getSupabaseClient()

  const [atual, setAtual] = useState<any>(null)
  const [historico, setHistorico] = useState<any[]>([])
  const [hora, setHora] = useState('')
  const [temperatura, setTemperatura] = useState('--')
  const [iconeClima, setIconeClima] = useState('☀️')
  const [animando, setAnimando] = useState(false)
  const filaAudio = useRef<any[]>([])
  const falando = useRef(false)
  const [audioLiberado, setAudioLiberado] = useState(false)
  
  // ⏰ relógio
  const getIcone = (code: number) => {
    if (code === 0) return '☀️' // céu limpo
    if (code <= 3) return '⛅' // parcialmente nublado
    if (code <= 48) return '☁️' // nublado
    if (code <= 67) return '🌧️' // chuva
    if (code <= 77) return '❄️' // neve
    if (code <= 99) return '⛈️' // tempestade
  
    return '🌤️'
  }

// carregar voz
useEffect(() => {
  const carregarVozes = () => {
    const voices = speechSynthesis.getVoices()
    console.log('VOZES DISPONÍVEIS:', voices)
  }

  carregarVozes()

  speechSynthesis.onvoiceschanged = carregarVozes
}, [])

  // ⏰ relógio
  useEffect(() => {
    const interval = setInterval(() => {
      const agora = new Date()
      setHora(
        agora.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        })
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [])
	
	// AUDIO LIBERADO
useEffect(() => {
  if (audioLiberado) {
    processarFila()
  }
}, [audioLiberado])

  // 🔊 áudio + voz
const falar = (c: any) => {
  console.log('FALAR RECEBEU:', c)

  filaAudio.current.push(c)

console.log('FILA:', filaAudio.current)

  setTimeout(() => {
    processarFila()
  }, 100)
}

// VOZ FEMININA

const getVozFeminina = () => {
  const voices = speechSynthesis.getVoices()

  // tenta vozes femininas conhecidas
  const feminina = voices.find(v =>
    v.lang === 'pt-BR' &&
    (
      v.name.includes('Maria') ||
      v.name.includes('Helena') ||
      v.name.includes('Google') ||
      v.name.includes('Microsoft')
    )
  )

  return feminina || voices.find(v => v.lang === 'pt-BR') || voices[0]
}

// PROCESSAR A FILA

const processarFila = () => {
	console.log('ENTROU processarFila')
	
  if (falando.current || filaAudio.current.length === 0) return

  falando.current = true
  const c = filaAudio.current.shift()

  console.log('PROCESSANDO:', c)

  const nome = c?.nome || 'Paciente'
  const sala = c?.sala || 'recepção'

  const texto = `Responsável pelo paciente ${nome}. Dirija-se à ${sala}`

  const msg = new SpeechSynthesisUtterance(texto)
  msg.lang = 'pt-BR'
  msg.voice = getVozFeminina()
  msg.rate = 0.95
  msg.pitch = 1.1

  msg.onend = () => {
    falando.current = false
    processarFila()
  }

  // 🔔 toca beep (independente)
  const beep = new Audio('/beep.mp3')
  beep.play().catch(() => {})

  // ⏱ espera e fala
  setTimeout(() => {
    speechSynthesis.cancel()
    speechSynthesis.speak(msg)
  }, 400)
}

  // CLIMA
	useEffect(() => {
	  const buscarClima = async () => {
		try {
		  const res = await fetch(
			'https://api.open-meteo.com/v1/forecast?latitude=-22.90&longitude=-43.20&current_weather=true&timezone=America/Sao_Paulo'
		  )

		  const data = await res.json()

		  setTemperatura(Math.round(data.current_weather.temperature))
		  setIconeClima(getIcone(data.current_weather.weathercode))

		} catch (err) {
		  console.error('Erro ao buscar clima', err)
		}
	  }

	  buscarClima()

	  const interval = setInterval(buscarClima, 600000) // 10 min

	  return () => clearInterval(interval)
	}, [])

  // 🔴 realtime
  // chamada_paciente
useEffect(() => {
  const channel = supabase
    .channel('tv')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chamada_paciente'
      },
      (payload) => {
        const c = payload.new

        console.log('🔥 CHEGOU NA TV:', c) // 👈 DEBUG

        setAtual(c)
        setHistorico((prev) => [c, ...prev].slice(0, 5))

        setAnimando(true)
        setTimeout(() => setAnimando(false), 1500)

        falar(c)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [supabase])

		// 🔴 realtime
		// fila_autorizacoes

		useEffect(() => {
		  const channelUpdate = supabase
			.channel('fila_update')
			.on(
			  'postgres_changes',
			  {
				event: 'UPDATE',
				schema: 'public',
				table: 'fila_autorizacoes'
			  },
			  (payload) => {
				const atualizado = payload.new

				console.log('🔄 UPDATE FILA:', atualizado)

				if (atualizado.status === 'concluido') {
				  console.log('🟢 REMOVENDO CONCLUÍDO:', atualizado.id)

				  // remove do histórico
				  setHistorico((prev) =>
					prev.filter((h) => h.agenda_id !== atualizado.id)
				  )

				  // remove do card principal
				  setAtual((prev) =>
					prev?.agenda_id === atualizado.id ? null : prev
				  )
				}
			  }
			)
			.subscribe()

		  return () => {
			supabase.removeChannel(channelUpdate)
		  }
		}, [supabase])

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
			onClick={() => {
			  const utter = new SpeechSynthesisUtterance('Sistema de chamadas ativado')
			  utter.lang = 'pt-BR'

			  speechSynthesis.cancel() // 👈 ESSENCIAL
			  speechSynthesis.speak(utter)

			  falando.current = false
			  setAudioLiberado(true)
			}}
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
        <img src="/logo-universo-aba.png" className="h-12 object-contain" />

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
    <div className="grid grid-cols-[1fr_380px] gap-6 p-6 flex-1">

      {/* 🟢 CENTRO */}
      <div className="h-full flex items-center justify-center">

        <div
			className={`
			  w-full h-full rounded-[36px]
			  bg-[linear-gradient(135deg,#f8fafc,#e2e8f0)]
			  flex flex-col items-center justify-center text-center
			  border border-slate-200
			  shadow-[0_25px_70px_rgba(15,23,42,0.15)]
			  transition-all duration-500
			  ${animando ? 'scale-[1.03] shadow-[0_0_80px_rgba(59,130,246,0.35)]' : ''}
			`}
		>
          <p className="text-bold uppercase tracking-widest text-slate-400 mb-6">
            RESPONSÁVEL PELO PACIENTE
          </p>

          <h1 className="text-[96px] font-extrabold leading-[0.95] text-[#0f172a]">
            {atual?.nome || 'Aguardando chamada...'}
          </h1>

          <div className="mt-12 flex items-center gap-6 text-slate-500">
            <div className="h-[2px] w-32 bg-blue-500/50" />

            <span className="text-lg font-medium">
              Dirija-se à recepção {atual?.sala || '--'}
            </span>

            <div className="h-[2px] w-32 bg-blue-500/50" />
          </div>

        </div>

      </div>

      {/* 🟡 HISTÓRICO */}
      <div className="
        h-full
        rounded-[28px]
        bg-[#cbd5e1]
        p-6
        shadow-inner
        flex flex-col
      ">

        <h2 className="text-slate-700 font-semibold mb-6 flex items-center gap-2">
          ⏱ Últimas chamadas
        </h2>

        <div className="space-y-3 overflow-y-auto">

          {historico.length === 0 && (
            <p className="text-slate-600 text-sm">
              Nenhuma chamada recente
            </p>
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
        <span>{hora}</span>
        <span>{temperatura}°C {iconeClima}</span>
      </div>

    </div>

  </div>
)
}