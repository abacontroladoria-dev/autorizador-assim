#!/usr/bin/env node
// Confere a grade do banco contra um CSV exportado da TiTa, no mesmo período.
//
//   node scripts/conferir-grade-vs-tita.js <arquivo.csv> [de] [ate]
//
//   node scripts/conferir-grade-vs-tita.js ~/Downloads/csv_grade_profissionais_20260701_a_20260731.csv
//   node scripts/conferir-grade-vs-tita.js grade.csv 2026-07-01 2026-07-31
//
// Sem `de`/`ate`, o período é inferido do menor e maior `Data` do próprio CSV.
//
// Por que este script existe
// ──────────────────────────
// Em 06/08/2026 as abas /rp e /individual pararam de depender do upload manual e
// passaram a ler a grade de `vw_grade_base`. Na primeira conferência de julho o
// total do banco ficou R$ 490,00 MENOR que o do CSV, e não havia como saber onde:
// a tela mostra um total, não uma população.
//
// A apuração mostrou que a captura não erra — em 14.699 linhas presentes nos dois
// lados, `Status`, `Possui Tratativa`, `Profissional` e `Terapia` batiam 100%. O
// que diverge é QUEM está na lista: 122 sessões que a TiTa reporta não existiam na
// view (23 inativadas por engano, 2 nunca inseridas, 82 de profissional de teste
// que a view filtra de propósito, 15 canceladas/planejadas), e 44 linhas ativas no
// banco que a TiTa não reporta mais.
//
// Ou seja: a pergunta útil não é "quanto deu" e sim "quais linhas existem de cada
// lado". É isso que este script responde, e é por isso que ele fica no repositório
// em vez de ter sido um comando de uma vez só.
//
// O `pa_estimado` no fim é uma ESTIMATIVA de conferência, não o cálculo oficial.
// Ele reproduz `resolverPARow` de lib/remuneracao/calculo.ts o suficiente para
// dizer "a ordem de grandeza do buraco é esta", e ignora de propósito PPD/diária,
// PE, ETA, feriado e a sobreposição de presença da fila_autorizacoes. Quem fecha
// no centavo é a tela, comparando os dois XLSX exportados.
//
// Node puro, sem dependências — mesmo padrão de scripts/check-rls.js.

const fs = require("fs")
const { lerEnv, descreverDestino } = require("./lib/backup-grade")

const UNIDADE = 280
const PAGINA = 1000

// ─── CSV ──────────────────────────────────────────────────────────────────────

// Parser de CSV com aspas. O relatório da TiTa traz vírgula dentro de campo
// ("Silva, Maria") e aspas escapadas por duplicação, então split(",") não serve.
function parsearCSV(texto) {
  const linhas = []
  let campo = ""
  let linha = []
  let entreAspas = false
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0 // BOM do export da TiTa

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
  return linhas
    .filter(l => l.length > 1)
    .map(l => {
      const o = {}
      cabecalho.forEach((h, k) => { o[h] = l[k] })
      return o
    })
}

// ─── Normalização ─────────────────────────────────────────────────────────────

