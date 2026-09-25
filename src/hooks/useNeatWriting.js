import { useCallback, useState } from 'react'
import { DEFAULT_FONT_ID, FONT_OPTIONS } from '../utils/fonts.js'

// "Neat writing" preferences, remembered across notebooks and PDFs.
//
//   mode 'off'     — ink is left exactly as drawn
//   mode 'sharpen' — pen/pencil strokes are smoothed when you lift the pen
//                    (offline, instant, free)
//   penStyle       — 'fountain' (line width follows pen speed) or 'classic'
//   mode 'type'    — sharpen, plus: after a short pause the handwriting is
//                    read by the AI service and swapped for typed text in
//                    `font` (needs GEMINI_API_KEY on the server)
//   shapeRecognition — when true (default), a rough circle/rectangle/line/
//                    triangle drawn with the pen or pencil snaps to a clean
//                    version of that shape on lift. Offline, geometric, same
//                    spirit as `sharpen` — see services/ink/shapeRecognition.js
//
// Defaults to 'sharpen' because it needs nothing but the browser. The AI
// conversion is opt-in since it makes network calls.

const STORAGE_KEY = 'inkwell-neat-writing'
const MODES = ['off', 'sharpen', 'type']
const PEN_STYLES = ['classic', 'fountain']
const DEFAULTS = { mode: 'sharpen', font: DEFAULT_FONT_ID, penStyle: 'fountain', shapeRecognition: true }

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (parsed && typeof parsed === 'object') {
      return {
        mode: MODES.includes(parsed.mode) ? parsed.mode : DEFAULTS.mode,
        font: FONT_OPTIONS.some((f) => f.id === parsed.font) ? parsed.font : DEFAULTS.font,
        penStyle: PEN_STYLES.includes(parsed.penStyle) ? parsed.penStyle : DEFAULTS.penStyle,
        shapeRecognition:
          typeof parsed.shapeRecognition === 'boolean'
            ? parsed.shapeRecognition
            : DEFAULTS.shapeRecognition
      }
    }
  } catch {
    // Corrupt or unavailable storage — fall through to defaults.
  }
  return DEFAULTS
}

export function useNeatWriting() {
  const [prefs, setPrefs] = useState(load)

  const update = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Private mode / quota — the preference just won't persist.
      }
      return next
    })
  }, [])

  return [prefs, update]
}
