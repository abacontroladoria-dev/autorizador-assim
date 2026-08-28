#!/usr/bin/env node
// Enriquece o cadastro de pacientes com o relatório "Situação do Favorecido"
// exportado do TiTa: endereço, CPF, nascimento, observações, situação, dados do
// familiar responsável e carteirinha do plano.
//
//   node scripts/importar-favorecidos-tita.js <arquivo.csv>            # simulação
//   node scripts/importar-favorecidos-tita.js <arquivo.csv> --aplicar  # escreve
//
// SIMULAÇÃO É O PADRÃO. Sem --aplicar nada é escrito: o script lê tudo, faz o
// casamento, aplica as normalizações e imprime exatamente o que MUDARIA, com a
// contagem por campo. Rode assim primeiro, sempre, e leia o relatório antes.
//
// ─── O QUE ELE NÃO FAZ, DE PROPÓSITO ─────────────────────────────────────────
//
// 1. NÃO CRIA PACIENTE. Só enriquece quem já existe em public.pacientes,
//    casando por tita_paciente_id = "Id Favorecido". Na conferência de
//    2026-08-26 o CSV tinha 577 favorecidos e a base 372 — os 205 restantes são
//    inativos que nunca migraram. Trazê-los ampliaria a base de titulares sem
//    finalidade definida, que é exatamente o que a LGPD manda evitar
//    (minimização, art. 6º III). Eles são LISTADOS no relatório, não inseridos.
//    Se algum dia forem necessários, isso é decisão de negócio, com script
//    próprio.
//
// 2. NÃO SOBRESCREVE DADO PREENCHIDO. Todo campo só é gravado se estiver vazio
//    no banco. O que a recepção corrigiu na tela vale mais que o export do
//    TiTa: aqui a origem é preenchimento de lacuna, não fonte da verdade.
//
// 3. NÃO CRIA CONVÊNIO NEM PLANO DE SAÚDE. O CSV traz 15 nomes de plano em
//    grafia livre ("BRADESCO SAÚDE S.A", "LEVE SAUDE"). Casar isso com
//    public.planos_saude por aproximação é como se inventa vínculo errado de
//    faturamento. Os que casam por nome normalizado são usados; os que não
//    casam entram no relatório para cadastro manual.
//
// ─── LGPD ─────────────────────────────────────────────────────────────────────
//
// Mesmo controlador, mesma finalidade, dado que já estava sob guarda da clínica
// no TiTa: mover entre sistemas próprios não exige novo consentimento (art. 7º
// V e art. 11 II "f"). O risco aqui é operacional, e é por isso que:
//   - o segredo vem do ambiente/frontend/.env.local, nunca do código;
//   - o CSV NÃO pode ser versionado (este repositório é PÚBLICO — veja a linha
//     `*.csv` no .gitignore) e deve ser apagado do disco depois;
//   - toda escrita entra em public.cadastros_auditoria com motivo explícito, de
//     modo que a origem de cada campo fique demonstrável depois;
//   - o relatório impresso mostra CONTAGEM por campo, não o conteúdo das
//     linhas — para o terminal e os logs não virarem mais uma cópia da base.
//
// Node puro, sem dependências — mesmo padrão de scripts/conferir-grade-vs-tita.js.

const fs = require("fs")
const { lerEnv, descreverDestino } = require("./lib/backup-grade")

const MOTIVO_AUDITORIA = "Importação do relatório Situação do Favorecido (TiTa)"
const LOTE = 200

// ─── CSV ──────────────────────────────────────────────────────────────────────

// Parser com aspas: o relatório traz vírgula dentro de campo ("Silva, Maria") e
// aspas escapadas por duplicação, então split(",") não serve.
function parsearCSV(texto) {
  const linhas = []
  let campo = ""
  let linha = []
  let entreAspas = false
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0 // BOM do export

  for (; i < texto.length; i++) {
    const c = texto[i]
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else { entreAspas = false }
      } else campo += c
    } else if (c === '"') entreAspas = true
    else if (c === ",") { linha.push(campo); campo = "" }
    else if (c === "\n") { linha.push(campo); campo = ""; linhas.push(linha); linha = [] }
    else if (c !== "\r") campo += c
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha) }

  const cabecalho = linhas.shift()
  if (!cabecalho) throw new Error("CSV vazio")
  return linhas.filter(l => l.length > 1).map(l => {
    const o = {}
    cabecalho.forEach((h, k) => { o[h] = l[k] })
    return o
  })
}

