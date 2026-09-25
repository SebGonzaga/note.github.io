// Decorative stickers (FreeNotes-style aesthetic extras). Each is a small,
// self-contained SVG, converted to a data URL on demand and inserted the
// exact same way "Insert image" already works — via ElementsLayer's
// existing addImage(), completely unmodified. No new element type, no
// changes to selection/drag/resize/delete: a sticker is just a small image.

function svgToDataUrl(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function svg(inner, viewBox = '0 0 24 24') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`
}

const STICKERS = {
  Stars: [
    {
      id: 'star-filled',
      label: 'Star',
      svg: svg(
        '<path d="M12 1.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L1.9 8.8l7.1-.7z" fill="#f2b705"/>'
      )
    },
    {
      id: 'sparkle',
      label: 'Sparkle',
      svg: svg(
        '<path d="M12 2c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" fill="#7048e8"/>' +
          '<circle cx="4" cy="4" r="1.3" fill="#7048e8"/><circle cx="20" cy="19" r="1" fill="#7048e8"/>'
      )
    },
    {
      id: 'star-outline',
      label: 'Star outline',
      svg: svg(
        '<path d="M12 1.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L1.9 8.8l7.1-.7z" fill="none" stroke="#e8590c" stroke-width="1.4" stroke-linejoin="round"/>'
      )
    }
  ],
  Hearts: [
    {
      id: 'heart-filled',
      label: 'Heart',
      svg: svg(
        '<path d="M12 20.5S3 14.9 3 8.9C3 5.9 5.4 3.5 8.4 3.5c1.8 0 3.2.9 3.6 2 .4-1.1 1.8-2 3.6-2 3 0 5.4 2.4 5.4 5.4 0 6-9 11.6-9 11.6z" fill="#e64980"/>'
      )
    },
    {
      id: 'heart-outline',
      label: 'Heart outline',
      svg: svg(
        '<path d="M12 20.5S3 14.9 3 8.9C3 5.9 5.4 3.5 8.4 3.5c1.8 0 3.2.9 3.6 2 .4-1.1 1.8-2 3.6-2 3 0 5.4 2.4 5.4 5.4 0 6-9 11.6-9 11.6z" fill="none" stroke="#e64980" stroke-width="1.4" stroke-linejoin="round"/>'
      )
    },
    {
      id: 'heart-two',
      label: 'Two hearts',
      svg: svg(
        '<path d="M8 15.5S2.5 12 2.5 8.3c0-2 1.6-3.5 3.5-3.5 1.2 0 2.1.6 2.4 1.3.3-.7 1.2-1.3 2.4-1.3 1.9 0 3.5 1.5 3.5 3.5 0 3.7-5.5 7.2-5.5 7.2z" fill="#e64980"/>' +
          '<path d="M16.5 20.5s-4-2.7-4-5.3c0-1.5 1.2-2.6 2.6-2.6.9 0 1.6.4 1.9 1 .3-.6.9-1 1.9-1 1.4 0 2.6 1.1 2.6 2.6 0 2.6-5 5.3-5 5.3z" fill="#f06595"/>'
      )
    }
  ],
  Marks: [
    {
      id: 'check-circle',
      label: 'Checked',
      svg: svg(
        '<circle cx="12" cy="12" r="10" fill="#2f9e44"/><path d="M7 12.5l3 3 7-7" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      )
    },
    {
      id: 'flag',
      label: 'Flag',
      svg: svg(
        '<path d="M6 2v20" stroke="#44403c" stroke-width="1.5" stroke-linecap="round"/>' +
          '<path d="M6 3.5c2-1 4 1 6 0s4 1 6 0v7c-2 1-4-1-6 0s-4-1-6 0z" fill="#1971c2"/>'
      )
    },
    {
      id: 'pin',
      label: 'Pin',
      svg: svg(
        '<path d="M12 2a6 6 0 0 0-6 6c0 4.5 6 13 6 13s6-8.5 6-13a6 6 0 0 0-6-6z" fill="#e8590c"/><circle cx="12" cy="8" r="2.4" fill="white"/>'
      )
    },
    {
      id: 'bubble',
      label: 'Speech',
      svg: svg(
        '<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="#1f2933"/>' +
          '<circle cx="8.5" cy="10.5" r="1.1" fill="white"/><circle cx="12" cy="10.5" r="1.1" fill="white"/><circle cx="15.5" cy="10.5" r="1.1" fill="white"/>'
      )
    }
  ],
  Nature: [
    {
      id: 'flower',
      label: 'Flower',
      svg: svg(
        '<g fill="#f06595"><circle cx="12" cy="6.5" r="3"/><circle cx="17.5" cy="12" r="3"/><circle cx="12" cy="17.5" r="3"/><circle cx="6.5" cy="12" r="3"/></g><circle cx="12" cy="12" r="3" fill="#f2b705"/>'
      )
    },
    {
      id: 'sun',
      label: 'Sun',
      svg: svg(
        '<circle cx="12" cy="12" r="5" fill="#f2b705"/><g stroke="#f2b705" stroke-width="1.6" stroke-linecap="round"><path d="M12 1.5v3M12 19.5v3M22.5 12h-3M4.5 12h-3M19.3 4.7l-2.1 2.1M6.8 17.2l-2.1 2.1M19.3 19.3l-2.1-2.1M6.8 6.8L4.7 4.7"/></g>'
      )
    },
    {
      id: 'moon',
      label: 'Moon',
      svg: svg('<path d="M20 13.5A8.5 8.5 0 1 1 10.5 4 6.8 6.8 0 0 0 20 13.5z" fill="#7048e8"/>')
    }
  ]
}

export const STICKER_SETS = Object.entries(STICKERS).map(([group, items]) => ({
  group,
  items: items.map((s) => ({ ...s, dataUrl: svgToDataUrl(s.svg) }))
}))

// Small, fixed insert size — a sticker isn't a photo, it should drop in at
// a size you'd actually use decoratively, not fill the page. The person
// can still resize it with the existing element-resize handle afterward.
export const STICKER_SIZE = 56
