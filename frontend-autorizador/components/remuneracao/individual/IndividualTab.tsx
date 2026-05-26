'use client'

import { useCalculadora } from '../CalculadoraProvider'
import { B } from '../lib/constants'
import ProfCardRemun from '../apuracao/ProfCardRemun'

export default function IndividualTab() {
  const {
    evoRows, evoFileRef, remuneracaoReal,
    remunIndProf, setRemunIndProf, remProfissionais, remMes,
  } = useCalculadora()

  if (!evoRows.length) return (
    <div className="text-center py-16">
      <div className="text-5xl mb-3">👤</div>
      <div className="font-bold text-lg mb-1" style={{ color: B.navy }}>
        Importe o relatório de evolução detalhada
      </div>
      <div className="text-sm text-gray-400 mb-4">analise_evolucao_detalhada_… .xls/.xlsx</div>
      <button
        onClick={() => evoFileRef.current?.click()}
        className="px-6 py-3 rounded-xl font-bold text-white text-sm"
        style={{ background: B.blue }}
      >
        Selecionar relatório XLS
      </button>
    </div>
  )

  const profSelecionado = remuneracaoReal.find(p => p.prof === remunIndProf)

  return (
    <>
      <div className="mb-5">
        <h2 className="font-bold text-lg mb-1" style={{ color: B.navy }}>
          👤 Remuneração Individual — {remMes}
        </h2>
        <div className="text-xs text-gray-400 mb-3">
          Selecione um profissional para visualizar somente os dados dele.
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={remunIndProf}
            onChange={e => setRemunIndProf(e.target.value)}
            className="border rounded-xl px-4 py-2 text-sm font-semibold min-w-[260px]"
            style={{ borderColor: B.blue, color: B.navy }}
          >
            <option value="">— Selecione um profissional —</option>
            {remProfissionais.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {remunIndProf && (
            <button onClick={() => setRemunIndProf('')} className="text-xs text-gray-400 hover:text-red-500">
              ✕ limpar
            </button>
          )}
        </div>
      </div>

      {!remunIndProf && (
        <div className="text-center py-12 rounded-xl bg-white text-gray-400 text-sm">
          Selecione um profissional no menu acima para ver seus dados.
        </div>
      )}

      {remunIndProf && !profSelecionado && (
        <div className="text-center py-12 rounded-xl bg-white text-gray-400 text-sm">
          Profissional não encontrado no relatório importado.
        </div>
      )}

      {profSelecionado && <ProfCardRemun p={profSelecionado} modoRP={false} />}
    </>
  )
}
