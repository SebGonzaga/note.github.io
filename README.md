# Inkwell — AI Study Notebook (Phase 1–6: through RAG + Flashcards)

This is the Phase 1–3 build of the AI study notebook described in the master
development prompt: layout, library, notebook/page system, local-first storage,
light/dark theming, a full handwriting canvas, typed text boxes and images,
the PDF study system, the Highlight → Explain signature feature, and now
document-aware retrieval plus AI-generated flashcards with active recall.

**The core loop from the spec is now complete end to end:** upload material →
study it → highlight something confusing → AI toolbar appears → ask →
get an explanation that cites your own document — and now reaches a
definition 200 pages away, or turns a highlight into a flashcard you'll
actually review later.

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

**Phase 5 — Highlight → Explain (the signature feature)**
- Select any text in a PDF and a contextual toolbar appears offering
  **Explain**, **Simplify**, **In context**, **Make notes**, and
  **Translate** — alongside the highlight colours from Phase 4.
- Results open in a side panel with a loading state, the answer, **copy**,
  suggested **follow-up questions**, and a free-text follow-up box.
- **Context modes** let you choose where the AI draws from: this page, this
  PDF, or general knowledge only.

*Grounding — the part that matters.* The spec is emphatic that the AI must
never fabricate citations or pass off general knowledge as coming from your
material. Two mechanisms enforce that:

1. Every response carries a **grounding badge** — "Based on your study
   material", "Your material + general knowledge", or "General explanation" —
   so you always know what you're reading.
2. **The model is never allowed to name a source.** The frontend tells the
   server which pages it sent, and the server echoes *those* back as the
   citation. The model's own output is never used for attribution, which
   makes a fabricated page number structurally impossible rather than merely
   discouraged.

*Context assembly* follows the spec's priority order: selected text → the
passage immediately surrounding it → the full current page → adjacent pages
(definitions very often split across a page break). Requests are capped on
both the client and the server so a single call can't push a whole book
through the model. Real retrieval — chunking, embeddings, pgvector — is
Phase 6; this focused-neighbourhood approach is what makes the feature
usable before then.

*Security.* `GEMINI_API_KEY` is read **only** inside the Edge Function, as a
Supabase secret. There is deliberately no `VITE_GEMINI_*` variable anywhere
in this project, because anything prefixed `VITE_` is compiled into the
browser bundle and is therefore public. The frontend calls our own function;
only that function calls Gemini.

*Usage tracking* records the fields the spec's `ai_requests` table needs
(feature, model, token counts, duration, success) and enforces the free
plan's 100 requests/month. Plan limits live in `src/config/plans.js` rather
than being scattered through the UI, so they become a database table in
Phase 7 without touching components.

**Known limitations to revisit:**
- **Usage limits are client-side and are not a security control.** Anyone can
  clear localStorage and reset their own counter. This exists so the limit
  UI and quota-exceeded path are built and testable now; real enforcement
  requires auth and must live in the Edge Function (Phase 7). The function is
  also currently unauthenticated — fine for local development, **not safe to
  expose publicly as-is**, since anyone with the URL could spend your Gemini
  quota. Deploy it publicly only after adding the auth checks marked in
  `supabase/functions/gemini-explain/index.ts`.
- AI is available on PDFs only so far. Selection inside typed notes and
  handwritten pages comes next.
- Context is limited to the current and adjacent pages; a term defined 200
  pages earlier won't be found until RAG lands in Phase 6.
- Responses aren't saved — closing the panel discards the answer.

**Responsive design pass (post-Phase 5)**

The app was built and tested on desktop first; several layout pieces didn't
actually adapt below `md`/`lg`. Fixed now:

- **Main sidebar** (256px) and the **notebook page list** (192px) are
  off-canvas drawers below `md`/`lg` instead of permanent columns — opened
  via a hamburger / panel icon, closed by tapping the backdrop or picking an
  item.
- **PDF viewer's three side panels** (thumbnails, AI response, in-document
  search — 144/320/288px) no longer try to dock simultaneously on a phone
  width. Thumbnails become a drawer; the AI and search panels become
  full-screen overlays and are now mutually exclusive (opening one closes
  the other), so two overlays can never silently stack.
- **Toolbar** scrolls horizontally on narrow screens instead of wrapping
  into a ragged multi-row block.
