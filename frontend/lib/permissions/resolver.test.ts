import { describe, expect, it } from 'vitest'
import { isSuperRole, podeAcessarRota, resolverPermissoes, temPermissao } from './resolver'

// O bug que originou `podeAcessarRota`: o proxy.ts retornava cedo para `admin`
// (liberava a rota sem olhar código nenhum) e o `canAccess` do Sidebar não tinha
// esse atalho — exigia o código em codigosToRotas. Como `autorizacoes_avulsas` só
// está no roleDefaults de `admin` e `recepcao`, o admin abria a página pelo link
// direto e não via o item no menu.
//
// Estes testes travam a propriedade que importa: menu e navegação decidem igual,
// porque agora são a MESMA função.

describe('podeAcessarRota — admin', () => {
  it('admin acessa rota cujo código ele não tem no conjunto (o caso do bug)', () => {
    // Conjunto vazio de propósito: prova que o acesso vem do papel, não do código.
    expect(podeAcessarRota('admin', new Set(), '/autorizacoes-avulsas')).toBe(true)
  })

  it('admin acessa qualquer rota, inclusive uma que não existe no catálogo', () => {
    expect(podeAcessarRota('admin', new Set(), '/rota-que-nao-existe')).toBe(true)
  })
})

describe('podeAcessarRota — papéis comuns', () => {
  it('recepcao tem a avulsa por default', () => {
    const codigos = resolverPermissoes('recepcao', [])
    expect(podeAcessarRota('recepcao', codigos, '/autorizacoes-avulsas')).toBe(true)
  })

  it('diretoria NÃO tem a avulsa por default', () => {
    // Não é bug: a RLS de fila_autorizacoes só dá INSERT a admin e recepcao
    // (20260817120000). Se algum dia diretoria ganhar a tela, a migration tem de
    // vir junto — este teste falha e obriga a decisão a ser consciente.
    const codigos = resolverPermissoes('diretoria', [])
    expect(podeAcessarRota('diretoria', codigos, '/autorizacoes-avulsas')).toBe(false)
  })

  it('papel desconhecido não acessa nada além do que o conjunto disser', () => {
    expect(podeAcessarRota('inexistente', new Set(), '/autorizacoes-avulsas')).toBe(false)
  })

  it('revogação individual vence o default do papel', () => {
    const codigos = resolverPermissoes('recepcao', [
      { permissao_codigo: 'autorizacoes_avulsas', permitido: false },
    ])
    expect(podeAcessarRota('recepcao', codigos, '/autorizacoes-avulsas')).toBe(false)
  })

  it('concessão individual dá rota que o papel não tem', () => {
    const codigos = resolverPermissoes('terapeutico', [
      { permissao_codigo: 'autorizacoes_avulsas', permitido: true },
    ])
    expect(podeAcessarRota('terapeutico', codigos, '/autorizacoes-avulsas')).toBe(true)
  })
})

describe('podeAcessarRota — permissão por aba (querystring)', () => {
  // /cronograma/indicadores é uma rota só, com abas separadas por ?tab=. Se a
  // querystring fosse ignorada, quem tem uma aba veria todas.
  it('a aba concedida abre', () => {
    const soUmaAba = new Set(['indicadores_pacientes'])
    expect(
      podeAcessarRota('diretoria', soUmaAba, '/cronograma/indicadores', '?tab=pacientes')
    ).toBe(true)
  })

  it('a aba não concedida não abre na mesma rota', () => {
    const soUmaAba = new Set(['indicadores_pacientes'])
    expect(
      podeAcessarRota('diretoria', soUmaAba, '/cronograma/indicadores', '?tab=profissionais')
    ).toBe(false)
  })

  it('admin passa por cima da checagem de aba', () => {
    expect(
      podeAcessarRota('admin', new Set(), '/cronograma/indicadores', '?tab=profissionais')
    ).toBe(true)
  })
})

describe('isSuperRole / temPermissao', () => {
  it('só admin é super', () => {
    expect(isSuperRole('admin')).toBe(true)
    expect(isSuperRole('diretoria')).toBe(false)
    expect(isSuperRole('')).toBe(false)
  })

  it('temPermissao e podeAcessarRota concordam sobre o admin', () => {
    // As duas portas (código e rota) não podem divergir para o mesmo papel.
    expect(temPermissao('admin', new Set(), 'insumos')).toBe(true)
    expect(podeAcessarRota('admin', new Set(), '/insumos')).toBe(true)
  })

  it('revogação individual não derruba o admin (o papel vence)', () => {
    const codigos = resolverPermissoes('admin', [
      { permissao_codigo: 'insumos', permitido: false },
    ])
    expect(codigos.has('insumos')).toBe(false)
    expect(temPermissao('admin', codigos, 'insumos')).toBe(true)
  })
})
