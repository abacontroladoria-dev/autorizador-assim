import {
  Activity, Apple, BookOpen, Brain, ClipboardList, Dumbbell, Hand, HeartHandshake, MapPin, Mic2,
  Move, Music, Palette, PawPrint, Puzzle, Stethoscope, Users, Waves, type LucideIcon,
} from 'lucide-react'
import { normTxt } from '@/lib/cronograma/constants'

// Ícone por especialidade — associação por palavra-chave no nome (ordem importa:
// regras mais específicas primeiro, ex.: "arteterapia" antes de "aba" pra não
// perder o ícone de arte em "Arteterapia (Psicologia ABA)").
//
// Vive aqui, e não dentro de OcupacaoProfShell onde nasceu, porque a grade
// semanal da Reconciliação precisa exatamente do mesmo mapa: duas cópias
// divergiriam na primeira terapia nova e a mesma especialidade apareceria com
// dois ícones em duas telas.
const ICONE_TERAPIA_REGRAS: [RegExp, LucideIcon][] = [
  [/nutri|alimentar|cozinha/,                 Apple],
  [/fisioterapia aquatica|hidro/,             Waves],
  [/fisioterapia/,                            Activity],
  [/fonoaudiologia/,                          Mic2],
  [/terapia ocupacional/,                     Hand],
  [/musicoterapia|musicalizacao/,             Music],
  [/arteterapia/,                             Palette],
  [/equoterapia/,                             PawPrint],
  [/habilidades sociais|trilha socioemocional/, HeartHandshake],
  [/psicomotricidade/,                        Move],
  [/psicopedagogia|oficina de aprendizagem|estagio/, BookOpen],
  [/avaliacao neuropsicologica|triagem/,       ClipboardList],
  [/psiquiatr|neurolog/,                       Stethoscope],
  [/aba/,                                      Puzzle],
  [/psicologia|psicoeducacao/,                 Brain],
  [/visita guiada/,                            MapPin],
  [/esporte adaptado|circuito funcional/,      Dumbbell],
  [/coordenador|supervis|especialista tecnico|facilitador|operacoes clinicas|apoio operacional|assistente de desenvolvimento|tecnico terapeutico/, Users],
]

export function iconeTerapia(esp: string): LucideIcon {
  const norm = normTxt(esp)
  const regra = ICONE_TERAPIA_REGRAS.find(([re]) => re.test(norm))
  return regra ? regra[1] : Stethoscope
}
