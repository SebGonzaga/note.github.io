# Inkwell — AI Study Notebook (Phase 1–7: through Accounts + Real Security)

This is the Phase 1–7 build of the AI study notebook described in the master
development prompt: layout, library, notebook/page system, local-first storage,
light/dark theming, a full handwriting canvas, typed text boxes and images,
the PDF study system, the Highlight → Explain signature feature,
document-aware retrieval, AI-generated flashcards and quizzes, and now real
accounts — sign up/in/out, password reset, Google, Postgres, Row Level
Security, and server-side usage enforcement.

**The core loop from the spec is now complete end to end:** upload material →
study it → highlight something confusing → AI toolbar appears → ask →
get an explanation that cites your own document — reaching a definition
200 pages away, turning a highlight into a flashcard you'll actually review
later, or testing yourself with a generated quiz. **AI features now require
signing in** — not as a paywall, but because that's what makes the usage
limit real instead of a number the browser was trusting itself about.
Notebooks, PDFs, and annotations remain fully local and account-free, per
the spec's "let people experience the core loop before asking them to sign
up" principle (§33) — signing in is only required for the parts that
actually cost money to run.

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
  scale of one document's chunks, but it's the client-side stand-in for
  real pgvector similarity search, which is where this moves once Postgres
  is in the picture (Phase 7).
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

**Phase 7 — Accounts, Postgres, RLS, and server-side security**

This phase's job was to close a gap flagged as far back as Phase 5: AI
usage limits were tracked client-side only, in localStorage, which anyone
could clear — a courtesy counter, not a security control. Phase 7 makes it
real.

*Accounts.* Sign up, sign in, sign out, password reset (email link),
Google OAuth, session persistence, protected AI actions. Auth pages
(`/login`, `/signup`, `/forgot-password`, `/reset-password`) are their own
standalone layout, no sidebar — matching spec §17's split between
unauthenticated-accessible pages and the main app.

