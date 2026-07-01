import { createClient } from "@supabase/supabase-js";

// ── Supabase client ──────────────────────────────────────────────────────
// URL + anon key come from build-time env vars so each environment
// (local / staging / production) can point at its own Supabase project.
// Set these in a local .env.local file and in each GitHub Actions
// environment. See .env.example and README.md.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail loudly during development instead of silently making broken requests.
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "Copy .env.example to .env.local and fill in your Supabase project values."
  );
}

const _supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Upload a file to Supabase Storage and return its public URL
export async function uploadPhoto(recipeId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const ext  = "jpg";
  const path = `${recipeId}/${Date.now()}.${ext}`;
  const { error } = await _supa.storage.from("recipe-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = _supa.storage.from("recipe-photos").getPublicUrl(path);
  // Save path reference to photos table
  await _supa.from("photos").insert({ recipe_id: recipeId, storage_path: path });
  return data.publicUrl;
}

// Fetch the most recent uploaded photo URL for a recipe
export async function fetchPhoto(recipeId) {
  const { data } = await _supa
    .from("photos")
    .select("storage_path")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  const { data: urlData } = _supa.storage.from("recipe-photos").getPublicUrl(data[0].storage_path);
  return urlData.publicUrl;
}

// Delete the most recent photo for a recipe
export async function deletePhoto(recipeId) {
  const { data } = await _supa
    .from("photos")
    .select("id, storage_path")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return;
  await _supa.storage.from("recipe-photos").remove([data[0].storage_path]);
  await _supa.from("photos").delete().eq("id", data[0].id);
}

// Likes: get count and check if this browser already liked
export async function fetchLikes(recipeId) {
  const { count } = await _supa
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("recipe_id", recipeId);
  return count || 0;
}

export async function addLike(recipeId) {
  await _supa.from("likes").insert({ recipe_id: recipeId });
}

// Comments: fetch all for a recipe
export async function fetchComments(recipeId) {
  const { data } = await _supa
    .from("comments")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });
  return data || [];
}

export async function addComment(recipeId, author, body) {
  await _supa.from("comments").insert({ recipe_id: recipeId, author, body });
}
