-- Inkwell — Phase 7 schema (accounts, RLS, server-side usage).
--
-- Run via: supabase db push   (or paste into the SQL editor)
--
-- Scope note: every table below is defined now so the backend contract is
-- settled, but as of this migration only `profiles`, `plans`, and
-- `ai_requests` are actually written to by the app — those three are what
-- make server-side auth + usage enforcement real. The rest (folders,
-- notebooks, pages, documents, document_chunks, pdf_annotations,
-- flashcards, quizzes, quiz_attempts) mirror the IndexedDB shapes the
-- frontend already uses locally, so a later cloud-sync pass has a target
-- schema to write to without a second migration. Until that pass, local
-- data lives only in each browser's IndexedDB, exactly as in Phases 1–6.

create extension if not exists "uuid-ossp";
create extension if not exists vector; -- pgvector, for document_chunks.embedding

-- ---------- Plans (spec §32: configurable, not hardcoded) ----------

create table if not exists plans (
  id text primary key, -- 'free' | 'premium'
  name text not null,
  ai_requests_per_month integer not null,
  max_document_size_mb integer not null,
  max_documents integer, -- null = unlimited
  features jsonb not null default '{}'::jsonb
);

insert into plans (id, name, ai_requests_per_month, max_document_size_mb, max_documents, features)
values
  ('free', 'Free', 100, 50, 20, '{"ocr": false, "advancedContext": false}'),
  ('premium', 'Premium', 2000, 200, null, '{"ocr": true, "advancedContext": true}')
on conflict (id) do nothing;

-- ---------- Profiles ----------
-- One row per auth user, created automatically on sign-up (trigger below).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  plan_id text not null default 'free' references plans(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------- AI usage tracking (spec §15) ----------
-- Written by the Edge Functions using the caller's own JWT-scoped client,
-- so RLS (below) is what actually prevents one user from inflating or
-- reading another user's usage — not application logic.

create table if not exists ai_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null, -- 'explain' | 'simplify' | 'inContext' | 'notes' | 'translate' | 'flashcards' | 'quiz' | 'followUp' | 'embed'
  model text,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ai_requests_user_month_idx on ai_requests (user_id, created_at);

-- ---------- Folders / Notebooks / Pages (cloud-sync target — see note above) ----------

create table if not exists folders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists notebooks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  title text not null,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notebook_id uuid not null references notebooks(id) on delete cascade,
  title text not null default 'Untitled',
  background text not null default 'blank',
  position integer not null default 0,
  elements jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- Documents (PDFs) ----------
-- The file itself lives in Storage (bucket `documents`, path
-- `{user_id}/{document_id}.pdf`), not in this table — `storage_path` just
-- points at it, matching the spec's "metadata in Postgres, files in object
-- storage" rule.

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text,
  page_count integer not null default 0,
  size_bytes bigint not null default 0,
  favorite boolean not null default false,
  index_status text not null default 'none', -- 'none' | 'indexing' | 'ready' | 'error'
  index_error text,
  chunk_count integer not null default 0,
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_chunks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  page_number integer not null,
  chunk_index integer not null,
  text text not null,
  embedding vector(768) -- text-embedding-004 dimension
);

create index if not exists document_chunks_document_idx on document_chunks (document_id);
-- Similarity search index — left commented until there's enough real data
-- for ivfflat's clustering to be worth it; a plain sequential scan is fine
-- at small scale and this can be added later with zero application changes.
-- create index document_chunks_embedding_idx on document_chunks
--   using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists pdf_annotations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  page_number integer not null,
  elements jsonb not null default '[]'::jsonb,
  unique (document_id, page_number)
);

-- ---------- Flashcards / Quizzes ----------

create table if not exists flashcards (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  page_number integer,
  front text not null,
  back text not null,
  source_text text,
  reviews integer not null default 0,
  correct integer not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists quizzes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  page_number integer,
  title text not null,
  questions jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists quiz_attempts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references quizzes(id) on delete cascade,
  score integer not null,
  total integer not null,
  completed_at timestamptz not null default now()
);

-- ==========================================================================
-- Row Level Security — every table a user's data lives in gets the same
-- shape of policy: you can only see or touch rows where user_id = your own
-- auth.uid(). This is the actual security boundary, not any check in
-- application code (spec §16: "never trust ... determine server-side").
-- ==========================================================================

alter table profiles enable row level security;
alter table ai_requests enable row level security;
alter table folders enable row level security;
alter table notebooks enable row level security;
alter table pages enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table pdf_annotations enable row level security;
alter table flashcards enable row level security;
alter table quizzes enable row level security;
alter table quiz_attempts enable row level security;

create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id);

create policy "own ai_requests select" on ai_requests for select using (auth.uid() = user_id);
create policy "own ai_requests insert" on ai_requests for insert with check (auth.uid() = user_id);
-- No update/delete policy for ai_requests on purpose — usage history is
-- append-only from the client's perspective, same reasoning as an audit log.

create policy "own folders" on folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notebooks" on notebooks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pages" on pages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own documents" on documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own document_chunks" on document_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own pdf_annotations" on pdf_annotations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own flashcards" on flashcards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own quizzes" on quizzes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own quiz_attempts" on quiz_attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- plans is public reference data — every signed-in user can read it (to
-- show pricing/limits), nobody can write to it from the client.
alter table plans enable row level security;
create policy "plans readable by anyone signed in" on plans for select using (auth.role() = 'authenticated');

-- ==========================================================================
-- Storage — PDFs live in a private bucket, one folder per user, enforced
-- the same way as the table policies: path must start with your own uid.
-- ==========================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "own document files select"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own document files insert"
  on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own document files delete"
  on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