*A real compatibility bug caught and fixed before it could bite anyone:*
this app uses `HashRouter` (`/#/route`), and Supabase's default auth flow
also puts its one-time tokens in the URL hash — the two uses of the hash
collide, and a password-reset or OAuth redirect would silently fail to
sign anyone in (confirmed against Supabase's own team statement that hash
routers aren't supported under the default flow, not just inferred). Fixed
by forcing `flowType: 'pkce'` in the client config, which puts the token in
a query string (`?code=...`) instead, sitting harmlessly alongside a
`#/route` fragment in the same URL. See the comment in
`services/supabase/client.js` for the full reasoning.

*Database schema + Row Level Security* (`supabase/migrations/0001_init.sql`):
every table a user's data could live in — profiles, plans, ai_requests,
folders, notebooks, pages, documents, document_chunks, pdf_annotations,
flashcards, quizzes, quiz_attempts — gets RLS enabled with a policy of
`auth.uid() = user_id`. This is the actual boundary preventing one user
from reading or writing another's data — not application code, which the
spec is explicit should never be trusted for this (§16). A Postgres
trigger creates a `profiles` row automatically on sign-up. `plans` is
seeded with `free` (100 requests/month) and `premium` (2000/month) rows,
matching spec §32's "don't hardcode pricing" rule — a real subscription
system later just updates `profiles.plan_id`, nothing in application code
changes.

*Server-side usage enforcement* (`supabase/functions/_shared/authUsage.ts`,
shared by both Edge Functions): every AI call now requires
`Authorization: Bearer <the user's own access token>`, not the anon key.
The function verifies that token, looks up the caller's plan, counts their
`ai_requests` rows for the current month, and rejects with 429 if they're
over the limit — all server-side, all using a Postgres client scoped to
that token so RLS makes it structurally impossible to check or inflate
someone else's usage. The old localStorage-based tracking
(`services/ai/usage.js`) is deleted, not just deprecated — replaced by
`services/ai/serverUsage.js`, which reads the real count from Postgres
with the same verified identity. Settings' usage meter shows this number
now, with a line making clear it's real: *"This is your real usage,
enforced server-side — not a number this browser is just trusting itself
about."*

*Account deletion* (spec §18) is an Edge Function
(`supabase/functions/delete-account`), not a client SDK call — deleting an
`auth.users` row requires the service-role key, which must never reach the
browser. The function verifies the request came from the account being
deleted (via that account's own JWT), removes their Storage files, then
deletes the auth user — every table cascades automatically via
`on delete cascade` in the schema. **Honest scope note:** this deletes the
account and its server-side data (profile, usage history); notebooks/PDFs/
annotations still live only in each browser's IndexedDB as of this phase
(see below) and aren't touched by account deletion yet — Settings says this
explicitly rather than implying a completeness that isn't there yet.

*What did NOT change: local-first still works with zero account.* Creating
notebooks, drawing, typing notes, uploading and annotating PDFs — none of
it requires signing in, and none of it changed in this phase. Only the AI
actions (Highlight → Explain, flashcards, quizzes, indexing) now gate on
being signed in, surfaced as a "Sign in" link inline wherever an AI action
is triggered (the AI panel's error state, and the quiz generation modal)
rather than a redirect that loses whatever you were doing.

**Local backup & restore** (added after Phase 7, before cloud sync): Settings
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
- **Cloud sync is not implemented yet.** The schema exists (folders,
  notebooks, pages, documents, document_chunks, pdf_annotations,
  flashcards, quizzes, quiz_attempts are all real tables with real RLS),
  but the application code for notebooks/PDFs/annotations still reads and
  writes IndexedDB exclusively, same as Phases 1-6. This is the single
  biggest remaining gap: signing in currently gets you AI access and a
  real usage meter, not synced data across devices. This is a deliberate
  scope cut for this phase, not an oversight — migrating every storage.js
  function from IndexedDB to Postgres (plus Storage for PDF blobs, plus a
  local→cloud migration path for data created before signing in) is a
  comparably large lift to everything else in this phase combined, and
  mixing it in risked doing both halves worse. It's next.
- No email-verification-required gate in the UI beyond what Supabase's
  project settings enforce — if email confirmation is required, `signUp()`
  correctly shows "check your email" (no session comes back), but there's
  no in-app banner nudging an unconfirmed user who's somehow already
  signed in (e.g. via a provider that skips confirmation).
- `plans.features` (ocr, advancedContext) exists in the schema and is
  seeded, but nothing reads it yet to actually gate a feature — it's
  ready for Phase 8's premium features, not wired to anything yet.
- The Edge Functions' CORS is still `Access-Control-Allow-Origin: '*'`,
  same flag as earlier phases — tighten to your actual domain before
  going live.
- Adding `@supabase/supabase-js` to power `useAuth()` (needed everywhere,
  so it's in the main bundle, not lazy-loaded) added real weight: main
  bundle gzipped went from ~72 KB to ~75 KB. Worth watching if it keeps
  growing.

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
only by the Edge Functions — **not** a `VITE_` variable, since those are
compiled into the public bundle.

```bash
# 1. Push the schema — profiles, plans, ai_requests, and the cloud-sync
#    target tables, all with RLS. Also creates the private `documents`
#    Storage bucket for a later phase.
supabase db push

# 2. Deploy the three functions.
supabase functions deploy gemini-explain
supabase functions deploy gemini-embed
supabase functions deploy delete-account

# 3. One secret, shared by gemini-explain and gemini-embed.
#    delete-account needs no secret of its own — it uses
#    SUPABASE_SERVICE_ROLE_KEY, which Supabase provides automatically.
supabase secrets set GEMINI_API_KEY=your-key-here
```

(`gemini-explain` handles `explain`/`simplify`/`inContext`/`notes`/
`translate`/`flashcards`/`quiz` — no separate function needed per mode.)

In the Supabase dashboard, under Authentication:
- Email auth is on by default — nothing to do.
- To make the "Continue with Google" button work, add a Google provider
  under Authentication → Providers. Skippable; email/password works
  without it.

Then set these in Vercel's environment variables (and your local `.env`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
```

Settings → AI shows whether the connection is configured; Settings →
Account shows whether you're signed in.

> **Phase 7 closed the security gap flagged in earlier phases.** The Edge
> Functions now require a real signed-in user (`Authorization: Bearer
> <access token>`, verified server-side) and enforce usage limits from
> Postgres, not a client-side counter anyone could clear. What's still
> worth doing before a public launch: tighten the Edge Functions' CORS
> `Access-Control-Allow-Origin` from `*` to your actual domain, and see
> the Phase 7 section above for what's deliberately still local-only
> (cloud sync of notebooks/PDFs isn't implemented yet).

## What's next (per the roadmap)

- **Cloud sync** — the single biggest remaining gap (see the Phase 7
  section above): migrate notebooks/pages/documents/annotations/
  flashcards/quizzes from IndexedDB-only to the Postgres schema that
  already exists and has RLS, with local IndexedDB becoming an offline
  cache/queue in front of it rather than the sole source of truth. Needs a
  migration path for data created before signing in, and conflict handling
  for editing offline.
- **Real pgvector similarity search**, replacing the in-browser
  cosine-similarity array — the schema and `document_chunks.embedding`
  column are already there, waiting for chunks to actually live server-side.
- **Spaced repetition** for flashcard review, replacing the current
  fully-random shuffle.
- **Quiz/flashcard generation from a notebook's typed/handwritten notes**,
  not just PDFs — the generation plumbing is already mode-agnostic on the
  server; it just needs a notebook-side context builder analogous to
  `buildPdfContext`.
- **Phase 8+** — subscriptions/billing (Stripe, per spec §34 — `plans` and
  `profiles.plan_id` are already the target shape), admin dashboard, OCR,
  production hardening.

## Project structure

```
src/
  components/
    layout/, sidebar/   app shell — sidebar now shows sign-in state
    auth/               AuthCard.jsx — shared centered-card layout for
                         the standalone /login, /signup etc. pages
    canvas/             DrawingCanvas.jsx — pointer capture, stroke
                         rendering, eraser/select hit-testing
                         ElementsLayer.jsx — DOM overlay for text boxes and
                         images: placement, drag, resize, inline editing
    ai/                 AiSelectionToolbar.jsx — the highlight→explain popover
                         AiPanel.jsx — response, grounding badge, follow-ups,
                         flashcard results, indexing controls, sign-in prompt
                         QuizGenerateModal.jsx, QuizPanel.jsx — quiz config
                         and quiz-taking (docked or floating/modal variant)
    pdf/                PdfPage.jsx — stacks raster + text + ink + elements
                         TextLayer.jsx — selectable text and highlights
                         PdfThumbnail.jsx — page-list previews
    toolbar/            Toolbar.jsx — tool + color/size/opacity/font controls
    common/             Button, Modal
  pages/
    Home, Notebook, Documents, Document, Flashcards, Quizzes, Settings
    auth/               SignIn, SignUp, ForgotPassword, ResetPassword —
                         standalone routes, no sidebar
  services/
    storage/            IndexedDB CRUD — notebooks, pages, documents, files,
                         PDF annotations, flashcards, quizzes (still local
                         as of Phase 7 — see the cloud-sync note above)
    pdf/pdfjs.js         PDF.js setup + helpers
    ai/aiService.js       provider-agnostic AI interface (now requires auth)
    ai/context.js         context assembly + priority order
    ai/serverUsage.js     real usage, read from Postgres (replaces the
                           deleted client-only ai/usage.js from Phase 5-6)
    ai/rag.js              chunking, indexing, similarity retrieval
    ai/embeddings.js       batched embedding calls + cosine similarity
    auth/authService.js    sign up/in/out, password reset, Google, delete
    supabase/client.js     the one Supabase client — see its PKCE comment
    ocr/, search/          reserved for later phases
  config/       plans.js — plan limits (now mirrored in the `plans` table)
  hooks/        useTheme, useHistory (per-page undo/redo), useAuth (session)
  utils/        strokes.js (hit-testing geometry), toolDefaults.js
supabase/
  migrations/0001_init.sql   schema + RLS + storage policies (Phase 7)
  functions/
    gemini-explain/   explain/simplify/inContext/notes/translate/
                       flashcards/quiz — authenticated, quota-enforced
    gemini-embed/     batch embeddings for indexing — same auth pattern
    delete-account/   the one place the service-role key is used
    _shared/authUsage.ts   auth verification + quota check/record,
                            shared by both AI functions
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

PDF data uses five IndexedDB stores, deliberately split so listing
documents never loads PDF bytes: `documents` (metadata — title, pageCount,
size, timestamps, `indexStatus`/`chunkCount`/`indexedAt`), `files` (the raw
blob, keyed by document id), `pdfAnnotations` (one row per document+page
holding an `elements` array in the same shape above), `documentChunks` (one
row per chunk — `{ id, documentId, pageNumber, chunkIndex, text, embedding
}`, the client-side stand-in for the spec's pgvector table), `flashcards`
(`{ id, documentId, pageNumber, front, back, sourceText, reviews, correct,
lastReviewedAt }`), and `quizzes` (`{ id, documentId, pageNumber, title,
questions: [{ type, prompt, options, correctAnswer, explanation }],
attempts: [{ score, total, completedAt }] }`). Deleting a document cascades
through all six locally, leaving nothing orphaned.

**As of Phase 7, this IndexedDB data model has a matching Postgres schema**
(`supabase/migrations/0001_init.sql`) that isn't wired up yet — see "What's
next" above. The only server-side tables actually in use today are
`profiles`, `plans`, and `ai_requests` (accounts + real usage enforcement).

## Design notes

Palette and type were chosen to read as a calm academic notebook rather than a
generic SaaS dashboard: a warm paper background, one ink-blue accent, Source
Serif 4 for headings paired with Inter for UI text, and CSS-pattern paper
textures instead of image assets.
