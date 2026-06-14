/**
 * Teste de lógica: Validar que Ação Imediata e Acompanhamento
 * são calculados usando dataFim, não hoje
 */

// Simular dados de RPC para período 01/06 → 12/06
const mockRowsJunePartial = [
  // Sessões de 01/06 a 07/06 (atraso >= 5 dias até 12/06)
  { paciente_nome: 'Paciente A', data_sessao: '2026-06-01', possui_tratativa: false, profissional: 'Terapeuta 1', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente B', data_sessao: '2026-06-02', possui_tratativa: false, profissional: 'Terapeuta 2', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente C', data_sessao: '2026-06-03', possui_tratativa: false, profissional: 'Terapeuta 1', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente D', data_sessao: '2026-06-04', possui_tratativa: false, profissional: 'Terapeuta 3', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente E', data_sessao: '2026-06-05', possui_tratativa: false, profissional: 'Terapeuta 2', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente F', data_sessao: '2026-06-06', possui_tratativa: false, profissional: 'Terapeuta 3', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente G', data_sessao: '2026-06-07', possui_tratativa: false, profissional: 'Terapeuta 1', profissional_tratativa: null, data_tratativa: null },
  // Sessões de 08/06 a 11/06 (atraso 1-4 dias até 12/06)
  { paciente_nome: 'Paciente H', data_sessao: '2026-06-08', possui_tratativa: false, profissional: 'Terapeuta 2', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente I', data_sessao: '2026-06-09', possui_tratativa: false, profissional: 'Terapeuta 1', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente J', data_sessao: '2026-06-10', possui_tratativa: false, profissional: 'Terapeuta 3', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente K', data_sessao: '2026-06-11', possui_tratativa: false, profissional: 'Terapeuta 2', profissional_tratativa: null, data_tratativa: null },
  // Sessão de 12/06 (atraso 0 dias - não conta)
  { paciente_nome: 'Paciente L', data_sessao: '2026-06-12', possui_tratativa: false, profissional: 'Terapeuta 1', profissional_tratativa: null, data_tratativa: null },
]

// Simular dados para período 11/06 → 11/06
const mockRowsJuneSingleDay = [
  { paciente_nome: 'Paciente H', data_sessao: '2026-06-11', possui_tratativa: false, profissional: 'Terapeuta 2', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente I', data_sessao: '2026-06-11', possui_tratativa: false, profissional: 'Terapeuta 1', profissional_tratativa: null, data_tratativa: null },
  { paciente_nome: 'Paciente J', data_sessao: '2026-06-11', possui_tratativa: false, profissional: 'Terapeuta 3', profissional_tratativa: null, data_tratativa: null },
]

function calcularPendencias(rows, dataFim) {
  const [dy, dm, dd] = dataFim.split('-').map(Number)
  const dataFimMs = new Date(dy, dm - 1, dd).getTime()

  const atrasoPorPaciente = new Map()

  for (const row of rows) {
    if (!row.possui_tratativa && row.data_sessao < dataFim) {
      const [sy, sm, sd] = row.data_sessao.split('-').map(Number)
      const dias = Math.floor((dataFimMs - new Date(sy, sm - 1, sd).getTime()) / (86_400_000))

      if (dias > 0) {
        const atual = atrasoPorPaciente.get(row.paciente_nome) ?? 0
        if (dias > atual) {
          atrasoPorPaciente.set(row.paciente_nome, dias)
        }
      }
    }
  }

  const pacientesPendentesOrdenados = Array.from(atrasoPorPaciente.entries())
    .map(([pacienteNome, diasAtraso]) => ({ pacienteNome, diasAtraso }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso)

  const acaoImediata = pacientesPendentesOrdenados.filter(p => p.diasAtraso >= 5)
  const acompanhamento = pacientesPendentesOrdenados.filter(p => p.diasAtraso >= 1 && p.diasAtraso <= 4)

  return { acaoImediata, acompanhamento, pacientesPendentesOrdenados }
}

console.log('='.repeat(70))
console.log('TESTE: Validar que Ação Imediata/Acompanhamento usam dataFim')
console.log('='.repeat(70))
console.log()

console.log('📅 CENÁRIO 1: Período 01/06 → 12/06')
console.log('-'.repeat(70))
const resultado1 = calcularPendencias(mockRowsJunePartial, '2026-06-12')
console.log(`Ação Imediata (>= 5 dias):    ${resultado1.acaoImediata.length} pacientes`)
resultado1.acaoImediata.forEach(p => console.log(`  ✓ ${p.pacienteNome}: ${p.diasAtraso} dias`))
console.log()
console.log(`Acompanhamento (1-4 dias):   ${resultado1.acompanhamento.length} pacientes`)
resultado1.acompanhamento.forEach(p => console.log(`  ✓ ${p.pacienteNome}: ${p.diasAtraso} dias`))
console.log()

console.log('📅 CENÁRIO 2: Período 11/06 → 11/06 (mesmo período de observação)')
console.log('-'.repeat(70))
// Importante: RPC retorna APENAS sessões do período 11/06
// Se calcularmos atraso até 11/06, o atraso seria 0
// Mas se temos sessões antigas de 11/06 sem evolução desde antes...

// Para simular melhor, vamos recalcular com dados que já têm atraso
// (como se fossem de períodos anteriores)
const resultado2 = calcularPendencias(mockRowsJuneSingleDay, '2026-06-11')
console.log(`Ação Imediata (>= 5 dias):    ${resultado2.acaoImediata.length} pacientes`)
resultado2.acaoImediata.forEach(p => console.log(`  ✓ ${p.pacienteNome}: ${p.diasAtraso} dias`))
console.log()
console.log(`Acompanhamento (1-4 dias):   ${resultado2.acompanhamento.length} pacientes`)
resultado2.acompanhamento.forEach(p => console.log(`  ✓ ${p.pacienteNome}: ${p.diasAtraso} dias`))
console.log()

console.log('='.repeat(70))
console.log('✅ VALIDAÇÃO')
console.log('='.repeat(70))
console.log()
console.log('Cenário 1 (01/06 → 12/06):')
console.log(`  - 7 pacientes de 01-07/06 têm atraso 11-5 dias → Ação Imediata`)
console.log(`  - 4 pacientes de 08-11/06 têm atraso 4-1 dias → Acompanhamento`)
console.log(`  - Resultado esperado: Ação Imediata = 7, Acompanhamento = 4`)
console.log(`  - Resultado obtido:   Ação Imediata = ${resultado1.acaoImediata.length}, Acompanhamento = ${resultado1.acompanhamento.length}`)
console.log(`  - ${resultado1.acaoImediata.length === 7 && resultado1.acompanhamento.length === 4 ? '✅ CORRETO' : '❌ ERRADO'}`)
console.log()

console.log('Cenário 2 (11/06 → 11/06):')
console.log(`  - Se RPC retorna apenas sessões de 11/06`)
console.log(`  - Atraso calculado de 11/06 até 11/06 = 0 dias`)
console.log(`  - Nenhum paciente deve estar em Ação Imediata ou Acompanhamento`)
console.log(`  - Resultado obtido: Ação Imediata = ${resultado2.acaoImediata.length}, Acompanhamento = ${resultado2.acompanhamento.length}`)
console.log(`  - ${resultado2.acaoImediata.length === 0 && resultado2.acompanhamento.length === 0 ? '✅ CORRETO' : '⚠️  ATENÇÃO'}`)
console.log()
console.log('📌 NOTA: Se acompanhamento no Cenário 2 > 0, significa que:')
console.log('   - RPC está retornando dados de dias ANTERIORES ao período início')
console.log('   - Ou há dados históricos que não deveriam estar lá')
console.log()
