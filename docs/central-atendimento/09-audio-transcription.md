# Central de Atendimento Pulsar — Transcrição de Áudio

> Documento: Audio Transcription
> Versão: 1.0
> Status: Referência oficial de transcrição de mídia
>
> Este documento define a arquitetura, fluxo operacional, armazenamento e utilização de transcrições de áudio na Central de Atendimento do Pulsar.

---

# 1. Objetivo

Todo áudio recebido pela Central de Atendimento deve ser convertido em texto pesquisável.

Objetivos:

* Melhorar produtividade operacional
* Permitir atuação da IA
* Facilitar buscas
* Aumentar acessibilidade
* Melhorar auditoria
* Gerar contexto estruturado

---

# 2. Princípios Fundamentais

O áudio original continua sendo o registro principal.

A transcrição é uma representação complementar.

Portanto:

```text
Áudio Original
≠
Transcrição
```

Ambos devem permanecer disponíveis.

---

# 3. Fluxo Geral

```text
Áudio Recebido
↓
Download
↓
Storage
↓
Fila de Processamento
↓
Transcrição
↓
Validação
↓
Persistência
↓
IA
↓
Operador
```

---

# 4. Recebimento

Origens suportadas:

```text
Meta WABA
Evolution
Instagram (futuro)
```

---

Após recebimento:

```text
Webhook
↓
Mensagem
↓
Attachment
↓
Storage
```

---

# 5. Armazenamento

Destino oficial:

```text
Supabase Storage
```

Bucket:

```text
chat-audio
```

---

Estrutura sugerida:

```text
chat-audio/

organization_id/
  inbox_id/
    year/
      month/
        file.ext
```

---

# 6. Registro da Mensagem

A mensagem é criada normalmente.

Exemplo:

```text
messages
```

Tipo:

```text
audio
```

---

Anexo:

```text
message_attachments
```

---

# 7. Fila de Transcrição

A transcrição nunca deve bloquear o atendimento.

Fluxo:

```text
Mensagem
↓
Salva
↓
Fila
↓
Worker
↓
Transcrição
```

---

# 8. Estados da Transcrição

```text
pending

processing

completed

failed
```

---

# 9. Worker de Transcrição

Responsável por:

* Download do áudio
* Conversão de formato
* Envio ao motor de transcrição
* Armazenamento do resultado

---

# 10. Motores de Transcrição

Arquitetura preparada para:

```text
OpenAI Whisper

OpenAI GPT Audio

Google Speech

Azure Speech

Modelos Locais
```

---

A troca do motor não deve impactar:

* Banco
* IA
* Interface

---

# 11. Provider de Transcrição

Criar abstração:

```typescript
TranscriptionProvider
```

---

Interface:

```typescript
interface TranscriptionProvider {
  transcribe(
    audioUrl: string
  ): Promise<TranscriptionResult>
}
```

---

# 12. Tabela audio_transcriptions

Persistência oficial.

```sql
audio_transcriptions

id uuid

organization_id uuid

message_id uuid

provider text

transcription text

confidence numeric

status text

language text

processing_time_ms integer

created_at timestamptz
```

---

# 13. Idiomas

Suportados inicialmente:

```text
Português

Inglês

Espanhol
```

---

# 14. Detecção Automática

O motor deve detectar idioma automaticamente.

Exemplo:

```text
Olá, tudo bem?
```

↓

```text
pt-BR
```

---

# 15. Exibição na Interface

O operador deve visualizar:

```text
▶ Áudio

📝 Transcrição
```

---

Exemplo:

```text
[Ouvir Áudio]

Transcrição:

Boa tarde.
Gostaria de remarcar a sessão do Pedro para quarta-feira.
```

---

# 16. Falha na Transcrição

Caso ocorra erro:

```text
status = failed
```

---

Exibir:

```text
Transcrição indisponível
```

---

Permitir:

```text
Reprocessar
```

---

# 17. Integração com IA

Toda IA trabalha sobre:

```text
Texto
```

e não sobre o arquivo de áudio.

---

Fluxo:

```text
Áudio
↓
Transcrição
↓
Texto
↓
IA
```

---

# 18. Resumo Automático

Após transcrição:

A IA pode gerar:

```text
Resumo
```

---

Exemplo:

```text
Responsável solicita alteração de horário.

Paciente:
Pedro

Preferência:
Quarta-feira à tarde.
```

---

# 19. Classificação de Intenção

Após transcrição:

A IA pode classificar:

```text
agenda

financeiro

autorizacao

documentacao

reclamacao

outros
```

---

# 20. Sentimento

Após transcrição:

A IA pode identificar:

```text
positive

neutral

negative
```

---

# 21. Busca Global

A transcrição deve ser indexada.

Exemplo:

Operador pesquisa:

```text
remarcar sessão
```

---

Resultado:

```text
Mensagens de texto

+
Transcrições de áudio
```

---

# 22. Auditoria

Toda transcrição deve registrar:

```text
Quem processou

Quando processou

Motor utilizado

Tempo processamento
```

---

# 23. Custos

Registrar:

```text
Modelo

Duração

Tokens

Custo estimado
```

---

Objetivo:

Controle financeiro da IA.

---

# 24. Segurança

A transcrição deve respeitar:

```text
organization_id
```

---

Nenhuma organização pode acessar:

```text
Áudios

Transcrições
```

de outra organização.

---

# 25. LGPD

As transcrições devem seguir as mesmas regras de retenção dos áudios.

---

A exclusão de um áudio deve:

```text
Arquivar
+
Ocultar
```

e nunca remover auditoria.

---

# 26. Retenção

Padrão inicial:

```text
Áudio: permanente

Transcrição: permanente
```

---

Futuras políticas podem alterar retenção.

---

# 27. Métricas

Monitorar:

```text
Áudios recebidos

Tempo médio transcrição

Falhas

Idioma detectado

Custos
```

---

# 28. Dashboard

Indicadores:

```text
Transcrições Hoje

Tempo Médio

Falhas

Custos IA

Idiomas Detectados
```

---

# 29. Casos de Uso

## Responsável

Envia áudio:

```text
Meu filho não poderá comparecer amanhã.
```

↓

Transcrição

↓

IA

↓

Sugestão de resposta.

---

## Terapeuta

Envia áudio:

```text
Preciso alterar minha disponibilidade.
```

↓

Transcrição

↓

Classificação

↓

Encaminhamento.

---

# 30. Roadmap Futuro

Evoluções previstas:

```text
Diarização

Separação de locutores

Resumo automático avançado

Extração de entidades

Correção ortográfica

Identificação de emoção por voz
```

---

# 31. Decisões Arquiteturais

Consideradas definitivas:

✅ Áudio original preservado

✅ Transcrição assíncrona

✅ Supabase Storage

✅ Provider de transcrição desacoplado

✅ IA opera sobre texto

✅ Busca indexada

✅ Auditoria obrigatória

✅ Multi-modelo

✅ Compatível com Evolution e WABA

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
