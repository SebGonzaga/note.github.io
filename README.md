# Inkwell — AI Study Notebook (Phase 1–4: Foundation, Handwriting, Typed Notes & PDF Study)

This is the Phase 1–3 build of the AI study notebook described in the master
development prompt: layout, library, notebook/page system, local-first storage,
light/dark theming, a full handwriting canvas, typed text boxes and images,
and now the PDF study system: upload, viewing, text selection, highlighting
and annotation. AI features are intentionally not implemented yet — they
arrive in Phase 5 so each layer can be tested before the next is built on
top of it.

## Run it locally

This project wasn't built or installed in the sandbox that generated it (no
network access there), so run these on your own machine:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## What's implemented

**Phase 1 — Foundation**
- **Library** — create, rename, delete, duplicate, favorite, search, and sort
  notebooks; organize them into folders.
- **Notebooks & pages** — add, delete, duplicate, reorder, and rename pages;
  six paper templates (blank, lined, grid, dotted, Cornell, graph).
- **Local-first storage** — everything persists in the browser's IndexedDB via
  a small dependency-free wrapper (`src/services/storage`). No backend, no
  account, works fully offline.
- **Theme** — light/dark mode via CSS variables, toggle in the top bar and in
  Settings, persisted across reloads.

**Phase 2 — Handwriting**
- Tools: pen, pencil, highlighter, eraser, and a rectangle select (a
  simplified stand-in for true lasso — see note below).
- Strokes are captured as vector points `{ x, y, pressure }` via the Pointer
  Events API (mouse, touch, and stylus all work; pressure feeds a subtle
  width taper), not raster screenshots — matching the data shape in the spec.
- Per-tool color palette + custom color picker, adjustable size and opacity,
  remembered per tool while the notebook is open.
- Eraser removes whole strokes it touches; select draws a marquee, highlights
  matched strokes, and deletes them via a toolbar button or Delete/Backspace.
- Undo/redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or `Ctrl+Y`) is a per-page
  linear history that resets when you switch pages, so history never leaks
  across pages.
- Rendering: a fixed-resolution canvas (850×1100, device-pixel-ratio aware
  for crisp lines) scaled visually via CSS transform for zoom — no recompute
  or redraw on zoom, and in-progress strokes draw incrementally rather than
  redrawing the whole page on every pointer move.
- Zoom via CSS transform; panning is native scroll for now (drag-to-pan
  arrives with Phase 3's element-move interactions).
- **Known simplification to revisit:** selection is rectangle-based rather
  than a true freeform lasso, and the eraser removes a whole stroke rather
  than just the segment it touches. Both are reasonable incremental steps
  per the spec and don't require changing the stroke data model to refine
  later.

**Phase 3 — Typed notes & images**
- A new **Text box** tool: click anywhere on the page to drop a text box and
  start typing immediately. Double-click any existing text box (with Select
  active) to re-open it for editing.
- Per-text-box formatting set at creation time from the toolbar: font size,
  color (same palette as ink), bold, italic, and left/center/right alignment.
- **Insert image** button in the toolbar — pick a file, and it's centered on
  the page at a sensible default size. Images are stored inline as base64
  data URLs for now (see note below).
- With Select active, text boxes and images can be dragged to reposition and
  resized from a small handle in the bottom-right corner, same as most
  notebook/slide apps. Delete works the same way as ink strokes: select it,
  then press Delete/Backspace or use the toolbar's "Delete N selected".
- Implementation note: these are DOM elements layered on top of the ink
  `<canvas>` (`ElementsLayer.jsx`), not canvas-drawn, since text editing and
  drag/resize interactions are far more natural in the DOM. It reads from and
  writes to the same `page.elements` array as strokes, so undo/redo, local
  persistence, and the future cloud sync in later phases all just work
  without changes.
- **Known simplifications to revisit:** selection of text/images is one
  element at a time (no shift-click multi-select, and the ink layer's
  rectangle-select still only ropes in strokes, not text/images); toolbar
  formatting controls set the default for *new* text boxes only — they don't
  live-restyle an already-placed box (reopen it to retype, or plan a small
  "format selected text box" affordance later); and images are embedded as
  base64 in the element data rather than uploaded to object storage, which
  is fine for local-first Phase 3 but should move to Supabase Storage
  (metadata + storage path, per the spec) once Phase 7+ cloud sync lands, to
  keep the local database size and sync payloads reasonable for
  photo-heavy notebooks.

**Phase 4 — PDF study system**
- **Documents library** at `/documents`: upload by button or drag-and-drop,
  with rename / favorite / delete. Uploads are validated for file type and
  size (50 MB cap), and every PDF is parsed *before* it's saved so a corrupt
  or password-protected file is rejected up front instead of becoming a
  broken library entry.
- **Viewer** built on PDF.js: page navigation (buttons, page-number field,
  arrow/PageUp/PageDown keys), zoom presets, and a rendered page-thumbnail
  strip you can click to jump.
- **In-document search** (Ctrl/Cmd+F) scans every page's text and lists the
  pages that matched with a surrounding snippet; click a result to jump.
- **Text selection and highlighting** — this is the important one. A
  transparent, correctly-positioned text layer sits over the rendered page,
  so you can select PDF text natively; releasing the selection pops a small
  colour picker that saves a highlight. This is the same mechanism Phase 5's
  "highlight → explain" will hang off, which is why it's built properly now
  rather than faked with rectangles.
- **Annotation on top of PDFs** — the full Phase 2/3 toolset (pen, pencil,
  highlighter, eraser, text boxes, images, undo/redo, delete) works directly
  on PDF pages. `DrawingCanvas` and `ElementsLayer` are reused unmodified;
  they just receive the PDF page's dimensions instead of the notebook page's.
- **The original PDF is never modified**, per the spec. Annotations are
  stored separately, one record per (document, page).

*Implementation notes.* `PdfPage.jsx` stacks four layers — PDF raster,
highlights + selectable text, ink canvas, typed elements. Pointer precedence
runs top-down, so dragging a text box beats selecting text, which beats the
ink canvas. Pages render above 1x and zoom is a CSS transform, so changing
zoom never re-renders the PDF. The PDF routes are lazy-loaded: pdf.js is ~107
kB gzipped and someone who only takes handwritten notes shouldn't download
it (main bundle stays at ~70 kB gzipped).

*Known simplifications to revisit:* search results are page-level rather than
per-match (no in-page match highlighting or next/previous stepping yet —
the text layer can support it when needed); only one page renders at a time
rather than a continuous scroll; undo history resets when you change pages;
and PDFs are stored as blobs in IndexedDB, which moves to Supabase Storage
(metadata row + storage path) in the cloud-sync phase.

## Deployment plan: Vercel (frontend) + Supabase (AI backend)

Phase 1 has no backend dependency — it's a static Vite build, so Vercel needs
zero configuration:

1. Push this repo to GitHub.
2. Import it in Vercel ("Add New Project" → pick the repo). Vercel
   auto-detects Vite (`npm run build`, output `dist/`) — no `vercel.json`
   needed.
3. Every push to `main` redeploys automatically; PRs get preview URLs.

`vite.config.js` already uses `base: './'` and the app uses `HashRouter`, so
it works the same on Vercel's root domain or a subpath, with no rewrite rules
needed for client-side routing.

**Where Gemini fits in (Phase 5+):** the Gemini API key must never reach the
browser, so it lives as a Supabase secret, not a `VITE_` env var. `supabase/functions/gemini-explain/`
is a scaffold for this — an Edge Function that takes `{ selectedText, context, mode }`,
calls Gemini server-side, and returns the explanation. It isn't called by the
UI yet (Phase 1 has no AI, per the roadmap), but the shape is settled now:

```
Browser (Vercel) → supabase.functions.invoke('gemini-explain') → Gemini API
```

To use it once we reach Phase 5:
```bash
supabase functions deploy gemini-explain
supabase secrets set GEMINI_API_KEY=your-key-here
```

Supabase's Postgres + Auth are also natural fits for Phase 10 (cloud sync/
accounts) later — same project, no new infra to introduce then.

