import { useState } from "react";
import { flagUrl, wikimediaThumb } from "../lib/format.jsx";

// fit="contain" shows the whole photo uncropped, backed by a blurred copy of itself.
// thumbWidth asks Wikimedia for a smaller pre-scaled copy of the stock photo
// (grid tiles); leave it unset for the full-size image (detail view).
export function DishImage({ recipe, photo, style = {}, showLabel = true, fit = "cover", thumbWidth }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  // Prefer the user's own photo of what they actually cooked over the generic stock image
  const stock = thumbWidth && !thumbFailed ? wikimediaThumb(recipe.dishImageUrl, thumbWidth) : recipe.dishImageUrl;
  const imageSrc = photo || stock;
  const showPhoto = !!imageSrc && !errored;
  // A thumb can fail (e.g. the original is narrower than thumbWidth); retry with the original before giving up
  const handleError = () => {
    if (!photo && thumbWidth && !thumbFailed && stock !== recipe.dishImageUrl) setThumbFailed(true);
    else setErrored(true);
  };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", ...style }}>
      {/* Flag always rendered as background layer */}
      <img
        src={flagUrl(recipe.countryCode)}
        alt={recipe.country}
        loading="lazy"
        decoding="async"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: showPhoto && loaded ? 0 : 0.55, filter: "saturate(0.5)", transition: "opacity 0.4s" }}
      />
      {/* Dish photo layered on top — user's own photo if they have one, else the stock image */}
      {showPhoto && fit === "contain" && (
        <img
          src={imageSrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(24px) brightness(0.85)", transform: "scale(1.15)", opacity: loaded ? 1 : 0, transition: "opacity 0.4s" }}
        />
      )}
      {showPhoto && (
        <img
          key={imageSrc}
          src={imageSrc}
          alt={recipe.dish}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, opacity: loaded ? 1 : 0, transition: "opacity 0.4s" }}
        />
      )}
      {/* Dish name overlay when no photo loaded (suppressed when the parent
          supplies its own label overlay, e.g. the grid tiles) */}
      {showLabel && (!showPhoto || !loaded) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", padding: "8px 10px", background: "linear-gradient(to top, rgba(26,22,18,0.45) 0%, transparent 60%)" }}>
          <span style={{ fontFamily: "inherit", fontSize: 11, color: "white", fontWeight: 600, lineHeight: 1.2, textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>{recipe.dish}</span>
        </div>
      )}
    </div>
  );
}
