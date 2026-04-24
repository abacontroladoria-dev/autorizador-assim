import NovaAutorizacaoForm from '@/components/autorizacoes/nova-autorizacao-form'

export default function NovaAutorizacaoPage() {
  return (
    <div className="max-w-3xl mx-auto w-full space-y-6">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">
          Nova Autorização
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Crie uma nova autorização para atendimento do paciente
        </p>
      </div>

      {/* FORM */}
      <NovaAutorizacaoForm />

    </div>
  )
}