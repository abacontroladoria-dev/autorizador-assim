// ficha-escolar //
'use client'

import { useEffect, useRef, useState } from 'react'
import { GraduationCap, Check, Search, Loader2 } from 'lucide-react'
import { PARENTESCOS } from '@/types/responsavel'

// Formulário que o RESPONSÁVEL preenche pelo link do WhatsApp — sem conta, num
// celular, provavelmente uma única vez na vida. Isso define tudo aqui:
//
//   - Um passo por vez. Achar o filho, confirmar quem é, preencher a escola. Uma
//     tela única com 12 campos faz o pai fechar antes de terminar.
//   - Nada de jargão do sistema. "Turma" e "Turno", não "vínculo" ou "registro".
//   - Só dois campos são obrigatórios (escola e quem preencheu). O resto o
//     responsável pode não saber de cabeça, e um asterisco a mais custa envios.
//
// A busca e o envio falam com /api/ficha-escolar/* — nunca com o Supabase direto,
// porque esta página roda sem sessão e a validação precisa ficar do lado do
// servidor. Ver os comentários naqueles dois handlers.

const BG = 'linear-gradient(160deg, #2163d5 0%, #0c3292 100%)'

// Espera antes de buscar, para não disparar uma requisição por tecla.
const DEBOUNCE_MS = 300

// Espelha MINIMO_CARACTERES do handler de busca. A tela precisa saber para
// explicar ao responsável por que nada aparece ainda.
const MINIMO_BUSCA = 3

const TURNOS = ['Manhã', 'Tarde', 'Integral'] as const

type PacienteEncontrado = { id: number; nome: string }

type Passo = 'buscar' | 'preencher' | 'enviado'

