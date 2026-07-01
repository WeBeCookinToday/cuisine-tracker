import { FLAGS } from "../data/flags.js";

export const flagUrl = (code) => FLAGS[code] || "";
export const p2 = (n) => String(n).padStart(2, "0");
export const fd = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; } };

// Equipment/appliance icon lookup — keys used in each recipe's `equipment` array
export const EQUIPMENT_ICONS = {
  pan: { icon: "🍳", label: "Pan" },
  pot: { icon: "🍲", label: "Pot" },
  "dutch-oven": { icon: "🍲", label: "Dutch oven" },
  saucepan: { icon: "🍲", label: "Saucepan" },
  stockpot: { icon: "🍲", label: "Stockpot" },
  "cast-iron-skillet": { icon: "🍳", label: "Cast iron skillet" },
  "stainless-skillet": { icon: "🍳", label: "Stainless steel skillet" },
  "nonstick-skillet": { icon: "🍳", label: "Nonstick skillet" },
  "carbon-steel-skillet": { icon: "🍳", label: "Carbon steel skillet" },
  "12in-skillet": { icon: "🍳", label: "12-in skillet" },
  "10in-skillet": { icon: "🍳", label: "10-in skillet" },
  "8in-skillet": { icon: "🍳", label: "8-in skillet" },
  oven: { icon: "🔥", label: "Oven" },
  grill: { icon: "♨️", label: "Grill" },
  blender: { icon: "🥤", label: "Blender" },
  "immersion-blender": { icon: "🧃", label: "Immersion blender" },
  "food-processor": { icon: "⚙️", label: "Food processor" },
  "citrus-juicer": { icon: "🍋", label: "Citrus juicer" },
  peeler: { icon: "🥔", label: "Peeler" },
  "air-fryer": { icon: "🌀", label: "Air fryer" },
  "stand-mixer": { icon: "🥣", label: "Stand mixer" },
  "slow-cooker": { icon: "⏲️", label: "Slow cooker" },
  wok: { icon: "🥘", label: "Wok" },
  "baking-sheet": { icon: "🍪", label: "Baking sheet" },
  "rice-cooker": { icon: "🍚", label: "Rice cooker" },
  steamer: { icon: "♨️", label: "Steamer" },
  grater: { icon: "🧀", label: "Grater" },
  "knife-board": { icon: "🔪", label: "Knife & board" },
  thermometer: { icon: "🌡️", label: "Thermometer" },
  skewers: { icon: "🍢", label: "Skewers" },
  "mortar-pestle": { icon: "🪨", label: "Mortar & pestle" },
};

// Builds a custom equipment entry on the fly for combos not worth hardcoding,
// e.g. equipmentCustom("🍳", "12-in Cast Iron Skillet") for a size+material the
// table above doesn't have a dedicated key for.
export function equipmentCustom(icon, label) {
  return { icon, label };
}

// Scale the leading quantity in an ingredient string, e.g. "2½ cups rice" * 2 -> "5 cups rice"
export const UNICODE_FRACTIONS = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1/3, "⅔": 2/3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
export const FRACTION_OUT = [[0.125,"⅛"],[0.25,"¼"],[0.333,"⅓"],[0.375,"⅜"],[0.5,"½"],[0.625,"⅝"],[0.667,"⅔"],[0.75,"¾"],[0.875,"⅞"]];
// Parse a duration string like "45 min", "1 hr 30 min", "2 hr" into total minutes
export function parseTimeToMinutes(str) {
  if (!str) return 0;
  let total = 0;
  const hrMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/i);
  const minMatch = str.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (hrMatch) total += parseFloat(hrMatch[1]) * 60;
  if (minMatch) total += parseFloat(minMatch[1]);
  if (!hrMatch && !minMatch) {
    const n = parseFloat(str);
    if (!isNaN(n)) total = n;
  }
  return total;
}
export function minutesToTimeString(mins) {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}

export function numToNiceString(n) {
  if (Number.isInteger(n)) return String(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  for (const [val, sym] of FRACTION_OUT) {
    if (Math.abs(frac - val) < 0.02) return whole > 0 ? `${whole}${sym}` : sym;
  }
  return String(Math.round(n * 100) / 100);
}
export function scaleIngredient(text, multiplier) {
  if (multiplier === 1) return text;
  const fracChars = Object.keys(UNICODE_FRACTIONS);
  const fracClass = fracChars.map(c => `\\u${c.codePointAt(0).toString(16).padStart(4, "0")}`).join("");
  const re = new RegExp(`^(\\d+\\.\\d+|\\d+\\/\\d+|\\d+\\s*[${fracClass}]|[${fracClass}]|\\d+)(\\s*-\\s*(\\d+(?:\\.\\d+)?))?`);
  const m = text.match(re);
  if (!m) return text;
  const head = m[1];
  let n;
  if (fracChars.includes(head)) {
    n = UNICODE_FRACTIONS[head];
  } else if (fracChars.some(c => head.includes(c))) {
    const fracChar = [...head].find(ch => fracChars.includes(ch));
    const wholePart = parseFloat(head.replace(fracChar, "").trim()) || 0;
    n = wholePart + UNICODE_FRACTIONS[fracChar];
  } else if (head.includes("/")) {
    const [a, b] = head.split("/").map(Number);
    n = a / b;
  } else {
    n = parseFloat(head);
  }
  if (isNaN(n)) return text;
  const scaled = n * multiplier;
  const rest = text.slice(m[0].length);
  if (m[3]) {
    const n2 = parseFloat(m[3]) * multiplier;
    return `${numToNiceString(scaled)}-${numToNiceString(n2)}${rest}`;
  }
  return `${numToNiceString(scaled)}${rest}`;
}

// Wraps "tsp"/"teaspoon" and "tbsp"/"tablespoon" (any common written form) in distinct
// colored badges so the two are never confused at a glance. Returns an array of strings
// and React elements suitable for rendering directly inside a <span>.
const TSP_COLOR = "#7C3AED"; // violet — teaspoon
const TBSP_COLOR = "#D97706"; // amber — tablespoon
export function renderIngredientWithUnits(text) {
  const unitRe = /\b(tablespoons?|tbsp\.?|teaspoons?|tsp\.?)\b/gi;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = unitRe.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const word = match[0];
    const isTbsp = /^t(ablespoons?|bsp\.?)/i.test(word);
    parts.push(
      <span key={`unit-${key++}`} style={{
        display: "inline-block",
        fontWeight: 700,
        color: "white",
        background: isTbsp ? TBSP_COLOR : TSP_COLOR,
        borderRadius: 4,
        padding: "1px 6px",
        fontSize: "0.92em",
        margin: "0 1px",
        whiteSpace: "nowrap",
      }}>{word}</span>
    );
    lastIndex = unitRe.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
