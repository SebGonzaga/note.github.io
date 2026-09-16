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
