# Inkwell — AI Study Notebook (no-accounts build)

This is the AI study notebook described in the master development prompt:
layout, library, notebook/page system, local-first storage, light/dark
theming, a full handwriting canvas, typed text boxes and images, the PDF
study system, the Highlight → Explain signature feature, document-aware
retrieval, and AI-generated flashcards and quizzes.

> **Note on this build:** an earlier version of this project went through
> a Phase 7 with full accounts (sign up/in/out, Google OAuth, Postgres, Row
> Level Security, server-side per-user usage quotas). That has been
> deliberately removed. **There are no accounts anywhere in this app.**
> Notebooks, PDFs, annotations, flashcards, and quizzes all live only in
> this browser's IndexedDB — open the app and your previous work is just
> there, with nothing to sign into and nothing that syncs anywhere. The
> *only* thing that ever leaves the device is an AI request (explain,
> simplify, flashcards, quiz, embeddings for indexing), which goes to this
> app's own two serverless functions in `/api`, which forward it to Gemini
> and hide the API key. See "AI backend" below for what that means in
> practice, including the trade-off of not having per-user quotas anymore.

**The core loop:** upload material → study it → highlight something
confusing → AI toolbar appears → ask → get an explanation that cites your
own document — reaching a definition 200 pages away, turning a highlight
into a flashcard you'll actually review later, or testing yourself with a
generated quiz. None of this requires signing in, ever.

## Run it locally

This project wasn't built or installed in the sandbox that generated it (no
network access there), so run these on your own machine:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). Everything
except the AI features works immediately, with zero configuration. For the
AI features to work locally too, see "AI backend" below — you'll need a
Gemini API key and a way to run the `/api` functions locally (e.g. the
Vercel CLI's `vercel dev`, which serves both the Vite frontend and the
`/api` functions together).

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
  is fine for local-first storage but would need to move to object storage
  (metadata + storage path) if cloud sync is ever added, to keep the local
  database size and sync payloads reasonable for photo-heavy notebooks.

**Neat writing — sharpen ink & convert handwriting to type**
- A wand control in the toolbar (shown with the Pen and Pencil) has three
  modes, remembered across notebooks and PDFs:
  - **Off** — ink is kept exactly as drawn.
  - **Sharpen ink** *(default)* — when you lift the pen, the stroke is
    cleaned up: near-duplicate points dropped, hand tremor relaxed, corners
    rounded. Fully offline and instant; the stroke's start and end points
    never move.
  - **Convert to text** — everything in *Sharpen*, plus: after ~1.6 s with the
    pen up, the strokes you just wrote are rendered to a small black-on-white
    image, read by Gemini (`/api/gemini-transcribe`), and replaced with a
    typed text box in the font you pick (Clean, Serif, Neat print, Script),
    sized to match your handwriting and placed where it was. It's one undo
    step — **Undo brings the ink back**.
- It's deliberately conservative: drawings, diagrams, arrows, and maths
  notation are left as ink (the model is told to decline them), results below
  0.6 confidence are ignored, and it transcribes exactly what you wrote —
  spelling included — rather than "fixing" it. If anything goes wrong
  (offline, no key, rate limited) your ink stays and a small note says why.
  Highlighter strokes are never converted.
- Needs `GEMINI_API_KEY` like the other AI features; without it the mode just
  reports "isn't set up" and everything else keeps working. It has its own
  rate-limit bucket (4 per 10 s, 300 per day per IP) so writing all day can't
  use up the explain/quiz budget.
- **Fountain pen** *(default for the Pen tool)* — a separate "Pen" control
  switches between Fountain and Classic. With Fountain, line width follows how
  fast you write: thinner on quick strokes, fuller when you slow down, with a
  pointed start and finish; real stylus pressure still counts on top. It uses
  the timestamps captured with each point (`t`, ms), works in every browser
  with no AI, and is independent of the Off/Sharpen/Convert setting. Each
  stroke remembers its own style (`style: 'fountain'`, per-point width `w`), so
  switching styles never changes ink you've already written. Pencil and
  highlighter are unchanged.
- The Text tool also gained a **typeface** picker (same four fonts). Text
  boxes made before this had no font and look exactly as they did.