## What's next (per the roadmap)

- **Phase 5** — the "Explain Selection" AI popup, starting with nearby-context
  only. The PDF text layer built in Phase 4 already produces the selected
  string and its page number, which is exactly the payload
  `/api/ai/explain` expects.
- **Phase 6+** — document-aware retrieval, study tools (flashcards, quiz,
  active recall), OCR, and multi-provider AI.

## Project structure

```
src/
  components/
    layout/, sidebar/   app shell
    canvas/             DrawingCanvas.jsx — pointer capture, stroke
                         rendering, eraser/select hit-testing
                         ElementsLayer.jsx — DOM overlay for text boxes and
                         images: placement, drag, resize, inline editing
    pdf/                PdfPage.jsx — stacks raster + text + ink + elements
                         TextLayer.jsx — selectable text and highlights
                         PdfThumbnail.jsx — page-list previews
    toolbar/            Toolbar.jsx — tool + color/size/opacity/font controls
    common/             Button, Modal
  pages/        Home (Library), Notebook, Documents, Document, Settings
  services/     storage/ (IndexedDB CRUD for notebooks, pages, documents,
                  files and PDF annotations)
                pdf/pdfjs.js (PDF.js setup + helpers)
                ai/, ocr/, search/ folders are reserved for later phases
  hooks/        useTheme, useHistory (per-page undo/redo)
  utils/        strokes.js (hit-testing geometry), toolDefaults.js
supabase/
  functions/gemini-explain/   Edge Function scaffold for Phase 5 (not yet
                              called by the frontend)
```

The data model matches the spec: `Notebook { id, title, folderId, createdAt,
updatedAt, favorite }`, `Page { id, notebookId, title, background, elements }`.
`elements` is a single array holding three element types today:
- Stroke: `{ id, type: 'stroke', tool, color, width, opacity, points: [{ x, y, pressure }] }`
- Text: `{ id, type: 'text', x, y, width, height, text, fontSize, color, bold, italic, align }`
- Image: `{ id, type: 'image', x, y, width, height, src }` (`src` is a base64 data URL for now — see Phase 3 notes above)

- Highlight: `{ id, type: 'highlight', color, text, rects: [{ x, y, width, height }] }` (PDF pages only)

Shape elements are the remaining piece the spec mentions for this array and
can join the same list later the same way text/image did.

PDF data uses three stores, deliberately split so listing documents never
loads PDF bytes: `documents` (metadata — title, pageCount, size, timestamps),
`files` (the raw blob, keyed by document id), and `pdfAnnotations` (one row
per document+page holding an `elements` array in the same shape above).
Deleting a document removes all three, leaving nothing orphaned.

## Design notes

Palette and type were chosen to read as a calm academic notebook rather than a
generic SaaS dashboard: a warm paper background, one ink-blue accent, Source
Serif 4 for headings paired with Inter for UI text, and CSS-pattern paper
textures instead of image assets.
