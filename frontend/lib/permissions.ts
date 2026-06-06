export type UserRole =
  | 'admin'
  | 'diretoria'
  | 'recepcao'
  | 'terapeuta'
  | 'faturamento'

export const menuByRole: Record<UserRole, string[]> = {
  admin: [
    '/',
    '/solicitacao',
    '/guias',
    '/financeiro',
    '/admin',
  ],

  diretoria: [
    '/',
    '/solicitacao',
    '/guias',
    '/financeiro',
  ],

  recepcao: [
    '/',
    '/solicitacao',
  ],

  terapeuta: [
    '/',
    '/guias',
  ],

  faturamento: [
    '/',
    '/financeiro',
  ],
}