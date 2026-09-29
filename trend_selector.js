// Strict AI & Technology topic selector.
// Google Trends is only a signal; unrelated India trends are NEVER allowed.
// If Google Trends has no AI/Tech topic, current AI/Tech news is used instead.

const TRENDS_URL = 'https://trends.google.com/trending/rss?geo=IN';

const NEWS_QUERIES = [
  'AI artificial intelligence technology',
  'ChatGPT Gemini OpenAI Anthropic AI',
  'AI agents robotics humanoid robots',
  'semiconductor GPU chip technology',
  'smartphone technology cybersecurity AI'
];

const STRONG_AI = /\b(ai|artificial intelligence|chatgpt|gemini|claude|grok|openai|anthropic|deepmind|copilot|perplexity|mistral|llama|qwen|deepseek|robot|robots|robotics|humanoid|machine learning|computer vision|generative ai|image generator|video generator|voice ai|deepfake|ai agent|ai agents|agentic ai|nvidia|gpu|semiconductor|chip|quantum computing)\b/i;
const TECH_CONTEXT = /\b(technology|tech|software|cybersecurity|smartphone|iphone|android|processor|data centre|data center|cloud computing|wearable|smart glasses|autonomous|drone|satellite|coding|developer|app|device)\b/i;
const HARD_BLOCK = /\b(scorecard|standings|fixture|live score|odds|cricket score|football score|match result|horoscope|astrology|lottery|celebrity wedding)\b/i;

const FALLBACK_TOPICS = [
  'AI agents that can complete tasks on your behalf',
  'How multimodal AI understands images, audio and video',
  'AI-powered smartphones and on-device intelligence',
  'Humanoid robots and what they can actually do today',
  'AI coding assistants and the future of software development',
  'Small AI models running directly on phones and laptops',
  'AI voice cloning and how voice authentication is changing',
  'AI image generators and the new era of synthetic media',
  'AI video generation and realistic text-to-video systems',
  'AI cybersecurity tools that detect threats automatically',
  'The race for faster AI chips and GPUs',
  'Why AI data centres need so much electricity',
  'AI search engines and how web search is changing',
  'AI assistants that can use apps and websites for users',
  'Robots learning tasks through vision and language models',
  'AI in healthcare: faster scans and clinical decision support',
  'AI translation for Indian languages',
  'AI-powered smart glasses and wearable computers',
  'Autonomous cars and the role of computer vision',
  'AI fraud detection in digital payments',
  'AI-powered education and personalized learning',
  'Semiconductor manufacturing and India’s technology push',
  'AI cloud computing and why compute matters',
  'Open-source AI models versus closed AI models',
  'AI memory, reasoning and why newer models use more compute',
  'AI-powered search inside smartphones',
  'Robotic factories and AI-controlled manufacturing',
  'AI assistants for small businesses',
  'AI-generated music and synthetic voices',
  'How AI agents could change everyday apps',
  'AI safety systems designed to control autonomous agents',
  'AI-powered cameras and computer vision',
  'Next-generation smartphone processors built for AI',
  'AI in agriculture: crop monitoring and smart farming',
  'AI in banking: fraud detection and customer service',
  'AI in transport: route prediction and autonomous systems',
  'AI in space technology and satellite data analysis',
  'Quantum computing and its connection with AI',
  'AI-powered search, shopping and recommendations',
  'The future of personal AI assistants'
];

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function isAiTech(title) {
  if (!title || HARD_BLOCK.test(title)) return false;
  return STRONG_AI.test(title) || (
    TECH_CONTEXT.test(title) &&
    /\b(launch|launched|new|update|unveils|unveiled|released|release|platform|model|device|chip|processor|software)\b/i.test(title)
  );
}

function relevance(title) {
  let score = 0;
  if (STRONG_AI.test(title)) score += 40;
  if (TECH_CONTEXT.test(title)) score += 15;
  if (/\b(breaking|launch|launched|new|update|unveils|unveiled|released|release|first|record|announces|announced)\b/i.test(title)) score += 15;
  return score;
}

async function fetchXml(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ai-tech-video-automation/2.0' } });
  if (!response.ok) throw new Error(`RSS ${response.status}`);
  return response.text();
}

function parseItems(xml, source) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const block = match[1];
    return {
      title: decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]),
      traffic: decodeXml(block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i)?.[1]),
      pubDate: decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]),
      source,
    };
  }).filter(x => x.title && isAiTech(x.title));
}

async function getAiNewsCandidates() {
  const all = [];
  for (const q of NEWS_QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=hi&gl=IN&ceid=IN:hi`;
      const xml = await fetchXml(url);
      all.push(...parseItems(xml, 'Google News AI/Tech'));
    } catch (error) {
      console.warn(`AI/Tech News query failed: ${q} - ${error.message}`);
    }
  }

  const seen = new Set();
  return all
    .filter(item => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(item => ({ ...item, aiTechScore: relevance(item.title) }))
    .sort((a, b) => b.aiTechScore - a.aiTechScore);
}

function selectRotating(candidates) {
  const now = new Date();
  const dayNumber = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  const slot = Math.floor(now.getUTCHours() / 8) % 3;
  const index = (dayNumber * 3 + slot) % candidates.length;
  return candidates[index];
}

async function getGoogleTrends() {
  let trendItems = [];
  try {
    const xml = await fetchXml(TRENDS_URL);
    trendItems = parseItems(xml, 'Google Trends AI/Tech');
  } catch (error) {
    console.warn(`Google Trends unavailable: ${error.message}`);
  }

  const newsItems = await getAiNewsCandidates();

  const pool = [...trendItems, ...newsItems];
  const seen = new Set();
  const candidates = pool.filter(item => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.aiTechScore || 0) - (a.aiTechScore || 0));

  if (!candidates.length) {
    const fallback = FALLBACK_TOPICS.map(title => ({
      title,
      source: 'AI/Tech evergreen rotation',
      pubDate: new Date().toISOString(),
      aiTechScore: 50
    }));
    return {
      source: 'AI/Tech rotation fallback',
      niche: 'AI & Technology',
      fetchedAt: new Date().toISOString(),
      candidates: fallback,
      fallback: true
    };
  }

  return {
    source: 'Google Trends + Google News AI/Tech',
    niche: 'AI & Technology',
    fetchedAt: new Date().toISOString(),
    candidates: candidates.slice(0, 40),
    fallback: false
  };
}

module.exports = { getGoogleTrends, selectRotating };
