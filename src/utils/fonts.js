// Fonts available for typed text and for handwriting that's been converted
// to type. Elements store the short `id` (not the CSS string) so saved
// notebooks and backups don't depend on exact font stacks — change a stack
// here and every existing element picks it up.
//
// Text elements created before fonts existed have no `font` at all and
// resolve to 'inherit', i.e. exactly what they rendered as before.

export const FONT_OPTIONS = [
  // Plain
  { id: 'inter', label: 'Clean', group: 'Plain', family: "'Inter', system-ui, sans-serif" },
  { id: 'serif', label: 'Serif', group: 'Plain', family: "'Source Serif 4', Georgia, serif" },
  { id: 'print', label: 'Neat print', group: 'Plain', family: "'Patrick Hand', 'Comic Sans MS', system-ui, sans-serif" },

  // Calligraphy
  { id: 'script', label: 'Script', group: 'Calligraphy', family: "'Caveat', 'Segoe Script', cursive" },
  { id: 'dancing', label: 'Dancing', group: 'Calligraphy', family: "'Dancing Script', 'Segoe Script', cursive" },
  { id: 'greatvibes', label: 'Great Vibes', group: 'Calligraphy', family: "'Great Vibes', 'Segoe Script', cursive" },
  { id: 'sacramento', label: 'Sacramento', group: 'Calligraphy', family: "'Sacramento', 'Segoe Script', cursive" },
  { id: 'parisienne', label: 'Parisienne', group: 'Calligraphy', family: "'Parisienne', 'Segoe Script', cursive" },

  // Cute / handwriting
  { id: 'indieflower', label: 'Indie Flower', group: 'Cute', family: "'Indie Flower', 'Comic Sans MS', cursive" },
  { id: 'gochihand', label: 'Gochi Hand', group: 'Cute', family: "'Gochi Hand', 'Comic Sans MS', cursive" },
  { id: 'shadows', label: 'Shadows', group: 'Cute', family: "'Shadows Into Light', 'Comic Sans MS', cursive" },
  { id: 'pacifico', label: 'Pacifico', group: 'Cute', family: "'Pacifico', 'Comic Sans MS', cursive" },
  { id: 'fredoka', label: 'Fredoka', group: 'Cute', family: "'Fredoka', system-ui, sans-serif" },
  { id: 'quicksand', label: 'Quicksand', group: 'Cute', family: "'Quicksand', system-ui, sans-serif" }
]

export const DEFAULT_FONT_ID = 'inter'

export function fontFamilyFor(id) {
  return FONT_OPTIONS.find((f) => f.id === id)?.family ?? 'inherit'
}