- **Known simplifications:** converted text is a normal text box, so it isn't
  re-flowed if you later resize it beyond its width; a long pause mid-sentence
  converts what's written so far (raise `CONVERT_IDLE_MS` in
  `DrawingCanvas.jsx` if that's too eager); the Neat print/Script fonts load
  from Google Fonts, so offline they fall back to a system font.

**Aesthetic extras (FreeNotes-inspired, purely additive)**

A batch of smaller features rounding out the FreeNotes comparison, added
without touching any existing tool's behavior — each is either a new file
or a clearly-separate branch alongside existing code:

- **Expanded font library** — `utils/fonts.js` grew from 14 to 26 curated
  fonts across five groups (Plain, Calligraphy, Elegant, Cute, Bold),
  available anywhere fonts already showed up (the Text tool, "Convert to
  text" mode).
- **Decorative underlines** — a new toolbar tool alongside pen/pencil/
  highlighter, styled wave, zigzag, double, or dash. Pure geometry
  (`utils/decorations.js`: arc-length resampling + perpendicular offset),
  computed fresh from the stroke's real points at draw time — selecting or
  erasing a decorative underline hit-tests the actual drawn path, not the
  rendered pattern, so nothing about selection/erase needed to change.
- **Shape recognition** — draw a rough circle, rectangle, triangle, or
  straight line with the pen or pencil and it snaps to a clean version on
  lift (`services/ink/shapeRecognition.js`), a new toggle next to the pen
  style picker. Deliberately conservative: a minimum size gate and strict
  fit tolerances keep it from mistaking an isolated letter like "O" for a
  circle — verified with test strokes for letters, scribbles, and
  five-sided shapes all correctly declining to match, alongside clean and
  hand-wobbled circles/rectangles/triangles/lines all correctly matching.
  Independent of the neat-writing mode (works even with mode "off"), and a
  recognized shape is never sent for AI conversion even in "Convert to
  text" mode — it isn't handwriting.
- **Stickers** — a curated set of small decorative SVGs (stars, hearts,
  checkmarks, flowers) in `utils/stickers.js`, inserted through
  `ElementsLayer`'s existing `addImage()` exactly like an uploaded photo —
  no new element type, no changes to drag/resize/delete.
- **Aesthetic page themes** — five new paper backgrounds (pastel pink/
  mint/lavender/sky, kraft) alongside the original six, each still dotted
  or lined underneath the tint rather than a purely decorative blank page.
- **Notebook cover colors** — a swatch picker in each notebook's menu on
  the library page, tinting its card. Notebooks created before this have
  no `color` field at all and render exactly as they did — nothing to
  migrate.

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
and PDFs are stored as blobs in IndexedDB, which would move to object
storage (metadata row + storage path) if cloud sync is ever added.

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

*Security.* `GEMINI_API_KEY` is read **only** inside the `/api` serverless
functions, as a server-side environment variable. There is deliberately no
`VITE_GEMINI_*` variable anywhere in this project, because anything
prefixed `VITE_` is compiled into the browser bundle and is therefore
public. The frontend calls our own same-origin `/api/gemini-explain` and
`/api/gemini-embed` functions; only those functions call Gemini.

*Rate limiting, not per-user quotas.* There are no accounts, so there is no
per-user identity to attach a usage limit to. Instead, `api/_shared/rateLimit.js`
does simple, best-effort per-IP rate limiting (a short burst cap plus a
daily cap), entirely in the function's own memory — no database. This is a
much weaker control than a real per-user quota: it resets when the
serverless instance recycles and is easy to route around with a VPN. It
exists to stop a runaway loop or a stray bug from quietly spending your
whole Gemini budget, not to police individual users.

**Known limitations to revisit:**
- **Rate limiting is best-effort and in-memory, not a real security
  control.** It resets whenever the function's instance recycles and only
  tracks by IP, so it's easy to work around deliberately. If this app gets
  meaningful traffic, replace it with a durable store (e.g. a KV/Redis
  counter) or bring back some form of accounts if you need real per-user
  quotas.
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


*Quizzes.* Generated from a page or a sampled cross-section of the whole
document (spec §28) — a config modal (opened from the PDF viewer's toolbar)
picks question count (5/10/20) and types (multiple choice, true/false,
identification). Unlike flashcards, a quiz is saved the moment it's
generated rather than requiring an explicit save step: you're about to take
it immediately, and it should survive you closing the tab mid-attempt.
Review and retake past quizzes at `/quizzes`; each attempt is recorded
separately so the library page can show both your last and best score, not
just a single overwritten number.

"Whole document" scope doesn't send the entire PDF — it samples evenly
spaced pages (`getDocumentSampleText` in `context.js`) up to a character
cap, so a quiz over "the whole PDF" has a chance of covering material
throughout it rather than only the introduction, without the request
blowing past the context limit. A future pass could sample from indexed
chunk embeddings instead for better spread; noted, not done here.

*A generation-quality bug I caught before shipping:* a 20-question quiz
with options and explanations for each question can genuinely exceed a
flat output-token budget, and Gemini truncating mid-JSON silently turns
into an empty quiz (the parser correctly gives up on broken JSON — the
loss is upstream of that, in the response getting cut off at all). Output
token budget now scales with question count instead of using one fixed
number for every mode.

**Known limitations to revisit:**
- Retrieval is cosine similarity over an in-browser array — fine at the
  scale of one document's chunks, but it would need a real vector database
  (e.g. pgvector) to scale to a large library, which this build
  deliberately doesn't have (no backend database at all — see the
  no-accounts note at the top of this file).
- No re-indexing prompt if a document's annotations change; indexing only
  ever looks at the PDF's own text, which doesn't change, so this is
  actually fine — noted in case that assumption ever stops holding.
- Flashcard review has no spaced-repetition scheduling yet (every card is
  equally likely to come up regardless of how well you know it) — listed
  under "what's next" below.
- Quiz identification answers are matched by exact (trimmed,
  case-insensitive) string — "mitochondria" and "the mitochondria" would be
  scored differently. Fine for short factual answers, worth revisiting for
  anything more free-form.
- The chunk size (700 chars) and match threshold (0.65 cosine similarity)
  are fixed constants, not tuned against real study material yet.

**Accounts, Postgres, and per-user quotas were removed**

An earlier version of this project went through a "Phase 7" that added full
accounts — sign up/in/out, password reset, Google OAuth, a Postgres schema
with Row Level Security, and server-side per-user AI usage quotas backed by
that database. All of it has been deliberately removed:

- No sign-up/sign-in/sign-out, no password reset, no Google OAuth, no
  account deletion.
- No Postgres, no Row Level Security, no `profiles`/`plans`/`ai_requests`
  tables, no database of any kind.
- No per-user usage quota. AI abuse protection is now a simple per-IP rate
  limit inside the `/api` functions themselves (see "AI backend" below) —
  much weaker than a real per-user quota, but it needs no accounts and no
  database to exist.
- Notebooks, PDFs, and annotations were never affected by any of this —
  they were local-first (IndexedDB-only) from Phase 1 onward and remain
  exactly that. Nothing about "your work is just there when you open the
  app" changed; what changed is that AI features no longer require signing
  in to use them at all, because there's no more "signing in."

If you want real per-user usage limits back later, the straightforward
path is reintroducing some form of identity (even something lighter than
full accounts, like a device-bound anonymous ID) and a durable store for
counting requests against it — a KV store or a small database — rather
than the in-memory IP rate limiting this build uses instead.


**Local backup & restore** (added before cloud sync, and unaffected by
removing accounts): Settings
→ Storage → Download backup exports everything — folders, notebooks, pages,
document metadata, PDF files, annotations, flashcards, and quizzes — as a
single `.zip` the person downloads and controls. This exists because
browser storage has a real durability gap that has nothing to do with
whether cloud sync exists yet: clearing site data, switching browsers, or
getting a new device all wipe IndexedDB with no way to get it back, whether
the app is a plain tab, an installed PWA, or wrapped in Median (which just
puts a native shell around the same WebView storage — it doesn't change
where the data lives). A backup is a file-based safety net that needs no
server.

RAG chunk embeddings are deliberately excluded from the export — they're
the single largest thing in the database and are fully regenerable from
the PDF's own text via re-indexing, so leaving them out shrinks backups
significantly for zero durability cost. Restoring always adds new IDs and
remaps every relationship (folder → notebook → page, document → chunks →
flashcards) rather than merging or overwriting, so importing into a
library that already has data is always safe — the tradeoff is that
importing the same backup twice creates two copies rather than
deduplicating, which is called out in the UI. Verified with a script
round-tripping a realistic linked dataset through actual zip/unzip
(compression, not just object copying) plus the ID-remapping logic
end-to-end: folder→notebook links, null folder handling, cross-store
references, and orphaned-reference dropping all checked explicitly before
trusting it.

Implementation: `services/storage/backup.js`, using `fflate` for
browser-side zip/unzip. Lazy-loaded alongside Settings (same reasoning as
the PDF routes) so visitors who never open Settings don't pay for it.

**Known limitations to revisit:**
- **There is no cloud sync, by design.** Notebooks, PDFs, annotations,
  flashcards, and quizzes live only in the current browser's IndexedDB.
  Clearing site data, switching browsers, or moving to a new device all
  lose that data with no way to get it back except a manual backup
  restore (above). If you want cross-device sync later, that requires
  bringing back some form of backend storage and, realistically, some
  form of identity to know which data belongs to whom.
- No premium/plan-gated features exist — there's no concept of a plan at
  all now that there are no accounts.

## Deployment: Vercel (frontend + AI backend)


### Frontend

The app is a static Vite build, so Vercel needs zero configuration:

1. Push this repo to GitHub.
2. Import it in Vercel ("Add New Project" → pick the repo). Vercel
   auto-detects Vite (`npm run build`, output `dist/`) — no `vercel.json`
   needed. The two functions in `/api` are auto-detected and deployed as
   serverless functions alongside the static build, with no separate
   deploy step.
3. Every push to `main` redeploys automatically; PRs get preview URLs.

`vite.config.js` uses `base: './'` and the app uses `HashRouter`, so it works
the same on Vercel's root domain or a subpath, with no rewrite rules for
client-side routing.

Notebooks, PDFs and annotations all work with no configuration at all. Only
the AI features need the one step below.

### AI backend

```
Browser → /api/gemini-explain or /api/gemini-embed (same origin) → Gemini API
```

The Gemini key never reaches the browser. Set it once, in Vercel's
dashboard under Project → Settings → Environment Variables:

```
GEMINI_API_KEY=your-key-here
```

That's the entire setup — no database to push a schema to, no separate
functions to deploy, no secrets CLI, no OAuth provider to configure. The
two `/api` files read `process.env.GEMINI_API_KEY` on the server only;
nothing prefixed `VITE_` is used for this, since those would be compiled
into the public bundle.

(`/api/gemini-explain` handles `explain`/`simplify`/`inContext`/`notes`/
`translate`/`flashcards`/`quiz` — no separate function needed per mode.
`/api/gemini-embed` handles the batch embeddings used for RAG indexing.)

Settings → AI just confirms there's no sign-in required; it doesn't check
whether `GEMINI_API_KEY` is actually set; a request without a key configured
comes back as an error in the AI panel itself.

> **This app has no accounts, no database, and no per-user usage quota.**
> The only abuse protection is the best-effort, in-memory, per-IP rate
> limiting in `api/_shared/rateLimit.js` (see the "Accounts, Postgres, and
> per-user quotas were removed" note above for what that trades away, and
> what to do instead if you need real per-user limits later).

## What's next (per the roadmap)

- **Cloud sync** — reintroducing some form of backend storage so
  notebooks/pages/documents/annotations/flashcards/quizzes can follow a
  person across devices. This build deliberately doesn't have one; it
  would need its own identity story (even something lighter than full
  accounts) to know whose data is whose.
- **Real vector similarity search** (e.g. pgvector), replacing the
  in-browser cosine-similarity array — only relevant once there's a
  server-side database to hold chunks in.
- **Model retirement** — Google retires Gemini models on a schedule
  (`gemini-2.0-flash` and `text-embedding-004` are already shut down). The
  models are now read from `GEMINI_MODEL` / `GEMINI_EMBEDDING_MODEL` env vars,
  so a retirement is a dashboard change + redeploy. A 502 from any `/api/gemini-*`
  route usually means this — the Vercel function log shows Google's reason.
- **Durable rate limiting** — replacing the in-memory per-IP limiter with
  a KV/Redis-backed one that survives instance recycling, if this app gets
  real traffic.
- **Spaced repetition** for flashcard review, replacing the current
  fully-random shuffle.
- **Quiz/flashcard generation from a notebook's typed/handwritten notes**,
  not just PDFs — the generation plumbing is already mode-agnostic on the
  server; it just needs a notebook-side context builder analogous to
  `buildPdfContext`.
- OCR of *scanned PDFs*, production hardening, and anything else that doesn't depend on
  reintroducing a backend.

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
                         QuizGenerateModal.jsx, QuizPanel.jsx — quiz config
                         and quiz-taking (docked or floating/modal variant)
    pdf/                PdfPage.jsx — stacks raster + text + ink + elements
                         TextLayer.jsx — selectable text and highlights
                         PdfThumbnail.jsx — page-list previews
    toolbar/            Toolbar.jsx — tool + color/size/opacity/font controls
    common/             Button, Modal

  pages/
    Home, Notebook, Documents, Document, Flashcards, Quizzes, Settings
  services/
    storage/            IndexedDB CRUD — notebooks, pages, documents, files,
                         PDF annotations, flashcards, quizzes (the only
                         place any of this data lives — no server copy)
    pdf/pdfjs.js         PDF.js setup + helpers
    ai/aiService.js       provider-agnostic AI interface — same-origin
                           fetch to /api, no accounts/tokens
    ai/context.js         context assembly + priority order
    ai/rag.js              chunking, indexing, similarity retrieval
    ai/embeddings.js       batched embedding calls + cosine similarity
    ocr/, search/          reserved for later
  hooks/        useTheme, useHistory (per-page undo/redo)
  utils/        strokes.js (hit-testing geometry), toolDefaults.js
api/
  gemini-explain.js   explain/simplify/inContext/notes/translate/
                       flashcards/quiz — holds GEMINI_API_KEY, no accounts
  gemini-embed.js     batch embeddings for indexing — same pattern
  gemini-transcribe.js  handwriting image → text for "Convert to text" — same pattern
  _shared/rateLimit.js   best-effort per-IP rate limiting, shared (per-feature buckets)
```

The data model matches the spec: `Notebook { id, title, folderId, createdAt,
updatedAt, favorite }`, `Page { id, notebookId, title, background, elements }`.
`elements` is a single array holding three element types today:
- Stroke: `{ id, type: 'stroke', tool, color, width, opacity, points: [{ x, y, pressure }] }` (newer strokes may also have `style: 'fountain'`, and points a timestamp `t` and width `w`; all optional)
- Text: `{ id, type: 'text', x, y, width, height, text, fontSize, color, bold, italic, align, font }` (`font` is optional — one of `inter | serif | print | script`; missing means the app default)
- Image: `{ id, type: 'image', x, y, width, height, src }` (`src` is a base64 data URL for now — see Phase 3 notes above)

- Highlight: `{ id, type: 'highlight', color, text, rects: [{ x, y, width, height }] }` (PDF pages only)

Shape elements are the remaining piece the spec mentions for this array and
can join the same list later the same way text/image did.

PDF data uses five IndexedDB stores, deliberately split so listing
documents never loads PDF bytes: `documents` (metadata — title, pageCount,
size, timestamps, `indexStatus`/`chunkCount`/`indexedAt`), `files` (the raw
blob, keyed by document id), `pdfAnnotations` (one row per document+page
holding an `elements` array in the same shape above), `documentChunks` (one
row per chunk — `{ id, documentId, pageNumber, chunkIndex, text, embedding
}`, embeddings live only here — no separate vector database), `flashcards`
(`{ id, documentId, pageNumber, front, back, sourceText, reviews, correct,
lastReviewedAt }`), and `quizzes` (`{ id, documentId, pageNumber, title,
questions: [{ type, prompt, options, correctAnswer, explanation }],
attempts: [{ score, total, completedAt }] }`). Deleting a document cascades
through all six locally, leaving nothing orphaned. This IndexedDB store is
the only copy of this data anywhere — there's no server-side schema for it,
matching or otherwise, since this build has no database at all.

## Design notes

Palette and type were chosen to read as a calm academic notebook rather than a
generic SaaS dashboard: a warm paper background, one ink-blue accent, Source
Serif 4 for headings paired with Inter for UI text, and CSS-pattern paper
textures instead of image assets.
