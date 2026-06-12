import type { CCOData } from './types'

export const mockCCOData: CCOData = {
  kpis: {
    pacientes_conciliados: 38,
    pacientes_pendentes: 14,
    pacientes_em_revisao: 8,
    total_pacientes: 60,
    sessoes_prontas: 342,
    sessoes_pendentes: 155,
    sessoes_em_revisao: 23,
    total_sessoes: 520,
    evolucoes_pendentes: 68,
    evolucoes_atrasadas: 42,
    total_pacientes_assim: 247,
    total_sessoes_assim: 1843,
  },

  // Total = 155 (= pendencias_conciliacao)
  // 342 prontas + 23 em_revisao + 155 pendências = 520 total
  motivosPendencias: [
    { motivo: 'evolucao_pendente', label: 'Evolução pendente', quantidade: 68, percentual: 44, color: '#818cf8' },
    { motivo: 'sem_autorizacao',   label: 'Sem autorização',   quantidade: 34, percentual: 22, color: '#f87171' },
    { motivo: 'glosa',             label: 'Glosa',             quantidade: 21, percentual: 14, color: '#fb923c' },
    { motivo: 'falta_terapeuta',   label: 'Falta terapeuta',   quantidade: 15, percentual: 10, color: '#facc15' },
    { motivo: 'falta_paciente',    label: 'Falta paciente',    quantidade: 12, percentual:  8, color: '#a78bfa' },
    { motivo: 'outros',            label: 'Outros',            quantidade:  5, percentual:  3, color: '#94a3b8' },
  ],

  sessoesRevisao: [
    { id: '1',  paciente: 'Lucas Oliveira',      terapeutaOriginal: 'Ana Clara Souza',    terapeutaSubstituto: 'Mariana Lima',     data: '2026-06-03', status: 'EM_REVISAO' },
    { id: '2',  paciente: 'Beatriz Santos',      terapeutaOriginal: 'Rafael Mendes',      terapeutaSubstituto: 'Carla Ferreira',   data: '2026-06-04', status: 'EM_REVISAO' },
    { id: '3',  paciente: 'Pedro Alves',         terapeutaOriginal: 'Juliana Costa',      terapeutaSubstituto: 'Fernanda Rocha',   data: '2026-06-04', status: 'EM_REVISAO' },
    { id: '4',  paciente: 'Sofia Martins',       terapeutaOriginal: 'Carlos Eduardo',     terapeutaSubstituto: 'Patricia Gomes',   data: '2026-06-05', status: 'EM_REVISAO' },
    { id: '5',  paciente: 'Gabriel Rodrigues',   terapeutaOriginal: 'Mariana Lima',       terapeutaSubstituto: 'Thiago Andrade',   data: '2026-06-05', status: 'EM_REVISAO' },
    { id: '6',  paciente: 'Isabela Ferreira',    terapeutaOriginal: 'Thiago Andrade',     terapeutaSubstituto: 'Ana Clara Souza',  data: '2026-06-06', status: 'EM_REVISAO' },
    { id: '7',  paciente: 'Mateus Costa',        terapeutaOriginal: 'Patricia Gomes',     terapeutaSubstituto: 'Rafael Mendes',    data: '2026-06-06', status: 'EM_REVISAO' },
    { id: '8',  paciente: 'Laura Pereira',       terapeutaOriginal: 'Carla Ferreira',     terapeutaSubstituto: 'Juliana Costa',    data: '2026-06-09', status: 'EM_REVISAO' },
    { id: '9',  paciente: 'Enzo Nascimento',     terapeutaOriginal: 'Fernanda Rocha',     terapeutaSubstituto: 'Carlos Eduardo',   data: '2026-06-09', status: 'EM_REVISAO' },
    { id: '10', paciente: 'Valentina Silva',     terapeutaOriginal: 'Ana Clara Souza',    terapeutaSubstituto: 'Patricia Gomes',   data: '2026-06-10', status: 'EM_REVISAO' },
    { id: '11', paciente: 'Arthur Lima',         terapeutaOriginal: 'Rafael Mendes',      terapeutaSubstituto: 'Mariana Lima',     data: '2026-06-10', status: 'EM_REVISAO' },
    { id: '12', paciente: 'Alice Carvalho',      terapeutaOriginal: 'Juliana Costa',      terapeutaSubstituto: 'Thiago Andrade',   data: '2026-06-11', status: 'EM_REVISAO' },
    { id: '13', paciente: 'Davi Mendes',         terapeutaOriginal: 'Carlos Eduardo',     terapeutaSubstituto: 'Carla Ferreira',   data: '2026-06-11', status: 'EM_REVISAO' },
    { id: '14', paciente: 'Larissa Barbosa',     terapeutaOriginal: 'Thiago Andrade',     terapeutaSubstituto: 'Fernanda Rocha',   data: '2026-06-12', status: 'EM_REVISAO' },
    { id: '15', paciente: 'Henrique Teixeira',   terapeutaOriginal: 'Mariana Lima',       terapeutaSubstituto: 'Ana Clara Souza',  data: '2026-06-12', status: 'EM_REVISAO' },
    { id: '16', paciente: 'Camila Sousa',        terapeutaOriginal: 'Patricia Gomes',     terapeutaSubstituto: 'Rafael Mendes',    data: '2026-06-13', status: 'EM_REVISAO' },
    { id: '17', paciente: 'Nicolas Araújo',      terapeutaOriginal: 'Carla Ferreira',     terapeutaSubstituto: 'Juliana Costa',    data: '2026-06-16', status: 'EM_REVISAO' },
    { id: '18', paciente: 'Manuela Ribeiro',     terapeutaOriginal: 'Fernanda Rocha',     terapeutaSubstituto: 'Carlos Eduardo',   data: '2026-06-16', status: 'EM_REVISAO' },
    { id: '19', paciente: 'Felipe Monteiro',     terapeutaOriginal: 'Ana Clara Souza',    terapeutaSubstituto: 'Carla Ferreira',   data: '2026-06-17', status: 'EM_REVISAO' },
    { id: '20', paciente: 'Eloá Ramos',          terapeutaOriginal: 'Juliana Costa',      terapeutaSubstituto: 'Mariana Lima',     data: '2026-06-17', status: 'EM_REVISAO' },
  ],

  evolucoesPendentes: [
    { terapeuta: 'Ana Clara Souza',  quantidade: 18 },
    { terapeuta: 'Rafael Mendes',    quantidade: 14 },
    { terapeuta: 'Mariana Lima',     quantidade: 11 },
    { terapeuta: 'Juliana Costa',    quantidade:  9 },
    { terapeuta: 'Carlos Eduardo',   quantidade:  7 },
    { terapeuta: 'Thiago Andrade',   quantidade:  5 },
    { terapeuta: 'Patricia Gomes',   quantidade:  3 },
    { terapeuta: 'Fernanda Rocha',   quantidade:  1 },
  ],

  pacientesComPendencias: [
    { id: '1',  nome: 'Lucas Oliveira',      ocorrencias: 18, tiposPendencia: ['evolucao_pendente', 'glosa'] },
    { id: '4',  nome: 'Sofia Martins',       ocorrencias: 15, tiposPendencia: ['evolucao_pendente', 'falta_terapeuta'] },
    { id: '5',  nome: 'Gabriel Rodrigues',   ocorrencias: 12, tiposPendencia: ['evolucao_pendente'] },
    { id: '2',  nome: 'Beatriz Santos',      ocorrencias: 12, tiposPendencia: ['sem_autorizacao', 'glosa'] },
    { id: '3',  nome: 'Pedro Alves',         ocorrencias: 10, tiposPendencia: ['evolucao_pendente', 'falta_paciente'] },
    { id: '6',  nome: 'Isabela Ferreira',    ocorrencias: 10, tiposPendencia: ['evolucao_pendente'] },
    { id: '7',  nome: 'Mateus Costa',        ocorrencias: 10, tiposPendencia: ['sem_autorizacao'] },
    { id: '8',  nome: 'Laura Pereira',       ocorrencias: 10, tiposPendencia: ['evolucao_pendente', 'glosa'] },
    { id: '9',  nome: 'Enzo Nascimento',     ocorrencias:  8, tiposPendencia: ['evolucao_pendente', 'falta_terapeuta'] },
    { id: '10', nome: 'Valentina Silva',     ocorrencias:  8, tiposPendencia: ['glosa'] },
    { id: '11', nome: 'Arthur Lima',         ocorrencias:  8, tiposPendencia: ['evolucao_pendente'] },
    { id: '12', nome: 'Alice Carvalho',      ocorrencias:  8, tiposPendencia: ['sem_autorizacao'] },
    { id: '13', nome: 'Davi Mendes',         ocorrencias:  7, tiposPendencia: ['falta_paciente'] },
    { id: '14', nome: 'Larissa Barbosa',     ocorrencias:  6, tiposPendencia: ['evolucao_pendente'] },
    { id: '15', nome: 'Henrique Teixeira',   ocorrencias:  6, tiposPendencia: ['evolucao_pendente'] },
  ],

  pacientesEvolucaoPendentePorTerapeuta: [
    {
      terapeuta: 'Ana Clara Souza',
      pacientes: [
        { id: '1', nome: 'Lucas Oliveira', quantidade: 4 },
        { id: '4', nome: 'Sofia Martins', quantidade: 3 },
        { id: '5', nome: 'Gabriel Rodrigues', quantidade: 3 },
        { id: '2', nome: 'Beatriz Santos', quantidade: 3 },
        { id: '3', nome: 'Pedro Alves', quantidade: 2 },
        { id: '6', nome: 'Isabela Ferreira', quantidade: 2 },
        { id: '9', nome: 'Enzo Nascimento', quantidade: 1 },
      ],
    },
    {
      terapeuta: 'Rafael Mendes',
      pacientes: [
        { id: '7', nome: 'Mateus Costa', quantidade: 4 },
        { id: '8', nome: 'Laura Pereira', quantidade: 3 },
        { id: '11', nome: 'Arthur Lima', quantidade: 3 },
        { id: '12', nome: 'Alice Carvalho', quantidade: 2 },
        { id: '9', nome: 'Enzo Nascimento', quantidade: 2 },
      ],
    },
    {
      terapeuta: 'Mariana Lima',
      pacientes: [
        { id: '1', nome: 'Lucas Oliveira', quantidade: 2 },
        { id: '4', nome: 'Sofia Martins', quantidade: 2 },
        { id: '5', nome: 'Gabriel Rodrigues', quantidade: 2 },
        { id: '10', nome: 'Valentina Silva', quantidade: 2 },
        { id: '14', nome: 'Larissa Barbosa', quantidade: 2 },
        { id: '15', nome: 'Henrique Teixeira', quantidade: 1 },
      ],
    },
    {
      terapeuta: 'Juliana Costa',
      pacientes: [
        { id: '5', nome: 'Gabriel Rodrigues', quantidade: 2 },
        { id: '2', nome: 'Beatriz Santos', quantidade: 2 },
        { id: '11', nome: 'Arthur Lima', quantidade: 2 },
        { id: '12', nome: 'Alice Carvalho', quantidade: 2 },
        { id: '13', nome: 'Davi Mendes', quantidade: 1 },
      ],
    },
    {
      terapeuta: 'Carlos Eduardo',
      pacientes: [
        { id: '4', nome: 'Sofia Martins', quantidade: 2 },
        { id: '3', nome: 'Pedro Alves', quantidade: 1 },
        { id: '7', nome: 'Mateus Costa', quantidade: 1 },
        { id: '8', nome: 'Laura Pereira', quantidade: 1 },
        { id: '9', nome: 'Enzo Nascimento', quantidade: 1 },
        { id: '10', nome: 'Valentina Silva', quantidade: 1 },
      ],
    },
    {
      terapeuta: 'Thiago Andrade',
      pacientes: [
        { id: '6', nome: 'Isabela Ferreira', quantidade: 1 },
        { id: '8', nome: 'Laura Pereira', quantidade: 1 },
        { id: '12', nome: 'Alice Carvalho', quantidade: 1 },
        { id: '14', nome: 'Larissa Barbosa', quantidade: 1 },
        { id: '15', nome: 'Henrique Teixeira', quantidade: 1 },
      ],
    },
    {
      terapeuta: 'Patricia Gomes',
      pacientes: [
        { id: '3', nome: 'Pedro Alves', quantidade: 1 },
        { id: '2', nome: 'Beatriz Santos', quantidade: 1 },
        { id: '9', nome: 'Enzo Nascimento', quantidade: 1 },
      ],
    },
    {
      terapeuta: 'Fernanda Rocha',
      pacientes: [
        { id: '10', nome: 'Valentina Silva', quantidade: 1 },
      ],
    },
  ],

  pacientesAcaoImediata: [
    { pacienteNome: 'Sofia Martins', diasAtraso: 7 },
    { pacienteNome: 'Beatriz Santos', diasAtraso: 6 },
  ],

  pacientesAcompanhamento: [
    { pacienteNome: 'Lucas Oliveira', diasAtraso: 3 },
  ],

  pacientesSessoes: {
    'Lucas Oliveira': [
      { id: 's1', paciente: 'Lucas Oliveira', data: '2026-06-03', horario: '09:00', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-03 18:42' },
      { id: 's2', paciente: 'Lucas Oliveira', data: '2026-06-04', horario: '10:30', terapia: 'ABA', profissional: 'Mariana Lima', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Mariana Lima', evolucaoDataHora: '2026-06-04 19:15' },
      { id: 's3', paciente: 'Lucas Oliveira', data: '2026-06-05', horario: '14:00', terapia: 'Fonoaudiologia', profissional: 'Rafael Mendes', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Rafael Mendes', evolucaoDataHora: '2026-06-05 20:30' },
      { id: 's4', paciente: 'Lucas Oliveira', data: '2026-06-06', horario: '09:00', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-06 18:00' },
      { id: 's5', paciente: 'Lucas Oliveira', data: '2026-06-09', horario: '10:00', terapia: 'Terapia Ocupacional', profissional: 'Mariana Lima', evolucaoStatus: 'PENDENTE', substituicao: { original: 'Ana Clara Souza', substituto: 'Mariana Lima' } },
      { id: 's6', paciente: 'Lucas Oliveira', data: '2026-06-10', horario: '13:30', terapia: 'ABA', profissional: 'Mariana Lima', evolucaoStatus: 'PENDENTE' },
      { id: 's7', paciente: 'Lucas Oliveira', data: '2026-06-11', horario: '09:00', terapia: 'Fonoaudiologia', profissional: 'Rafael Mendes', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Rafael Mendes', evolucaoDataHora: '2026-06-11 19:45' },
      { id: 's8', paciente: 'Lucas Oliveira', data: '2026-06-12', horario: '14:00', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-12 20:10', glosa: true },
      { id: 's9', paciente: 'Lucas Oliveira', data: '2026-06-13', horario: '10:30', terapia: 'Psicologia', profissional: 'Carlos Eduardo', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Carlos Eduardo', evolucaoDataHora: '2026-06-13 19:20' },
      { id: 's10', paciente: 'Lucas Oliveira', data: '2026-06-16', horario: '09:00', terapia: 'ABA', profissional: 'Mariana Lima', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Mariana Lima', evolucaoDataHora: '2026-06-16 18:30' },
      { id: 's11', paciente: 'Lucas Oliveira', data: '2026-06-17', horario: '11:00', terapia: 'Fonoaudiologia', profissional: 'Rafael Mendes', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Rafael Mendes', evolucaoDataHora: '2026-06-17 20:00' },
      { id: 's12', paciente: 'Lucas Oliveira', data: '2026-06-18', horario: '14:30', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-18 19:10' },
    ],
    'Sofia Martins': [
      { id: 's13', paciente: 'Sofia Martins', data: '2026-06-03', horario: '10:00', terapia: 'ABA', profissional: 'Carlos Eduardo', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Carlos Eduardo', evolucaoDataHora: '2026-06-03 19:00' },
      { id: 's14', paciente: 'Sofia Martins', data: '2026-06-04', horario: '11:30', terapia: 'Fonoaudiologia', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-04 20:00' },
      { id: 's15', paciente: 'Sofia Martins', data: '2026-06-05', horario: '14:00', terapia: 'Terapia Ocupacional', profissional: 'Mariana Lima', evolucaoStatus: 'PENDENTE', substituicao: { original: 'Carlos Eduardo', substituto: 'Mariana Lima' } },
      { id: 's16', paciente: 'Sofia Martins', data: '2026-06-06', horario: '09:30', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-06 19:15' },
      { id: 's17', paciente: 'Sofia Martins', data: '2026-06-09', horario: '10:00', terapia: 'Psicologia', profissional: 'Carlos Eduardo', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Carlos Eduardo', evolucaoDataHora: '2026-06-09 20:30' },
      { id: 's18', paciente: 'Sofia Martins', data: '2026-06-10', horario: '13:00', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'PENDENTE', glosa: true },
      { id: 's19', paciente: 'Sofia Martins', data: '2026-06-11', horario: '11:00', terapia: 'Fonoaudiologia', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-11 20:00' },
      { id: 's20', paciente: 'Sofia Martins', data: '2026-06-12', horario: '14:30', terapia: 'ABA', profissional: 'Mariana Lima', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Mariana Lima', evolucaoDataHora: '2026-06-12 19:45' },
    ],
    'Gabriel Rodrigues': [
      { id: 's21', paciente: 'Gabriel Rodrigues', data: '2026-06-03', horario: '09:30', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-03 18:30' },
      { id: 's22', paciente: 'Gabriel Rodrigues', data: '2026-06-04', horario: '14:00', terapia: 'Fonoaudiologia', profissional: 'Juliana Costa', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Juliana Costa', evolucaoDataHora: '2026-06-04 20:15' },
      { id: 's23', paciente: 'Gabriel Rodrigues', data: '2026-06-05', horario: '10:00', terapia: 'Terapia Ocupacional', profissional: 'Mariana Lima', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Mariana Lima', evolucaoDataHora: '2026-06-05 19:30' },
      { id: 's24', paciente: 'Gabriel Rodrigues', data: '2026-06-06', horario: '13:30', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-06 20:00' },
      { id: 's25', paciente: 'Gabriel Rodrigues', data: '2026-06-09', horario: '11:00', terapia: 'Psicologia', profissional: 'Juliana Costa', evolucaoStatus: 'PENDENTE' },
      { id: 's26', paciente: 'Gabriel Rodrigues', data: '2026-06-10', horario: '09:00', terapia: 'ABA', profissional: 'Mariana Lima', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Mariana Lima', evolucaoDataHora: '2026-06-10 19:00' },
      { id: 's27', paciente: 'Gabriel Rodrigues', data: '2026-06-11', horario: '14:00', terapia: 'Fonoaudiologia', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-11 20:30' },
      { id: 's28', paciente: 'Gabriel Rodrigues', data: '2026-06-12', horario: '10:30', terapia: 'ABA', profissional: 'Juliana Costa', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Juliana Costa', evolucaoDataHora: '2026-06-12 19:45' },
    ],
    'Beatriz Santos': [
      { id: 's29', paciente: 'Beatriz Santos', data: '2026-06-04', horario: '09:00', terapia: 'ABA', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-04 18:45' },
      { id: 's30', paciente: 'Beatriz Santos', data: '2026-06-05', horario: '10:30', terapia: 'Fonoaudiologia', profissional: 'Patricia Gomes', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Patricia Gomes', evolucaoDataHora: '2026-06-05 19:15' },
      { id: 's31', paciente: 'Beatriz Santos', data: '2026-06-06', horario: '14:00', terapia: 'ABA', profissional: 'Juliana Costa', evolucaoStatus: 'PENDENTE', glosa: true },
      { id: 's32', paciente: 'Beatriz Santos', data: '2026-06-09', horario: '11:00', terapia: 'Psicologia', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-09 20:00' },
      { id: 's33', paciente: 'Beatriz Santos', data: '2026-06-10', horario: '13:30', terapia: 'ABA', profissional: 'Juliana Costa', evolucaoStatus: 'PENDENTE' },
      { id: 's34', paciente: 'Beatriz Santos', data: '2026-06-11', horario: '09:30', terapia: 'Fonoaudiologia', profissional: 'Ana Clara Souza', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Ana Clara Souza', evolucaoDataHora: '2026-06-11 19:30' },
      { id: 's35', paciente: 'Beatriz Santos', data: '2026-06-12', horario: '10:00', terapia: 'Terapia Ocupacional', profissional: 'Patricia Gomes', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Patricia Gomes', evolucaoDataHora: '2026-06-12 20:15' },
      { id: 's36', paciente: 'Beatriz Santos', data: '2026-06-13', horario: '14:00', terapia: 'ABA', profissional: 'Juliana Costa', evolucaoStatus: 'EVOLUIDA', evolucaoAutor: 'Juliana Costa', evolucaoDataHora: '2026-06-13 19:45' },
    ],
  },
}
