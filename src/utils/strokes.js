// Pure geometry helpers used by the drawing canvas. Kept separate from the
// canvas component so they're easy to unit test later and reused by the
// (future) lasso-select and eraser-precision improvements.

export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    return Math.hypot(px - x1, py - y1)
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))

  const closestX = x1 + t * dx
  const closestY = y1 + t * dy
  return Math.hypot(px - closestX, py - closestY)
}

// True if `point` is within `radius` of any segment in the stroke's polyline.
export function strokeHitByPoint(stroke, point, radius) {
  const pts = stroke.points
  if (pts.length === 1) {
    return Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= radius
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distanceToSegment(point.x, point.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
    if (d <= radius) return true
  }
  return false
}

export function strokeBoundingBox(stroke) {
  const xs = stroke.points.map((p) => p.x)
  const ys = stroke.points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = (stroke.width || 1) / 2
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

// True if the stroke's bounding box overlaps the given rectangle at all —
// used for rectangle selection (a simplified stand-in for true lasso).
export function strokeIntersectsRect(stroke, rect) {
  const box = strokeBoundingBox(stroke)
  return !(
    box.maxX < rect.minX ||
    box.minX > rect.maxX ||
    box.maxY < rect.minY ||
    box.minY > rect.maxY
  )
}

export function normalizeRect(x1, y1, x2, y2) {
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2)
  }
}

// --- Ink sharpening ---------------------------------------------------------

function lerpPoint(a, b, f) {
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    pressure: (a.pressure ?? 0.5) + ((b.pressure ?? 0.5) - (a.pressure ?? 0.5)) * f,
    t: a.t != null && b.t != null ? a.t + (b.t - a.t) * f : undefined
  }
}

// Cleans up a freshly drawn stroke so handwriting looks crisper:
//   1. drops near-duplicate points (mouse/touch jitter and pauses),
//   2. relaxes hand tremor with a light 1-2-1 weighted average, and
//   3. rounds off the polyline's corners with one Chaikin pass, so curves
//      read as curves instead of a chain of short straight segments.
// The first and last points are never moved, so a stroke still starts and
// ends exactly where the pen touched down and lifted. Pure function: returns
// a new array, never mutates its input.
export function smoothStroke(points, { minDistance = 1.2, relaxPasses = 2 } = {}) {
  if (!points || points.length < 3) return points

  // 1. Drop near-duplicates, always keeping the final point.
  const kept = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1]
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDistance) kept.push(points[i])
  }
  kept.push(points[points.length - 1])
  if (kept.length < 3) return kept

  // 2. Weighted-average relaxation with pinned endpoints.
  let pts = kept.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure ?? 0.5, t: p.t }))
  for (let pass = 0; pass < relaxPasses; pass++) {
    const next = [pts[0]]
    for (let i = 1; i < pts.length - 1; i++) {
      next.push({
        x: (pts[i - 1].x + 2 * pts[i].x + pts[i + 1].x) / 4,
        y: (pts[i - 1].y + 2 * pts[i].y + pts[i + 1].y) / 4,
        pressure: (pts[i - 1].pressure + 2 * pts[i].pressure + pts[i + 1].pressure) / 4,
        t: pts[i].t // timing is left as recorded — only position is relaxed
      })
    }
    next.push(pts[pts.length - 1])
    pts = next
  }

  // 3. One Chaikin corner-cutting pass (endpoints preserved).
  const out = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const q = lerpPoint(pts[i], pts[i + 1], 0.25)
    const r = lerpPoint(pts[i], pts[i + 1], 0.75)
    if (i > 0) out.push(q)
    if (i < pts.length - 2) out.push(r)
  }
  out.push(pts[pts.length - 1])
  return out
}

export function strokesBounds(strokes) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    const b = strokeBoundingBox(s)
    minX = Math.min(minX, b.minX)
    minY = Math.min(minY, b.minY)
    maxX = Math.max(maxX, b.maxX)
    maxY = Math.max(maxY, b.maxY)
  }
  return { minX, minY, maxX, maxY }
}

// --- Fountain-pen width ---------------------------------------------------
//
// A fountain-pen line is thinner when the pen moves fast and fatter when it
// slows down or curves, and it comes to a point where the pen lands and
// lifts. We get that from the timestamps `t` (ms) captured with each point:
// speed in page-px per ms picks a width scale, and an easing average keeps
// the width changing smoothly instead of in jumps. Real stylus pressure
// still counts on top of that. Points without `t` (older strokes, or input
// that has no timing) simply get no speed effect.

const FOUNTAIN = {
  slowSpeed: 0.25, // px/ms — at or below this the line is at its fattest
  fastSpeed: 2.0, // px/ms — at or above this it's at its thinnest
  slowScale: 1.3,
  fastScale: 0.5,
  ease: 0.3, // how quickly width follows the target (0-1)
  minWidth: 0.5
}

function speedScale(speed) {
  if (!Number.isFinite(speed)) return 1
  const f = Math.min(1, Math.max(0, (speed - FOUNTAIN.slowSpeed) / (FOUNTAIN.fastSpeed - FOUNTAIN.slowSpeed)))
  return FOUNTAIN.slowScale + (FOUNTAIN.fastScale - FOUNTAIN.slowScale) * f
}

// Width for the next point, given the previous point's width (or null for
// the first point). Used live while drawing and in the final pass below.
export function nextFountainWidth(prevWidth, baseWidth, pressure, speed) {
  const target = Math.max(FOUNTAIN.minWidth, baseWidth * (0.5 + (pressure ?? 0.5)) * speedScale(speed))
  return prevWidth == null ? target : prevWidth + (target - prevWidth) * FOUNTAIN.ease
}

const TAPER = [0.6, 0.8, 0.92]

// Returns new points with a width `w` on each. Pure — never mutates input.
export function applyFountainWidths(points, baseWidth) {
  let w = null
  const out = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(points.length - 1, i + 1)]
    const dt = a.t != null && b.t != null ? b.t - a.t : NaN
    const speed = dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / dt : NaN
    w = nextFountainWidth(w, baseWidth, p.pressure, speed)
    return { ...p, w }
  })

  // Pointed start and finish — only for strokes long enough to have a body.
  if (out.length >= 8) {
    for (let i = 0; i < TAPER.length; i++) {
      out[i].w *= TAPER[i]
      out[out.length - 1 - i].w *= TAPER[i]
    }
  }
  for (const p of out) p.w = Math.round(Math.max(FOUNTAIN.minWidth, p.w) * 100) / 100
  return out
}
