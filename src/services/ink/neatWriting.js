// Helpers for turning a batch of handwritten strokes into a typed text
// element. Kept out of DrawingCanvas so the canvas stays about pointer
// handling, and so the geometry/measuring can be tested on its own.

import { newId } from '../storage/db.js'
import { fontFamilyFor } from '../../utils/fonts.js'
import { strokesBounds } from '../../utils/strokes.js'

const MAX_IMAGE_SIDE = 1400
const MIN_IMAGE_SIDE = 256
const IMAGE_PAD = 24

// Anything smaller than this in both directions is a speck, not writing.
export const MIN_WRITING_SIZE = 8

// Renders strokes as black ink on white, cropped to their bounding box.
// Recognition works best on high-contrast images, so this deliberately
// ignores the strokes' own colour, opacity (pencil is 0.8) and thinness.
export function renderStrokesToImage(strokes) {
  const box = strokesBounds(strokes)
  const w = box.maxX - box.minX + IMAGE_PAD * 2
  const h = box.maxY - box.minY + IMAGE_PAD * 2
  const longSide = Math.max(w, h)
  const scale =
    longSide > MAX_IMAGE_SIDE
      ? MAX_IMAGE_SIDE / longSide
      : longSide < MIN_IMAGE_SIDE
      ? Math.min(4, MIN_IMAGE_SIDE / longSide)
      : 1

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w * scale))
  canvas.height = Math.max(1, Math.ceil(h * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.translate(IMAGE_PAD - box.minX, IMAGE_PAD - box.minY)
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = '#000000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const minWidth = 2.5 / scale // keep hairlines visible after downscaling
  for (const s of strokes) {
    const pts = s.points
    if (pts.length === 0) continue
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, Math.max(s.width / 2, minWidth / 2), 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const pressure = ((pts[i].pressure ?? 0.5) + (pts[i + 1].pressure ?? 0.5)) / 2
      ctx.lineWidth = Math.max(minWidth, s.width * (0.5 + pressure))
      ctx.beginPath()
      ctx.moveTo(pts[i].x, pts[i].y)
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y)
      ctx.stroke()
    }
  }
  return canvas.toDataURL('image/png')
}

async function measureWidest(lines, fontId, fontSize) {
  const family = fontFamilyFor(fontId)
  try {
    // Web fonts load lazily — without this the first conversion would be
    // measured (and sized) using the fallback font.
    await document.fonts?.load(`${fontSize}px ${family}`)
  } catch {
    // Measuring with the fallback font is still close enough.
  }
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = `${fontSize}px ${family}`
  return Math.max(...lines.map((line) => ctx.measureText(line).width))
}

// Builds the replacement text element: positioned where the handwriting was,
// with a font size that roughly matches how large it was written, shrunk if
// the typed version would run off the page.
export async function buildTextElement({ strokes, text, font, pageWidth, pageHeight }) {
  const box = strokesBounds(strokes)
  const lines = text.split('\n')
  const lineCount = lines.length
  const boxHeight = Math.max(1, box.maxY - box.minY)

  let fontSize = Math.min(36, Math.max(12, boxHeight / lineCount / 1.5))
  const x = Math.max(0, box.minX - 4)
  const y = Math.max(0, box.minY - 4)

  let widest = await measureWidest(lines, font, fontSize)
  const room = Math.max(60, pageWidth - x - 8)
  if (widest + 24 > room) {
    const shrink = (room - 24) / widest
    fontSize = Math.max(11, fontSize * shrink)
    widest = await measureWidest(lines, font, fontSize)
  }

  const width = Math.min(room, Math.max(80, widest + 24))
  const height = lineCount * fontSize * 1.4 + 14

  return {
    id: newId('el'),
    type: 'text',
    x,
    y: Math.min(y, Math.max(0, pageHeight - height)),
    width,
    height,
    text,
    fontSize: Math.round(fontSize * 2) / 2,
    color: strokes[0]?.color || '#1f2933',
    bold: false,
    italic: false,
    align: 'left',
    font
  }
}