// ─── NORMALIZAÇÃO ─────────────────────────────────────────────────────────────

const vazio = v => v === null || v === undefined || String(v).trim() === ""

/** Texto aproveitável, ou null. Colapsa espaço e devolve null para "", "-", "N/A". */
function texto(v) {
  if (vazio(v)) return null
  const t = String(v).replace(/\s+/g, " ").trim()
  if (/^(-+|n\/?a|nao informado|não informado)$/i.test(t)) return null
  return t
}

const digitos = v => (vazio(v) ? null : String(v).replace(/\D/g, "") || null)

function cpf(v) {
  const d = digitos(v)
  // 11 dígitos e não-repetido. CPF inválido no export é lixo conhecido; entra
  // como não-preenchido em vez de contaminar a base.
  if (!d || d.length !== 11 || /^(\d)\1{10}$/.test(d)) return null
  return d
}

function cep(v) {
  const d = digitos(v)
  return d && d.length === 8 ? d : null
}

/** Celular/telefone brasileiro com DDD (10 ou 11 dígitos). */
function telefone(v) {
  let d = digitos(v)
  if (!d) return null
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2) // +55 no export
  return d.length === 10 || d.length === 11 ? d : null
}

function email(v) {
  const t = texto(v)
  if (!t) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t.toLowerCase() : null
}

const UFS = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"])
const POR_EXTENSO = {
  "rio de janeiro": "RJ", "sao paulo": "SP", "minas gerais": "MG",
  "espirito santo": "ES", "bahia": "BA", "parana": "PR",
}

function uf(v) {
  const t = texto(v)
  if (!t) return null
  const sigla = t.toUpperCase()
  if (UFS.has(sigla)) return sigla
  return POR_EXTENSO[semAcento(t).toLowerCase()] ?? null
}

// U+0300..U+036F = os diacríticos que o NFD separa da letra. Escapados, e não
// digitados literalmente, para o arquivo sobreviver a qualquer editor.
const semAcento = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

/**
 * Data do export -> ISO. Aceita DD/MM/AAAA e AAAA-MM-DD.
 *
 * Corta a hora antes de converter, e NUNCA passa por `new Date(...)`: parsear
 * "2020-03-15" como Date o trata como UTC meia-noite, e em America/Sao_Paulo
 * isso vira dia 14. Data de nascimento errada em um dia é o tipo de bug que
 * ninguém vê até bater com o documento.
 */
function dataISO(v) {
  const t = texto(v)
  if (!t) return null
  const so = t.split(" ")[0]
  let m = so.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = so.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return so
  return null
}

/**
 * Nome com caractere perdido no export (U+FFFD, o "�" do losango).
 *
 * O export conferido em 2026-08-26 estava LIMPO: UTF-8 válido, zero U+FFFD nos
 * bytes crus, "Ângelo" e "Ângela" íntegros. Esta guarda continua aqui porque o
 * dia em que um export sair quebrado ela é a diferença entre recusar o nome e
 * gravar um losango no meio do cadastro — e o byte original, quando se perde no
 * export, não volta por código. Nome assim fica de fora e vai para o relatório,
 * para correção manual.
 */
const temCaractereQuebrado = s => typeof s === "string" && s.includes("�")

/**
 * Parentesco do export -> `tipo` do vínculo + rótulo legível.
 *
 * O export traz MAE/PAI/AVO/TIO/OUTROS em caixa alta e sem acento, e OUTROS é
 * MAIORIA (276 de 577 na conferência). Mapear OUTROS para "filiação" seria
 * inventar um parentesco que o dado não afirma: ele vira vínculo `filiacao_1`
 * (o slot de contato principal, que é o papel que essa pessoa exerce de fato)
 * com `parentesco` nulo, deixando explícito que o grau é desconhecido.
 */
const PARENTESCO = {
  MAE: "Mãe", PAI: "Pai", AVO: "Avó/Avô", AVÓ: "Avó/Avô",
  TIO: "Tio/Tia", TIA: "Tio/Tia", IRMAO: "Irmão/Irmã",
}

