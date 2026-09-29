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
  const topic = process.env.AI_TECH_TOPIC || 'AI & Technology';
  return `FACT:
${topic} क्या है? आसान भाषा में समझिए: यह technology किस problem को solve करती है, इसके पीछे कौन-सा hardware या software काम करता है और इसका practical इस्तेमाल कहाँ होता है। इस video में हम concept को तीन छोटे visual steps में समझेंगे।
CAPTION:
${topic} को आसान हिंदी में समझिए।
VISUAL:
Photorealistic vertical 9:16 technology explainer about ${topic}. Show a specific real device, machine, chip, software interface or technical environment related to the topic. No generic psychology, no unrelated people, no news footage, no fake logos, no readable fake text, no watermark.`;
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

function makeViralHashtags(topic) {
  const clean = String(topic || '').toLowerCase();
  const tags = ['#AI', '#ArtificialIntelligence', '#Technology', '#Tech', '#FutureTech', '#Innovation', '#TechExplained', '#HindiTech'];
  if (/robot|humanoid|रोबोट/.test(clean)) tags.unshift('#HumanoidRobots', '#Robotics');
  else if (/quantum|क्वांटम/.test(clean)) tags.unshift('#QuantumComputing', '#QuantumTech');
  else if (/chip|semiconductor|processor|gpu|cpu|सेमीकंडक्टर/.test(clean)) tags.unshift('#AIChip', '#Semiconductor');
  else if (/3d|printer|प्रिंट/.test(clean)) tags.unshift('#3DPrinting');
  else if (/car|vehicle|driving|गाड़ी/.test(clean)) tags.unshift('#FutureCars', '#SelfDriving');
  return [...new Set(tags)].slice(0, 12).join(' ');
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
  const topic = process.env.AI_TECH_TOPIC || 'AI & Technology';
  const lower = topic.toLowerCase();
  const isRobot = /robot|humanoid|रोबोट/.test(lower);
  const isChip = /chip|semiconductor|processor|gpu|cpu|सर्किट|सेमीकंडक्टर/.test(lower);
  const isQuantum = /quantum|क्वांटम/.test(lower);

  let scene1, scene2, scene3;
  if (isRobot) {
    scene1 = 'Show the robot itself as the hero: detailed cameras/sensors, articulated joints, motors, hands and actuator hardware. Close-up documentary shot, clearly recognizable humanoid robotics hardware.';
    scene2 = 'Show the robot actively operating: sensors observing an object, onboard computer/perception display, articulated arm or hand moving with visible servo/joint action. Make the physical cause-and-effect obvious.';
    scene3 = 'Show the same type of humanoid robot performing a useful real task in a believable workplace such as a factory, warehouse or service environment. Wider shot, clear task action, not just posing.';
  } else if (isChip) {
    scene1 = 'Show the actual hardware: close macro view of a modern processor/semiconductor package, wafer, circuit traces and a realistic electronics laboratory or fabrication environment.';
    scene2 = 'Show the chip/process working: microscopic circuit activity, signals moving through silicon, fabrication machinery or a realistic engineering test setup. Make the process visually understandable.';
    scene3 = 'Show the technology inside a real product or system such as a computer, AI server, phone, vehicle or industrial machine, with the hardware clearly connected to its practical function.';
  } else if (isQuantum) {
    scene1 = 'Show a real quantum-computing laboratory environment with a cryogenic system, dilution refrigerator hardware, control electronics and scientific instrumentation. Avoid fantasy holograms.';
    scene2 = 'Show the underlying process: quantum-control electronics, cryogenic wiring and a conceptual but physically grounded visualization of qubits being controlled. Keep the hardware central.';
    scene3 = 'Show a believable application environment where quantum computing could be used for optimization, simulation or scientific research, with real computers and laboratory equipment rather than sci-fi imagery.';
  } else {
    scene1 = 'Show the exact physical hardware, machine, device, chip or technical setup that defines the topic. Make the technology itself the hero, with a close establishing shot and visible component detail.';
    scene2 = 'Show the technology actually working or the underlying mechanism. Use visible components interacting, data/control signals, moving parts or a clear technical process. The action must be understandable from the image alone.';
    scene3 = 'Show the same technology solving a real-world problem in a believable environment. Make the practical action obvious and use a different location, camera angle and composition from scenes 1 and 2.';
  }

  const shared = `Create a coherent photorealistic technology documentary about "${topic}". Vertical 9:16 composition. This must be an evergreen AI & Technology explainer, not news footage. Keep the same technology identity across scenes but never repeat the same composition. Use realistic materials, engineering details, natural lighting and believable environments. No generic portraits, no psychology imagery, no phone-scrolling filler, no unrelated people, no fake readable text, no fake logos, no watermark. The topic is: ${topic}. Base visual description: ${baseVisual}`;
  return [
    `${shared} SCENE 1 — HARDWARE/IDENTITY: ${scene1} Camera: slow controlled push-in. Strong detail and clear subject separation.`,
    `${shared} SCENE 2 — HOW IT WORKS: ${scene2} Camera: different angle and closer action framing. Show real physical or technical motion, not a static pose.`,
    `${shared} SCENE 3 — REAL APPLICATION: ${scene3} Camera: wider composition in a different environment. Show cause-and-effect and a visible useful task.`
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

  const subtitleFilter = `subtitles=${srtPath}:original_size=1080x1920:force_style='FontName=Noto Sans Devanagari,FontSize=9,PrimaryColour=&H00FFFFFF,OutlineColour=&HCC000000,Outline=1,Shadow=0,Alignment=2,MarginV=55,WrapStyle=2,BorderStyle=1,Spacing=0'`;
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

  const topic = process.env.AI_TECH_TOPIC || 'AI & Technology';
  const combined = await askGemini(`Create ONE original evergreen AI & Technology explainer for a Hindi Facebook Reel about ONLY this topic: "${topic}".
This is NOT a trending-news video. Do not mention Google Trends, Google News, trending, viral search, breaking news, current events, today's trend, or recent headlines.
Explain a stable technical concept accurately and simply. Use concrete technology details and avoid invented statistics, dates, prices, companies or news claims.
Return exactly three sections:
FACT:
50-70 words in natural spoken Hindi using Devanagari. Start with a strong hook, explain what the technology is and how it works, then give one practical or surprising takeaway. End with a natural question.
CAPTION:
20-35 words in simple Hindi/Hinglish summarizing the same technology. No news framing and no hashtags.
VISUAL:
40-70 words in English describing a photorealistic vertical 9:16 technology scene that directly shows this topic. Mention specific hardware, software, machines, screens or environments relevant to the topic. No generic people, psychology imagery, unrelated cinematic people, news footage, fake text, logos or watermark.`);
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
    caption = `${topic} को आसान हिंदी में समझिए — यह क्या है, कैसे काम करती है और इसका इस्तेमाल कहाँ होता है।`;
  }
  if (!fact || !caption || !visual) throw new Error(`Could not create fact/caption/visual content: ${normalized.slice(0, 1000)}`);

  const scenePrompts = buildScenePrompts(visual);
  const imagePaths = [1, 2, 3].map(i => path.join(outDir, `viral_fact_scene_${i}.png`));
  const motionPaths = [1, 2, 3].map(i => path.join(outDir, `ai_motion_scene_${i}.mp4`));
  const sceneVideoPaths = [1, 2, 3].map(i => `/tmp/viral_scene_${i}_10s.mp4`);
  const audioPath = path.join(outDir, 'hindi_voice.mp3');
  const srtPath = path.join(outDir, 'captions.srt');
  const finalPath = path.join(outDir, 'viral_fact_reel.mp4');

  const hashtags = makeViralHashtags(topic);\n  const socialCaption = `${caption}\\n\\n${hashtags}`;\n  fs.writeFileSync(path.join(outDir, 'caption.txt'), socialCaption, 'utf8');
  fs.writeFileSync(path.join(outDir, 'visual_prompt.txt'), scenePrompts.join('\n\n--- SCENE 2 ---\n\n'), 'utf8');

  console.log('Generating Hindi voice...');
  generateHindiVoice(fact, audioPath);
  const audioDuration = probeDuration(audioPath);
  createSrt(fact, Math.min(audioDuration, TOTAL_VIDEO_DURATION), srtPath);

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
