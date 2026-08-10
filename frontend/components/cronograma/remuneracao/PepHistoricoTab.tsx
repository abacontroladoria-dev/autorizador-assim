"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { useHeader } from "@/contexts/HeaderContext"
import { getPrestadoresComApuracao, getEvolucaoMensalPrestador, type PontoEvolucaoMensal } from "@/services/pepApuracao.service"

const money = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`

function competenciaLabel(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number)
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(y, m - 1, 1))
  return `${nome.replace(".", "")}/${String(y).slice(2)}`
}

export function PepHistoricoTab() {
  const { setHeader, setRightContent } = useHeader()
  const [prestadores, setPrestadores] = useState<string[]>([])
  const [prestador, setPrestador] = useState("")
  const [pontos, setPontos] = useState<PontoEvolucaoMensal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setHeader("PEP - Histórico", "Relacionamento Prestador")
    setRightContent(null)
    return () => setHeader("", "")
  }, [setHeader, setRightContent])

  useEffect(() => {
    getPrestadoresComApuracao().then(({ data }) => {
      setPrestadores(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!prestador) { setPontos([]); return }
    getEvolucaoMensalPrestador(prestador).then(({ data }) => setPontos(data))
  }, [prestador])

  const dadosGrafico = useMemo(
    () => pontos.map(p => ({ ...p, mes: competenciaLabel(p.competencia) })),
    [pontos]
  )

  const totais = useMemo(
    () => pontos.reduce((acc, p) => ({ potencial: acc.potencial + p.potencial, alcancado: acc.alcancado + p.alcancado }), { potencial: 0, alcancado: 0 }),
    [pontos]
  )

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <label htmlFor="pep-historico-prestador" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Analista do Comportamento
        </label>
        <select
          id="pep-historico-prestador"
          value={prestador}
          onChange={e => setPrestador(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Selecione —</option>
          {prestadores.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {!loading && prestadores.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Ainda não há PEP apurada para nenhum prestador. Registre e apure entregas na aba "Entregas PEP" primeiro.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Esta lista independe da Grade carregada — mostra qualquer Analista com apuração já registrada, mesmo que tenha deixado a clínica.
        </p>
      </div>

      {!prestador ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Selecione um Analista do Comportamento para ver a evolução mensal.
        </div>
      ) : pontos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma competência apurada para {prestador} ainda.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex items-center gap-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Potencial acumulado</p>
              <p className="text-lg font-bold text-foreground">{money(totais.potencial)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Alcançado acumulado</p>
              <p className="text-lg font-bold text-[#8F6AA8]">{money(totais.alcancado)}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={dadosGrafico} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `R$ ${Math.round(v)}`}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v, nome) => [money(Number(v)), nome === "alcancado" ? "Alcançado" : "Potencial"]}
                    labelFormatter={mes => `Competência: ${mes}`}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend
                    formatter={valor => (valor === "alcancado" ? "Alcançado" : "Potencial")}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="alcancado" fill="#8F6AA8" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Line dataKey="potencial" stroke="#6b7280" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Competência</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Potencial</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Alcançado</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">% alcançado</th>
                </tr>
              </thead>
              <tbody>
                {pontos.slice().reverse().map(p => (
                  <tr key={p.competencia} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{competenciaLabel(p.competencia)}</td>
                    <td className="px-4 py-3 text-right">{money(p.potencial)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{money(p.alcancado)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.potencial > 0 ? `${((p.alcancado / p.potencial) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
