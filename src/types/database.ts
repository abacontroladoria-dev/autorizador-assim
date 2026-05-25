export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agenda_orbita: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          crm: string | null
          data_atendimento: string
          dep: string | null
          empresa: string | null
          horario: string
          id: string
          matricula: string | null
          nome_medico: string | null
          paciente_id: string
          paciente_nome: string
          terapia: string | null
          tuss: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          crm?: string | null
          data_atendimento: string
          dep?: string | null
          empresa?: string | null
          horario: string
          id?: string
          matricula?: string | null
          nome_medico?: string | null
          paciente_id: string
          paciente_nome: string
          terapia?: string | null
          tuss?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string
          dep?: string | null
          empresa?: string | null
          horario?: string
          id?: string
          matricula?: string | null
          nome_medico?: string | null
          paciente_id?: string
          paciente_nome?: string
          terapia?: string | null
          tuss?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agenda_terapias: {
        Row: {
          created_at: string | null
          crm: string | null
          data_atendimento: string
          dep: string | null
          empresa: string | null
          horario: string
          id: string
          matricula: string | null
          nome_medico: string | null
          paciente_id: string
          paciente_nome: string
          terapia: string | null
          tuss: string | null
        }
        Insert: {
          created_at?: string | null
          crm?: string | null
          data_atendimento: string
          dep?: string | null
          empresa?: string | null
          horario: string
          id?: string
          matricula?: string | null
          nome_medico?: string | null
          paciente_id: string
          paciente_nome: string
          terapia?: string | null
          tuss?: string | null
        }
        Update: {
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string
          dep?: string | null
          empresa?: string | null
          horario?: string
          id?: string
          matricula?: string | null
          nome_medico?: string | null
          paciente_id?: string
          paciente_nome?: string
          terapia?: string | null
          tuss?: string | null
        }
        Relationships: []
      }
      agenda_tita: {
        Row: {
          atividade: string | null
          ativo: boolean | null
          clinica_id: number | null
          clinica_nome: string | null
          convenio_id: number | null
          convenio_nome: string | null
          cpf: string | null
          created_at: string | null
          data_atendimento: string | null
          data_nascimento: string | null
          hora_final: string | null
          hora_inicial: string | null
          id: number
          numero_carteirinha: string | null
          origem: string | null
          paciente_id: number | null
          paciente_nome: string | null
          profissional_cpf: string | null
          profissional_id: number | null
          profissional_nome: string | null
          raw_json: Json | null
          responsavel_email: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          sala_id: number | null
          sala_nome: string | null
          sala_observacoes: string | null
          terapia_exibicao_id: number | null
          terapia_exibicao_nome: string | null
          terapia_id: number | null
          terapia_nome: string | null
          tita_agendamento_id: number
          updated_at: string | null
        }
        Insert: {
          atividade?: string | null
          ativo?: boolean | null
          clinica_id?: number | null
          clinica_nome?: string | null
          convenio_id?: number | null
          convenio_nome?: string | null
          cpf?: string | null
          created_at?: string | null
          data_atendimento?: string | null
          data_nascimento?: string | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: number
          numero_carteirinha?: string | null
          origem?: string | null
          paciente_id?: number | null
          paciente_nome?: string | null
          profissional_cpf?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          raw_json?: Json | null
          responsavel_email?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          sala_id?: number | null
          sala_nome?: string | null
          sala_observacoes?: string | null
          terapia_exibicao_id?: number | null
          terapia_exibicao_nome?: string | null
          terapia_id?: number | null
          terapia_nome?: string | null
          tita_agendamento_id: number
          updated_at?: string | null
        }
        Update: {
          atividade?: string | null
          ativo?: boolean | null
          clinica_id?: number | null
          clinica_nome?: string | null
          convenio_id?: number | null
          convenio_nome?: string | null
          cpf?: string | null
          created_at?: string | null
          data_atendimento?: string | null
          data_nascimento?: string | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: number
          numero_carteirinha?: string | null
          origem?: string | null
          paciente_id?: number | null
          paciente_nome?: string | null
          profissional_cpf?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          raw_json?: Json | null
          responsavel_email?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          sala_id?: number | null
          sala_nome?: string | null
          sala_observacoes?: string | null
          terapia_exibicao_id?: number | null
          terapia_exibicao_nome?: string | null
          terapia_id?: number | null
          terapia_nome?: string | null
          tita_agendamento_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      agenda_tita_autorizacao_backup_20260508: {
        Row: {
          atividade: string | null
          ativo: boolean | null
          clinica_id: number | null
          clinica_nome: string | null
          codigo_tuss: string | null
          convenio_id: number | null
          convenio_nome: string | null
          cpf: string | null
          created_at: string | null
          crm: string | null
          data_atendimento: string | null
          dep: string | null
          empresa: string | null
          hora_final: string | null
          hora_inicial: string | null
          id: number | null
          matricula: string | null
          nome_medico: string | null
          numero_carteirinha: string | null
          origem: string | null
          paciente_id: number | null
          paciente_nome: string | null
          profissional_cpf: string | null
          profissional_id: number | null
          profissional_nome: string | null
          raw_json: Json | null
          responsavel_email: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          sala_id: number | null
          sala_nome: string | null
          sala_observacoes: string | null
          terapia_exibicao_id: number | null
          terapia_exibicao_nome: string | null
          terapia_id: number | null
          terapia_nome: string | null
          tita_agendamento_id: number | null
          updated_at: string | null
        }
        Insert: {
          atividade?: string | null
          ativo?: boolean | null
          clinica_id?: number | null
          clinica_nome?: string | null
          codigo_tuss?: string | null
          convenio_id?: number | null
          convenio_nome?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string | null
          dep?: string | null
          empresa?: string | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: number | null
          matricula?: string | null
          nome_medico?: string | null
          numero_carteirinha?: string | null
          origem?: string | null
          paciente_id?: number | null
          paciente_nome?: string | null
          profissional_cpf?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          raw_json?: Json | null
          responsavel_email?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          sala_id?: number | null
          sala_nome?: string | null
          sala_observacoes?: string | null
          terapia_exibicao_id?: number | null
          terapia_exibicao_nome?: string | null
          terapia_id?: number | null
          terapia_nome?: string | null
          tita_agendamento_id?: number | null
          updated_at?: string | null
        }
        Update: {
          atividade?: string | null
          ativo?: boolean | null
          clinica_id?: number | null
          clinica_nome?: string | null
          codigo_tuss?: string | null
          convenio_id?: number | null
          convenio_nome?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string | null
          dep?: string | null
          empresa?: string | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: number | null
          matricula?: string | null
          nome_medico?: string | null
          numero_carteirinha?: string | null
          origem?: string | null
          paciente_id?: number | null
          paciente_nome?: string | null
          profissional_cpf?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          raw_json?: Json | null
          responsavel_email?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          sala_id?: number | null
          sala_nome?: string | null
          sala_observacoes?: string | null
          terapia_exibicao_id?: number | null
          terapia_exibicao_nome?: string | null
          terapia_id?: number | null
          terapia_nome?: string | null
          tita_agendamento_id?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      autorizacoes: {
        Row: {
          created_at: string | null
          crm: string | null
          data_atendimento: string | null
          data_horario: string | null
          dep: string | null
          empresa: string | null
          erro: string | null
          erro_detalhe: string | null
          finished_at: string | null
          horario: string | null
          horario_atendimento: string | null
          id: string
          log: Json | null
          machine_id: string | null
          matricula: string | null
          nome_medico: string | null
          orbita_agenda_id: string | null
          paciente_id: string | null
          paciente_nome: string | null
          started_at: string | null
          status: string | null
          terapia: string | null
          tuss1: string | null
          ultima_autorizacao: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string | null
          data_horario?: string | null
          dep?: string | null
          empresa?: string | null
          erro?: string | null
          erro_detalhe?: string | null
          finished_at?: string | null
          horario?: string | null
          horario_atendimento?: string | null
          id?: string
          log?: Json | null
          machine_id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          orbita_agenda_id?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          started_at?: string | null
          status?: string | null
          terapia?: string | null
          tuss1?: string | null
          ultima_autorizacao?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string | null
          data_horario?: string | null
          dep?: string | null
          empresa?: string | null
          erro?: string | null
          erro_detalhe?: string | null
          finished_at?: string | null
          horario?: string | null
          horario_atendimento?: string | null
          id?: string
          log?: Json | null
          machine_id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          orbita_agenda_id?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          started_at?: string | null
          status?: string | null
          terapia?: string | null
          tuss1?: string | null
          ultima_autorizacao?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "maquinas"
            referencedColumns: ["id"]
          },
        ]
      }
      autorizacoes_assim: {
        Row: {
          codigo_erro: string | null
          codigo_tuss: string | null
          data_autorizacao: string | null
          data_execucao: string | null
          descricao_erro: string | null
          guia: string
          matricula: string | null
          matricula_limpa: string | null
          paciente_id: number | null
          paciente_nome: string | null
          status: string | null
          status_tratado: string | null
          teve_token: boolean | null
          token: string | null
          updated_at: string | null
        }
        Insert: {
          codigo_erro?: string | null
          codigo_tuss?: string | null
          data_autorizacao?: string | null
          data_execucao?: string | null
          descricao_erro?: string | null
          guia: string
          matricula?: string | null
          matricula_limpa?: string | null
          paciente_id?: number | null
          paciente_nome?: string | null
          status?: string | null
          status_tratado?: string | null
          teve_token?: boolean | null
          token?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo_erro?: string | null
          codigo_tuss?: string | null
          data_autorizacao?: string | null
          data_execucao?: string | null
          descricao_erro?: string | null
          guia?: string
          matricula?: string | null
          matricula_limpa?: string | null
          paciente_id?: number | null
          paciente_nome?: string | null
          status?: string | null
          status_tratado?: string | null
          teve_token?: boolean | null
          token?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_fila_null_terapia: {
        Row: {
          agenda_id: string | null
          assim_updated_at: string | null
          completed_at: string | null
          completed_by: string | null
          completion_type: string | null
          created_at: string | null
          criado_por: string | null
          crm: string | null
          data_atendimento: string | null
          data_horario: string | null
          dep: string | null
          empresa: string | null
          error_message: string | null
          execution_time_ms: number | null
          horario: string | null
          horario_autorizacao: string | null
          id: string | null
          machine_id: string | null
          matricula: string | null
          nome_medico: string | null
          numero_autorizacao: string | null
          paciente_id: string | null
          paciente_nome: string | null
          started_at: string | null
          status: string | null
          status_assim: string | null
          terapia_exibicao_id: number | null
          terapia_falta: string | null
          terapia_nome: string | null
          tipo_falta: string | null
          tuss: string | null
          tuss1: string | null
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          agenda_id?: string | null
          assim_updated_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_type?: string | null
          created_at?: string | null
          criado_por?: string | null
          crm?: string | null
          data_atendimento?: string | null
          data_horario?: string | null
          dep?: string | null
          empresa?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          horario?: string | null
          horario_autorizacao?: string | null
          id?: string | null
          machine_id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          numero_autorizacao?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          started_at?: string | null
          status?: string | null
          status_assim?: string | null
          terapia_exibicao_id?: number | null
          terapia_falta?: string | null
          terapia_nome?: string | null
          tipo_falta?: string | null
          tuss?: string | null
          tuss1?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          agenda_id?: string | null
          assim_updated_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_type?: string | null
          created_at?: string | null
          criado_por?: string | null
          crm?: string | null
          data_atendimento?: string | null
          data_horario?: string | null
          dep?: string | null
          empresa?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          horario?: string | null
          horario_autorizacao?: string | null
          id?: string | null
          machine_id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          numero_autorizacao?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          started_at?: string | null
          status?: string | null
          status_assim?: string | null
          terapia_exibicao_id?: number | null
          terapia_falta?: string | null
          terapia_nome?: string | null
          tipo_falta?: string | null
          tuss?: string | null
          tuss1?: string | null
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      chamada_paciente: {
        Row: {
          agenda_id: string | null
          chamado_em: string | null
          chamado_por: string | null
          id: string
          nome: string
          sala: string | null
          status: string | null
          unidade: string | null
        }
        Insert: {
          agenda_id?: string | null
          chamado_em?: string | null
          chamado_por?: string | null
          id?: string
          nome: string
          sala?: string | null
          status?: string | null
          unidade?: string | null
        }
        Update: {
          agenda_id?: string | null
          chamado_em?: string | null
          chamado_por?: string | null
          id?: string
          nome?: string
          sala?: string | null
          status?: string | null
          unidade?: string | null
        }
        Relationships: []
      }
      controle_disponibilidade_terapeutas: {
        Row: {
          agenda_id: number | null
          created_at: string
          criado_por: string | null
          data: string
          hora_final: string | null
          hora_inicial: string
          id: string
          motivo: string | null
          observacao: string | null
          possui_substituto: boolean
          status: string
          substituto_id: number | null
          substituto_nome: string | null
          terapeuta_id: number
          terapeuta_nome: string
          terapia_id: number | null
          terapia_nome: string | null
          updated_at: string
        }
        Insert: {
          agenda_id?: number | null
          created_at?: string
          criado_por?: string | null
          data: string
          hora_final?: string | null
          hora_inicial: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          possui_substituto?: boolean
          status?: string
          substituto_id?: number | null
          substituto_nome?: string | null
          terapeuta_id: number
          terapeuta_nome: string
          terapia_id?: number | null
          terapia_nome?: string | null
          updated_at?: string
        }
        Update: {
          agenda_id?: number | null
          created_at?: string
          criado_por?: string | null
          data?: string
          hora_final?: string | null
          hora_inicial?: string
          id?: string
          motivo?: string | null
          observacao?: string | null
          possui_substituto?: boolean
          status?: string
          substituto_id?: number | null
          substituto_nome?: string | null
          terapeuta_id?: number
          terapeuta_nome?: string
          terapia_id?: number | null
          terapia_nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      controle_terapeutico: {
        Row: {
          confirmado_em: string | null
          confirmado_por: string | null
          created_at: string | null
          data_atualizacao: string | null
          id: string
          observacao: string | null
          profissional_substituto_id: number | null
          profissional_substituto_nome: string | null
          status: string
          tita_agendamento_id: number
          updated_at: string | null
        }
        Insert: {
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string | null
          data_atualizacao?: string | null
          id?: string
          observacao?: string | null
          profissional_substituto_id?: number | null
          profissional_substituto_nome?: string | null
          status?: string
          tita_agendamento_id: number
          updated_at?: string | null
        }
        Update: {
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string | null
          data_atualizacao?: string | null
          id?: string
          observacao?: string | null
          profissional_substituto_id?: number | null
          profissional_substituto_nome?: string | null
          status?: string
          tita_agendamento_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      fila_autorizacoes: {
        Row: {
          agenda_id: string | null
          assim_updated_at: string | null
          completed_at: string | null
          completed_by: string | null
          completion_type: string | null
          created_at: string | null
          criado_por: string | null
          crm: string | null
          data_atendimento: string
          data_horario: string | null
          dep: string | null
          empresa: string | null
          error_message: string | null
          execution_time_ms: number | null
          forma_autorizacao: string | null
          horario: string
          horario_autorizacao: string | null
          id: string
          machine_id: string | null
          matricula: string | null
          nome_medico: string | null
          numero_autorizacao: string | null
          paciente_id: string
          paciente_nome: string
          started_at: string | null
          status: string
          status_assim: string | null
          terapia_exibicao_id: number | null
          terapia_falta: string | null
          terapia_nome: string | null
          tipo_falta: string | null
          tita_agendamento_id: number | null
          tuss: string | null
          tuss1: string | null
          updated_at: string | null
          usuario_id: string | null
          validacao_finalizada_em: string | null
        }
        Insert: {
          agenda_id?: string | null
          assim_updated_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_type?: string | null
          created_at?: string | null
          criado_por?: string | null
          crm?: string | null
          data_atendimento: string
          data_horario?: string | null
          dep?: string | null
          empresa?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          forma_autorizacao?: string | null
          horario: string
          horario_autorizacao?: string | null
          id?: string
          machine_id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          numero_autorizacao?: string | null
          paciente_id: string
          paciente_nome: string
          started_at?: string | null
          status?: string
          status_assim?: string | null
          terapia_exibicao_id?: number | null
          terapia_falta?: string | null
          terapia_nome?: string | null
          tipo_falta?: string | null
          tita_agendamento_id?: number | null
          tuss?: string | null
          tuss1?: string | null
          updated_at?: string | null
          usuario_id?: string | null
          validacao_finalizada_em?: string | null
        }
        Update: {
          agenda_id?: string | null
          assim_updated_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_type?: string | null
          created_at?: string | null
          criado_por?: string | null
          crm?: string | null
          data_atendimento?: string
          data_horario?: string | null
          dep?: string | null
          empresa?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          forma_autorizacao?: string | null
          horario?: string
          horario_autorizacao?: string | null
          id?: string
          machine_id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          numero_autorizacao?: string | null
          paciente_id?: string
          paciente_nome?: string
          started_at?: string | null
          status?: string
          status_assim?: string | null
          terapia_exibicao_id?: number | null
          terapia_falta?: string | null
          terapia_nome?: string | null
          tipo_falta?: string | null
          tita_agendamento_id?: number | null
          tuss?: string | null
          tuss1?: string | null
          updated_at?: string | null
          usuario_id?: string | null
          validacao_finalizada_em?: string | null
        }
        Relationships: []
      }
      fila_autorizacoes_logs: {
        Row: {
          created_at: string | null
          descricao: string | null
          erro: string | null
          fila_id: string
          horario_autorizacao: string | null
          id: string
          machine_id: string | null
          metadata: Json | null
          numero_autorizacao: string | null
          status: string | null
          tita_agendamento_id: number | null
          usuario: string | null
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          erro?: string | null
          fila_id: string
          horario_autorizacao?: string | null
          id?: string
          machine_id?: string | null
          metadata?: Json | null
          numero_autorizacao?: string | null
          status?: string | null
          tita_agendamento_id?: number | null
          usuario?: string | null
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          erro?: string | null
          fila_id?: string
          horario_autorizacao?: string | null
          id?: string
          machine_id?: string | null
          metadata?: Json | null
          numero_autorizacao?: string | null
          status?: string | null
          tita_agendamento_id?: number | null
          usuario?: string | null
        }
        Relationships: []
      }
      grade_profissionais_tita: {
        Row: {
          cbo_profissional: string | null
          cpf_profissional: string | null
          created_at: string | null
          data: string
          dia_semana: string | null
          grade_clinica_id: number | null
          grade_terapeuta_id: number
          hora_final: string
          hora_inicial: string
          id: string
          id_sala: number | null
          id_unidade: number | null
          nome_profissional: string | null
          nome_terapia: string | null
          nome_unidade: string | null
          numero_telefone: string | null
          observacoes_sala: string | null
          profissional_id: number | null
          raw_json: Json | null
          registro_profissional: string | null
          sala: string | null
          status_agendamento: string | null
          terapia_exibicao: string | null
          terapia_exibicao_id: number | null
          terapia_id: number | null
          tipo_registro_profissional: string | null
          uf_registro_profissional: string | null
          updated_at: string | null
        }
        Insert: {
          cbo_profissional?: string | null
          cpf_profissional?: string | null
          created_at?: string | null
          data: string
          dia_semana?: string | null
          grade_clinica_id?: number | null
          grade_terapeuta_id: number
          hora_final: string
          hora_inicial: string
          id?: string
          id_sala?: number | null
          id_unidade?: number | null
          nome_profissional?: string | null
          nome_terapia?: string | null
          nome_unidade?: string | null
          numero_telefone?: string | null
          observacoes_sala?: string | null
          profissional_id?: number | null
          raw_json?: Json | null
          registro_profissional?: string | null
          sala?: string | null
          status_agendamento?: string | null
          terapia_exibicao?: string | null
          terapia_exibicao_id?: number | null
          terapia_id?: number | null
          tipo_registro_profissional?: string | null
          uf_registro_profissional?: string | null
          updated_at?: string | null
        }
        Update: {
          cbo_profissional?: string | null
          cpf_profissional?: string | null
          created_at?: string | null
          data?: string
          dia_semana?: string | null
          grade_clinica_id?: number | null
          grade_terapeuta_id?: number
          hora_final?: string
          hora_inicial?: string
          id?: string
          id_sala?: number | null
          id_unidade?: number | null
          nome_profissional?: string | null
          nome_terapia?: string | null
          nome_unidade?: string | null
          numero_telefone?: string | null
          observacoes_sala?: string | null
          profissional_id?: number | null
          raw_json?: Json | null
          registro_profissional?: string | null
          sala?: string | null
          status_agendamento?: string | null
          terapia_exibicao?: string | null
          terapia_exibicao_id?: number | null
          terapia_id?: number | null
          tipo_registro_profissional?: string | null
          uf_registro_profissional?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      guia_terapias: {
        Row: {
          created_at: string | null
          guia_numero: string
          id: string
          terapeuta_id: string | null
          terapia_nome: string
        }
        Insert: {
          created_at?: string | null
          guia_numero: string
          id?: string
          terapeuta_id?: string | null
          terapia_nome: string
        }
        Update: {
          created_at?: string | null
          guia_numero?: string
          id?: string
          terapeuta_id?: string | null
          terapia_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "guia_terapias_terapeuta_id_fkey"
            columns: ["terapeuta_id"]
            isOneToOne: false
            referencedRelation: "terapeutas"
            referencedColumns: ["id"]
          },
        ]
      }
      guias_processadas: {
        Row: {
          created_at: string | null
          guia_numero: string | null
          id: string
          metadata: Json | null
          page_count: number
          status: string
        }
        Insert: {
          created_at?: string | null
          guia_numero?: string | null
          id?: string
          metadata?: Json | null
          page_count?: number
          status?: string
        }
        Update: {
          created_at?: string | null
          guia_numero?: string | null
          id?: string
          metadata?: Json | null
          page_count?: number
          status?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          autorizacao_id: string | null
          created_at: string | null
          fila_id: string | null
          id: string
          mensagem: string | null
          nivel: string | null
          origem: string | null
        }
        Insert: {
          autorizacao_id?: string | null
          created_at?: string | null
          fila_id?: string | null
          id?: string
          mensagem?: string | null
          nivel?: string | null
          origem?: string | null
        }
        Update: {
          autorizacao_id?: string | null
          created_at?: string | null
          fila_id?: string | null
          id?: string
          mensagem?: string | null
          nivel?: string | null
          origem?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_autorizacao_id_fkey"
            columns: ["autorizacao_id"]
            isOneToOne: false
            referencedRelation: "autorizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_execucao: {
        Row: {
          created_at: string | null
          id: string
          machine_id: string | null
          mensagem: string | null
          payload: Json | null
          session_id: string | null
          status: string | null
          tipo_acao: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          machine_id?: string | null
          mensagem?: string | null
          payload?: Json | null
          session_id?: string | null
          status?: string | null
          tipo_acao?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          machine_id?: string | null
          mensagem?: string | null
          payload?: Json | null
          session_id?: string | null
          status?: string | null
          tipo_acao?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_execucao_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      maquinas: {
        Row: {
          ativa: boolean | null
          created_at: string | null
          hostname: string | null
          id: string
          ip: string | null
          last_seen: string | null
          navegador: string | null
          nome: string | null
          sistema_operacional: string | null
          token_maquina: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          ativa?: boolean | null
          created_at?: string | null
          hostname?: string | null
          id: string
          ip?: string | null
          last_seen?: string | null
          navegador?: string | null
          nome?: string | null
          sistema_operacional?: string | null
          token_maquina?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          ativa?: boolean | null
          created_at?: string | null
          hostname?: string | null
          id?: string
          ip?: string | null
          last_seen?: string | null
          navegador?: string | null
          nome?: string | null
          sistema_operacional?: string | null
          token_maquina?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      paciente_classificacao: {
        Row: {
          convenio_tipo: string | null
          created_at: string | null
          id: string
          paciente_id: string | null
          paciente_nome: string | null
          updated_at: string | null
        }
        Insert: {
          convenio_tipo?: string | null
          created_at?: string | null
          id?: string
          paciente_id?: string | null
          paciente_nome?: string | null
          updated_at?: string | null
        }
        Update: {
          convenio_tipo?: string | null
          created_at?: string | null
          id?: string
          paciente_id?: string | null
          paciente_nome?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      perfis: {
        Row: {
          created_at: string | null
          id: string
          nome: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          nome?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string | null
          role?: string | null
        }
        Relationships: []
      }
      pre_auditoria_snapshot: {
        Row: {
          created_at: string | null
          data_ref: string | null
          erros: number | null
          faltas: number | null
          id: string
          liberados: number | null
          pendentes: number | null
          tokens: number | null
          total: number | null
        }
        Insert: {
          created_at?: string | null
          data_ref?: string | null
          erros?: number | null
          faltas?: number | null
          id?: string
          liberados?: number | null
          pendentes?: number | null
          tokens?: number | null
          total?: number | null
        }
        Update: {
          created_at?: string | null
          data_ref?: string | null
          erros?: number | null
          faltas?: number | null
          id?: string
          liberados?: number | null
          pendentes?: number | null
          tokens?: number | null
          total?: number | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string | null
          id: string
          last_seen: string | null
          machine_id: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          last_seen?: string | null
          machine_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_seen?: string | null
          machine_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sync_controle: {
        Row: {
          force: boolean | null
          id: number
          last_run: string | null
          machine_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          force?: boolean | null
          id?: number
          last_run?: string | null
          machine_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          force?: boolean | null
          id?: number
          last_run?: string | null
          machine_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_status: {
        Row: {
          id: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          id: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      terapeuta_eventos: {
        Row: {
          created_at: string | null
          data_evento: string
          evento: string
          horario_referencia: string | null
          id: number
          observacao: string | null
          sala: string | null
          substituto: string | null
          terapeuta: string
          terapia: string | null
          unidade: string | null
          usuario: string | null
        }
        Insert: {
          created_at?: string | null
          data_evento: string
          evento: string
          horario_referencia?: string | null
          id?: number
          observacao?: string | null
          sala?: string | null
          substituto?: string | null
          terapeuta: string
          terapia?: string | null
          unidade?: string | null
          usuario?: string | null
        }
        Update: {
          created_at?: string | null
          data_evento?: string
          evento?: string
          horario_referencia?: string | null
          id?: number
          observacao?: string | null
          sala?: string | null
          substituto?: string | null
          terapeuta?: string
          terapia?: string | null
          unidade?: string | null
          usuario?: string | null
        }
        Relationships: []
      }
      terapeutas: {
        Row: {
          carimbo_digital: string | null
          created_at: string | null
          email: string | null
          id: string
          nome: string
        }
        Insert: {
          carimbo_digital?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
        }
        Update: {
          carimbo_digital?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      terapias_controle: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          terapia_id: number
          terapia_nome: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          terapia_id: number
          terapia_nome: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          terapia_id?: number
          terapia_nome?: string
        }
        Relationships: []
      }
      tita_grade_profissionais: {
        Row: {
          cpf_profissional: string | null
          created_at: string | null
          data_atendimento: string
          grade_clinica_id: number | null
          grade_terapeuta_id: number | null
          hora_final: string | null
          hora_inicial: string | null
          id: number
          raw_json: Json | null
          sala: string | null
          status_agendamento: string | null
          terapeuta_id: number | null
          terapeuta_nome: string
          terapia: string | null
          unidade: string | null
        }
        Insert: {
          cpf_profissional?: string | null
          created_at?: string | null
          data_atendimento: string
          grade_clinica_id?: number | null
          grade_terapeuta_id?: number | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: number
          raw_json?: Json | null
          sala?: string | null
          status_agendamento?: string | null
          terapeuta_id?: number | null
          terapeuta_nome: string
          terapia?: string | null
          unidade?: string | null
        }
        Update: {
          cpf_profissional?: string | null
          created_at?: string | null
          data_atendimento?: string
          grade_clinica_id?: number | null
          grade_terapeuta_id?: number | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: number
          raw_json?: Json | null
          sala?: string | null
          status_agendamento?: string | null
          terapeuta_id?: number | null
          terapeuta_nome?: string
          terapia?: string | null
          unidade?: string | null
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          email: string
          id: string
          nome: string
          primeiro_acesso: boolean | null
          role: string
          ultimo_acesso: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          email: string
          id: string
          nome: string
          primeiro_acesso?: boolean | null
          role?: string
          ultimo_acesso?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          nome?: string
          primeiro_acesso?: boolean | null
          role?: string
          ultimo_acesso?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      vw_central_pacientes_backup_20260508: {
        Row: {
          agenda_id: string | null
          assim_updated_at: string | null
          classificacao_terapia: string | null
          clinica_nome: string | null
          completion_type: string | null
          convenio: string | null
          convenio_nome: string | null
          created_at: string | null
          data_atendimento: string | null
          data_horario: string | null
          error_message: string | null
          execution_time_ms: number | null
          hora_final: string | null
          hora_inicial: string | null
          horario: string | null
          horario_autorizacao: string | null
          id: string | null
          machine_id: string | null
          numero_autorizacao: string | null
          numero_carteirinha: string | null
          paciente_id: string | null
          paciente_nome: string | null
          profissional_id: number | null
          profissional_nome: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          sala_nome: string | null
          status: string | null
          status_assim: string | null
          status_operacional: string | null
          terapia_exibicao_id: number | null
          terapia_exibicao_nome: string | null
          terapia_nome: string | null
          tipo_falta: string | null
          unidade: string | null
          updated_at: string | null
          usuario_nome: string | null
        }
        Insert: {
          agenda_id?: string | null
          assim_updated_at?: string | null
          classificacao_terapia?: string | null
          clinica_nome?: string | null
          completion_type?: string | null
          convenio?: string | null
          convenio_nome?: string | null
          created_at?: string | null
          data_atendimento?: string | null
          data_horario?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          hora_final?: string | null
          hora_inicial?: string | null
          horario?: string | null
          horario_autorizacao?: string | null
          id?: string | null
          machine_id?: string | null
          numero_autorizacao?: string | null
          numero_carteirinha?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          sala_nome?: string | null
          status?: string | null
          status_assim?: string | null
          status_operacional?: string | null
          terapia_exibicao_id?: number | null
          terapia_exibicao_nome?: string | null
          terapia_nome?: string | null
          tipo_falta?: string | null
          unidade?: string | null
          updated_at?: string | null
          usuario_nome?: string | null
        }
        Update: {
          agenda_id?: string | null
          assim_updated_at?: string | null
          classificacao_terapia?: string | null
          clinica_nome?: string | null
          completion_type?: string | null
          convenio?: string | null
          convenio_nome?: string | null
          created_at?: string | null
          data_atendimento?: string | null
          data_horario?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          hora_final?: string | null
          hora_inicial?: string | null
          horario?: string | null
          horario_autorizacao?: string | null
          id?: string | null
          machine_id?: string | null
          numero_autorizacao?: string | null
          numero_carteirinha?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          profissional_id?: number | null
          profissional_nome?: string | null
          responsavel_nome?: string | null
          responsavel_telefone?: string | null
          sala_nome?: string | null
          status?: string | null
          status_assim?: string | null
          status_operacional?: string | null
          terapia_exibicao_id?: number | null
          terapia_exibicao_nome?: string | null
          terapia_nome?: string | null
          tipo_falta?: string | null
          unidade?: string | null
          updated_at?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      worker_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          token: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          token: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          token?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      agenda_classificada: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          crm: string | null
          data_atendimento: string | null
          dep: string | null
          empresa: string | null
          horario: string | null
          id: string | null
          matricula: string | null
          nome_medico: string | null
          paciente_id: string | null
          paciente_nome: string | null
          status: string | null
          terapia: string | null
          tuss: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string | null
          dep?: string | null
          empresa?: string | null
          horario?: string | null
          id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          status?: never
          terapia?: string | null
          tuss?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          crm?: string | null
          data_atendimento?: string | null
          dep?: string | null
          empresa?: string | null
          horario?: string | null
          id?: string | null
          matricula?: string | null
          nome_medico?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          status?: never
          terapia?: string | null
          tuss?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agenda_tita_autorizacao: {
        Row: {
          atividade: string | null
          ativo: boolean | null
          clinica_id: number | null
          clinica_nome: string | null
          codigo_tuss: string | null
          convenio_id: number | null
          convenio_nome: string | null
          cpf: string | null
          created_at: string | null
          crm: string | null
          data_atendimento: string | null
          data_nascimento: string | null
          dep: string | null
          empresa: string | null
          hora_final: string | null
          hora_inicial: string | null
          id: number | null
          matricula: string | null
          nome_medico: string | null
          numero_carteirinha: string | null
          origem: string | null
          paciente_id: number | null
          paciente_nome: string | null
          profissional_cpf: string | null
          profissional_id: number | null
          profissional_nome: string | null
          raw_json: Json | null
          responsavel_email: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          sala_id: number | null
          sala_nome: string | null
          sala_observacoes: string | null
          terapia_exibicao_id: number | null
          terapia_exibicao_nome: string | null
          terapia_id: number | null
          terapia_nome: string | null
          tita_agendamento_id: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      vw_central_autorizacoes: {
        Row: {
          agendamentos: string[] | null
          codigos_tuss: string[] | null
          convenio_id: number | null
          convenio_nome: string | null
          cpf: string | null
          crm: string | null
          data_atendimento: string | null
          data_nascimento: string | null
          dep: string | null
          empresa: string | null
          horario: string | null
          horario_autorizacao: string | null
          matricula: string | null
          mostrar_na_tela: boolean | null
          nome_medico: string | null
          paciente_id: number | null
          paciente_nome: string | null
          profissionais: string[] | null
          sala_nome: string[] | null
          status_final: string | null
          terapias: string[] | null
          tipo_fluxo: string | null
          ultima_autorizacao_anterior: string | null
        }
        Relationships: []
      }
      vw_central_pacientes: {
        Row: {
          agenda_id: string | null
          assim_updated_at: string | null
          classificacao_terapia: string | null
          clinica_nome: string | null
          completion_type: string | null
          convenio: string | null
          convenio_nome: string | null
          created_at: string | null
          data_atendimento: string | null
          data_horario: string | null
          error_message: string | null
          execution_time_ms: number | null
          hora_final: string | null
          hora_inicial: string | null
          horario: string | null
          horario_autorizacao: string | null
          id: string | null
          machine_id: string | null
          numero_autorizacao: string | null
          numero_carteirinha: string | null
          paciente_id: string | null
          paciente_nome: string | null
          profissional_id: number | null
          profissional_nome: string | null
          responsavel_nome: string | null
          responsavel_telefone: string | null
          sala_nome: string | null
          status: string | null
          status_assim: string | null
          status_operacional: string | null
          terapia_exibicao_id: number | null
          terapia_exibicao_nome: string | null
          terapia_nome: string | null
          tipo_falta: string | null
          unidade: string | null
          updated_at: string | null
          usuario_nome: string | null
        }
        Relationships: []
      }
      vw_central_terapeutica: {
        Row: {
          clinica_id: number | null
          clinica_nome: string | null
          confirmado_em: string | null
          confirmado_por: string | null
          controle_created_at: string | null
          controle_updated_at: string | null
          convenio_nome: string | null
          data_atendimento: string | null
          hora_final: string | null
          hora_inicial: string | null
          observacao: string | null
          paciente_id: number | null
          paciente_nome: string | null
          profissional_id: number | null
          profissional_nome: string | null
          profissional_substituto_id: number | null
          profissional_substituto_nome: string | null
          sala_id: number | null
          sala_nome: string | null
          sala_operacional: string | null
          status: string | null
          terapia_id: number | null
          terapia_nome: string | null
          tita_agendamento_id: number | null
          unidade: string | null
        }
        Relationships: []
      }
      vw_match_autorizacoes_assim: {
        Row: {
          codigo_tuss: string | null
          consome_autorizacao: boolean | null
          cpf: string | null
          data_atendimento: string | null
          data_execucao: string | null
          data_nascimento: string | null
          guia: string | null
          hora_inicial: string | null
          ordem_autorizacao: number | null
          ordem_consumo: number | null
          paciente_id: number | null
          paciente_nome: string | null
          status_assim: string | null
          tita_agendamento_id: number | null
        }
        Relationships: []
      }
      vw_profissionais_disponiveis: {
        Row: {
          cbo_profissional: string | null
          cpf_profissional: string | null
          created_at: string | null
          data: string | null
          dia_semana: string | null
          grade_clinica_id: number | null
          grade_terapeuta_id: number | null
          hora_final: string | null
          hora_inicial: string | null
          id: string | null
          id_sala: number | null
          id_unidade: number | null
          nome_profissional: string | null
          nome_terapia: string | null
          nome_unidade: string | null
          numero_telefone: string | null
          observacoes_sala: string | null
          profissional_id: number | null
          raw_json: Json | null
          registro_profissional: string | null
          sala: string | null
          status_agendamento: string | null
          terapia_exibicao: string | null
          terapia_exibicao_id: number | null
          terapia_id: number | null
          tipo_registro_profissional: string | null
          uf_registro_profissional: string | null
          updated_at: string | null
        }
        Insert: {
          cbo_profissional?: string | null
          cpf_profissional?: string | null
          created_at?: string | null
          data?: string | null
          dia_semana?: string | null
          grade_clinica_id?: number | null
          grade_terapeuta_id?: number | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: string | null
          id_sala?: number | null
          id_unidade?: number | null
          nome_profissional?: string | null
          nome_terapia?: string | null
          nome_unidade?: string | null
          numero_telefone?: string | null
          observacoes_sala?: string | null
          profissional_id?: number | null
          raw_json?: Json | null
          registro_profissional?: string | null
          sala?: string | null
          status_agendamento?: string | null
          terapia_exibicao?: string | null
          terapia_exibicao_id?: number | null
          terapia_id?: number | null
          tipo_registro_profissional?: string | null
          uf_registro_profissional?: string | null
          updated_at?: string | null
        }
        Update: {
          cbo_profissional?: string | null
          cpf_profissional?: string | null
          created_at?: string | null
          data?: string | null
          dia_semana?: string | null
          grade_clinica_id?: number | null
          grade_terapeuta_id?: number | null
          hora_final?: string | null
          hora_inicial?: string | null
          id?: string | null
          id_sala?: number | null
          id_unidade?: number | null
          nome_profissional?: string | null
          nome_terapia?: string | null
          nome_unidade?: string | null
          numero_telefone?: string | null
          observacoes_sala?: string | null
          profissional_id?: number | null
          raw_json?: Json | null
          registro_profissional?: string | null
          sala?: string | null
          status_agendamento?: string | null
          terapia_exibicao?: string | null
          terapia_exibicao_id?: number | null
          terapia_id?: number | null
          tipo_registro_profissional?: string | null
          uf_registro_profissional?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_worker_token: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      rpc_horarios_disponiveis: {
        Args: { p_data: string; p_unidade: string }
        Returns: {
          hora: string
        }[]
      }
      sync_assim_results: { Args: never; Returns: undefined }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      status_terapeutico:
        | "pendente"
        | "presente"
        | "falta"
        | "atraso"
        | "cobertura_planejada"
        | "cobertura_confirmada"
        | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      status_terapeutico: [
        "pendente",
        "presente",
        "falta",
        "atraso",
        "cobertura_planejada",
        "cobertura_confirmada",
        "cancelado",
      ],
    },
  },
} as const

