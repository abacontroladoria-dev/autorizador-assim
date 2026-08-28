const AVATAR_COLORS = [
  '#3A8FB7', '#7C6AEA', '#22C55E', '#F59E0B',
  '#EF4444', '#14B8A6', '#F97316', '#8B5CF6', '#EC4899',
]

export function getAvatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
