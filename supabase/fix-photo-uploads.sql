-- ============================================================================
-- Fix: dish photo uploads are rejected by Storage
--
-- Production's recipe-photos bucket exists and is public, but it has no policy
-- letting the anon role upload, so every upload fails with "new row violates
-- row-level security policy". The app then falls back to saving the whole image
-- inline in cooking_log.photo, which is why every photo in the table is a large
-- data: URL instead of a Storage link.
--
-- Run this once in the Supabase dashboard -> SQL editor for the PRODUCTION
-- project (and staging, if it has the same problem). Safe to re-run.
-- ============================================================================

drop policy if exists "recipe_photos_read"   on storage.objects;
drop policy if exists "recipe_photos_insert" on storage.objects;
drop policy if exists "recipe_photos_delete" on storage.objects;

create policy "recipe_photos_read"   on storage.objects for select to anon using (bucket_id = 'recipe-photos');
create policy "recipe_photos_insert" on storage.objects for insert to anon with check (bucket_id = 'recipe-photos');
create policy "recipe_photos_delete" on storage.objects for delete to anon using (bucket_id = 'recipe-photos');
