	import AttendanceCard from './AttendanceCard'

	export default function AttendanceList({
	  dados,
	  selecionado,
	  setSelecionado,
	  loading
	}: any) {
	  return (
		<div className="overflow-y-auto pr-1 space-y-3">

		  {loading && (
			<div className="bg-white rounded-2xl p-10 text-center text-slate-400">
			  Carregando atendimentos...
			</div>
		  )}

		  {!loading && dados.length === 0 && (
			<div className="bg-white rounded-2xl p-10 text-center text-slate-400">
			  Nenhum atendimento encontrado
			</div>
		  )}

		  {dados.map((item: any) => (
			<AttendanceCard
			  key={`${item.id}_${item.horario}_${item.classificacao_terapia}`}
			  
			  item={item}
			  ativo={
				  selecionado === (
					item.id ??
					`${item.paciente_id}_${item.data_atendimento}_${item.horario}_${item.terapia_exibicao_id}`
				  )
				}
			  onClick={() =>

				  setSelecionado(

					item.id ??
					`${item.paciente_id}_${item.data_atendimento}_${item.horario}_${item.terapia_exibicao_id}`

				  )

				}
			/>
		  ))}
		</div>
	  )
	}