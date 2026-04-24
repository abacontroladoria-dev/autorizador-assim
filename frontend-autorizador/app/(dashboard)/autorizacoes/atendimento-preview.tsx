export default function AtendimentoPreview({ paciente, atendimento }: any) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-700">
          Resumo da Autorização
        </h3>

        <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-600 font-medium">
          Pronto para envio
        </span>
      </div>

      {/* DADOS */}
      <div className="grid grid-cols-2 gap-3 text-sm">

        <div>
          <p className="text-xs text-slate-400">Paciente</p>
          <p className="font-medium text-slate-800">
            {paciente?.nome || '-'}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-400">Matrícula</p>
          <p className="font-medium text-slate-800">
            {paciente?.matricula || '-'}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-400">Data</p>
          <p className="font-medium text-slate-800">
            {atendimento?.data || 'Não definida'}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-400">Horário</p>
          <p className="font-medium text-slate-800">
            {atendimento?.horario || 'Não definido'}
          </p>
        </div>

        <div className="col-span-2">
          <p className="text-xs text-slate-400">Terapia</p>
          <p className="font-medium text-slate-800">
            {atendimento?.terapia || 'Não informada'}
          </p>
        </div>

      </div>

    </div>
  )
}