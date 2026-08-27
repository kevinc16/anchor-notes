const TOPICS = {
  design: ["design", "interface", "typography", "color", "layout", "brand", "ux", "ui"],
  engineering: ["code", "software", "api", "database", "javascript", "python", "architecture"],
  research: ["study", "research", "evidence", "paper", "analysis", "data", "experiment"],
  product: ["product", "customer", "market", "strategy", "growth", "roadmap", "feature"],
  ideas: ["idea", "inspiration", "creative", "concept", "possibility", "imagine"],
  learning: ["learn", "guide", "tutorial", "explain", "course", "lesson", "how to"]
};

export function organizeLocally(note) {
  const text = `${note.title} ${note.quote} ${note.body}`.toLowerCase();
  const scored = Object.entries(TOPICS)
    .map(([topic, words]) => [topic, words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0)])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);

  const domain = (() => {
    try { return new URL(note.url).hostname.replace(/^www\./, "").split(".")[0]; }
    catch { return "web"; }
  })();
  return [...new Set([...scored, domain])].slice(0, 4);
}

export async function organizeWithAI(note, settings) {
  if (!settings.aiApiKey) throw new Error("Add an API key in Settings first.");
  const response = await fetch(settings.aiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.aiApiKey}`
    },
    body: JSON.stringify({
      model: settings.aiModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only JSON with a tags array containing 2-5 short lowercase topic tags and a summary string under 140 characters." },
        { role: "user", content: JSON.stringify({ title: note.title, url: note.url, quote: note.quote, note: note.body }) }
      ]
    })
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status}).`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
    summary: typeof parsed.summary === "string" ? parsed.summary : ""
  };
}

