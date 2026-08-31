#!/usr/bin/env node
// Enriquece o cadastro de pacientes com o relatório "Situação do Favorecido"
// exportado do TiTa: endereço, CPF, nascimento, observações, situação, dados do
// familiar responsável e carteirinha do plano.
//
//   node scripts/importar-favorecidos-tita.js <arquivo.csv>            # simulação
//   node scripts/importar-favorecidos-tita.js <arquivo.csv> --aplicar  # escreve
//   node scripts/importar-favorecidos-tita.js <arquivo.csv> --criar-pacientes
//
// SIMULAÇÃO É O PADRÃO. Sem --aplicar nada é escrito: o script lê tudo, faz o
// casamento, aplica as normalizações e imprime exatamente o que MUDARIA, com a
// contagem por campo. Rode assim primeiro, sempre, e leia o relatório antes.
//
// ─── O QUE ELE NÃO FAZ, DE PROPÓSITO ─────────────────────────────────────────
//
// 1. NÃO CRIA PACIENTE, A MENOS QUE --criar-pacientes SEJA PASSADO.
//    Por padrão só enriquece quem já existe em public.pacientes, casando por
//    tita_paciente_id = "Id Favorecido". Na conferência de 2026-08-26 o CSV
//    tinha 577 favorecidos e a base 372 — os restantes são em boa parte
//    inativos que nunca migraram, e trazê-los ampliaria a base de titulares sem
//    finalidade definida, que é o que a LGPD manda evitar (minimização,
//    art. 6º III). Por isso o padrão apenas os LISTA.
//
//    A flag existe porque essa decisão de negócio foi tomada em 2026-08-28: o
//    acompanhamento de laudos precisa enxergar também o histórico de inativos,
//    então a finalidade passou a existir. A flag é separada de --aplicar de
//    propósito — ampliar a base de titulares é um ato distinto de preencher
//    lacuna em titular que já está sob guarda, e merece ser digitado à parte.
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

/**
 * Endereços de preenchimento: um campo obrigatório satisfeito com texto, não um
 * contato. Medidos na base em 2026-08-28 (22 e 3 ocorrências). Importá-los daria
 * a 25 responsáveis um e-mail que ninguém lê — pior que campo vazio, porque
 * parece preenchido. O e-mail da própria clínica, que também aparece repetido,
 * não entra nesta lista: aquele ao menos é uma caixa que existe.
 */
const EMAIL_DE_FACHADA = new Set([
  "emailnaoinformado@gmail.com",
  "pendente-na-base-de-dados-anterior@gmail.com",
])