// Mesma normalização de `normKey` em lib/remuneracao/formatacao.ts: sem acento,
// minúsculo, espaço colapsado. Comparar nome cru daria falso positivo em
// "  Maria  Silva" vs "Maria Silva".
const normKey = v => String(v ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim()

// O banco guarda "INATIVO-Fulano" e `buscarGradeParaRP` remove o prefixo antes de
// entregar ao cálculo. Para comparar os dois lados temos que remover dos dois.
const semPrefixoDesligado = v => String(v ?? "").replace(/^\s*inativ[oa]\s*[-–—:]\s*/i, "").trim()

const simNao = v => (v === true ? "sim" : v === false ? "nao" : "")
const simNaoCsv = v => {
  const n = normKey(v)
  return n === "sim" ? "sim" : n === "nao" ? "nao" : ""
}

// ─── Banco ────────────────────────────────────────────────────────────────────

async function baixar(cfg, recurso, campos, filtro) {
  const todas = []
  for (let de = 0; ; de += PAGINA) {
    const url = `${cfg.url}/rest/v1/${recurso}?select=${encodeURIComponent(campos)}&${filtro}&order=id`
    const r = await fetch(url, {
      headers: {
        apikey: cfg.key, Authorization: `Bearer ${cfg.key}`,
        Range: `${de}-${de + PAGINA - 1}`, "Range-Unit": "items",
      },
    })
    if (!r.ok) throw new Error(`HTTP ${r.status} em ${recurso}: ${(await r.text()).slice(0, 300)}`)
    const lote = await r.json()
    todas.push(...lote)
    if (lote.length < PAGINA) return todas
  }
}

// ─── PA estimado ──────────────────────────────────────────────────────────────

// Espelha ESPECIALIDADES_SEM_PA de lib/remuneracao/calculo.ts.
const SEM_PA = ["Técnico Terapêutico Particular", "Aplicador ABA Casa", "Aplicador ABA Escola", "Aplicador ABA Casa/Escola"].map(normKey)

async function carregarTabelaDePA(cfg) {
  const taxas = {}
  for (const t of await baixar(cfg, "remuneracao_taxas_especialidade", "id,especialidade,taxa_pa", "id=not.is.null")) {
    taxas[t.especialidade] = Number(t.taxa_pa) || 0
  }
  const [params] = await baixar(cfg, "remuneracao_parametros_gerais", "id,cc_pa_default", "id=not.is.null")
  const ccPA = Number(params?.cc_pa_default) || 0

  const contratos = await baixar(cfg, "remuneracao_contratos", "id,profissional_nome", "id=not.is.null")
  const itens = await baixar(cfg, "remuneracao_contratos_itens", "id,contrato_id,funcao,valor_pa,vigente,modelo_faturamento", "vigente=is.true")
  const porContrato = {}
  for (const i of itens) (porContrato[i.contrato_id] ||= []).push(i)
  const cadastro = {}
  for (const c of contratos) cadastro[normKey(c.profissional_nome)] = porContrato[c.id] || []

  return { taxas, ccPA, cadastro }
}

// Redução honesta de resolverPARow: só os ramos que decidem valor.
function paEstimado(especialidade, profissional, { taxas, ccPA, cadastro }) {
  if (SEM_PA.includes(normKey(especialidade))) return 0

  const n = normKey(especialidade)
  const funcaoLinha = (n === "coordenador de caso" || n.includes("analista do comportamento")) ? "AC"
    : (n === "aplicador aba (ps)" || n === "aplicador aba ps") ? "PS"
      : null
  const taxaFuncao = f => (f === "AC" ? ccPA : (taxas["Aplicador ABA (PS)"] ?? 0))
  const doContrato = c => {
    if (c.valor_pa != null) return Number(c.valor_pa)
    if (c.funcao === "AC" || c.funcao === "PS") return taxaFuncao(c.funcao)
    return taxas[especialidade] ?? 0
  }

  const vigentes = cadastro[normKey(profissional)] || []
  if (vigentes.length && vigentes.every(c => c.modelo_faturamento === "banco_horas")) return 0
  const escolhido = vigentes.find(c => c.funcao === funcaoLinha)
    || vigentes.find(c => c.funcao && normKey(c.funcao) === normKey(especialidade))
    || vigentes.find(c => !c.funcao)
  if (escolhido) return escolhido.modelo_faturamento === "banco_horas" ? 0 : doContrato(escolhido)

  if (!funcaoLinha) return n === "coordenador de caso" ? ccPA : (taxas[especialidade] ?? 0)
  return taxaFuncao(funcaoLinha)
}

// ─── Relatório ────────────────────────────────────────────────────────────────

const brl = v => `R$ ${v.toFixed(2).replace(".", ",")}`
const titulo = t => console.log(`\n${t}\n${"─".repeat(t.length)}`)

function contarPor(linhas, chave) {
  const m = new Map()
  for (const l of linhas) m.set(chave(l), (m.get(chave(l)) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

async function main() {
  const [arquivo, deArg, ateArg] = process.argv.slice(2)
  if (!arquivo) {
    console.error("uso: node scripts/conferir-grade-vs-tita.js <arquivo.csv> [de] [ate]")
    process.exit(2)
  }
  if (!fs.existsSync(arquivo)) throw new Error(`Não encontrei ${arquivo}`)

  const cfg = lerEnv()
  console.log(`destino: ${descreverDestino(cfg)}`)

  const csvTodas = parsearCSV(fs.readFileSync(arquivo, "utf8"))
  const datas = csvTodas.map(r => r["Data"]).filter(Boolean).sort()
  const de = deArg || datas[0]
  const ate = ateArg || datas[datas.length - 1]
  console.log(`período: ${de} a ${ate}`)

  // O recorte do CSV tem que ser o mesmo que `buscarGradeParaRP` aplica no banco:
  // unidade 280 e a janela de datas. Sem isso a comparação acusa diferença que é
  // só de escopo — o export da TiTa costuma vir mais largo do que se pediu.
  const csv = csvTodas.filter(r =>
    String(r["Id Unidade"]).trim() === String(UNIDADE) && r["Data"] >= de && r["Data"] <= ate)

  const filtroData = `data=gte.${de}&data=lte.${ate}&unidade_id=eq.${UNIDADE}`
  const campos = "id,tita_agendamento_id,data,hora_inicial,profissional_id,profissional_nome,paciente_nome,terapia_nome,status_agendamento,status_execucao,possui_tratativa,tratativa_profissional_id,tratativa_profissional_nome,origem"
  const view = await baixar(cfg, "vw_grade_base", campos, filtroData)
  const inativas = await baixar(cfg, "csv_grades_profissionais",
    "id,tita_agendamento_id,data,hora_inicial,profissional_nome,terapia_nome,motivo_inativacao,status_execucao",
    `${filtroData}&ativo=is.false`)

  titulo("População")
  console.log(`  CSV da TiTa (unidade ${UNIDADE}, no período) : ${csv.length}`)
  console.log(`  vw_grade_base                              : ${view.length}`)
  console.log(`  inativas na tabela (fora da view)          : ${inativas.length}`)

  const idDe = r => (r.tita_agendamento_id == null ? "" : String(r.tita_agendamento_id))
  const viewPorId = new Map()
  for (const r of view) { const k = idDe(r); if (k && !viewPorId.has(k)) viewPorId.set(k, r) }
  const csvPorId = new Map()
  for (const r of csv) { const k = (r["ID Agendamento"] || "").trim(); if (k && !csvPorId.has(k)) csvPorId.set(k, r) }

  // Mesma canonização que buscarGradeParaRP aplica antes de calcular: um nome por
  // `profissional_id`, o mais frequente na agenda. A TiTa grava o mesmo id com
  // grafias diferentes em `profissional_nome` e `tratativa_profissional_nome`
  // (medido: id 17586, "Nicolly Christine da Silva Alcantara" × "Nicolly
  // Alcantara"). Sem repetir a regra aqui, este relatório acusaria 88
  // "divergências" que a aplicação já resolve — ruído que faz duvidar do resto.
  const frequencia = new Map()
  for (const r of view) {
    if (typeof r.profissional_id !== "number") continue
    const m = frequencia.get(r.profissional_id) ?? new Map()
    const nome = semPrefixoDesligado(r.profissional_nome)
    if (nome) m.set(nome, (m.get(nome) ?? 0) + 1)
    frequencia.set(r.profissional_id, m)
  }
  const canonico = new Map()
  for (const [id, m] of frequencia) {
    const melhor = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    if (melhor) canonico.set(id, melhor[0])
  }
  const nomePorId = (id, nome) =>
    (typeof id === "number" ? canonico.get(id) : undefined) ?? semPrefixoDesligado(nome)

  // ── Linhas casadas: a captura mente? ────────────────────────────────────────
  const campoADia = [
    ["Status", r => r["Status"], d => d.status_execucao ?? ""],
    ["Possui Tratativa", r => simNaoCsv(r["Possui Tratativa"]), d => simNao(d.possui_tratativa)],
    ["Profissional", r => semPrefixoDesligado(r["Profissional"]), d => nomePorId(d.profissional_id, d.profissional_nome)],
    ["Terapia", r => r["Terapia"], d => d.terapia_nome],
    ["Nome Profissional Tratativa", r => semPrefixoDesligado(r["Nome Profissional Tratativa"]), d => nomePorId(d.tratativa_profissional_id, d.tratativa_profissional_nome)],
  ]
  const divergencias = new Map(campoADia.map(([nome]) => [nome, []]))
  let casadas = 0
  for (const [id, linhaCsv] of csvPorId) {
    const linhaDb = viewPorId.get(id)
    if (!linhaDb) continue
    casadas++
    for (const [nome, doCsv, doDb] of campoADia) {
      const a = doCsv(linhaCsv), b = doDb(linhaDb)
      if (normKey(a) !== normKey(b)) divergencias.get(nome).push(`${id}: csv="${a}" banco="${b}"`)
    }
  }

  titulo(`Linhas presentes nos dois lados: ${casadas}`)
  for (const [nome, casos] of divergencias) {
    console.log(`  ${nome.padEnd(28)} ${casos.length === 0 ? "ok" : `${casos.length} divergência(s)`}`)
    casos.slice(0, 5).forEach(c => console.log(`      ${c}`))
    if (casos.length > 5) console.log(`      ... e mais ${casos.length - 5}`)
  }

  // ── Só no CSV: o banco perdeu ───────────────────────────────────────────────
  const soCsv = [...csvPorId.entries()].filter(([id]) => !viewPorId.has(id)).map(([, r]) => r)
  const inativaPorId = new Map(inativas.map(r => [idDe(r), r]))

  titulo(`Só no CSV — a TiTa reporta e a view não tem: ${soCsv.length}`)
  for (const [k, n] of contarPor(soCsv, r => `${r["Status"] || "(sem status)"} / tratativa=${r["Possui Tratativa"] || "-"}`)) {
    console.log(`  ${String(n).padStart(4)}  ${k}`)
  }

  // O subconjunto que vira dinheiro: sessão realizada e evoluída.
  const pagaveis = soCsv.filter(r => normKey(r["Status"]) === "realizado" && simNaoCsv(r["Possui Tratativa"]) === "sim")
  titulo(`Destas, pagáveis (Realizado + Possui Tratativa = Sim): ${pagaveis.length}`)

  const tabela = await carregarTabelaDePA(cfg)
  let total = 0
  for (const r of pagaveis) {
    const id = (r["ID Agendamento"] || "").trim()
    const inativa = inativaPorId.get(id)
    const causa = inativa ? `inativada (${inativa.motivo_inativacao})` : "ausente da tabela"
    // Em substituição quem recebe é quem evoluiu, não quem estava na agenda.
    const agenda = r["Profissional"], tratativa = r["Nome Profissional Tratativa"]
    const recebe = normKey(agenda) === normKey(tratativa) ? agenda : (tratativa || agenda)
    const pa = paEstimado(r["Terapia"], recebe, tabela)
    total += pa
    console.log(`  ${r["Data"]} ${String(r["Hora Inicial"]).slice(0, 5)}  ${String(r["Terapia"] || "").padEnd(26).slice(0, 26)}  ${String(recebe || "").padEnd(36).slice(0, 36)}  ${brl(pa).padStart(11)}  ${causa}`)
  }
  console.log(`  ${"".padEnd(75)}${brl(total).padStart(11)}  pa_estimado (não é o cálculo oficial)`)

  // ── Só no banco: sobrou linha que a TiTa não reconhece mais ─────────────────
  const soBanco = view.filter(r => idDe(r) && !csvPorId.has(idDe(r)))
  titulo(`Só no banco — ativas que a TiTa não reporta mais: ${soBanco.length}`)
  for (const [k, n] of contarPor(soBanco, r => `origem=${r.origem} / execução=${r.status_execucao ?? "nula"}`)) {
    console.log(`  ${String(n).padStart(4)}  ${k}`)
  }
  const soBancoPagavel = soBanco.filter(r => r.status_execucao === "Realizado" && r.possui_tratativa === true)
  if (soBancoPagavel.length) {
    console.log(`  ATENÇÃO: ${soBancoPagavel.length} destas estão como Realizado+evoluída e PAGAM sem a TiTa confirmar.`)
  }

  // ── Linhas sem tita_agendamento_id: cegas para a captura de execução ────────
  const cegas = view.filter(r => !idDe(r) && r.status_agendamento === "Agendado")
  if (cegas.length) {
    titulo(`Cegas à captura — 'Agendado' sem tita_agendamento_id: ${cegas.length}`)
    console.log("  A execução é casada por ID; sem ID a linha nunca recebe status_execucao")
    console.log("  e entra no cálculo como não evoluída. São as linhas semeadas do backup XLS.")
    for (const [k, n] of contarPor(cegas, r => `origem=${r.origem}`)) console.log(`  ${String(n).padStart(4)}  ${k}`)
  }

  titulo("Veredicto")
  const problemas = pagaveis.length + soBancoPagavel.length
  if (problemas === 0) {
    console.log("  Nenhuma sessão pagável divergente. Os dois caminhos devem fechar.")
  } else {
    console.log(`  ${pagaveis.length} sessão(ões) que o CSV paga e o banco não (${brl(total)} estimados).`)
    if (soBancoPagavel.length) console.log(`  ${soBancoPagavel.length} sessão(ões) que o banco paga e a TiTa não confirma.`)
    console.log("  Rode o sync em modo 'execucao' cobrindo o período para reconciliar.")
  }
  process.exitCode = problemas === 0 ? 0 : 1
}

main().catch(e => { console.error(`\nfalhou: ${e.message}`); process.exit(1) })
