const fs = require('fs');
const path = require('path');
const { getGoogleTrends } = require('./trend_selector');

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function getNewsContext(topic) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=hi&gl=IN&ceid=IN:hi`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'viral-facts-video-automation/1.0' }
    });
    if (!response.ok) throw new Error(`Google News RSS ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      .slice(0, 5)
      .map(match => {
        const block = match[1];
        const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
        const description = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1];
        const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1];
        const source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1];
        return {
          title: decodeXml(title),
          description: decodeXml(description),
          pubDate: decodeXml(pubDate),
          source: decodeXml(source)
        };
      })
      .filter(item => item.title);
    return { url, items };
  } catch (error) {
    console.warn(`Google News context unavailable: ${error.message}`);
    return { url, items: [] };
  }
}

function trendFallback(topic, newsItems) {
  const sourceLine = newsItems.length
    ? ` उपलब्ध समाचारों में इस विषय से जुड़ी हाल की रिपोर्टें सामने आ रही हैं। ${newsItems[0].title}`
    : ` इस विषय पर अभी उपलब्ध जानकारी के आधार पर यह चर्चा में है, लेकिन इसके बारे में अपुष्ट दावे नहीं किए जाएंगे।`;

  return `FACT:\nआज का ट्रेंडिंग टॉपिक है ${topic}। यह विषय इस समय लोगों के बीच चर्चा में है।${sourceLine} इस वीडियो में हम आसान हिंदी में बताएंगे कि यह विषय क्या है, अभी इसकी चर्चा क्यों हो रही है और इससे जुड़ी सबसे महत्वपूर्ण बात क्या है।\nCAPTION:\nआज का ट्रेंडिंग टॉपिक: ${topic}\nयह क्यों चर्चा में है और असल में मामला क्या है? आसान हिंदी में समझिए।\nVISUAL:\nCreate a topic-specific cinematic visual story about ${topic}. Scene 1: visually establish the real-world subject, place, people or event represented by the trend. Scene 2: show the main development or action connected to the topic. Scene 3: show the most important consequence, reaction or context. Photorealistic documentary/news-reel style, vertical 9:16, realistic Indian context when relevant, natural camera movement, believable lighting, no generic psychology imagery, no unrelated people, no readable fake text, no logos, no watermark.`;
}

function makeResponse(text, status = 200) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }]
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

async function main() {
  let trends;
  try {
    trends = await getGoogleTrends();
    fs.mkdirSync(path.join(process.cwd(), 'output'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'output', 'google_trends.json'), JSON.stringify(trends, null, 2), 'utf8');
    console.log(`Google Trends: fetched ${trends.candidates.length} India candidates.`);
  } catch (error) {
    console.warn(`Google Trends unavailable: ${error.message}. Stopping instead of making a generic fact video.`);
    process.exitCode = 1;
    return;
  }

  const selectedTrend = trends.candidates?.[0]?.title?.trim() || '';
  if (!selectedTrend) {
    throw new Error('No Google Trends topic was selected; refusing to generate a generic fact video.');
  }

  fs.writeFileSync(path.join(process.cwd(), 'output', 'selected_trend.txt'), selectedTrend + '\n', 'utf8');
  console.log(`Google Trends selected topic: ${selectedTrend}`);

  const news = await getNewsContext(selectedTrend);
  fs.writeFileSync(path.join(process.cwd(), 'output', 'trend_news.json'), JSON.stringify(news, null, 2), 'utf8');
  console.log(`Google News context: ${news.items.length} recent matching articles.`);

  const newsContext = news.items.length
    ? news.items.map((item, index) => `${index + 1}. ${item.title} | ${item.source || 'Unknown source'} | ${item.pubDate || ''}\n   ${item.description || ''}`).join('\n')
    : 'No matching Google News articles were available. Do not invent current events.';

  const trendContext = `\n\nMANDATORY GOOGLE TRENDS EXPLAINER MODE (INDIA):\nSelected Google Trends topic: "${selectedTrend}"\n\nThis is NOT a generic facts video and NOT a psychology-facts video. The entire Reel must be ABOUT THIS EXACT TRENDING TOPIC. Explain what the topic is, why it is trending now, what is happening, and the most useful context a viewer needs. Use the recent news context below as the factual basis. Do not invent names, numbers, quotes, dates, events or causes that are not supported by the supplied news context. If the sources are insufficient, say so briefly instead of making something up.\n\nRECENT GOOGLE NEWS CONTEXT:\n${newsContext}\n\nLANGUAGE: Voiceover and on-screen subtitles must be natural, simple Hindi in Devanagari. Translate/regroup the trend title into Hindi when needed, but keep the exact original topic available in the explanation.\n\nVISUAL RULE: The visual must directly depict ${selectedTrend}. Do NOT generate generic people looking at phones, psychology scenes, memory scenes, yawning, abstract stock footage, or unrelated cinematic people. Make each of the three scenes visually different but about the same real-world topic: Scene 1 = establish the topic, Scene 2 = show the main development/action, Scene 3 = show reaction/consequence/context. Use realistic documentary/news-style visuals and specific objects, locations, environments and actions associated with the topic. No fake readable text, no fake logos, no watermark.\n\nOUTPUT: Return exactly these sections: FACT, CAPTION, VISUAL. FACT is a 25-35 second Hindi news-style explainer, not a trivia/fact. CAPTION is a short social caption about the trend. VISUAL is a detailed topic-specific three-scene visual direction.`;

  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com') && options.body) {
      let body;
      try {
        body = JSON.parse(options.body);
        const part = body.contents?.[0]?.parts?.[0];
        if (part?.text) {
          part.text += trendContext;
          options.body = JSON.stringify(body);
        }
      } catch (_) {
        return originalFetch(url, options);
      }

      const response = await originalFetch(url, options);
      let raw = '';
      try { raw = await response.text(); } catch (_) {}

      if (!response.ok) {
        console.warn(`Gemini returned ${response.status}; using deterministic trend-explainer fallback.`);
        return makeResponse(trendFallback(selectedTrend, news.items));
      }

      try {
        const data = JSON.parse(raw);
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
        const lower = text.toLowerCase();
        const exactMention = lower.includes(selectedTrend.toLowerCase());
        const hasSections = /FACT:\s*[\s\S]*CAPTION:\s*[\s\S]*VISUAL:/i.test(text);
        const genericFactPattern = /(psychology|human behaviour|memory|yawn|जम्हाई|दिमाग.*ध्यान)/i.test(text) && !exactMention;
        if (!exactMention || !hasSections || genericFactPattern) {
          console.warn('Gemini did not produce a topic-locked explainer; using trend fallback.');
          return makeResponse(trendFallback(selectedTrend, news.items));
        }
        return makeResponse(text);
      } catch (_) {
        console.warn('Gemini response was not usable; using deterministic trend-explainer fallback.');
        return makeResponse(trendFallback(selectedTrend, news.items));
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
