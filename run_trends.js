const fs = require('fs');
const path = require('path');
const { getTopics, selectTopic } = require('./trend_selector');

function makeResponse(text, status = 200) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }]
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

function topicFallback(topic) {
  return `FACT:
यह AI और Technology का topic है: ${topic}। आसान भाषा में समझिए कि यह technology क्या है, कैसे काम करती है और इसका practical इस्तेमाल कहाँ होता है। इस short video में हम इसके सबसे जरूरी हिस्से को समझेंगे।
CAPTION:
${topic}
AI और Technology को आसान हिंदी में समझिए।
VISUAL:
Create a photorealistic documentary-style three-scene visual story specifically about ${topic}. Scene 1: show the correct technology, hardware, software interface or real-world environment. Scene 2: show the technology working or the underlying process. Scene 3: show a realistic practical application. Vertical 9:16, realistic cinematic lighting, specific technology-related objects, no generic psychology imagery, no unrelated people, no fake readable text, no fake logos, no watermark.`;
}

async function main() {
  const topics = getTopics();
  fs.mkdirSync(path.join(process.cwd(), 'output'), { recursive: true });

  const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 1);
  const selectedTopic = selectTopic(runNumber);

  fs.writeFileSync(path.join(process.cwd(), 'output', 'google_trends.json'), JSON.stringify({
    source: 'NOT USED - AI/Tech rotation only',
    runNumber,
    selectedTopic,
    totalTopics: topics.candidates.length
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(process.cwd(), 'output', 'selected_trend.txt'), selectedTopic + '\n', 'utf8');
  console.log(`AI/Tech topic: ${selectedTopic}`);
  console.log(`Topic source: ${topics.source}`);
  console.log(`GitHub workflow run number: ${runNumber}`);

  const topicContext = `

MANDATORY AI & TECHNOLOGY EXPLAINER MODE:
Selected AI/Tech topic: "${selectedTopic}"

THIS IS NOT A TRENDING-NEWS VIDEO.
Do NOT mention Google Trends, trending, viral search, breaking news, current trend, or "आज ट्रेंड कर रहा है".
The Reel must be an evergreen AI/Technology explainer about ONLY this selected topic.

Create a useful 25-35 second Hindi explainer:
1. What is this technology?
2. How does it work in simple terms?
3. Where is it used or likely to be used?
4. End with one useful/surprising takeaway.

Do not invent current events, companies, prices, dates or statistics. Prefer stable technical facts.

LANGUAGE: Natural simple Hindi in Devanagari. Keep necessary technical terms in English.

VISUAL RULE:
All three scenes must directly depict the selected AI/Tech topic.
Scene 1 = technology/hardware/software.
Scene 2 = how it works/process.
Scene 3 = real-world application.
No generic people looking at phones, psychology scenes, memory scenes, yawning, abstract stock footage, or unrelated cinematic people.
Photorealistic technology/documentary style, vertical 9:16, realistic lighting, specific objects and environments, no fake readable text, no fake logos, no watermark.

OUTPUT exactly:
FACT
CAPTION
VISUAL
`;

  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com') && options.body) {
      let body;
      try {
        body = JSON.parse(options.body);
        const part = body.contents?.[0]?.parts?.[0];
        if (part?.text) {
          part.text += topicContext;
          options.body = JSON.stringify(body);
        }
      } catch (_) {
        return originalFetch(url, options);
      }

      const response = await originalFetch(url, options);
      let raw = '';
      try { raw = await response.text(); } catch (_) {}

      if (!response.ok) {
        console.warn(`Gemini returned ${response.status}; using deterministic AI/Tech fallback.`);
        return makeResponse(topicFallback(selectedTopic));
      }

      try {
        const data = JSON.parse(raw);
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
        const lower = text.toLowerCase();
        const exactMention = lower.includes(selectedTopic.toLowerCase());
        const hasSections = /FACT:\s*[\s\S]*CAPTION:\s*[\s\S]*VISUAL:/i.test(text);
        const trendWords = /(google trends|trending|viral search|breaking news|आज.*ट्रेंड|ट्रेंडिंग)/i.test(text);
        if (!exactMention || !hasSections || trendWords) {
          console.warn('Gemini response was not a clean AI/Tech explainer; using deterministic fallback.');
          return makeResponse(topicFallback(selectedTopic));
        }
        return makeResponse(text);
      } catch (_) {
        console.warn('Gemini response was not usable; using deterministic AI/Tech fallback.');
        return makeResponse(topicFallback(selectedTopic));
      }
    }
    return originalFetch(url, options);
  };

  require('./viral_video.js');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
