'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B } from '../lib/constants'

export default function LegendaTab() {
  const { ccPME, diarias, taxasPA, etaBonus } = useCalculadora()

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="font-bold text-xl mb-1" style={{ color: B.navy }}>📖 Legenda Completa — Guia de Referência</h2>
        <p className="text-sm text-gray-500">
          Tudo que você precisa saber para interpretar corretamente os dados desta ferramenta.
        </p>
      </div>

      {/* Modalidades */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-base" style={{ color: B.navy }}>💡 As Três Modalidades de Pagamento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg p-3" style={{ background: B.green + '15', borderLeft: `3px solid ${B.green}` }}>
            <div className="font-bold text-sm mb-1" style={{ color: B.green }}>PA — Pagamento por Atendimento</div>
            <div className="text-xs text-gray-600 space-y-1">
              <p>Valor fixo por <strong>sessão de 40 min</strong> efetivamente realizada e com tratativa (evolução) registrada no sistema.</p>
              <p>Varia por especialidade. Exemplos: Aplicador ABA = R$30/sessão; Terapia Ocupacional = R$35/sessão.</p>
              <p>Na projeção futura (Análise), é multiplicado pela taxa de presença configurada (ex.: 80%).</p>
              <p className="text-gray-400 italic">Não é pago por sessão cancelada, não evoluída ou cedida a outro profissional.</p>
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ background: B.purple + '15', borderLeft: `3px solid ${B.purple}` }}>
            <div className="font-bold text-sm mb-1" style={{ color: B.purple }}>PME — Pagamento Mediante Entrega</div>
            <div className="text-xs text-gray-600 space-y-1">
              <p>Exclusivo do <strong>Psicólogo Analista do Comportamento</strong> (antes chamado de Coordenador de Caso).</p>
              <p>Valor fixo mensal por <strong>paciente único</strong> que tem sessão de "Coordenador de Caso" na agenda. Atualmente: R${ccPME.toFixed(2)}/paciente/mês.</p>
              <p><strong>Não é afetado pela % de presença</strong> — é pago pelo vínculo de acompanhamento, não por sessão realizada.</p>
              <p className="text-gray-400 italic">Exemplo: 8 pacientes únicos × R${ccPME.toFixed(2)} = R${(8 * ccPME).toFixed(2)}/mês.</p>
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ background: B.orange + '15', borderLeft: `3px solid ${B.orange}` }}>
            <div className="font-bold text-sm mb-1" style={{ color: B.orange }}>PPD — Pagamento por Disponibilidade</div>
            <div className="text-xs text-gray-600 space-y-1">
              <p>Antes chamado de "Diária". Valor fixo por <strong>dia que o profissional está escalado na clínica</strong>, independentemente de quantos pacientes compareceram.</p>
              <p>Reconhece a disponibilidade do profissional mesmo nos dias em que há faltas de pacientes.</p>
              <p><strong>Não se aplica</strong> ao Psicólogo Analista. Aplica-se, por exemplo, a Fonoaudiologia (R$300/dia), Terapia Ocupacional (R$350/dia), ETA (R${(diarias['Especialista Técnico de Área'] || 350).toFixed(2)}/dia).</p>
              <p className="text-gray-400 italic">Na aba Remuneração Real: conta os dias distintos com sessão no período.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Exemplo anotado */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-bold text-base mb-3" style={{ color: B.navy }}>🔍 Exemplo Anotado — Lendo um Card de Profissional</h3>
        <div className="rounded-xl p-4 text-xs space-y-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div className="font-bold text-sm" style={{ color: B.navy }}>Exemplo: Danielle Galvão Nogueira</div>
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: 'PS.ABA-2024-0415  📋 contrato antigo', cor: B.amber, desc: 'Código do contrato ANTIGO — modelo de pagamento por carga horária. Aparece com o badge amarelo para deixar claro que é apenas referência de comparação.' },
              { label: '162 sessões agendadas', cor: B.navy, desc: 'Total de registros na agenda do profissional no período analisado. Inclui sessões evoluídas, canceladas, não evoluídas etc. NÃO é quantidade de pacientes.' },
              { label: '61 pacientes únicos', cor: B.blue, desc: 'Número de pacientes diferentes que aparecem na agenda deste profissional no período.' },
              { label: '66 evoluções próprias', cor: B.green, desc: 'Sessões que estavam NA AGENDA DESTE profissional e que ELE MESMO evoluiu (registrou tratativa). Estas geram PA para ele.' },
              { label: '9 substituições realizadas', cor: B.blue, desc: 'Sessões que estavam na agenda de OUTRO profissional, mas que ESTE profissional evoluiu. Também geram PA para ele.' },
              { label: '75 sessões remuneráveis', cor: B.green, desc: '66 + 9 = total de sessões que geram PA. Base do valor a receber.' },
              { label: '35 canceladas', cor: B.gray, desc: 'Sessões registradas como canceladas no sistema (falta do paciente ou do profissional). Não geram PA.' },
              { label: '43 pendentes retroativas', cor: B.amber, desc: 'Paciente presente (recepção) e sessão sem tratativa (profissional). O profissional PODE regularizar antes do fechamento e receber o PA.' },
              { label: '18 não evoluídas', cor: '#92400e', desc: 'Paciente ausente (recepção) e sessão sem tratativa (profissional). Sem presença confirmada E sem evolução registrada.' },
            ].map(x => (
              <div key={x.label} className="flex gap-2 items-start">
                <span className="font-bold px-2 py-0.5 rounded text-white text-[11px] flex-shrink-0 mt-0.5" style={{ background: x.cor }}>{x.label}</span>
                <span className="text-gray-600">{x.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Para que serve cada aba */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-bold text-base mb-3" style={{ color: B.navy }}>📋 Para Que Serve Cada Aba</h3>
        <div className="space-y-3 text-sm">
          {[
            { icon: '📊', nome: 'Análise Futura', cor: B.blue, pub: 'Setor de Cronograma', desc: 'Usa o CSV da grade semanal e projeta para o mês completo com base nos dias úteis reais. Permite comparar se a remuneração pelo novo modelo (PA/PPD/PME) se aproxima do contrato antigo.' },
            { icon: '💼', nome: 'Remuneração — RP (Uso Interno)', cor: B.green, pub: 'Setor de Relacionamento com Prestador', desc: 'Visão completa de todos os profissionais com percentuais, gráficos de distribuição de sessões e análise gerencial. SOMENTE para uso interno.' },
            { icon: '👤', nome: 'Remuneração Individual', cor: B.blue, pub: 'Apresentação ao profissional', desc: 'Exibe UM profissional por vez, selecionado no menu. NÃO exibe percentuais — adequado para ser apresentado diretamente ao profissional.' },
            { icon: '👥', nome: 'Psicólogos Analistas do Comportamento', cor: B.purple, pub: 'Diretoria Terapêutica', desc: 'Exibe a carteira de pacientes por analista, alertas de capacidade (teto de 18 pacientes por padrão, editável) e estima PA e PME.' },
            { icon: '⚙️', nome: 'Config', cor: B.navy, pub: 'Administração', desc: 'Edite: taxa de presença projetada (%), valores de PA e PPD por especialidade, dados dos contratos antigos para comparação, bônus ETA e feriados municipais.' },
            { icon: '📈', nome: 'Histórico', cor: B.green, pub: 'Gestão', desc: 'Salve retratos mensais para acompanhar a evolução da remuneração ao longo do tempo. O gráfico compara os valores entre meses por profissional.' },
          ].map(a => (
            <div key={a.nome} className="rounded-lg p-3" style={{ background: a.cor + '10', borderLeft: `3px solid ${a.cor}` }}>
              <div className="font-bold text-sm" style={{ color: a.cor }}>{a.icon} {a.nome}</div>
              <div className="text-xs font-semibold mt-0.5 mb-1" style={{ color: a.cor }}>Principal usuário: {a.pub}</div>
              <div className="text-xs text-gray-600">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Classificação das sessões */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-bold text-base mb-3" style={{ color: B.navy }}>🏷️ Classificação das Sessões (Aba Remuneração)</h3>
        <p className="text-xs text-gray-500 mb-3">
          Cada sessão recebe uma classificação automática com base em 4 campos do relatório:
          Presença Órbita, Possui Tratativa, Profissional Agenda vs. Profissional CSV, e Status Final.
        </p>
        <div className="space-y-2">
          {[
            { label: '✅ Evolução normal', cor: B.green, recebe: 'Recebe PA', cond: 'Sessão da agenda DESTE profissional + ele mesmo evoluiu (Possui Tratativa = Sim) + sem inconsistência.' },
            { label: '🔄 Substituição realizada', cor: B.blue, recebe: 'Recebe PA', cond: 'Sessão estava na agenda de OUTRO profissional, mas ESTE evoluiu. O profissional que evoluiu recebe o PA.' },
            { label: '⏳ Pendente retroativa', cor: B.amber, recebe: 'Pode receber', cond: 'Paciente presente (recepção confirmou presença) e sessão sem tratativa. O profissional pode regularizar retroativamente.' },
            { label: '🔁 Cedida para outro (Substituição perdida)', cor: B.red, recebe: 'Não recebe', cond: 'Sessão estava na agenda DESTE profissional, mas outro profissional evoluiu. O PA vai para quem evoluiu.' },
            { label: '🚫 Cancelada', cor: B.gray, recebe: 'Não recebe', cond: 'Status cancelado no sistema e sem tratativa. Excluída da base de cálculo do percentual.' },
            { label: '⬜ Não evoluída', cor: '#92400e', recebe: 'Não recebe', cond: 'Paciente ausente e sessão sem tratativa. Sem nenhum registro de desfecho.' },
            { label: '⚠️ Evolução sem presença', cor: B.red, recebe: '⚠️ Investigar', cond: 'INCONSISTÊNCIA: recepção marcou ausência, mas profissional registrou evolução.' },
            { label: '⚠️ Cancelado evoluído', cor: B.red, recebe: '⚠️ Investigar', cond: 'INCONSISTÊNCIA: sessão foi cancelada no sistema, mas há evolução registrada.' },
          ].map(x => (
            <div key={x.label} className="rounded-lg p-2" style={{ background: x.cor + '10', borderLeft: `2px solid ${x.cor}` }}>
              <div className="flex gap-2 items-center flex-wrap">
                <span className="font-bold text-xs" style={{ color: x.cor }}>{x.label}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: x.recebe.startsWith('Recebe') ? B.green : x.recebe.startsWith('Pode') ? B.amber : x.recebe.startsWith('⚠️') ? B.red : B.gray }}>
                  {x.recebe}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">{x.cond}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ETA */}
      <div className="bg-white border rounded-xl p-5" style={{ borderLeft: `3px solid ${B.orange}` }}>
        <h3 className="font-bold text-base mb-3" style={{ color: B.orange }}>🏷️ Especialista Técnico de Área (ETA) — Modelo de 3 Frentes</h3>
        <p className="text-sm text-gray-600 mb-3">A especialidade ETA tem um modelo de remuneração composto por três componentes distintos e independentes:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div className="rounded-lg p-3" style={{ background: '#fed7aa' }}>
            <div className="font-bold text-sm" style={{ color: B.orange }}>① PPD — Disponibilidade</div>
            <div className="text-xs text-gray-700 mt-1">
              R${(diarias['Especialista Técnico de Área'] || 350).toFixed(2)} por dia escalado. Pago por toda semana em que a ETA está presente na clínica.
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ background: '#bbf7d0' }}>
            <div className="font-bold text-sm" style={{ color: B.green }}>② PA — Por Sessão Real</div>
            <div className="text-xs text-gray-700 mt-1">
              R${(taxasPA['Especialista Técnico de Área'] || 50).toFixed(2)} por sessão realizada com paciente real. Afetado pela % de presença na projeção.
            </div>
          </div>
          <div className="rounded-lg p-3" style={{ background: '#fed7aa' }}>
            <div className="font-bold text-sm" style={{ color: B.orange }}>③ Bônus Semanal ETA</div>
            <div className="text-xs text-gray-700 mt-1">
              R${etaBonus.toFixed(2)} fixo por semana trabalhada como ETA. <strong>Não afetado</strong> por % de presença.
            </div>
          </div>
        </div>
        <div className="rounded-lg p-3 text-xs" style={{ background: '#fff7ed', color: '#7c2d12' }}>
          <strong>Como o nº de semanas ETA é calculado:</strong> tomamos o <em>máximo de ocorrências entre os dias da semana em que há "Horário Administrativo"</em>. Isso garante que semanas em que um dos dias admin caiu em feriado, mas o outro não, ainda sejam contadas como semana trabalhada.
        </div>
      </div>

      {/* Percentual */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-bold text-base mb-3" style={{ color: B.navy }}>📐 Como o Percentual de Evolução é Calculado</h3>
        <div className="text-sm text-gray-700 space-y-2">
          <p><strong>Fórmula:</strong> <code className="bg-gray-100 px-1 rounded">(evoluções próprias + substituições realizadas) ÷ (agendadas − canceladas) × 100</code></p>
          <p><strong>Por que descontar as canceladas?</strong> Sessões canceladas estão fora do controle do profissional. Incluí-las penalizaria injustamente quem teve muitas faltas de pacientes.</p>
          <p><strong>Por que incluir substituições no numerador?</strong> O profissional realizou atendimentos além dos próprios — isso deve ser reconhecido. O percentual pode ultrapassar 100%.</p>
          <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: B.navyLt }}>
            <p><strong>Exemplo A:</strong> 162 agendadas − 35 canceladas = 127 válidas. Evoluiu 66 + 9 subs = 75. Percentual = 75/127 = <strong>59,1%</strong></p>
            <p><strong>Exemplo B:</strong> 162 agendadas − 0 canceladas = 162 válidas. Evoluiu 162 + 9 subs = 171. Percentual = 171/162 = <strong>105,6%</strong> ✓</p>
          </div>
        </div>
      </div>

      {/* Projeção */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-bold text-base mb-3" style={{ color: B.navy }}>📅 Projeção Mensal — Dias Úteis Reais</h3>
        <div className="text-sm text-gray-700 space-y-2">
          <p>A ferramenta usa a <strong>grade da semana importada</strong> como padrão semanal e extrapola para o mês inteiro contando <strong>quantas vezes cada dia da semana ocorre no mês</strong> — nunca um multiplicador fixo de 4,33.</p>
          <p><strong>Exemplo Junho 2026:</strong> Segunda 5×, Terça 5×, Quarta 4×, Quinta apenas 3× (04/06 = Corpus Christi), Sexta 4×.</p>
          <p><strong>Feriados nacionais</strong> são descontados automaticamente. Feriados municipais devem ser cadastrados manualmente em Config.</p>
          <div className="rounded-lg p-2 text-xs" style={{ background: '#fff8e1', color: '#92400e' }}>
            ⚠️ A aba Análise Futura é uma <em>projeção</em>: assume que o profissional terá a mesma grade durante todo o mês. Afastamentos, inclusões ou remanejamentos no meio do mês não são capturados.
          </div>
        </div>
      </div>

      <div className="rounded-xl p-4 text-sm" style={{ background: B.navyLt, color: B.navy }}>
        <strong>Para atualizar PA, PPD ou PME:</strong> acesse <em>⚙️ Config → PA + Diária (PPD)</em>. Os valores salvam automaticamente no navegador (localStorage). Para o Psicólogo Analista (CC), use <em>Config → Geral</em>.
      </div>
    </div>
  )
}
