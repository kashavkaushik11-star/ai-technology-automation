const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

const SCENE_DURATION = 10;
const TOTAL_VIDEO_DURATION = 30;

if (!GEMINI_API_KEY || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('Missing required secrets: GEMINI_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID');
}

function localFallback() {
  const facts = [
    {
      fact: 'क्या आपने कभी नोटिस किया है कि कोई नाम या शब्द याद नहीं आता, लेकिन कुछ देर बाद अचानक खुद याद आ जाता है? ऐसा इसलिए हो सकता है क्योंकि दिमाग उस जानकारी को पूरी तरह छोड़ता नहीं है। वह पीछे से उसे खोजता रहता है, और जब सही connection मिल जाता है तो जवाब अचानक सामने आ जाता है। आपके साथ ऐसा कितनी बार होता है?',
      visual: 'A photorealistic cinematic close-up of a thoughtful person sitting quietly at a desk, briefly looking away while trying to remember something, then suddenly showing a subtle moment of realization. Slow gentle camera push-in, warm realistic window light, shallow depth of field, centered subject, natural room environment.'
    },
    {
      fact: 'जब आप किसी कमरे में जाते हैं और अचानक भूल जाते हैं कि वहाँ क्यों आए थे, तो यह सिर्फ लापरवाही नहीं होती। जगह बदलने से आपका दिमाग context भी बदल देता है, जिससे पिछला विचार थोड़ी देर के लिए कम accessible हो सकता है। दरवाज़े से वापस उसी जगह जाने पर बात फिर याद आ जाना इसी तरह के effect से जुड़ा हो सकता है।',
      visual: 'A photorealistic cinematic scene of a person entering a room, stopping with a puzzled expression, then looking back toward the doorway as the memory returns. Subtle handheld camera movement, realistic indoor lighting, shallow depth of field, centered subject, natural home environment.'
    },
    {
      fact: 'कभी आपने देखा है कि किसी को जम्हाई लेते देखकर आपको भी जम्हाई आने लगती है? यह देखकर नकल करने जैसा लग सकता है, लेकिन इसके पीछे कई factors हो सकते हैं। लोगों में एक-दूसरे के व्यवहार और expressions अपने-आप notice और mirror करने की प्रवृत्ति होती है। इसलिए सामने वाले की छोटी-सी action भी आपके behavior को प्रभावित कर सकती है।',
      visual: 'A photorealistic cinematic scene of two people sitting together in a quiet cafe, one person yawning naturally while the other notices and begins to yawn. Gentle camera drift, realistic soft lighting, shallow depth of field, centered subjects, authentic expressions, documentary-film atmosphere.'
    },
    {
      fact: 'जब कोई गाना आपके दिमाग में बार-बार बजता रहता है, तो उसे रोकने की कोशिश कभी-कभी उल्टा उसे और noticeable बना देती है। दिमाग किसी विचार को दबाने की कोशिश करते हुए उसी विचार पर ध्यान बनाए रख सकता है। इसलिए कभी-कभी उस धुन को एक बार पूरा सुन लेना या ध्यान किसी दूसरे काम पर लगाना ज्यादा आसान महसूस होता है।',
      visual: 'A photorealistic cinematic scene of a person working at a desk while a familiar song seems stuck in their mind, then calmly shifting attention to another task. Slow camera push, realistic afternoon light, shallow depth of field, centered subject, subtle expressive behavior.'
    },
    {
      fact: 'जब आप किसी चीज़ को बहुत ध्यान से खोज रहे होते हैं, तो कई बार वही चीज़ सामने होते हुए भी दिखाई नहीं देती। इसका एक कारण attention है: दिमाग हर visual detail को बराबर महत्व नहीं देता। वह आपके लक्ष्य से जुड़ी जानकारी को प्राथमिकता देता है। इसलिए खोजते समय कभी-कभी वस्तु सामने होने के बावजूद आपकी नजर उसे ignore कर देती है।',
      visual: 'A photorealistic cinematic scene of a person searching a cluttered desk for a small object, overlooking it, then suddenly noticing it directly in front of them. Slow camera movement, realistic daylight, shallow depth of field, centered subject and object, natural environment.'
    },
    {
      fact: 'जब आप किसी कहानी को बार-बार सुनाते हैं, तो आपको लग सकता है कि आपकी memory बिल्कुल वैसी ही बनी हुई है। लेकिन यादें recording की तरह fixed नहीं होतीं। उन्हें याद करते समय दिमाग उन्हें दोबारा reconstruct करता है, इसलिए समय के साथ छोटी details बदल सकती हैं। इसी वजह से दो लोग एक ही घटना को थोड़ा अलग तरीके से याद कर सकते हैं।',
      visual: 'A photorealistic cinematic scene of a person telling a familiar story to a friend, pausing thoughtfully as they reconstruct a memory. Slow subtle camera push-in, warm realistic lighting, shallow depth of field, centered faces, intimate documentary-film mood.'
    },
    {
      fact: 'जब आप किसी काम को बीच में छोड़कर दूसरे काम पर चले जाते हैं, तो पहला काम दिमाग में अधूरा बना रह सकता है। यही वजह है कि कभी-कभी कोई अधूरा task अचानक याद आ जाता है, जबकि पूरा किया हुआ काम आसानी से दिमाग से निकल जाता है। हमारा ध्यान सिर्फ finished चीज़ों पर नहीं, बल्कि pending कामों पर भी टिक सकता है।',
      visual: 'A photorealistic cinematic scene of a person leaving an unfinished notebook task on a desk, then suddenly remembering it while doing another activity. Smooth camera transition, realistic evening light, shallow depth of field, centered subject, believable home environment.'
    },
    {
      fact: 'किसी व्यक्ति की पहली छाप बनाते समय हमारा दिमाग बहुत कम जानकारी से भी जल्दी एक overall impression बना लेता है। कपड़े, चेहरे के भाव, बोलने का तरीका और body language जैसी चीज़ें उस impression को प्रभावित कर सकती हैं। लेकिन पहली छाप हमेशा पूरी कहानी नहीं बताती। इसलिए किसी व्यक्ति को समझने के लिए सिर्फ शुरुआती कुछ seconds पर निर्भर करना सही नहीं होता।',
      visual: 'A photorealistic cinematic scene of two strangers meeting for the first time, briefly observing each other before beginning a friendly conversation. Slow natural camera movement, realistic street-side lighting, shallow depth of field, centered subjects, authentic body language and expressions.'
    }
  ];
  const item = facts[Math.floor(Date.now() / 86400000) % facts.length];
  return `FACT:\n${item.fact}\nVISUAL:\n${item.visual}`;
}

