// Snaps a rough hand-drawn stroke to a clean line, rectangle, ellipse, or
// triangle — but only when the drawn shape is unambiguously one of these,
// so ordinary handwriting (an isolated letter "O", a period, a dash) is
// never mistaken for a shape. Two safety gates keep false positives rare:
//   1. A minimum size — a deliberately drawn shape is typically much
//      bigger than a single letter.
//   2. Fit tolerance — the actual points must lie close to the candidate
//      clean shape, not just "roughly" resemble it.
// Returns null (leave the ink exactly as drawn) in the common case where
// nothing fits confidently — this is meant to be conservative, not clever.

const MIN_SIZE = 45 // bounding-box diagonal, px — below this, never attempt
const CLOSE_GAP_RATIO = 0.28 // start-end distance vs perimeter, to call it "closed"
const LINE_STRAIGHTNESS = 0.95 // chord length / path length, to call it "straight"

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pathLength(pts) {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += dist(pts[i], pts[i - 1])
  return len
}

function bounds(pts) {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

// Shoelace formula — the enclosed area of a (auto-closed) polygon.
function enclosedArea(pts) {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

// Ramer–Douglas–Peucker simplification — reduces a hand-drawn path to its
// dominant corner points. Counting those corners is what distinguishes "4
// corners, so maybe a rectangle" from "no real corners, so maybe an
// ellipse."
function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return dist(p, a)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len
}

function rdp(points, tolerance) {
  if (points.length < 3) return points
  let maxDist = 0
  let index = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      index = i
    }
  }
  if (maxDist > tolerance) {
    const left = rdp(points.slice(0, index + 1), tolerance)
    const right = rdp(points.slice(index), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function angleAt(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const dot = v1.x * v2.x + v1.y * v2.y
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1
  const cos = Math.min(1, Math.max(-1, dot / mag))
  return (Math.acos(cos) * 180) / Math.PI
}

export function recognizeShape(rawPoints) {
  if (!rawPoints || rawPoints.length < 4) return null
  const pts = rawPoints.map((p) => ({ x: p.x, y: p.y }))
  const box = bounds(pts)
  const diag = Math.hypot(box.width, box.height)
  if (diag < MIN_SIZE) return null

  const perimeter = pathLength(pts)
  if (perimeter < 1) return null

  const start = pts[0]
  const end = pts[pts.length - 1]
  const gap = dist(start, end)
  const closed = gap / perimeter < CLOSE_GAP_RATIO
  const chord = gap

  // --- Line: open, and nearly the whole path is just the straight chord ---
  if (!closed && chord / perimeter > LINE_STRAIGHTNESS) {
    return { type: 'line', points: [start, end] }
  }
  if (!closed) return null // open and not straight enough — leave as ink

  const ring = gap > 2 ? [...pts, start] : pts
  const area = enclosedArea(ring)
  const bboxArea = Math.max(1, box.width * box.height)
  const fillRatio = area / bboxArea

  const tolerance = Math.max(4, diag * 0.045)
  let simplified = rdp(ring, tolerance)
  if (simplified.length > 1 && dist(simplified[0], simplified[simplified.length - 1]) < tolerance) {
    simplified = simplified.slice(0, -1)
  }
  const corners = simplified.length

  // --- Ellipse / circle: fills most of its bbox, no sharp dominant corners ---
  if (fillRatio > 0.68 && (corners <= 2 || corners >= 7)) {
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    const rx = box.width / 2
    const ry = box.height / 2
    let variance = 0
    for (const p of pts) {
      const nx = (p.x - cx) / (rx || 1)
      const ny = (p.y - cy) / (ry || 1)
      variance += (Math.hypot(nx, ny) - 1) ** 2
    }
    variance /= pts.length
    if (variance < 0.05) return { type: 'ellipse', cx, cy, rx, ry }
    return null
  }

  // --- Rectangle: ~4 corners, each close to 90°, fills most of its bbox ---
  if (corners === 4 && fillRatio > 0.62) {
    const angles = simplified.map((p, i) =>
      angleAt(
        simplified[(i + simplified.length - 1) % simplified.length],
        p,
        simplified[(i + 1) % simplified.length]
      )
    )
    if (angles.every((a) => Math.abs(a - 90) < 22)) {
      return { type: 'rectangle', minX: box.minX, minY: box.minY, width: box.width, height: box.height }
    }
  }

  // --- Triangle: ~3 dominant corners ---
  if (corners === 3) {
    return { type: 'triangle', points: simplified }
  }

  return null
}

// Converts a recognized shape back into a plain stroke point array, so the
// caller can just replace `finished.points` with the result — everything
// else about how a stroke is stored, rendered, selected, and erased stays
// exactly as it already works, unmodified.
export function shapeToPoints(shape, segments = 64) {
  if (shape.type === 'line') return shape.points
  if (shape.type === 'triangle') return [...shape.points, shape.points[0]]
  if (shape.type === 'rectangle') {
    const { minX, minY, width, height } = shape
    return [
      { x: minX, y: minY },
      { x: minX + width, y: minY },
      { x: minX + width, y: minY + height },
      { x: minX, y: minY + height },
      { x: minX, y: minY }
    ]
  }
  if (shape.type === 'ellipse') {
    const pts = []
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2
      pts.push({ x: shape.cx + Math.cos(t) * shape.rx, y: shape.cy + Math.sin(t) * shape.ry })
    }
    return pts
  }
  return null
}
