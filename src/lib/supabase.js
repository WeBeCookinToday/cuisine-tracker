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

// Upload a file to Supabase Storage and return its public URL.
// The URL is persisted on the recipe's cooking_log row (via saveCookingLog),
// which is the single source of truth for "your photo of this dish".
export async function uploadPhoto(recipeId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${recipeId}/${Date.now()}.jpg`;
  // Paths are unique, so no upsert: that way only the bucket's INSERT policy is needed
  const { error } = await _supa.storage.from("recipe-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data } = _supa.storage.from("recipe-photos").getPublicUrl(path);
  return data.publicUrl;
}

// Delete an uploaded photo from Storage, given the public URL stored in
// cooking_log.photo. Data-URL previews (not yet uploaded) have nothing to remove.
export async function deletePhoto(photoUrl) {
  if (!photoUrl || !photoUrl.includes("/recipe-photos/")) return;
  const path = decodeURIComponent(photoUrl.split("/recipe-photos/")[1]);
  await _supa.storage.from("recipe-photos").remove([path]);
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

// Cooking log: fetch all entries as a keyed object
export async function fetchCookingLog() {
  const { data, error } = await _supa.from("cooking_log").select("*");
  if (error) throw error;
  const out = {};
  (data || []).forEach(r => {
    out[r.recipe_id] = {
      cooked: r.cooked,
      cookedDate: r.cooked_date,
      rating: r.rating,
      notes: r.notes,
      photo: r.photo,
    };
  });
  return out;
}

// Log fields that live in the cooking_log table, mapped to their column names.
// Anything else on an entry (checked ingredients, the 2× toggle) is local-only.
export const LOG_COLUMNS = {
  cooked: "cooked",
  cookedDate: "cooked_date",
  rating: "rating",
  notes: "notes",
  photo: "photo",
};

// Save the given fields of one recipe's log entry. Only the columns passed in
// are written — upsert leaves every other column as it is — so a save from one
// device can't overwrite a field another device changed (and a rating tap no
// longer re-sends the photo). Throws on failure; supabase-js reports errors in
// the result instead of throwing, which used to make failed saves silent.
export async function saveCookingLog(recipeId, fields) {
  const row = { recipe_id: recipeId, updated_at: new Date().toISOString() };
  for (const [key, col] of Object.entries(LOG_COLUMNS)) {
    if (key in fields) row[col] = fields[key] ?? null;
  }
  const { error } = await _supa.from("cooking_log").upsert(row);
  if (error) throw error;
}
