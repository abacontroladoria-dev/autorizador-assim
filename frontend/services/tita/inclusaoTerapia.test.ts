import { describe, expect, it } from "vitest"
import { montarBundleId } from "./inclusaoTerapia"

// A chave de dedup é o que impede o cronograma de receber dois cards para a
// mesma inclusão. Como ela é o único guarda contra isso — o unique index no
// banco depende inteiramente do valor que sai daqui —, as propriedades que a
// tornam confiável ficam fixadas em teste.

describe("montarBundleId", () => {
  it("é estável para o mesmo conjunto — é isto que faz o retry colidir", () => {
    // O caso real: duplo-clique no botão, ou o navegador reenviando o POST
    // depois de um timeout de rede. As duas chamadas carregam o mesmo bundle, e
    // a segunda precisa esbarrar no unique index em vez de criar outro card.
    const a = montarBundleId(["slot-1", "slot-2", "slot-3"])
    const b = montarBundleId(["slot-1", "slot-2", "slot-3"])
    expect(a).toBe(b)
  })

  it("ignora a ordem em que as sessões foram aceitas na tela", () => {
    // A ordem vem da seleção do usuário e não é estável entre duas tentativas —
    // se ela contasse, reordenar a mesma seleção geraria um card novo.
    expect(montarBundleId(["c", "a", "b"])).toBe(montarBundleId(["a", "b", "c"]))
  })

  it("distingue conjuntos diferentes", () => {
    // O outro lado da moeda: implantações genuinamente distintas precisam
    // passar. Um paciente que ganha um horário hoje e outro amanhã tem direito
    // a dois cards.
    expect(montarBundleId(["a", "b"])).not.toBe(montarBundleId(["a", "c"]))
  })

  it("distingue subconjunto de superconjunto", () => {
    // Implantar 2 horários e depois implantar os mesmos 2 mais um terceiro são
    // eventos diferentes, e o segundo não pode ser silenciado como duplicata.
    expect(montarBundleId(["a", "b"])).not.toBe(montarBundleId(["a", "b", "c"]))
  })

  it("não colide por concatenação ambígua", () => {
    // O separador precisa ser um caractere que não aparece em UUID: sem ele,
    // ["ab","c"] e ["a","bc"] produziriam a mesma string de entrada e dois
    // conjuntos distintos virariam o mesmo hash.
    expect(montarBundleId(["ab", "c"])).not.toBe(montarBundleId(["a", "bc"]))
  })

  it("cabe na coluna e é seguro para índice", () => {
    const id = montarBundleId(["slot-1"])
    expect(id).toMatch(/^[0-9a-f]{32}$/)
  })
})
