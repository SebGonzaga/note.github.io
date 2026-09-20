import { STORES, getAll, getById, getByIndex, put, putMany, remove, removeByIndex, newId } from './db.js'

// ---------- Documents (metadata) ----------

export async function listDocuments() {
  return getAll(STORES.documents)
}

export async function getDocument(id) {
  return getById(STORES.documents, id)
}

// `file` is the raw uploaded File/Blob. Stored separately in STORES.files so
// listing documents never has to load PDF bytes into memory.
export async function createDocument({ title, file, pageCount }) {
  const now = Date.now()
  const doc = {
    id: newId('doc'),
    title,
    pageCount,
    size: file.size,
    createdAt: now,
    updatedAt: now,
    favorite: false
  }
  await put(STORES.documents, doc)
  await put(STORES.files, { id: doc.id, blob: file })
  return doc
}

export async function renameDocument(id, title) {
  const doc = await getById(STORES.documents, id)
  if (!doc) return null
  doc.title = title
  doc.updatedAt = Date.now()
  return put(STORES.documents, doc)
}

export async function toggleDocumentFavorite(id) {
  const doc = await getById(STORES.documents, id)
  if (!doc) return null
  doc.favorite = !doc.favorite
  return put(STORES.documents, doc)
}

// Deletion removes the metadata row, the stored file blob, every per-page
// annotation row, every RAG chunk, and every flashcard — no orphaned data
// left behind, matching the "don't leave private files accessible" rule
// from the spec.
export async function deleteDocument(id) {
  await remove(STORES.documents, id)
  await remove(STORES.files, id)
  await removeByIndex(STORES.pdfAnnotations, 'documentId', id)
  await removeByIndex(STORES.documentChunks, 'documentId', id)
  await removeByIndex(STORES.flashcards, 'documentId', id)
  await removeByIndex(STORES.quizzes, 'documentId', id)
  return true
}

export async function getDocumentFile(id) {
  const record = await getById(STORES.files, id)
  return record?.blob ?? null
}

async function touchDocument(id) {
  const doc = await getById(STORES.documents, id)
  if (!doc) return
  doc.updatedAt = Date.now()
  await put(STORES.documents, doc)
}

// ---------- Per-page annotations ----------
// One row per (documentId, pageNumber); `elements` holds the same stroke /
// text / image / highlight element shapes used elsewhere, so DrawingCanvas
// and ElementsLayer work unmodified on top of a rendered PDF page.

export async function getPageAnnotations(documentId, pageNumber) {
  const rows = await getByIndex(STORES.pdfAnnotations, 'documentId', documentId)
  return rows.find((r) => r.pageNumber === pageNumber)?.elements ?? []
}

export async function setPageAnnotations(documentId, pageNumber, elements) {
  const rows = await getByIndex(STORES.pdfAnnotations, 'documentId', documentId)
  const existing = rows.find((r) => r.pageNumber === pageNumber)
  const row = existing ? { ...existing, elements } : { id: newId('ann'), documentId, pageNumber, elements }
  await put(STORES.pdfAnnotations, row)
  await touchDocument(documentId)
  return row
}

// ---------- RAG index (Phase 6) ----------
// `indexStatus` lives on the document record itself: 'none' | 'indexing' |
// 'ready' | 'error'. Chunks live in their own store so re-indexing is just
// "delete this document's chunks, write new ones" without touching
// metadata rows other code depends on.

export async function setIndexStatus(documentId, patch) {
  const doc = await getById(STORES.documents, documentId)
  if (!doc) return null
  const next = { ...doc, ...patch }
  await put(STORES.documents, next)
  return next
}

export async function replaceDocumentChunks(documentId, chunks) {
  await removeByIndex(STORES.documentChunks, 'documentId', documentId)
  if (chunks.length > 0) await putMany(STORES.documentChunks, chunks)
  return chunks
}

// Adds chunks without clearing existing ones first — used to persist each
// embedding batch as it completes during indexing, so a quota/network
// failure partway through a long document keeps whatever already succeeded
// instead of losing it. Callers that want a clean re-index call
// replaceDocumentChunks once up front, then this per batch.
export async function appendDocumentChunks(documentId, chunks) {
  if (chunks.length > 0) await putMany(STORES.documentChunks, chunks)
  return chunks
}

export async function getDocumentChunks(documentId) {
  return getByIndex(STORES.documentChunks, 'documentId', documentId)
}

// ---------- Flashcards (Phase 6) ----------

export async function listFlashcards(documentId) {
  const cards = documentId
    ? await getByIndex(STORES.flashcards, 'documentId', documentId)
    : await getAll(STORES.flashcards)
  return cards.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveFlashcards(cards) {
  const now = Date.now()
  const rows = cards.map((c) => ({
    id: newId('card'),
    documentId: c.documentId ?? null,
    pageNumber: c.pageNumber ?? null,
    front: c.front,
    back: c.back,
    sourceText: c.sourceText ?? null,
    createdAt: now,
    // Active-recall stats (spec §29) — updated as the card is reviewed.
    reviews: 0,
    correct: 0,
    lastReviewedAt: null
  }))
  await putMany(STORES.flashcards, rows)
  return rows
}

export async function recordFlashcardReview(cardId, wasCorrect) {
  const cards = await getAll(STORES.flashcards)
  const card = cards.find((c) => c.id === cardId)
  if (!card) return null
  const next = {
    ...card,
    reviews: card.reviews + 1,
    correct: card.correct + (wasCorrect ? 1 : 0),
    lastReviewedAt: Date.now()
  }
  await put(STORES.flashcards, next)
  return next
}

export async function deleteFlashcard(id) {
  await remove(STORES.flashcards, id)
  return true
}

// ---------- Quizzes (Phase 6) ----------

export async function listQuizzes(documentId) {
  const quizzes = documentId
    ? await getByIndex(STORES.quizzes, 'documentId', documentId)
    : await getAll(STORES.quizzes)
  return quizzes.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getQuiz(id) {
  return getById(STORES.quizzes, id)
}

export async function saveQuiz({ documentId, pageNumber, title, questions, sources }) {
  const quiz = {
    id: newId('quiz'),
    documentId: documentId ?? null,
    pageNumber: pageNumber ?? null,
    title,
    questions,
    sources: sources ?? [],
    createdAt: Date.now(),
    // Attempt history (spec §28: "Store... Score"): each entry is one
    // completed attempt, not a running average, so the review page can
    // show a trend rather than a single flattened number.
    attempts: []
  }
  await put(STORES.quizzes, quiz)
  return quiz
}

export async function recordQuizAttempt(quizId, { score, total }) {
  const quiz = await getById(STORES.quizzes, quizId)
  if (!quiz) return null
  const next = {
    ...quiz,
    attempts: [...quiz.attempts, { score, total, completedAt: Date.now() }]
  }
  await put(STORES.quizzes, next)
  return next
}

export async function deleteQuiz(id) {
  await remove(STORES.quizzes, id)
  return true
}
