# Prompt — Audio Transcription

Leia:

docs/central-atendimento/09-audio-transcription.md

Sua missão é implementar transcrição de áudio.

Criar:

AudioTranscriptionService

TranscriptionProvider

Fluxo:

Áudio
↓
Storage
↓
Fila
↓
Transcrição
↓
Persistência

Implementar:

- Upload
- Download
- Transcrição
- Reprocessamento

Persistir:

audio_transcriptions

Integrar com IA:

- Resumo
- Sugestão resposta

Ao final apresentar:

"Ready for review"