import { describe, expect, it } from 'vitest'
import { temPapelParaConferir } from './situacoes'

/**
 * A pergunta que este predicado responde é "existe papel na recepção?", e há
 * duas armadilhas: confundi-la com "como se tentou validar?" e confundir
 * "recusado" com "sem resposta". Os casos abaixo fixam as duas fronteiras.
 */
describe('temPapelParaConferir', () => {
  it('filipeta vale por si: token é fato do relatório da ASSIM', () => {
    // Sem gate de status de propósito — `teve_token` só existe em
    // autorizacoes_assim, e existir ali já prova que a autorização saiu.
    expect(temPapelParaConferir({ teve_token: true, status_assim: 'Liberado' })).toBe(true)
    expect(temPapelParaConferir({ teve_token: true, status_assim: '1013-CADASTRO' })).toBe(true)
  })

  it('erro facial com autorização liberada deixa papel', () => {
    expect(
      temPapelParaConferir({
        teve_token: false,
        forma_autorizacao: 'Erro no Reconhecimento Facial',
        status_assim: 'Liberado',
      })
    ).toBe(true)
  })

  it('erro facial sob recusa não deixa papel — o caso Bernardo', () => {
    // BERNARDO FREIRES PESSOA OTERIO, 31/08/2026 13:40, glosa 1013. A recepção
    // escolheu "erro no reconhecimento facial" ANTES de a ASSIM responder; a
    // ASSIM recusou, então filipeta não saiu e não há o que conferir.
    expect(
      temPapelParaConferir({
        teve_token: false,
        forma_autorizacao: 'Erro no Reconhecimento Facial',
        status_assim: '1013-CADASTRO DO BENEFICI',
      })
    ).toBe(false)
  })

  it('sem resposta da ASSIM o papel se presume: as 19 linhas de julho', () => {
    // RETORNO_NAO_CONFIRMADO: `status_assim` nulo é resposta DESCONHECIDA, não
    // negativa. Um gate que exigisse liberação derrubaria estas — medido em
    // 2026-09-02, 19 linhas de julho/2026 sairiam por engano.
    expect(
      temPapelParaConferir({
        teve_token: null,
        forma_autorizacao: 'Erro no Reconhecimento Facial',
        status_assim: null,
      })
    ).toBe(true)
  })

  it("'Liberado *' (cancelada) mantém o papel: a guia existiu", () => {
    // Veredito, não ausência — a guia saiu e o papel com ela, antes do
    // cancelamento. A filipeta é justamente o que documenta isso.
    expect(
      temPapelParaConferir({
        teve_token: false,
        forma_autorizacao: 'Erro no Reconhecimento Facial',
        status_assim: 'Liberado *',
      })
    ).toBe(true)
  })

  it('outras formas de validação nunca pedem conferência', () => {
    for (const forma of ['QR Code', 'Biometria', 'Beneficiário sem celular', null]) {
      expect(
        temPapelParaConferir({ teve_token: false, forma_autorizacao: forma, status_assim: 'Liberado' })
      ).toBe(false)
    }
  })

  it('tolera acento, caixa e espaço da opção gravada', () => {
    // Mesma tolerância de `erroReconhecimentoFacial` e do ILIKE no SQL: a
    // opção é digitada pela recepção e já apareceu em mais de uma grafia.
    expect(
      temPapelParaConferir({
        teve_token: false,
        forma_autorizacao: 'ERRO NO RECONHECIMENTO  FACIAL',
        status_assim: 'Liberado',
      })
    ).toBe(true)
  })
})