- **Notebook zoom** auto-fits to the available width on first load, so a
  phone doesn't open straight into a page that's mostly off-screen.
- **Touch-only bug:** several action buttons (rename/favorite/delete menus,
  per-page reorder icons) were `opacity-0` until `:hover` — invisible and
  undiscoverable on a touchscreen, which has no hover state. They're now
  visible by default below `sm` and hover-reveal only on larger screens.

Not yet covered: the PDF viewer still doesn't auto-fit zoom to width on
load (notebooks do); touch target sizing hasn't had a dedicated pass beyond
the fix above. Worth a proper device test once Median packaging (Phase 46
in the spec) is underway.

**Phase 6 — RAG + flashcards**

*Document-aware retrieval.* "This PDF" context mode used to only look at the
current page and its immediate neighbours (Phase 5's fallback — still there,
see below). Now a PDF can be **indexed**: every page is chunked (~700
characters, slight overlap so a sentence doesn't get severed at a chunk
boundary), each chunk is embedded via Gemini's embedding model, and the
vectors are stored locally. When you ask about a selection, the query itself
gets embedded and compared against every stored chunk by cosine similarity
— the top matches (above a confidence threshold) go into the prompt as
"relevant passages found elsewhere in this document." This is what makes
"explain this" able to reach a definition from 200 pages back, which
adjacent-page context structurally cannot do.

Indexing is **on-demand, not automatic on upload** — the control lives in
the AI panel, next to the context-mode selector, since that's where its
value is obvious. A document that's never indexed keeps working exactly as
it did in Phase 5 (adjacent-page fallback); indexing just makes "This PDF"
smarter. The fallback also kicks back in for an indexed document if
retrieval comes up empty or below the confidence threshold — an indexed
document should never end up with *less* context than an unindexed one.

*Cost discipline, because embedding a document isn't free either:*
- Indexing batches up to 100 chunks per request (via Gemini's
  `batchEmbedContents`), not one request per chunk — a 50-page PDF costs a
  handful of requests, not fifty.
- Embedding calls draw from the **same monthly AI quota** as
  explain/simplify/etc (tracked in `usage.js`), so indexing a huge document
  is subject to the same limit as everything else.
- If quota runs out partway through indexing a long document, the chunks
  already embedded (already paid for) are **kept and saved incrementally**,
  not discarded — the document ends up partially indexed with a note, not
  un-indexed. Verified with a scripted simulation of the batch-accounting
  logic (`chunkCount` sums correctly across success, partial failure, and
  total failure).