export default function FichaEscolarPage() {
  const [passo, setPasso] = useState<Passo>('buscar')

  // ===== Passo 1: achar o paciente =====
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [selecionado, setSelecionado] = useState<PacienteEncontrado | null>(null)
  const [dataNascimento, setDataNascimento] = useState('')

  // ===== Passo 2: os dados =====
  const [escolaNome, setEscolaNome] = useState('')
  const [escolaEndereco, setEscolaEndereco] = useState('')
  const [escolaTelefone, setEscolaTelefone] = useState('')
  const [escolaEmail, setEscolaEmail] = useState('')
  const [coordenadorNome, setCoordenadorNome] = useState('')
  const [turma, setTurma] = useState('')
  const [turno, setTurno] = useState('')
  const [porNome, setPorNome] = useState('')
  const [porParentesco, setPorParentesco] = useState('')
  const [porTelefone, setPorTelefone] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  // Guarda a busca mais recente: respostas fora de ordem (a de "ana" chegando
  // depois da de "ana clara") sobrescreveriam a lista certa pela antiga.
  const buscaAtual = useRef(0)

  useEffect(() => {
    const alvo = termo.trim()

    if (alvo.length < MINIMO_BUSCA) {
      setResultados([])
      setBuscando(false)
      return
    }

    setBuscando(true)
    const id = ++buscaAtual.current

    const timer = setTimeout(async () => {
      try {
        // Barra final: o projeto roda com trailingSlash, e sem ela o fetch toma
        // 308 antes de chegar ao handler.
        const resposta = await fetch(
          `/api/ficha-escolar/buscar-paciente/?nome=${encodeURIComponent(alvo)}`,
          { cache: 'no-store' }
        )
        const dados = await resposta.json().catch(() => null)

        if (id !== buscaAtual.current) return

        setResultados(resposta.ok && Array.isArray(dados?.pacientes) ? dados.pacientes : [])
      } catch {
        if (id === buscaAtual.current) setResultados([])
      } finally {
        if (id === buscaAtual.current) setBuscando(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [termo])

  function escolher(paciente: PacienteEncontrado) {
    setSelecionado(paciente)
    setErro('')
  }

  function voltarParaBusca() {
    setSelecionado(null)
    setDataNascimento('')
    setErro('')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()

    if (!selecionado) return

    setErro('')
    setEnviando(true)

    try {
      const resposta = await fetch('/api/ficha-escolar/enviar/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id: selecionado.id,
          data_nascimento: dataNascimento,
          escola_nome: escolaNome,
          escola_endereco: escolaEndereco,
          escola_telefone: escolaTelefone,
          escola_email: escolaEmail,
          coordenador_nome: coordenadorNome,
          turma,
          turno,
          preenchido_por_nome: porNome,
          preenchido_por_parentesco: porParentesco,
          preenchido_por_telefone: porTelefone,
        }),
      })

      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok) {
        setErro(dados?.error ?? 'Não foi possível enviar. Tente novamente.')
        setEnviando(false)
        return
      }

      setPasso('enviado')
    } catch {
      setErro('Sem conexão. Verifique a internet e tente novamente.')
      setEnviando(false)
    }
  }

  // ===== Confirmação =====
  if (passo === 'enviado') {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center px-5 py-12"
        style={{ background: BG }}
      >
        <div
          className="w-full max-w-sm bg-white text-center px-8 py-12"
          style={{ borderRadius: '26px', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: '#dcfce7' }}
          >
            <Check size={40} strokeWidth={2.5} style={{ color: '#15803d' }} />
          </div>
          <h1 className="font-bold tracking-tight mb-3" style={{ fontSize: '26px', color: '#192755' }}>
            Recebemos, obrigado!
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: '#64748b' }}>
            As informações da escola de {selecionado?.nome.split(' ')[0]} já estão com a
            equipe terapêutica. Pode fechar esta página.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-5 py-10" style={{ background: BG }}>
      <div className="w-full max-w-md mx-auto">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-col items-center gap-4 pb-8">
          {/* Logo da clínica, não o glifo do Pulsar: quem abre este link é o
              responsável, que reconhece a Universo ABA e nunca ouviu falar do
              nome do sistema interno. */}
          {/* A logo tem bastante espaço em branco embutido no PNG, então um
              padding generoso aqui a encolheria duas vezes. `p-1.5` só evita que
              ela encoste no canto arredondado. */}
          <div
            className="w-28 h-28 bg-white flex items-center justify-center p-1.5"
            style={{ borderRadius: '24px', boxShadow: '0 12px 32px rgba(0,0,0,0.22)' }}
          >
            <img
              src="/logo-universo-aba.png"
              alt="Universo ABA"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-center">
            <h1 className="text-[21px] font-bold text-white tracking-tight leading-tight">
              Clínica Universo ABA
            </h1>
            <p className="text-[15px] font-medium mt-1" style={{ color: 'rgba(255,255,255,0.72)' }}>
              Informações Escolares
            </p>
          </div>
        </div>

        <div
          className="bg-white overflow-hidden"
          style={{ borderRadius: '26px', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}
        >
          {/* ── Introdução ── */}
          <div className="px-7 pt-8 pb-2 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: '#dde8f9' }}
            >
              <GraduationCap size={30} strokeWidth={1.75} style={{ color: '#1a4fc4' }} />
            </div>
            <p
              className="text-[15px] leading-relaxed"
              style={{ color: '#64748b', textWrap: 'balance' } as React.CSSProperties}
            >
              Estas informações ajudam a equipe terapêutica a acompanhar o dia a dia
              escolar. Leva menos de dois minutos.
            </p>
          </div>

          {/* ── Passo 1: buscar o paciente ── */}
          {!selecionado && (
            <div className="px-7 pt-6 pb-8 space-y-4">
              <div>
                <label
                  htmlFor="busca-paciente"
                  className="block font-bold uppercase tracking-widest mb-2"
                  style={{ fontSize: '11px', color: '#64748b' }}
                >
                  Nome do paciente
                </label>
                <div className="relative">
                  <Search
                    size={18}
                    strokeWidth={2}
                    className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: '#94a3b8' }}
                    aria-hidden="true"
                  />
                  <input
                    id="busca-paciente"
                    type="text"
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    placeholder="Digite o nome da criança"
                    autoComplete="off"
                    className="w-full rounded-2xl pl-11 pr-11 py-4 text-[15px] focus:outline-none focus:border-[#1a4fc4] placeholder:text-slate-400"
                    style={{
                      background: '#eef3fc',
                      color: '#1e293b',
                      border: '1.5px solid transparent',
                    }}
                  />
                  {buscando && (
                    <Loader2
                      size={18}
                      className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin"
                      style={{ color: '#1a4fc4' }}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="text-[13px] mt-2" style={{ color: '#94a3b8' }}>
                  Digite pelo menos {MINIMO_BUSCA} letras do nome.
                </p>
              </div>

              <div aria-live="polite">
                {resultados.length > 0 && (
                  <ul className="space-y-2">
                    {resultados.map((paciente) => (
                      <li key={paciente.id}>
                        <button
                          type="button"
                          onClick={() => escolher(paciente)}
                          className="w-full text-left px-4 py-3.5 rounded-2xl text-[15px] font-medium transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fc4]"
                          style={{ background: '#f8fafc', color: '#1e293b' }}
                        >
                          {paciente.nome}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {!buscando && termo.trim().length >= MINIMO_BUSCA && resultados.length === 0 && (
                  <p className="text-[14px] px-1" style={{ color: '#64748b' }}>
                    Nenhum paciente encontrado com esse nome. Confira a grafia ou fale
                    com a recepção.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Passo 2: confirmar e preencher ── */}
          {selecionado && (
            <form onSubmit={enviar} className="px-7 pt-6 pb-8 space-y-6">

              {/* Paciente escolhido */}
              <div
                className="rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3"
                style={{ background: '#eef3fc' }}
              >
                <div className="min-w-0">
                  <p
                    className="font-bold uppercase tracking-widest"
                    style={{ fontSize: '10px', color: '#64748b' }}
                  >
                    Paciente
                  </p>
                  <p className="text-[15px] font-semibold truncate" style={{ color: '#192755' }}>
                    {selecionado.nome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={voltarParaBusca}
                  className="text-[13px] font-semibold shrink-0 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fc4] rounded"
                  style={{ color: '#1a4fc4' }}
                >
                  Trocar
                </button>
              </div>

              {/* Confirmação por data de nascimento. É o que amarra o envio a esta
                  criança — o link é o mesmo para todas as famílias. */}
              <Campo
                id="data-nascimento"
                rotulo="Data de nascimento do paciente"
                obrigatorio
                dica="Para confirmar que é a criança certa."
              >
                <input
                  id="data-nascimento"
                  type="date"
                  required
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                  className={ENTRADA}
                  style={ESTILO_ENTRADA}
                />
              </Campo>

              <Secao titulo="Escola">
                <Campo id="escola-nome" rotulo="Nome da escola" obrigatorio>
                  <input
                    id="escola-nome"
                    type="text"
                    required
                    maxLength={120}
                    value={escolaNome}
                    onChange={(e) => setEscolaNome(e.target.value)}
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>

                <Campo id="escola-endereco" rotulo="Endereço da escola">
                  <textarea
                    id="escola-endereco"
                    rows={2}
                    maxLength={300}
                    value={escolaEndereco}
                    onChange={(e) => setEscolaEndereco(e.target.value)}
                    placeholder="Rua, número, bairro"
                    className={`${ENTRADA} resize-none`}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>

                <Campo id="escola-telefone" rotulo="Telefone(s) da escola">
                  <input
                    id="escola-telefone"
                    type="tel"
                    inputMode="tel"
                    maxLength={120}
                    value={escolaTelefone}
                    onChange={(e) => setEscolaTelefone(e.target.value)}
                    placeholder="(21) 3333-3333"
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>

                <Campo id="escola-email" rotulo="E-mail da escola">
                  <input
                    id="escola-email"
                    type="email"
                    maxLength={120}
                    value={escolaEmail}
                    onChange={(e) => setEscolaEmail(e.target.value)}
                    placeholder="secretaria@escola.com.br"
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>
              </Secao>

              {/* "Pedagógico", não "Turma": o campo Turma vive dentro desta
                  seção, e repetir a palavra nos dois níveis confunde quem lê. */}
              <Secao titulo="Pedagógico">
                <Campo id="coordenador" rotulo="Coordenador(a)">
                  <input
                    id="coordenador"
                    type="text"
                    maxLength={120}
                    value={coordenadorNome}
                    onChange={(e) => setCoordenadorNome(e.target.value)}
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>

                <Campo id="turma" rotulo="Turma">
                  <input
                    id="turma"
                    type="text"
                    maxLength={120}
                    value={turma}
                    onChange={(e) => setTurma(e.target.value)}
                    placeholder="Ex.: 2º ano B"
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>

                <Campo id="turno" rotulo="Turno">
                  <select
                    id="turno"
                    value={turno}
                    onChange={(e) => setTurno(e.target.value)}
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  >
                    <option value="">Selecione</option>
                    {TURNOS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Campo>
              </Secao>

              <Secao titulo="Quem está preenchendo">
                <Campo id="por-nome" rotulo="Seu nome" obrigatorio>
                  <input
                    id="por-nome"
                    type="text"
                    required
                    maxLength={120}
                    value={porNome}
                    onChange={(e) => setPorNome(e.target.value)}
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>

                <Campo id="por-parentesco" rotulo="Parentesco com o paciente">
                  <select
                    id="por-parentesco"
                    value={porParentesco}
                    onChange={(e) => setPorParentesco(e.target.value)}
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  >
                    <option value="">Selecione</option>
                    {PARENTESCOS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Campo>

                <Campo id="por-telefone" rotulo="Seu telefone (WhatsApp)">
                  <input
                    id="por-telefone"
                    type="tel"
                    inputMode="tel"
                    maxLength={120}
                    value={porTelefone}
                    onChange={(e) => setPorTelefone(e.target.value)}
                    placeholder="(21) 99999-9999"
                    className={ENTRADA}
                    style={ESTILO_ENTRADA}
                  />
                </Campo>
              </Secao>

              {erro && (
                <div
                  role="alert"
                  className="text-sm px-4 py-3 rounded-2xl"
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}
                >
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="w-full font-bold text-white transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a4fc4] focus-visible:ring-offset-2 disabled:opacity-50 bg-[#1a3275] hover:bg-[#152a68] active:bg-[#111f52] active:scale-[0.97]"
                style={{ height: '56px', borderRadius: '16px', fontSize: '16px' }}
              >
                {enviando ? 'Enviando...' : 'Enviar informações'}
              </button>
            </form>
          )}
        </div>

        <p
          className="text-[13px] leading-snug text-center mt-6 px-4"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          As informações são usadas apenas pela equipe terapêutica da clínica.
        </p>
      </div>
    </main>
  )
}

// ===== Peças da tela =====
// Locais de propósito: components/ui/form.tsx é um stub vazio e o resto do
// projeto monta markup Tailwind à mão. Extrair para components/ só quando
// existir uma segunda tela pública precisando do mesmo.

const ENTRADA =
  'w-full rounded-2xl px-4 py-3.5 text-[15px] focus:outline-none focus:border-[#1a4fc4] placeholder:text-slate-400'

const ESTILO_ENTRADA: React.CSSProperties = {
  background: '#eef3fc',
  color: '#1e293b',
  border: '1.5px solid transparent',
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend
        className="font-bold uppercase tracking-widest pb-1"
        style={{ fontSize: '11px', color: '#1a4fc4' }}
      >
        {titulo}
      </legend>
      {children}
    </fieldset>
  )
}

function Campo({
  id,
  rotulo,
  obrigatorio,
  dica,
  children,
}: {
  id: string
  rotulo: string
  obrigatorio?: boolean
  dica?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-bold uppercase tracking-widest mb-2"
        style={{ fontSize: '11px', color: '#64748b' }}
      >
        {rotulo}
        {obrigatorio && <span style={{ color: '#b91c1c' }} aria-hidden="true"> *</span>}
      </label>
      {children}
      {dica && (
        <p className="text-[13px] mt-1.5" style={{ color: '#94a3b8' }}>
          {dica}
        </p>
      )}
    </div>
  )
}
