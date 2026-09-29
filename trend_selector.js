// AI & Technology viral-topic selector for India.
const TRENDS_URL = 'https://trends.google.com/trending/rss?geo=IN';

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

const AI_TERMS = [
  'ai','artificial intelligence','chatgpt','gemini','claude','grok','openai','anthropic',
  'deepmind','copilot','perplexity','meta ai','mistral','llama','qwen','deepseek','agent',
  'robot','humanoid','robotics','machine learning','computer vision','generative ai',
  'image generator','video generator','voice ai','deepfake','chip','semiconductor','nvidia',
  'gpu','processor','smartphone','iphone','android','google','microsoft','apple','meta',
  'tesla','space','quantum','technology','tech','app','software','cyber','internet'
];
const HARD_BLOCK = /\b(scorecard|standings|fixture|live score|odds|cricket score|football score)\b/i;
const EXCLUDE = /\b(celebrity wedding|astrology|horoscope|lottery|match result|scorecard)\b/i;

function relevance(title) {
  const t = title.toLowerCase();
  let score = 0;
  for (const term of AI_TERMS) if (t.includes(term)) score += term.length >= 8 ? 8 : 5;
  if (/\b(ai|tech|technology|robot|chatgpt|gemini|iphone|android|nvidia|google|apple|microsoft)\b/i.test(title)) score += 15;
  if (/\b(breaking|launch|launched|new|update|unveils|unveiled|released|release|viral|shocking|first|record)\b/i.test(title)) score += 8;
  if (EXCLUDE.test(title)) score -= 30;
  return score;
}

async function getGoogleTrends() {
  const response = await fetch(TRENDS_URL, { headers: { 'User-Agent': 'ai-tech-video-automation/1.0' } });
  if (!response.ok) throw new Error(`Google Trends RSS ${response.status}`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(match => {
      const block = match[1];
      const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
      const traffic = block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i)?.[1];
      const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1];
      return { title: decodeXml(title), traffic: decodeXml(traffic), pubDate: decodeXml(pubDate) };
    })
    .filter(item => item.title && !HARD_BLOCK.test(item.title));
  if (!items.length) throw new Error('Google Trends RSS returned no usable trends');

  const ranked = items.map(item => ({ ...item, aiTechScore: relevance(item.title) }))
    .filter(item => item.aiTechScore > 0)
    .sort((a, b) => b.aiTechScore - a.aiTechScore);

  const candidates = (ranked.length ? ranked : items.slice(0, 20)).slice(0, 20);
  return { source: TRENDS_URL, niche: 'AI & Technology', fetchedAt: new Date().toISOString(), candidates };
}

module.exports = { getGoogleTrends };
