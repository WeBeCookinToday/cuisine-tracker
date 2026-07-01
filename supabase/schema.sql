-- ============================================================================
-- Cuisine Tracker — Supabase schema
--
-- Run this in your STAGING project's SQL editor (Supabase dashboard -> SQL) to
-- recreate the tables, storage bucket, and access policies the app expects.
--
-- NOTE: This is an inferred, minimal schema that matches what the front-end
-- calls (see src/lib/supabase.js). If your PRODUCTION project's schema differs,
-- prefer dumping it for exact parity:
--     supabase db dump --db-url "postgresql://...prod..." -f prod-schema.sql
-- and run that against staging instead.
--
-- These policies are intentionally permissive (anyone with the anon key can
-- read/write) because the app has no login — this mirrors a public community
-- board. Tighten them if you add auth later.
-- ============================================================================

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.photos (
  id           bigint generated always as identity primary key,
  recipe_id    text        not null,
  storage_path text        not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.likes (
  id         bigint generated always as identity primary key,
  recipe_id  text        not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  recipe_id  text        not null,
  author     text        not null,
  body       text        not null,
  created_at timestamptz not null default now()
);

-- One persisted cooking-log entry per recipe (upserted on recipe_id).
create table if not exists public.cooking_log (
  recipe_id   text primary key,
  cooked      boolean,
  cooked_date timestamptz,
  rating      numeric,
  notes       text,
  photo       text,
  updated_at  timestamptz not null default now()
);

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- RLS is ON; the policies below grant the anon (public) role exactly the
-- operations the app performs. With RLS on and no policy, all access is denied.

alter table public.photos      enable row level security;
alter table public.likes       enable row level security;
alter table public.comments    enable row level security;
alter table public.cooking_log enable row level security;

-- photos: app selects, inserts, and deletes
create policy "photos_select" on public.photos for select to anon using (true);
create policy "photos_insert" on public.photos for insert to anon with check (true);
create policy "photos_delete" on public.photos for delete to anon using (true);

-- likes: app selects (count) and inserts
create policy "likes_select" on public.likes for select to anon using (true);
create policy "likes_insert" on public.likes for insert to anon with check (true);

-- comments: app selects and inserts
create policy "comments_select" on public.comments for select to anon using (true);
create policy "comments_insert" on public.comments for insert to anon with check (true);

-- cooking_log: everyone reads; upsert needs insert + update.
-- (Admin gating is client-side only, so the anon role must be allowed to write.)
create policy "cooking_log_select" on public.cooking_log for select to anon using (true);
create policy "cooking_log_insert" on public.cooking_log for insert to anon with check (true);
create policy "cooking_log_update" on public.cooking_log for update to anon using (true) with check (true);

-- ── Storage bucket for uploaded dish photos ─────────────────────────────────

insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

-- Public read of the bucket, plus anon upload/delete (matches uploadPhoto/deletePhoto)
create policy "recipe_photos_read"   on storage.objects for select to anon using (bucket_id = 'recipe-photos');
create policy "recipe_photos_insert" on storage.objects for insert to anon with check (bucket_id = 'recipe-photos');
create policy "recipe_photos_delete" on storage.objects for delete to anon using (bucket_id = 'recipe-photos');