function parentesco(v) {
  const t = texto(v)
  if (!t) return null
  return PARENTESCO[semAcento(t).toUpperCase()] ?? null
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

let ENV = null

async function api(caminho, opcoes = {}) {
  const r = await fetch(`${ENV.url}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: ENV.key,
      Authorization: `Bearer ${ENV.key}`,
      "Content-Type": "application/json",
      ...(opcoes.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`${opcoes.method ?? "GET"} ${caminho} -> ${r.status} ${await r.text()}`)
  const corpo = await r.text()
  return corpo ? JSON.parse(corpo) : null
}

async function selecionarTudo(caminho) {
  const saida = []
  const passo = 1000
  for (let de = 0; ; de += passo) {
    const pagina = await api(`${caminho}${caminho.includes("?") ? "&" : "?"}limit=${passo}&offset=${de}`)
    saida.push(...pagina)
    if (pagina.length < passo) return saida
  }
}

// ─── RELATÓRIO ────────────────────────────────────────────────────────────────

/** Conta MUDANÇAS por campo, nunca valores: o log não pode virar cópia da base. */
function contador() {
  const mapa = new Map()
  return {
    marcar: campo => mapa.set(campo, (mapa.get(campo) ?? 0) + 1),
    imprimir: titulo => {
      if (mapa.size === 0) { console.log(`  ${titulo}: nada a preencher`); return }
      console.log(`  ${titulo}:`)
      for (const [campo, n] of [...mapa].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${String(n).padStart(5)}  ${campo}`)
      }
    },
  }
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes("--aplicar")
  const arquivo = args.find(a => !a.startsWith("--"))

  if (!arquivo) {
    console.error("Uso: node scripts/importar-favorecidos-tita.js <arquivo.csv> [--aplicar]")
    process.exit(1)
  }
  if (!fs.existsSync(arquivo)) {
    console.error(`Arquivo não encontrado: ${arquivo}`)
    process.exit(1)
  }

  ENV = lerEnv()
  console.log(`Destino: ${descreverDestino(ENV)}`)
  console.log(aplicar
    ? "MODO: APLICAR — as escritas abaixo serão gravadas.\n"
    : "MODO: SIMULAÇÃO — nada será escrito. Use --aplicar depois de conferir.\n")

  const linhas = parsearCSV(fs.readFileSync(arquivo, "utf8"))
  console.log(`CSV: ${linhas.length} favorecidos`)

  const pacientes = await selecionarTudo(
    "pacientes?select=id_paciente,tita_paciente_id,nome,cpf,data_nascimento,observacoes," +
    "cep,logradouro,numero,complemento,bairro,cidade,uf,ativo"
  )
  const porTita = new Map(pacientes.filter(p => p.tita_paciente_id).map(p => [p.tita_paciente_id, p]))
  console.log(`Base: ${pacientes.length} pacientes (${porTita.size} com id do TiTa)\n`)

  // ─── Casamento ──────────────────────────────────────────────────────────────
  const casados = []
  const foraDaBase = []
  const semId = []

  for (const l of linhas) {
    const idTita = Number(digitos(l["Id Favorecido"]))
    if (!idTita) { semId.push(l); continue }
    const paciente = porTita.get(idTita)
    if (!paciente) { foraDaBase.push(idTita); continue }
    casados.push({ linha: l, paciente })
  }

  console.log("── Casamento por Id Favorecido ──")
  console.log(`  ${casados.length} casam com paciente da base (serão enriquecidos)`)
  console.log(`  ${foraDaBase.length} existem só no CSV — IGNORADOS de propósito (minimização; ver cabeçalho)`)
  if (semId.length) console.log(`  ${semId.length} sem Id Favorecido legível — ignorados`)
  console.log()

  const nomesQuebrados = linhas.filter(l =>
    temCaractereQuebrado(l["Favorecido"]) || temCaractereQuebrado(l["Nome do Familiar"]))
  if (nomesQuebrados.length) {
    console.log(`⚠  ${nomesQuebrados.length} nome(s) com caractere perdido no export (�).`)
    console.log("   O byte original não existe mais no arquivo — não dá para recuperar por código.")
    console.log("   Esses nomes NÃO serão gravados. Ids do TiTa para correção manual:")
    console.log(`   ${nomesQuebrados.map(l => digitos(l["Id Favorecido"])).join(", ")}\n`)
  }

  // ─── 1. Pacientes ───────────────────────────────────────────────────────────
  console.log("── 1. Pacientes (só campos VAZIOS na base) ──")
  const cPac = contador()
  const updatesPaciente = []

  for (const { linha, paciente } of casados) {
    const candidatos = {
      cpf: cpf(linha["CPF Favorecido"]),
      data_nascimento: dataISO(linha["Data de Nascimento"]),
      observacoes: texto(linha["Observações do Favorecido"]),
      cep: cep(linha["CEP"]),
      logradouro: texto(linha["Endereço do Favorecido"]),
      numero: texto(linha["Número do Endereço"]),
      complemento: texto(linha["Complemento"]),
      bairro: texto(linha["Bairro"]),
      cidade: texto(linha["Cidade"]),
      uf: uf(linha["Estado"]),
    }

    const mudancas = {}
    for (const [campo, valor] of Object.entries(candidatos)) {
      if (valor !== null && vazio(paciente[campo])) { mudancas[campo] = valor; cPac.marcar(campo) }
    }

    if (Object.keys(mudancas).length) {
      updatesPaciente.push({ paciente, mudancas })
    }
  }

  cPac.imprimir(`${updatesPaciente.length} pacientes com algo a preencher`)
  console.log()

  // ─── 2. Responsáveis ────────────────────────────────────────────────────────
  // Só cria vínculo para paciente que ainda NÃO tem filiacao_1: o slot é único
  // por (paciente, tipo), e sobrescrever quem a recepção cadastrou seria trocar
  // dado curado por export.
  console.log("── 2. Responsáveis (só para paciente sem filiação principal) ──")
  const vinculos = await selecionarTudo("pacientes_responsaveis?select=paciente_id,tipo")
  const jaTemFiliacao = new Set(vinculos.filter(v => v.tipo === "filiacao_1").map(v => v.paciente_id))

  const novosResponsaveis = []
  let semNomeDeFamiliar = 0

  for (const { linha, paciente } of casados) {
    if (jaTemFiliacao.has(paciente.id_paciente)) continue

    const nome = texto(linha["Nome do Familiar"])
    if (!nome || temCaractereQuebrado(nome)) { semNomeDeFamiliar++; continue }

    novosResponsaveis.push({
      paciente,
      responsavel: {
        nome,
        celular: telefone(linha["Telefone do Familiar"]),
        email: email(linha["E-mail do Familiar"]),
      },
      parentesco: parentesco(linha["Parentesco do Familiar"]),
    })
  }

  const comCelular = novosResponsaveis.filter(r => r.responsavel.celular).length
  const comEmail = novosResponsaveis.filter(r => r.responsavel.email).length
  const comParentesco = novosResponsaveis.filter(r => r.parentesco).length
  console.log(`  ${novosResponsaveis.length} responsáveis a criar e vincular como filiacao_1`)
  console.log(`    ${comCelular} com celular válido`)
  console.log(`    ${comEmail} com e-mail válido`)
  console.log(`    ${comParentesco} com grau de parentesco conhecido (o resto vem como OUTROS no export)`)
  console.log(`  ${jaTemFiliacao.size} pacientes já tinham filiação — intocados`)
  if (semNomeDeFamiliar) console.log(`  ${semNomeDeFamiliar} linhas sem nome de familiar aproveitável`)
  console.log()

  // ─── 3. Ficha médica / carteirinha ──────────────────────────────────────────
  console.log("── 3. Carteirinha do plano ──")
  const planos = await selecionarTudo("planos_saude?select=id,nome,convenio_id&ativo=is.true")
  const planoPorNome = new Map(planos.map(p => [semAcento(p.nome).toUpperCase().replace(/\s+/g, " ").trim(), p.id]))

  const fichas = await selecionarTudo("pacientes_ficha_medica?select=paciente_id,plano_saude_id,numero_carteirinha")
  const fichaPorPaciente = new Map(fichas.map(f => [f.paciente_id, f]))

  const updatesFicha = []
  const planosNaoEncontrados = new Map()

  for (const { linha, paciente } of casados) {
    const carteirinha = texto(linha["Número da Carteirinha"])
    const nomePlano = texto(linha["Plano de Saúde"])
    const ficha = fichaPorPaciente.get(paciente.id_paciente)

    const mudancas = {}
    if (carteirinha && vazio(ficha?.numero_carteirinha)) mudancas.numero_carteirinha = carteirinha

    if (nomePlano) {
      const chave = semAcento(nomePlano).toUpperCase().replace(/\s+/g, " ").trim()
      const planoId = planoPorNome.get(chave)
      if (planoId) {
        if (vazio(ficha?.plano_saude_id)) mudancas.plano_saude_id = planoId
      } else {
        planosNaoEncontrados.set(nomePlano, (planosNaoEncontrados.get(nomePlano) ?? 0) + 1)
      }
    }

    if (Object.keys(mudancas).length) {
      updatesFicha.push({ paciente, mudancas, existe: Boolean(ficha) })
    }
  }

  console.log(`  ${updatesFicha.length} fichas a preencher`)
  console.log(`    ${updatesFicha.filter(u => u.mudancas.numero_carteirinha).length} ganham carteirinha`)
  console.log(`    ${updatesFicha.filter(u => u.mudancas.plano_saude_id).length} ganham vínculo de plano`)
  if (planosNaoEncontrados.size) {
    console.log(`  ⚠  ${planosNaoEncontrados.size} nomes de plano do CSV sem correspondente em planos_saude.`)
    console.log("     NÃO são criados por este script — cadastre em /cadastros/convenios e rode de novo:")
    for (const [nome, n] of [...planosNaoEncontrados].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(4)}x  ${nome}`)
    }
  }
  console.log()

  // ─── Escrita ────────────────────────────────────────────────────────────────
  if (!aplicar) {
    console.log("Simulação concluída. Nada foi escrito.")
    console.log("Confira o relatório acima e, se estiver de acordo, rode de novo com --aplicar.")
    return
  }

  console.log("── Aplicando ──")

  const auditoria = []
  const carimbo = (tabela, registroId, pacienteId, pacienteNome, antes, depois, resumo) => ({
    tabela, registro_id: String(registroId), acao: antes ? "editar" : "criar",
    paciente_id: pacienteId, paciente_nome: pacienteNome,
    antes, depois, resumo, motivo: MOTIVO_AUDITORIA,
  })

  let n = 0
  for (const { paciente, mudancas } of updatesPaciente) {
    await api(`pacientes?id_paciente=eq.${paciente.id_paciente}`, {
      method: "PATCH", body: JSON.stringify(mudancas),
    })
    const antes = Object.fromEntries(Object.keys(mudancas).map(c => [c, paciente[c] ?? null]))
    auditoria.push(carimbo("paciente", paciente.id_paciente, paciente.id_paciente, paciente.nome,
      antes, mudancas, `Importação TiTa preencheu: ${Object.keys(mudancas).join(", ")}.`))
    if (++n % 50 === 0) console.log(`  pacientes: ${n}/${updatesPaciente.length}`)
  }
  console.log(`  pacientes atualizados: ${n}`)

  n = 0
  for (const { paciente, responsavel, parentesco: grau } of novosResponsaveis) {
    const [criado] = await api("responsaveis", {
      method: "POST", body: JSON.stringify(responsavel),
      headers: { Prefer: "return=representation" },
    })
    await api("pacientes_responsaveis", {
      method: "POST",
      body: JSON.stringify({
        paciente_id: paciente.id_paciente,
        responsavel_id: criado.id,
        tipo: "filiacao_1",
        parentesco: grau,
      }),
    })
    auditoria.push(carimbo("responsavel", criado.id, paciente.id_paciente, paciente.nome,
      null, responsavel, `Responsável importado do TiTa e vinculado como filiação principal.`))
    if (++n % 50 === 0) console.log(`  responsáveis: ${n}/${novosResponsaveis.length}`)
  }
  console.log(`  responsáveis criados: ${n}`)

  n = 0
  for (const { paciente, mudancas, existe } of updatesFicha) {
    if (existe) {
      await api(`pacientes_ficha_medica?paciente_id=eq.${paciente.id_paciente}`, {
        method: "PATCH", body: JSON.stringify(mudancas),
      })
    } else {
      await api("pacientes_ficha_medica", {
        method: "POST",
        body: JSON.stringify({ paciente_id: paciente.id_paciente, ...mudancas }),
      })
    }
    auditoria.push(carimbo("ficha_medica", paciente.id_paciente, paciente.id_paciente, paciente.nome,
      existe ? {} : null, mudancas, `Importação TiTa preencheu: ${Object.keys(mudancas).join(", ")}.`))
    n++
  }
  console.log(`  fichas médicas: ${n}`)

  // A trilha vai por último e em lote: se ela falhar, o dado já está gravado e
  // o erro aparece aqui — o contrário (trilha antes do dado) mentiria.
  for (let i = 0; i < auditoria.length; i += LOTE) {
    await api("cadastros_auditoria", {
      method: "POST", body: JSON.stringify(auditoria.slice(i, i + LOTE)),
    })
  }
  console.log(`  linhas de auditoria: ${auditoria.length}`)
  console.log("\nConcluído. Agora apague o CSV do disco — ele não tem mais função.")
}

main().catch(e => { console.error("\nFALHOU:", e.message); process.exit(1) })
