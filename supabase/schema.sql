-- VU Lecture Study System — full schema.
-- Run once in the Supabase SQL editor (or `npm run db:apply` with SUPABASE_DB_URL set).
-- Safe to re-run: every statement is idempotent.

create extension if not exists vector;

-- ───────────────────────── core tables ─────────────────────────

create table if not exists courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,            -- 'CS201'
  name        text not null,            -- 'Introduction to Programming'
  instructor  text,
  created_at  timestamptz default now()
);
create index if not exists courses_user_idx on courses (user_id);

create table if not exists lectures (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  number      int  not null,            -- 1..45
  title       text,
  created_at  timestamptz default now(),
  unique (course_id, number)
);

do $$ begin
  create type material_kind as enum ('transcript', 'handout', 'notes', 'past_paper');
exception when duplicate_object then null; end $$;

create table if not exists materials (
  id          uuid primary key default gen_random_uuid(),
  lecture_id  uuid references lectures(id) on delete cascade,  -- null = course-wide (handout, past paper)
  course_id   uuid not null references courses(id) on delete cascade,
  kind        material_kind not null,
  title       text,
  content     text not null,            -- the raw pasted text
  token_count int,
  created_at  timestamptz default now()
);
create index if not exists materials_lecture_idx on materials (lecture_id);
create index if not exists materials_course_idx on materials (course_id);

create table if not exists chunks (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  course_id   uuid not null references courses(id) on delete cascade,
  lecture_id  uuid references lectures(id) on delete cascade,
  kind        material_kind not null,
  position    int  not null,            -- order inside the material
  content     text not null,
  embedding   vector(1024) not null,
  -- full-text column for hybrid search (exact terms, function names, acronyms)
  fts         tsvector generated always as (to_tsvector('english', content)) stored
);
create index if not exists chunks_embedding_idx on chunks
  using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_course_idx on chunks (course_id);
create index if not exists chunks_fts_idx on chunks using gin (fts);

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  lecture_id  uuid not null references lectures(id) on delete cascade,
  markdown    text not null,            -- rendered notes
  exam_alerts jsonb not null default '[]', -- [{point, quote, handout_ref}]
  model       text not null,
  source_hash text,                     -- sha256 of the inputs; a repeat click never bills twice
  created_at  timestamptz default now()
);
create index if not exists notes_lecture_idx on notes (lecture_id, created_at desc);
create index if not exists notes_hash_idx on notes (lecture_id, source_hash);

create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  thread_id   uuid not null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  citations   jsonb default '[]',       -- [{lecture_number, chunk_id}]
  created_at  timestamptz default now()
);
create index if not exists chat_thread_idx on chat_messages (thread_id, created_at);

-- Every Claude / Voyage call is logged here; the home page shows the running total.
create table if not exists usage_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  course_id          uuid references courses(id) on delete set null,
  operation          text not null,     -- 'notes' | 'ask' | 'quiz' | 'grade' | 'revision' | 'embed'
  model              text not null,
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd           numeric(12, 6) not null default 0,
  created_at         timestamptz default now()
);
create index if not exists usage_user_idx on usage_log (user_id, created_at desc);

-- ───────────────────────── retrieval ─────────────────────────
-- Hybrid search: vector similarity fused with Postgres full-text via reciprocal-rank fusion.
-- Without p_query_text it behaves exactly like plain vector search.

drop function if exists match_chunks(uuid, vector, int, int, int);

create or replace function match_chunks(
  p_course_id    uuid,
  p_query        vector(1024),
  p_limit        int  default 12,
  p_lecture_from int  default null,
  p_lecture_to   int  default null,
  p_query_text   text default null
) returns table (
  chunk_id uuid, lecture_number int, kind material_kind,
  content text, similarity float
) language sql stable as $$
  with scoped as (
    select c.id, l.number as lecture_number, c.kind, c.content, c.embedding, c.fts
    from chunks c
    left join lectures l on l.id = c.lecture_id
    where c.course_id = p_course_id
      and (p_lecture_from is null or l.number >= p_lecture_from)
      and (p_lecture_to   is null or l.number <= p_lecture_to)
  ),
  vec as (
    select id, row_number() over (order by embedding <=> p_query) as rnk
    from scoped
    order by embedding <=> p_query
    limit p_limit * 2
  ),
  kw as (
    select s.id, row_number() over (order by ts_rank_cd(s.fts, q) desc) as rnk
    from scoped s, websearch_to_tsquery('english', coalesce(p_query_text, '')) q
    where p_query_text is not null and s.fts @@ q
    order by ts_rank_cd(s.fts, q) desc
    limit p_limit
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
           coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + k.rnk), 0) as score
    from vec v
    full outer join kw k on k.id = v.id
  )
  select s.id, s.lecture_number, s.kind, s.content,
         (1 - (s.embedding <=> p_query))::float as similarity
  from fused f
  join scoped s on s.id = f.id
  order by f.score desc
  limit p_limit;
$$;

-- ───────────────────────── row-level security ─────────────────────────
-- Server routes use the service-role key (which bypasses RLS) and check ownership in code.
-- These policies only matter if the browser ever queries Supabase directly.

alter table courses       enable row level security;
alter table lectures      enable row level security;
alter table materials     enable row level security;
alter table chunks        enable row level security;
alter table notes         enable row level security;
alter table chat_messages enable row level security;
alter table usage_log     enable row level security;

drop policy if exists courses_owner on courses;
create policy courses_owner on courses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists lectures_owner on lectures;
create policy lectures_owner on lectures
  for all using (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()));

drop policy if exists materials_owner on materials;
create policy materials_owner on materials
  for all using (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()));

drop policy if exists chunks_owner on chunks;
create policy chunks_owner on chunks
  for all using (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()));

drop policy if exists notes_owner on notes;
create policy notes_owner on notes
  for all using (exists (
    select 1 from lectures l join courses c on c.id = l.course_id
    where l.id = lecture_id and c.user_id = auth.uid()))
  with check (exists (
    select 1 from lectures l join courses c on c.id = l.course_id
    where l.id = lecture_id and c.user_id = auth.uid()));

drop policy if exists chat_owner on chat_messages;
create policy chat_owner on chat_messages
  for all using (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()))
  with check (exists (select 1 from courses c where c.id = course_id and c.user_id = auth.uid()));

drop policy if exists usage_owner on usage_log;
create policy usage_owner on usage_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