async function askGemini(prompt) {
  const models = ['gemini-2.5-flash-lite', 'gemini-3-flash-preview'];
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 450 } })
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')?.trim() || '';
        if (text) return text;
      } else {
        const errorText = await r.text();
        if (![429, 500, 502, 503, 504].includes(r.status)) break;
        let waitMs = Math.min(15000, attempt * 5000);
        const retryMatch = errorText.match(/retryDelay[^\d]*(\d+)s/i);
        if (retryMatch) waitMs = Math.min(15000, Number(retryMatch[1]) * 1000);
        console.log(`Gemini ${model} attempt ${attempt} returned ${r.status}; waiting ${Math.ceil(waitMs / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }
  console.log('Gemini quota unavailable; using local fact/visual fallback so the video pipeline can continue.');
  return localFallback();
}

async function generateImage(prompt, outPath) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt.slice(0, 2000) }) });
  if (!r.ok) throw new Error(`Cloudflare image error ${r.status}: ${await r.text()}`);
  const contentType = r.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await r.json();
    if (data.result?.image) { fs.writeFileSync(outPath, Buffer.from(data.result.image, 'base64')); return; }
    throw new Error(`Cloudflare returned JSON without image: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  fs.writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
}

function pythonVideo(imagePath, prompt, outPath) {
  const py = `
import sys, shutil
from gradio_client import Client, handle_file
image_path, prompt, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
client = Client("zerogpu-aoti/wan2-2-fp8da-aoti-faster")
result = client.predict(handle_file(image_path), prompt[:1200], 4, "", 4.0, 1.0, 1.0, 42, True, api_name="/generate_video")
video_path = result[0] if isinstance(result, (list, tuple)) else result
if isinstance(video_path, dict): video_path = video_path.get("path") or video_path.get("url")
if not video_path: raise RuntimeError(f"ZeroGPU returned no video: {result}")
shutil.copyfile(video_path, out_path)
print(out_path)
`;
  fs.writeFileSync('/tmp/make_video.py', py);
  execFileSync('python', ['/tmp/make_video.py', imagePath, prompt, outPath], { stdio: 'inherit' });
}

function generateHindiVoice(text, outPath) {
  const py = `
import sys, asyncio
import edge_tts
text = sys.argv[1]
out_path = sys.argv[2]
async def main():
    communicate = edge_tts.Communicate(text, "hi-IN-SwaraNeural", rate="-5%", pitch="+0Hz", volume="+0%")
    await communicate.save(out_path)
asyncio.run(main())
`;
  fs.writeFileSync('/tmp/make_tts.py', py);
  execFileSync('python', ['/tmp/make_tts.py', text, outPath], { stdio: 'inherit' });
}

function probeDuration(filePath) {
  const value = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { encoding: 'utf8' }).trim();
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Could not read duration for ${filePath}`);
  return duration;
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}

function wrapCaption(text, maxChars = 30) {
  const words = text.trim().split(/\s+/), lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) { lines.push(line); line = word; } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2).join('\n');
}

function createSrt(text, duration, outPath) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const pieces = (clean.match(/[^.!?]+[.!?]?/g) || [clean]).map(s => s.trim()).filter(Boolean);
  const totalChars = pieces.reduce((sum, s) => sum + Math.max(1, s.length), 0);
  let cursor = 0;
  const blocks = [];
  let index = 0;

  pieces.forEach((piece) => {
    const pieceDuration = duration * (Math.max(1, piece.length) / totalChars);
    const start = cursor;
    const end = cursor + pieceDuration;
    const chars = Array.from(piece);
    const step = pieceDuration / Math.max(1, chars.length);

    for (let i = 1; i <= chars.length; i++) {
      const cueStart = start + (i - 1) * step;
      const cueEnd = i === chars.length ? end : start + i * step;
      const visible = chars.slice(0, i).join('');
      index++;
      blocks.push(`${index}\n${srtTime(cueStart)} --> ${srtTime(cueEnd)}\n${wrapCaption(visible)}\n`);
    }
    cursor = end;
  });

  fs.writeFileSync(outPath, blocks.join('\n'), 'utf8');
}

function runFfmpeg(args) { execFileSync('ffmpeg', ['-y', ...args], { stdio: 'inherit' }); }

function buildScenePrompts(baseVisual) {
  const shared = `Keep the same main subject, wardrobe, location and overall visual identity across all three scenes. ${baseVisual}`;
  return [
    `${shared} Scene 1 of 3: establish the situation and begin the main action. Slow cinematic push-in, natural subtle movement.`,
    `${shared} Scene 2 of 3: continue the same moment from a slightly different camera angle with a clear change in body language or action. Gentle lateral camera drift, visually distinct composition.`,
    `${shared} Scene 3 of 3: show the natural payoff or reaction to the action, using a closer composition and a subtle final camera move. Keep it believable and cinematic.`
  ];
}

function buildTenSecondClip(aiVideoPath, outPath) {
  runFfmpeg([
    '-stream_loop', '-1', '-i', aiVideoPath,
    '-t', String(SCENE_DURATION),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p',
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', outPath
  ]);
}

function concatScenes(scenePaths, outPath) {
  const concatPath = '/tmp/scenes_concat.txt';
  fs.writeFileSync(concatPath, scenePaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n', 'utf8');
  runFfmpeg(['-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', '-movflags', '+faststart', outPath]);
}

function buildReel(scenePaths, audioPath, srtPath, finalPath) {
  const visualVideo = '/tmp/visual_reel_30s.mp4';
  const audioDuration = probeDuration(audioPath);
  console.log(`Voice duration: ${audioDuration.toFixed(2)}s; visual duration: exactly ${TOTAL_VIDEO_DURATION}s.`);
  concatScenes(scenePaths, visualVideo);

  const subtitleFilter = `subtitles=${srtPath}:original_size=1080x1920:force_style='FontName=DejaVu Sans,FontSize=9,PrimaryColour=&H00FFFFFF,OutlineColour=&HCC000000,Outline=1,Shadow=0,Alignment=2,MarginV=55,WrapStyle=2,BorderStyle=1,Spacing=0'`;
  runFfmpeg([
    '-i', visualVideo,
    '-i', audioPath,
    '-filter_complex', `[1:a]apad=pad_dur=${TOTAL_VIDEO_DURATION}[a]`,
    '-vf', subtitleFilter,
    '-map', '0:v:0', '-map', '[a]',
    '-t', String(TOTAL_VIDEO_DURATION),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', finalPath
  ]);
}

(async () => {
  const outDir = path.join(process.cwd(), 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const combined = await askGemini(`Create ONE highly shareable psychology/human-behaviour fact for a Hindi Facebook Reel. It must be surprising but factually responsible. Return exactly three sections using these markers and nothing else:\nFACT:\n50-70 words in natural spoken Hindi using Devanagari script. This is for the voiceover. Start with a strong spoken hook. Do not invent statistics, medical claims or fake research. End with one natural question.\nCAPTION:\n20-35 words in simple Roman-script Hinglish summarizing the same fact. Use easy words, no Devanagari, no emojis, no hashtags, no English-only sentence. Keep it short enough for small bottom captions.\nVISUAL:\n40-70 words in English. Describe one photorealistic cinematic scene that visually represents the fact, one clear action, subtle camera movement, realistic lighting, depth and mood. Keep the main subject centered for vertical 9:16 cropping. No text, letters, numbers, logos or captions in the scene.`);

  const normalized = String(combined || '')
    .replace(/```(?:text|markdown)?/gi, '')
    .replace(/```/g, '')
    .trim();
  let factMatch = normalized.match(/FACT:\s*([\s\S]*?)\s*CAPTION:/i);
  let captionMatch = normalized.match(/CAPTION:\s*([\s\S]*?)\s*VISUAL:/i);
  let visualMatch = normalized.match(/VISUAL:\s*([\s\S]*)$/i);
  let fact = factMatch?.[1]?.trim();
  let caption = captionMatch?.[1]?.trim();
  let visual = visualMatch?.[1]?.trim();
  if (!fact || !caption || !visual) {
    console.log('Gemini returned incomplete FACT/CAPTION/VISUAL format; using local fallback and a safe Hinglish caption.');
    const fallback = localFallback();
    factMatch = fallback.match(/FACT:\s*([\s\S]*?)\s*VISUAL:/i);
    visualMatch = fallback.match(/VISUAL:\s*([\s\S]*)$/i);
    fact = factMatch?.[1]?.trim();
    visual = visualMatch?.[1]?.trim();
    caption = 'Kabhi kabhi dimaag kisi baat ko turant yaad nahi karta, lekin background mein us information ko process karta rehta hai.';
  }
  if (!fact || !caption || !visual) throw new Error(`Could not create fact/caption/visual content: ${normalized.slice(0, 1000)}`);

  const scenePrompts = buildScenePrompts(visual);
  const imagePaths = [1, 2, 3].map(i => path.join(outDir, `viral_fact_scene_${i}.png`));
  const motionPaths = [1, 2, 3].map(i => path.join(outDir, `ai_motion_scene_${i}.mp4`));
  const sceneVideoPaths = [1, 2, 3].map(i => `/tmp/viral_scene_${i}_10s.mp4`);
  const audioPath = path.join(outDir, 'hindi_voice.mp3');
  const srtPath = path.join(outDir, 'captions.srt');
  const finalPath = path.join(outDir, 'viral_fact_reel.mp4');

  fs.writeFileSync(path.join(outDir, 'caption.txt'), fact + '\n\n#AI #ArtificialIntelligence #Technology #TechNews #AITech #FutureTech #AIIndia #Reels', 'utf8');
  fs.writeFileSync(path.join(outDir, 'visual_prompt.txt'), scenePrompts.join('\n\n--- SCENE 2 ---\n\n'), 'utf8');

  console.log('Generating Hindi voice...');
  generateHindiVoice(fact, audioPath);
  const audioDuration = probeDuration(audioPath);
  createSrt(caption, Math.min(audioDuration, TOTAL_VIDEO_DURATION), srtPath);

  for (let i = 0; i < 3; i++) {
    console.log(`Generating image ${i + 1}/3...`);
    const imagePrompt = `Photorealistic cinematic social-media scene designed for a vertical 9:16 crop. Main subject centered and clearly visible. ${scenePrompts[i]} Natural realistic people and environment, believable dramatic lighting, shallow depth of field, premium documentary-film look, strong composition, no text, no letters, no numbers, no logos, no watermark, no captions, no borders, no collage.`;
    await generateImage(imagePrompt, imagePaths[i]);

    console.log(`Generating 4-second motion ${i + 1}/3 with Wan 2.2 Fast ZeroGPU...`);
    pythonVideo(imagePaths[i], scenePrompts[i], motionPaths[i]);

    console.log(`Making scene ${i + 1} exactly ${SCENE_DURATION} seconds...`);
    buildTenSecondClip(motionPaths[i], sceneVideoPaths[i]);
  }

  console.log('Joining 3 x 10-second scenes into exactly 30 seconds...');
  buildReel(sceneVideoPaths, audioPath, srtPath, finalPath);
  console.log('DONE:', finalPath);
})();
