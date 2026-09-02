import { describe, expect, it } from 'vitest'
import {
  INTERVALO_ASSIM_MIN,
  LIBERACAO_SOLICITAR_MIN,
  minutosDesde,
  minutosRestantes,
  podeSolicitar,
} from './intervaloAssim'

/**
 * `minutosDesde` faz `new Date(ultima)` e compara com `Date.now()`. A coluna
 * `horario_autorizacao` é `timestamp without time zone` com hora de parede de São
 * Paulo, e o navegador da recepção está no mesmo fuso — então o parse local casa.
 *
 * Estes helpers montam a string no MESMO formato (sem sufixo de fuso), para o
 * teste exercitar o caminho real em vez de um ISO com `Z` que o parse trataria
 * como UTC.
 */
function haMinutos(min: number): string {
  const d = new Date(Date.now() - min * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

describe('as duas constantes', () => {
  it('a liberação da /solicitar é um minuto acima do que a ASSIM exige', () => {
    // Se alguém igualar as duas, a margem de segurança desaparece em silêncio.
    expect(INTERVALO_ASSIM_MIN).toBe(30)
    expect(LIBERACAO_SOLICITAR_MIN).toBe(31)
    expect(LIBERACAO_SOLICITAR_MIN).toBeGreaterThan(INTERVALO_ASSIM_MIN)
  })
})

describe('podeSolicitar', () => {
  it('bloqueia aos 29 min nos dois limiares', () => {
    const ultima = haMinutos(29)
    expect(podeSolicitar(ultima)).toBe(false)
    expect(podeSolicitar(ultima, LIBERACAO_SOLICITAR_MIN)).toBe(false)
  })

  // O caso que define a mudança inteira: a faixa onde os dois limiares discordam.
  it('aos 30,5 min libera no default (30) e BLOQUEIA em 31', () => {
    const ultima = haMinutos(30.5)
    expect(podeSolicitar(ultima)).toBe(true)
    expect(podeSolicitar(ultima, LIBERACAO_SOLICITAR_MIN)).toBe(false)
  })

  it('aos 32 min libera nos dois', () => {
    const ultima = haMinutos(32)
    expect(podeSolicitar(ultima)).toBe(true)
    expect(podeSolicitar(ultima, LIBERACAO_SOLICITAR_MIN)).toBe(true)
  })

  it('sem autorização anterior, libera — não bloquear por falta de prova é deliberado', () => {
    // É o que permite a primeira solicitação do dia.
    expect(podeSolicitar(null)).toBe(true)
    expect(podeSolicitar(undefined, LIBERACAO_SOLICITAR_MIN)).toBe(true)
    expect(podeSolicitar('')).toBe(true)
  })

  it('data ilegível é tratada como ausência de registro', () => {
    expect(podeSolicitar('nao é uma data')).toBe(true)
  })
})

describe('minutosRestantes', () => {
  it('conta contra o limiar recebido, não contra o default', () => {
    // Aos 30,2 min já passou dos 30, mas ainda falta para os 31. Se contasse
    // contra o default, diria 0 com o botão ainda recusando.
    const ultima = haMinutos(30.2)
    expect(minutosRestantes(ultima)).toBe(0)
    expect(minutosRestantes(ultima, LIBERACAO_SOLICITAR_MIN)).toBe(1)
  })

  it('arredonda para cima — 29,1 min restantes viram 2 no limiar de 31', () => {
    expect(minutosRestantes(haMinutos(29.1), LIBERACAO_SOLICITAR_MIN)).toBe(2)
  })

  it('zero quando a janela já abriu', () => {
    expect(minutosRestantes(haMinutos(45), LIBERACAO_SOLICITAR_MIN)).toBe(0)
  })

  it('zero quando não há autorização anterior', () => {
    expect(minutosRestantes(null, LIBERACAO_SOLICITAR_MIN)).toBe(0)
  })
})

describe('minutosDesde', () => {
  it('null para ausência e para data inválida', () => {
    expect(minutosDesde(null)).toBeNull()
    expect(minutosDesde('')).toBeNull()
    expect(minutosDesde('30/08/2026 às 14h')).toBeNull()
  })

  it('mede o intervalo em minutos', () => {
    expect(minutosDesde(haMinutos(10))).toBeCloseTo(10, 1)
  })
})
