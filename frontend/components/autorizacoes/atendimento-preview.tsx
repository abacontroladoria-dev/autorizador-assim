export default function AtendimentoPreview({ paciente }: any) {
  return (
    <div className="border p-3 rounded bg-gray-50">
      <p><strong>Paciente:</strong> {paciente.nome}</p>
      <p><strong>Matrícula:</strong> {paciente.matricula}</p>
      <p><strong>Status:</strong> AUTORIZADO</p>
    </div>
  )
}