function email(v) {
  const t = texto(v)
  if (!t) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return null
  const e = t.toLowerCase()
  return EMAIL_DE_FACHADA.has(e) ? null : e
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
 * Parentesco do export -> lista fechada de `pacientes_responsaveis.parentesco`.
 *
 * ESPELHA public.normalizar_parentesco (20260828170000) e PARENTESCOS em
 * frontend/types/responsavel.ts. Desde 20260828170000 a coluna tem CHECK: um
 * valor fora da lista não vira dado ruim, vira INSERT recusado — e, num laço de
 * 500 responsáveis, aborta a importação no meio.
 *
 * O export traz MAE/PAI/AVO/TIO/OUTROS em caixa alta e sem acento, e OUTROS é
 * MAIORIA (277 de 581 na conferência de 2026-08-28). Mapear OUTROS para
 * "filiação" seria inventar um parentesco que o dado não afirma: ele vira
 * vínculo `filiacao_1` (o slot de contato principal, que é o papel que essa
 * pessoa exerce de fato) com `parentesco` nulo, deixando explícito que o grau é
 * desconhecido.
 *
 * AVO fica de fora do mapa DE PROPÓSITO: sem acento, "AVO" não diz se é avó ou
 * avô, e a versão anterior deste script resolvia isso gravando "Avó/Avô" — um
 * valor que nomeia duas pessoas possíveis e hoje nem passa no CHECK. TIO/TIA e
 * IRMAO/IRMA, ao contrário, se distinguem sem acento (mudam a última letra) e
 * por isso são mapeados normalmente.
 */
const PARENTESCO = {
  MAE: "Mãe", MAMAE: "Mãe", GENITORA: "Mãe",
  PAI: "Pai", PAPAI: "Pai", GENITOR: "Pai",
  MADRASTA: "Madrasta", PADRASTO: "Padrasto",
  IRMA: "Irmã", IRMAO: "Irmão",
  TIA: "Tia", TIO: "Tio",
  TUTOR: "Tutor(a) legal", TUTORA: "Tutor(a) legal",
  "RESPONSAVEL LEGAL": "Responsável legal",
  OUTRO: "Outro", OUTROS: "Outro", OUTRA: "Outro",
}

/**
 * Chave de identidade de um responsável dentro do import.
 *
 * Espelha public.normalizar_nome_paciente (sem acento, sem pontuação,
 * minúsculo, espaço colapsado) combinada com o celular só em dígitos — a mesma
 * dupla que o backfill 20260828170100 usa para reaproveitar responsável sem CPF.
 */
const chaveResponsavel = (nome, celular) => {
  const n = semAcento(String(nome ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return `${n}|${digitos(celular) ?? ""}`
}

/**
 * Chave de comparação de nome de plano/convênio: sem acento, caixa alta, espaço
 * colapsado. Uma função só, porque o mesmo nome é comparado ao ler o cadastro e
 * ao decidir se um plano precisa ser criado — duas normalizações divergentes
 * criariam convênio duplicado a cada execução.
 */
const chavePlano = nome =>
  semAcento(String(nome ?? "")).toUpperCase().replace(/\s+/g, " ").trim()

/**
 * Operadora que deixou de existir -> para quem seus pacientes foram.
 *
 * MEMORIAL SAÚDE LTDA encerrou e toda a carteira dela passou a ASSIM Saúde, mas
 * o relatório do TiTa ainda traz o nome antigo em 22 pacientes. Criar um
 * convênio "MEMORIAL" para acomodá-los produziria um cadastro que nasce morto —
 * e 22 fichas apontando para uma operadora com quem não se fatura mais.
 *
 * Chaves e valores em chavePlano() (maiúsculo, sem acento) porque é assim que a
 * comparação acontece do outro lado.
 */
const REDIRECIONAMENTO_CONVENIO = {
  "MEMORIAL SAUDE LTDA": "ASSIM SAUDE",
}

/**
 * Marcadores de agenda que o TiTa cadastra como se fossem favorecidos.
 *
 * Os quatro primeiros vêm da lista do backfill 20260817190100; "estagio" e
 * "supervisao" foram encontrados no export de 2026-08-28 entre os favorecidos
 * ausentes da base. Sem esta marcação eles entram no diretório de pacientes como
 * gente, e o filtro de Situação da tela — que separa fictícios justamente para
 * isso — não tem como escondê-los.
 *
 * Lista explícita, e não heurística por número de palavras: um nome de uma
 * palavra só é MOTIVO DE AVISO no relatório, nunca de classificação automática.
 * Marcar um paciente real como fictício o sumiria da lista padrão, que é um
 * estrago pior do que o que se está evitando.
 */
const NOMES_FICTICIOS = new Set([
  "horario administrativo",
  "horario bloqueado",
  "notificacao previa",
  "ainda nao selecionado",
  "estagio",
  "supervisao",
])

const chaveNome = nome =>
  semAcento(String(nome ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

function parentesco(v) {
  const t = texto(v)
  if (!t) return null
  // Avó e avô só se separam pelo acento, então o teste acentuado vem antes de
  // achatar. Quem escreveu "AVO" continua sem resposta, como acima.
  const comAcento = t.toLowerCase()
  if (["avó", "vó", "vovó"].includes(comAcento)) return "Avó"
  if (["avô", "vô", "vovô"].includes(comAcento)) return "Avô"
  return PARENTESCO[semAcento(t).toUpperCase().replace(/\s+/g, " ")] ?? null
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
  const criarPacientes = args.includes("--criar-pacientes")
  const criarConvenios = args.includes("--criar-convenios")
  const arquivo = args.find(a => !a.startsWith("--"))

  if (!arquivo) {
    console.error("Uso: node scripts/importar-favorecidos-tita.js <arquivo.csv> [--aplicar] [--criar-pacientes] [--criar-convenios]")
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
  if (criarPacientes) {
    console.log("--criar-pacientes ATIVO: favorecidos ausentes da base serão CRIADOS.")
  }
  if (criarConvenios) {
    console.log("--criar-convenios ATIVO: nomes de plano sem cadastro viram convênio + plano.")
  }
  if (criarPacientes || criarConvenios) console.log()

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
    if (!paciente) { foraDaBase.push({ linha: l, idTita }); continue }
    casados.push({ linha: l, paciente })
  }

  console.log("── Casamento por Id Favorecido ──")
  console.log(`  ${casados.length} casam com paciente da base (serão enriquecidos)`)
  console.log(`  ${foraDaBase.length} existem só no CSV`)
  if (semId.length) console.log(`  ${semId.length} sem Id Favorecido legível — ignorados`)
  console.log()

  // ─── 0. Pacientes a criar ───────────────────────────────────────────────────
  //
  // Entram no MESMO fluxo dos casados, através de um espaço reservado com
  // id_paciente nulo e todo campo vazio: assim as seções 2 e 3 abaixo já os
  // consideram sem lógica paralela. Na hora de aplicar, o INSERT preenche o
  // id_paciente DESTE MESMO objeto, e as listas montadas adiante — que guardam
  // a referência, não uma cópia — enxergam o id real.
  const novosPacientes = []

  if (criarPacientes) {
    for (const { linha, idTita } of foraDaBase) {
      const nome = texto(linha["Favorecido"])
      // Mesma regra dos responsáveis: nome com losango não é gravado. Num
      // paciente NOVO isso é mais grave ainda — seria criar um titular cujo
      // nome já nasce errado, sem original de onde recuperá-lo.
      if (!nome || temCaractereQuebrado(nome)) continue

      const payload = {
        tita_paciente_id: idTita,
        nome,
        cpf: cpf(linha["CPF Favorecido"]),
        data_nascimento: dataISO(linha["Data de Nascimento"]),
        // `Situacao` manda, e não `Data de Inativação`: as duas discordam em uma
        // linha do export de 2026-08-28 (341 "Ativo" contra 342), e a coluna de
        // situação é a que a tela do TiTa mostra.
        ativo: semAcento(String(linha["Situacao"] ?? "")).trim().toLowerCase() === "ativo",
        observacoes: texto(linha["Observações do Favorecido"]),
        cep: cep(linha["CEP"]),
        logradouro: texto(linha["Endereço do Favorecido"]),
        numero: texto(linha["Número do Endereço"]),
        complemento: texto(linha["Complemento"]),
        bairro: texto(linha["Bairro"]),
        cidade: texto(linha["Cidade"]),
        uf: uf(linha["Estado"]),
        // 'tita' e não 'pulsar': a linha veio de lá, tem tita_paciente_id, e é
        // isso que deixa o resync do TiTa continuar refrescando a identidade
        // dela. Também é o que a CHECK pacientes_origem_cadastro_check permite —
        // os únicos valores são 'tita' e 'pulsar'.
        origem_cadastro: "tita",
        ficticio: NOMES_FICTICIOS.has(chaveNome(nome)),
      }

      const reservado = { id_paciente: null, nome, tita_paciente_id: idTita }
      novosPacientes.push({ linha, payload, paciente: reservado })
      casados.push({ linha, paciente: reservado, novo: true })
    }

    const ativos = novosPacientes.filter(p => p.payload.ativo).length
    const ficticios = novosPacientes.filter(p => p.payload.ficticio)
    console.log("── 0. Pacientes a CRIAR (--criar-pacientes) ──")
    console.log(`  ${novosPacientes.length} pacientes novos`)
    console.log(`    ${ativos} ativos / ${novosPacientes.length - ativos} inativos`)
    console.log(`    ${novosPacientes.filter(p => p.payload.cpf).length} com CPF válido`)
    console.log(`    ${novosPacientes.filter(p => p.payload.data_nascimento).length} com data de nascimento`)
    if (ficticios.length) {
      console.log(`    ${ficticios.length} marcados como FICTÍCIOS (marcador de agenda, não pessoa):`)
      for (const p of ficticios) console.log(`       ${p.payload.nome}`)
    }
    const descartados = foraDaBase.length - novosPacientes.length
    if (descartados) console.log(`  ${descartados} descartados por nome ausente ou com caractere perdido`)

    // Nome de uma palavra só é forte indício de marcador de agenda que ainda não
    // está em NOMES_FICTICIOS. Vira AVISO, não classificação: quem decide é
    // quem conhece a operação, com um clique na tela depois.
    const umaPalavra = novosPacientes.filter(
      p => !p.payload.ficticio && chaveNome(p.payload.nome).split(" ").length < 2
    )
    if (umaPalavra.length) {
      console.log(`  ⚠  ${umaPalavra.length} com nome de uma palavra só — confira se não é marcador de agenda:`)
      for (const p of umaPalavra) console.log(`       ${p.payload.nome}  (Id ${p.payload.tita_paciente_id})`)
    }
    console.log()
  } else {
    console.log("  (os que existem só no CSV são IGNORADOS — use --criar-pacientes para trazê-los)\n")
  }

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

  for (const { linha, paciente, novo } of casados) {
    // Paciente que este mesmo run vai criar já nasce com todos estes campos no
    // INSERT — enriquecê-lo em seguida seria um UPDATE que reescreve o que
    // acabou de ser gravado, e ainda contaria em dobro no relatório.
    if (novo) continue

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

  // REAPROVEITAMENTO é a razão de existir de public.responsaveis: irmãos
  // atendidos na clínica compartilham responsável, e uma linha por filho é
  // justamente a duplicação que a tabela veio desfazer (20260826100200). Medido
  // no export de 2026-08-28: 579 linhas com familiar para 542 pessoas distintas
  // — 37 seriam cópias.
  //
  // A chave é (nome normalizado, celular), e não CPF, porque o relatório não
  // traz CPF do familiar. Homônimo com telefone diferente continua sendo duas
  // pessoas, de propósito: fundir por nome só seria pior.
  const responsaveisExistentes = await selecionarTudo("responsaveis?select=id,nome,celular")
  const porChave = new Map()
  for (const r of responsaveisExistentes) porChave.set(chaveResponsavel(r.nome, r.celular), r.id)
  const jaNoBanco = porChave.size

  const novosResponsaveis = []
  let semNomeDeFamiliar = 0

  for (const { linha, paciente } of casados) {
    if (jaTemFiliacao.has(paciente.id_paciente)) continue

    const nome = texto(linha["Nome do Familiar"])
    if (!nome || temCaractereQuebrado(nome)) { semNomeDeFamiliar++; continue }

    const celular = telefone(linha["Telefone do Familiar"])
    const chave = chaveResponsavel(nome, celular)

    const registro = {
      paciente,
      responsavel: { nome, celular, email: email(linha["E-mail do Familiar"]) },
      parentesco: parentesco(linha["Parentesco do Familiar"]),
      // Preenchido só quando ESTE registro é o dono da criação.
      responsavelId: null,
      // Número = linha que já está no banco. Objeto = o registro deste mesmo
      // lote que vai criar a pessoa, e de quem o id é lido depois da escrita.
      reaproveitaDe: null,
      cria: false,
    }

    if (porChave.has(chave)) {
      registro.reaproveitaDe = porChave.get(chave)
    } else {
      registro.cria = true
      // O primeiro a aparecer é quem cria; os irmãos seguintes apontam para ele.
      // Como o laço de escrita percorre o array nesta mesma ordem, o dono já
      // tem id quando o reaproveitador chega.
      porChave.set(chave, registro)
    }

    novosResponsaveis.push(registro)
  }

  const aCriar = novosResponsaveis.filter(r => r.cria)
  const comCelular = aCriar.filter(r => r.responsavel.celular).length
  const comEmail = aCriar.filter(r => r.responsavel.email).length
  const comParentesco = novosResponsaveis.filter(r => r.parentesco).length
  console.log(`  ${novosResponsaveis.length} vínculos filiacao_1 a criar`)
  console.log(`    ${aCriar.length} responsáveis NOVOS`)
  console.log(`    ${novosResponsaveis.length - aCriar.length} reaproveitam pessoa já existente (irmãos)`)
  console.log(`    ${comCelular} dos novos com celular válido`)
  console.log(`    ${comEmail} dos novos com e-mail válido`)
  console.log(`    ${comParentesco} com grau de parentesco conhecido (AVO fica em branco: avó ou avô?)`)
  console.log(`  ${jaNoBanco} responsáveis já cadastrados na base`)
  console.log(`  ${jaTemFiliacao.size} pacientes já tinham filiação — intocados`)
  if (semNomeDeFamiliar) console.log(`  ${semNomeDeFamiliar} linhas sem nome de familiar aproveitável`)
  console.log()

  // ─── 3. Ficha médica / carteirinha ──────────────────────────────────────────
  console.log("── 3. Carteirinha do plano ──")
  // Casamento por CONVÊNIO, não por nome de plano.
  //
  // O relatório traz UM campo ("Plano de Saúde") preenchido com o nome da
  // OPERADORA — "ASSIM Saúde", "UNIMED FERJ", "Unimed Nacional". Como cada
  // convênio tem um único plano, chamado "Padrão" (ver
  // APLICAR_3_convenios_2026-08-31.sql), casar contra planos_saude.nome
  // encontraria 17 planos homônimos e o último venceria — todo paciente
  // acabaria no convênio errado, sem erro nenhum aparecer.
  const conveniosCad = await selecionarTudo("convenios?select=id,nome&ativo=is.true")
  const planos = await selecionarTudo("planos_saude?select=id,nome,convenio_id&ativo=is.true")

  const planoPorConvenio = new Map()
  for (const p of planos) {
    // "Padrão" tem precedência; qualquer outro plano só entra se o convênio
    // ainda não tiver nenhum, para um convênio que ganhe planos de verdade pela
    // tela continuar importável em vez de virar erro.
    const atual = planoPorConvenio.get(p.convenio_id)
    if (!atual || chavePlano(p.nome) === "PADRAO") planoPorConvenio.set(p.convenio_id, p.id)
  }
  const convenioPorNome = new Map(
    conveniosCad.map(c => [chavePlano(c.nome), { id: c.id, planoId: planoPorConvenio.get(c.id) ?? null }])
  )

  const fichas = await selecionarTudo("pacientes_ficha_medica?select=paciente_id,plano_saude_id,numero_carteirinha")
  const fichaPorPaciente = new Map(fichas.map(f => [f.paciente_id, f]))

  const updatesFicha = []
  const planosNaoEncontrados = new Map()
  let redirecionados = 0

  for (const { linha, paciente } of casados) {
    const carteirinha = texto(linha["Número da Carteirinha"])
    const nomePlano = texto(linha["Plano de Saúde"])
    const ficha = fichaPorPaciente.get(paciente.id_paciente)

    const mudancas = {}
    if (carteirinha && vazio(ficha?.numero_carteirinha)) mudancas.numero_carteirinha = carteirinha

    // Nome de convênio que ainda não existe: guardado como PENDENTE em vez de
    // resolvido agora. O id só passa a existir na fase de escrita, e resolver
    // antes obrigaria a criar convênio durante o que deveria ser simulação.
    let planoPendente = null

    if (nomePlano) {
      const chaveOriginal = chavePlano(nomePlano)
      const chaveAlvo = REDIRECIONAMENTO_CONVENIO[chaveOriginal] ?? chaveOriginal
      if (chaveAlvo !== chaveOriginal) redirecionados++

      const convenio = convenioPorNome.get(chaveAlvo)
      if (convenio?.planoId) {
        if (vazio(ficha?.plano_saude_id)) mudancas.plano_saude_id = convenio.planoId
      } else {
        planosNaoEncontrados.set(nomePlano, (planosNaoEncontrados.get(nomePlano) ?? 0) + 1)
        if (criarConvenios && vazio(ficha?.plano_saude_id)) planoPendente = nomePlano
      }
    }

    if (Object.keys(mudancas).length || planoPendente) {
      updatesFicha.push({ paciente, mudancas, existe: Boolean(ficha), planoPendente })
    }
  }

  console.log(`  ${updatesFicha.length} fichas a preencher`)
  console.log(`    ${updatesFicha.filter(u => u.mudancas.numero_carteirinha).length} ganham carteirinha`)
  console.log(`    ${updatesFicha.filter(u => u.mudancas.plano_saude_id).length} ganham vínculo de convênio já cadastrado`)
  if (redirecionados) {
    console.log(`    ${redirecionados} redirecionados de operadora extinta (ver REDIRECIONAMENTO_CONVENIO)`)
  }
  if (criarConvenios) {
    console.log(`    ${updatesFicha.filter(u => u.planoPendente).length} ganham vínculo de convênio a ser criado`)
  }
  if (planosNaoEncontrados.size) {
    if (criarConvenios) {
      console.log(`  ${planosNaoEncontrados.size} convênios + planos a CRIAR (--criar-convenios):`)
    } else {
      console.log(`  ⚠  ${planosNaoEncontrados.size} nomes do CSV sem convênio correspondente cadastrado.`)
      console.log("     Cadastre em /cadastros/convenios (ou rode APLICAR_3_convenios) e repita:")
    }
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

  // Os pacientes novos vêm PRIMEIRO: as listas de responsáveis e de fichas
  // guardam a referência ao objeto reservado, então preencher id_paciente aqui
  // é o que faz as etapas seguintes apontarem para a linha real. Um a um, e não
  // em lote, para o id voltar casado com a linha certa.
  let n = 0
  for (const { payload, paciente } of novosPacientes) {
    const [criado] = await api("pacientes", {
      method: "POST", body: JSON.stringify(payload),
      headers: { Prefer: "return=representation" },
    })
    paciente.id_paciente = criado.id_paciente
    auditoria.push(carimbo("paciente", criado.id_paciente, criado.id_paciente, criado.nome,
      null, payload, "Paciente criado a partir do relatório Situação do Favorecido (TiTa)."))
    if (++n % 50 === 0) console.log(`  pacientes novos: ${n}/${novosPacientes.length}`)
  }
  if (novosPacientes.length) console.log(`  pacientes criados: ${n}`)

  n = 0
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

  // A ordem do array importa: quem cria a pessoa aparece antes de quem a
  // reaproveita (o mapa de chaves foi montado na mesma passagem), então o id já
  // está preenchido quando o irmão chega.
  n = 0
  let nVinculos = 0
  for (const registro of novosResponsaveis) {
    const { paciente, responsavel, parentesco: grau } = registro

    if (registro.cria) {
      const [criado] = await api("responsaveis", {
        method: "POST", body: JSON.stringify(responsavel),
        headers: { Prefer: "return=representation" },
      })
      registro.responsavelId = criado.id
      auditoria.push(carimbo("responsavel", criado.id, paciente.id_paciente, paciente.nome,
        null, responsavel, "Responsável importado do TiTa e vinculado como filiação principal."))
      n++
    } else {
      registro.responsavelId = typeof registro.reaproveitaDe === "number"
        ? registro.reaproveitaDe
        : registro.reaproveitaDe.responsavelId
    }

    if (registro.responsavelId == null) {
      throw new Error(`Responsável sem id para o paciente ${paciente.id_paciente} — abortado antes de gravar vínculo órfão.`)
    }

    await api("pacientes_responsaveis", {
      method: "POST",
      body: JSON.stringify({
        paciente_id: paciente.id_paciente,
        responsavel_id: registro.responsavelId,
        tipo: "filiacao_1",
        parentesco: grau,
      }),
    })
    if (!registro.cria) {
      // Reaproveitar pessoa não cria responsável, mas cria VÍNCULO — e é o
      // vínculo que faz o telefone aparecer no cartão deste paciente. Sem esta
      // linha na trilha, o irmão ganharia contato sem rastro de onde veio.
      auditoria.push(carimbo("responsavel", registro.responsavelId, paciente.id_paciente, paciente.nome,
        null, { vinculos: `filiacao_1#${registro.responsavelId}` },
        "Responsável já cadastrado (irmão) vinculado como filiação principal, a partir do relatório do TiTa."))
    }
    if (++nVinculos % 50 === 0) console.log(`  vínculos: ${nVinculos}/${novosResponsaveis.length}`)
  }
  console.log(`  responsáveis criados: ${n}  |  vínculos filiacao_1: ${nVinculos}`)

  // Convênios antes das fichas: é o INSERT aqui que dá id ao `planoPendente`
  // que as fichas vão referenciar.
  //
  // REDE DE SEGURANÇA, não o caminho normal: o cadastro curado (CNPJ, ANS, razão
  // social) é feito por APLICAR_3_convenios_2026-08-31.sql. Isto aqui só cobre
  // nome de operadora que apareça num export FUTURO sem ter sido cadastrado
  // ainda — e cria sem CNPJ/ANS, para alguém completar na tela.
  //
  // O plano nasce "Padrão", igual ao do cadastro curado: se nascesse com o nome
  // do convênio, o casamento por convênio acima continuaria funcionando, mas a
  // tela passaria a mostrar dois padrões de nomenclatura sem razão.
  if (criarConvenios && planosNaoEncontrados.size) {
    n = 0
    for (const nome of planosNaoEncontrados.keys()) {
      const [convenio] = await api("convenios", {
        method: "POST", body: JSON.stringify({ nome }),
        headers: { Prefer: "return=representation" },
      })
      const [plano] = await api("planos_saude", {
        method: "POST", body: JSON.stringify({ convenio_id: convenio.id, nome: "Padrão" }),
        headers: { Prefer: "return=representation" },
      })
      convenioPorNome.set(chavePlano(nome), { id: convenio.id, planoId: plano.id })
      auditoria.push(carimbo("convenio", convenio.id, null, null, null, { nome },
        "Convênio e plano criados a partir do relatório Situação do Favorecido (TiTa)."))
      n++
    }
    console.log(`  convênios + planos criados: ${n}`)
  }

  n = 0
  for (const { paciente, mudancas, existe, planoPendente } of updatesFicha) {
    if (planoPendente) {
      const convenio = convenioPorNome.get(chavePlano(planoPendente))
      if (convenio?.planoId) mudancas.plano_saude_id = convenio.planoId
    }
    // O pendente pode ter sido a única razão desta ficha estar na lista; sem id
    // resolvido não há o que gravar, e um PATCH vazio é 400 no PostgREST.
    if (Object.keys(mudancas).length === 0) continue

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
