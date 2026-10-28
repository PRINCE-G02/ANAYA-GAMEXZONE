const CATS = {
  games: "the games at a kids and family gaming zone (fun, good variety, enjoyed by kids and adults, time flew by). Do NOT name any specific game.",
  place: "the place and service (cleanliness, friendly staff, comfortable atmosphere, value for money).",
  party: "birthday party space and arrangement for kids' birthday parties (good space, nice arrangement, helpful staff)."
};

const LANGS = {
  hn: "Hinglish (Hindi written in Roman/English letters, casual, like a normal WhatsApp message)",
  hi: "Hindi in Devanagari script",
  en: "simple natural English"
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { category, lang } = req.body || {};
  if (!CATS[category] || !LANGS[lang]) return res.status(400).json({ error: "bad input" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "no key set" });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const prompt =
    `Write 4 different short Google reviews for a gaming zone called "Anaya GameXZone" in Minal Residency, Bhopal.\n` +
    `Topic: ${CATS[category]}\n` +
    `Language: ${LANGS[lang]}\n` +
    `Rules:\n` +
    `- Each review is 1 or 2 short sentences, under 25 words.\n` +
    `- Sound like a real customer: natural, positive but believable, no exaggeration.\n` +
    `- Every review must start differently from the others.\n` +
    `- No emojis, no hashtags.\n` +
    `- Do not mention prices, discounts, offers, or any specific game names.\n` +
    `- Do not claim anything specific that may not be true.\n` +
    `- Do not mention AI.\n` +
    `Variation seed: ${Math.random()}\n` +
    `Return ONLY a JSON array of exactly 4 strings.`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1, responseMimeType: "application/json" }
        })
      }
    );
    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini error:", JSON.stringify(data));
      return res.status(502).json({ error: "ai failed" });
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    text = text.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(text);
    const reviews = (Array.isArray(arr) ? arr : [])
      .filter(s => typeof s === "string" && s.trim() && s.length < 300)
      .slice(0, 4);

    if (reviews.length < 2) return res.status(502).json({ error: "empty" });
    return res.status(200).json({ reviews });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server error" });
  }
};