// Fonts available for typed text and for handwriting that's been converted
// to type. Elements store the short `id` (not the CSS string) so saved
// notebooks and backups don't depend on exact font stacks — change a stack
// here and every existing element picks it up.
//
// Text elements created before fonts existed have no `font` at all and
// resolve to 'inherit', i.e. exactly what they rendered as before.

export const FONT_OPTIONS = [
  { id: 'inter', label: 'Clean', family: "'Inter', system-ui, sans-serif" },
  { id: 'serif', label: 'Serif', family: "'Source Serif 4', Georgia, serif" },
  { id: 'print', label: 'Neat print', family: "'Patrick Hand', 'Comic Sans MS', system-ui, sans-serif" },
  { id: 'script', label: 'Script', family: "'Caveat', 'Segoe Script', cursive" }
]

export const DEFAULT_FONT_ID = 'inter'

export function fontFamilyFor(id) {
  return FONT_OPTIONS.find((f) => f.id === id)?.family ?? 'inherit'
}