*Flashcards.* A sixth action joins the highlight → explain toolbar:
**Flashcards**, generating a small set of front/back cards from the
selection (grounded the same way, with the same "material vs. general
knowledge" honesty as every other mode). Review them at `/flashcards` —
flip to reveal, self-grade Got it / Missed it, per-card stats persist
(times reviewed, times correct) — the spec's active-recall mechanic (§29)
in its simplest useful form: no spaced-repetition scheduling yet, just
"show me a card, let me think, tell me the truth."

**Known limitations to revisit:**
- Retrieval is cosine similarity over an in-browser array — fine at the
  scale of one document's chunks, but it's the client-side stand-in for
  real pgvector similarity search, which is where this moves once Postgres
  is in the picture (Phase 7).
- No re-indexing prompt if a document's annotations change; indexing only
  ever looks at the PDF's own text, which doesn't change, so this is
  actually fine — noted in case that assumption ever stops holding.
- Flashcard review has no spaced-repetition scheduling (every card is
  equally likely to come up regardless of how well you know it) and no
  quiz mode yet — both listed under "what's next" below.
- The chunk size (700 chars) and match threshold (0.65 cosine similarity)
  are fixed constants, not tuned against real study material yet.

## Deployment: Vercel (frontend) + Supabase (AI backend)

### Frontend

The app is a static Vite build, so Vercel needs zero configuration:

1. Push this repo to GitHub.
2. Import it in Vercel ("Add New Project" → pick the repo). Vercel
   auto-detects Vite (`npm run build`, output `dist/`) — no `vercel.json`
   needed.
3. Every push to `main` redeploys automatically; PRs get preview URLs.

`vite.config.js` uses `base: './'` and the app uses `HashRouter`, so it works
the same on Vercel's root domain or a subpath, with no rewrite rules for
client-side routing.

Notebooks, PDFs and annotations all work with no backend at all. Only the AI
features need the steps below.

### AI backend

```
Browser (Vercel) → Supabase Edge Function → Gemini API
```

The Gemini key never reaches the browser. It's a Supabase secret readable
only by the Edge Function — **not** a `VITE_` variable, since those are
compiled into the public bundle.

```bash
supabase functions deploy gemini-explain
supabase functions deploy gemini-embed
supabase secrets set GEMINI_API_KEY=your-key-here
```

(Both functions share the same `GEMINI_API_KEY` secret — set it once.)

Then set these in Vercel's environment variables (and your local `.env`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
```

Settings → AI shows whether the connection is configured.

> **Before deploying publicly:** the function is currently unauthenticated
> (`verify_jwt = false` in `supabase/config.toml`) and has no server-side
> usage limits, so anyone with the URL could spend your Gemini quota. It's
> fine for local development. Add the auth and ownership checks marked in
> `supabase/functions/gemini-explain/index.ts` — and tighten the CORS
> `Access-Control-Allow-Origin` to your own domain — before exposing it.

Supabase's Postgres + Auth are the same project used for accounts and cloud
sync in Phase 7, so there's no new infrastructure to introduce then.

## What's next (per the roadmap)

- **Quiz generation** — multiple choice / true-false / identification, from
  a page, PDF, or notebook, reusing the flashcard generation plumbing and
  the same Edge Function pattern.
- **Spaced repetition** for flashcard review, replacing the current
  fully-random shuffle.
- **Phase 7** — accounts, Supabase Auth, RLS, cloud sync, moving embeddings
  to real pgvector, and moving usage limits server-side where they
  actually count.
- **Phase 8+** — admin dashboard, subscriptions, OCR, production hardening.

## Project structure

```
src/
  components/
    layout/, sidebar/   app shell
    canvas/             DrawingCanvas.jsx — pointer capture, stroke
                         rendering, eraser/select hit-testing
                         ElementsLayer.jsx — DOM overlay for text boxes and
                         images: placement, drag, resize, inline editing
    ai/                 AiSelectionToolbar.jsx — the highlight→explain popover
                         AiPanel.jsx — response, grounding badge, follow-ups,
                         flashcard results, indexing controls
    pdf/                PdfPage.jsx — stacks raster + text + ink + elements
                         TextLayer.jsx — selectable text and highlights
                         PdfThumbnail.jsx — page-list previews
    toolbar/            Toolbar.jsx — tool + color/size/opacity/font controls
    common/             Button, Modal
  pages/        Home (Library), Notebook, Documents, Document, Settings
  services/     storage/ (IndexedDB CRUD for notebooks, pages, documents,
                  files and PDF annotations)
                pdf/pdfjs.js (PDF.js setup + helpers)
                ai/aiService.js (provider-agnostic AI interface)
                ai/context.js (context assembly + priority order)
                ai/usage.js (request tracking against plan limits)
                ai/rag.js (chunking, indexing, similarity retrieval)
                ai/embeddings.js (batched embedding calls + cosine similarity)
                ocr/, search/ folders are reserved for later phases
  config/       plans.js — plan limits, not hardcoded in the UI
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

PDF data uses five stores, deliberately split so listing documents never
loads PDF bytes: `documents` (metadata — title, pageCount, size, timestamps,
and now `indexStatus`/`chunkCount`/`indexedAt`), `files` (the raw blob,
keyed by document id), `pdfAnnotations` (one row per document+page holding
an `elements` array in the same shape above), `documentChunks` (one row per
chunk — `{ id, documentId, pageNumber, chunkIndex, text, embedding }`, the
client-side stand-in for the spec's pgvector table), and `flashcards`
(`{ id, documentId, pageNumber, front, back, sourceText, reviews, correct,
lastReviewedAt }`). Deleting a document cascades through all five, leaving
nothing orphaned.

## Design notes

Palette and type were chosen to read as a calm academic notebook rather than a
generic SaaS dashboard: a warm paper background, one ink-blue accent, Source
Serif 4 for headings paired with Inter for UI text, and CSS-pattern paper
textures instead of image assets.
