import React from "react";
import { C } from "../lib/theme.js";
import { fetchLikes, addLike, fetchComments, addComment } from "../lib/supabase.js";

export function LikesAndComments({ recipeId }) {
  const [likes, setLikes] = React.useState(0);
  const [liked, setLiked] = React.useState(false);
  const [comments, setComments] = React.useState([]);
  const [author, setAuthor] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);

  React.useEffect(() => {
    fetchLikes(recipeId).then(setLikes);
    fetchComments(recipeId).then(setComments);
    const wasLiked = localStorage.getItem("liked_" + recipeId);
    if (wasLiked) setLiked(true);
  }, [recipeId]);

  const handleLike = async () => {
    if (liked) return;
    await addLike(recipeId);
    setLikes(l => l + 1);
    setLiked(true);
    localStorage.setItem("liked_" + recipeId, "1");
  };

  const handleComment = async () => {
    if (!author.trim() || !body.trim()) return;
    setSubmitting(true);
    await addComment(recipeId, author.trim(), body.trim());
    const updated = await fetchComments(recipeId);
    setComments(updated);
    setBody("");
    setShowForm(false);
    setSubmitting(false);
  };

  const fd2 = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18, marginTop: 18 }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: C.inkMute, marginBottom: 14 }}>Community</div>

      {/* Like button */}
      <button onClick={handleLike} disabled={liked} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", background: liked ? C.accSoft : C.card, border: `0.5px solid ${liked ? C.acc : C.line}`, borderRadius: 20, cursor: liked ? "default" : "pointer", fontSize: 13, fontWeight: 500, color: liked ? C.acc : C.inkMute, fontFamily: "inherit", marginBottom: 20 }}>
        <span style={{ fontSize: 16 }}>♥</span>
        {likes} {likes === 1 ? "like" : "likes"}{liked ? " · You liked this" : ""}
      </button>

      {/* Comments list */}
      {comments.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {comments.map(c => (
            <div key={c.id} style={{ background: C.surface1, border: `0.5px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{c.author}</span>
                <span style={{ fontSize: 11, color: C.inkMute }}>{fd2(c.created_at)}</span>
              </div>
              <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, margin: 0 }}>{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Comment form */}
      {!showForm
        ? <button onClick={() => setShowForm(true)} style={{ fontSize: 13, color: C.acc, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>+ Leave a comment</button>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your name" style={{ padding: "8px 10px", border: `0.5px solid ${C.line}`, borderRadius: 6, fontFamily: "inherit", fontSize: 13, color: C.ink, background: C.card }} />
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Share your thoughts on this dish…" rows={3} style={{ padding: "8px 10px", border: `0.5px solid ${C.line}`, borderRadius: 6, fontFamily: "inherit", fontSize: 13, color: C.ink, background: C.card, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleComment} disabled={submitting || !author.trim() || !body.trim()} style={{ padding: "8px 16px", background: C.acc, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit" }}>
                {submitting ? "Posting…" : "Post comment"}
              </button>
              <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", background: "none", border: `0.5px solid ${C.line}`, borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: C.inkMute }}>Cancel</button>
            </div>
          </div>
        )
      }
    </div>
  );
}
