const TOPICS = {
  games: "the games at a kids and family gaming zone (fun, good variety, enjoyed by kids and adults, time flew by). Do NOT name any specific game.",
  place: "the place and service (cleanliness, friendly staff, comfortable atmosphere, value for money).",
  party: "birthday party space and arrangement for kids' birthday parties (good space, nice arrangement, helpful staff)."
};

const LANG_RULES = {
  hn: `Language: HINGLISH. Write in Hindi but using English (Roman) letters, exactly like people type on WhatsApp. Most words must be Hindi words (hai, tha, bahut, maza, achha, ke liye, bachon, jagah, aur, zaroor, dobara...) with only a few common English words (games, staff, party). It must NOT be plain English and must NOT use Devanagari script. Style examples (do not copy them, only match the language style): "Bachon ko yahan bahut maza aaya, saare games ek se badhkar ek hain." / "Jagah saaf hai aur staff ka behavior bhi achha tha." / "Birthday party ke liye achhi jagah hai, hum dobara zaroor aayenge."`,
  hi: `Language: HINDI written in Devanagari script only. Style example (do not copy it): "बच्चों को यहाँ बहुत मज़ा आया, सारे गेम्स एक से बढ़कर एक हैं।"`,
  en: `Language: simple natural ENGLISH only. Do not use any Hindi words.`
};

const HINDI_WORDS = /\b(hai|hain|tha|thi|bahut|bohot|maza|mazedar|achha|achhi|achhe|acha|aur|ke|ki|ka|ko|se|mein|par|nahi|zaroor|bachon|bachche|sabko|dobara|jagah|mujhe|hum|humein|laga|lagi|lage|aaya|aayi|gaye|gaya|raha|rahi|wala|wali|bhi|toh|bilkul|lekin|liye|yahan|saaf|saare)\b/gi;
const DEVANAGARI = /[\u0900-\u097F]/;

// Sahi language ki jaanch
function fitsLang(lang, text) {
  if (lang === "hi") return DEVANAGARI.test(text);
  if (DEVANAGARI.test(text)) return false;
  if (lang === "hn") return (text.match(HINDI_WORDS) || []).length >= 2;
  return true;
}

async function askGemini(model, key, prompt, lang, cats, timeoutMs) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1, responseMimeType: "application/json" }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    }
  );
  const data = await r.json();
  if (!r.ok) {
    throw new Error(`${model} -> ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }

  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  text = text.replace(/```json|```/g, "").trim();
  const obj = JSON.parse(text);

  const out = {};
  for (const c of cats) {
    const arr = Array.isArray(obj[c]) ? obj[c] : [];
    const good = arr
      .filter(s => typeof s === "string" && s.trim() && s.length < 300)
      .filter(s => fitsLang(lang, s))
      .slice(0, 4);
    if (good.length >= 2) out[c] = good;
  }
  if (!Object.keys(out).length) throw new Error(`${model} -> wrong language or empty (${lang})`);
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { cats, lang } = req.body || {};
  const list = (Array.isArray(cats) ? cats : []).filter(c => TOPICS[c]).slice(0, 3);
  if (!list.length || !LANG_RULES[lang]) return res.status(400).json({ error: "bad input" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "no key set" });

  const prompt =
    `Write short Google reviews for a gaming zone called "Anaya GameXzone" in Minal Residency, Bhopal.\n` +
    `For EACH topic below write 4 different reviews.\n` +
    `Topics:\n` + list.map(c => `- ${c}: ${TOPICS[c]}`).join("\n") + `\n` +
    `${LANG_RULES[lang]}\n` +
    `Rules:\n` +
    `- Each review is 1 or 2 short sentences, under 25 words.\n` +
    `- Sound like a real customer: natural, positive but believable, no exaggeration.\n` +
    `- Every review must start differently from the others.\n` +
    `- No emojis, no hashtags.\n` +
    `- Do not mention prices, discounts, offers, or any specific game names.\n` +
    `- Do not claim anything specific that may not be true.\n` +
    `- Do not mention AI.\n` +
    `Variation seed: ${Math.random()}\n` +
    `Return ONLY a JSON object with the keys ${list.map(c => `"${c}"`).join(", ")}, each an array of exactly 4 strings.`;

  // Ek ke baad ek (saath nahi). Dusra model tabhi chalega jab pehla fail ho.
  const attempts = [
    { model: "gemini-flash-lite-latest", ms: 6000 },
    { model: "gemini-3.1-flash-lite", ms: 3500 }
  ];

  for (const a of attempts) {
    try {
      const reviews = await askGemini(a.model, key, prompt, lang, list, a.ms);
      console.log("OK model:", a.model, "lang:", lang, "cats:", list.join(","));
      return res.status(200).json({ reviews });
    } catch (e) {
      console.error("Gemini failed:", e.message);
    }
  }
  return res.status(502).json({ error: "all models failed" });
};