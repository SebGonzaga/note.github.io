// Decorative underline paths (wave / zigzag / double), inspired by
// FreeNotes' customizable underline styles. Pure geometry, computed fresh
// at draw time from a stroke's real hand-drawn points — nothing here is
// stored, and nothing here touches strokes.js, smoothing, or hit-testing,
// so selecting/erasing a decorative underline works exactly like any other
// stroke (it hit-tests against the actual drawn path, not the decoration).

function pathLength(pts) {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return len
}

// Resamples a polyline at even arc-length spacing. Each sample also gets
// the path's local unit normal (perpendicular direction), which is what
// lets wave/zigzag/double offset *across* the stroke regardless of
// whether it was drawn perfectly straight or with a bit of a hand-drawn
// curve to it.
function resample(points, spacing) {
  if (points.length === 0) return []
  if (points.length === 1) return [{ x: points[0].x, y: points[0].y, nx: 0, ny: -1 }]

  const total = pathLength(points)
  if (total < 1) return [{ x: points[0].x, y: points[0].y, nx: 0, ny: -1 }]

  const count = Math.max(2, Math.round(total / Math.max(1, spacing)))
  const out = []
  let segIndex = 0
  let traveled = 0
  let segStart = points[0]
  let segEnd = points[1]
  let segLen = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y)

  for (let i = 0; i <= count; i++) {
    const target = (total * i) / count
    while (traveled + segLen < target && segIndex < points.length - 2) {
      traveled += segLen
      segIndex++
      segStart = points[segIndex]
      segEnd = points[segIndex + 1]
      segLen = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y)
    }
    const segT = segLen > 0 ? Math.min(1, Math.max(0, (target - traveled) / segLen)) : 0
    const x = segStart.x + (segEnd.x - segStart.x) * segT
    const y = segStart.y + (segEnd.y - segStart.y) * segT
    const dx = segEnd.x - segStart.x
    const dy = segEnd.y - segStart.y
    const dlen = Math.hypot(dx, dy) || 1
    out.push({ x, y, nx: -dy / dlen, ny: dx / dlen })
  }
  return out
}

export function wavePath(points, amplitude = 4) {
  const samples = resample(points, amplitude * 1.4)
  const cycles = Math.max(1, Math.round(samples.length / 4))
  return samples.map((s, i) => {
    const t = (i / Math.max(1, samples.length - 1)) * Math.PI * 2 * cycles
    const offset = Math.sin(t) * amplitude
    return { x: s.x + s.nx * offset, y: s.y + s.ny * offset }
  })
}

export function zigzagPath(points, amplitude = 4) {
  const samples = resample(points, amplitude * 1.6)
  return samples.map((s, i) => {
    const offset = (i % 2 === 0 ? 1 : -1) * amplitude
    return { x: s.x + s.nx * offset, y: s.y + s.ny * offset }
  })
}

// Returns two parallel paths, offset to either side of the original —
// used for the "double" underline style.
export function doublePaths(points, gap = 3) {
  const samples = resample(points, 4)
  return [
    samples.map((s) => ({ x: s.x + s.nx * gap, y: s.y + s.ny * gap })),
    samples.map((s) => ({ x: s.x - s.nx * gap, y: s.y - s.ny * gap }))
  ]
}

export const UNDERLINE_STYLES = [
  { id: 'wave', label: 'Wave' },
  { id: 'zigzag', label: 'Zigzag' },
  { id: 'double', label: 'Double' },
  { id: 'dash', label: 'Dash' }
]
