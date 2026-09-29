from pathlib import Path
import re

p = Path('viral_video.js')
s = p.read_text(encoding='utf-8')

new_voice = r'''function generateHindiVoice(text, outPath) {
  const py = `
import sys, asyncio, json
import edge_tts
text = sys.argv[1]
out_path = sys.argv[2]
timing_path = out_path + ".words.json"

async def main():
    # Explicitly request WordBoundary metadata. Without this, edge-tts
    # defaults to sentence boundaries and no word timings are returned.
    communicate = edge_tts.Communicate(text, "hi-IN-SwaraNeural", rate="-5%", pitch="+0Hz", volume="+0%", boundary="WordBoundary")
    audio = bytearray()
    words = []
    async for item in communicate.stream():
        if item["type"] == "audio":
            audio.extend(item["data"])
        elif item["type"] == "WordBoundary":
            words.append({
                "offset": item["offset"] / 10000000.0,
                "duration": item["duration"] / 10000000.0,
                "text": item.get("text", "")
            })
    with open(out_path, "wb") as f:
        f.write(audio)
    with open(timing_path, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)

asyncio.run(main())
`;
  fs.writeFileSync('/tmp/make_tts.py', py);
  execFileSync('python', ['/tmp/make_tts.py', text, outPath], { stdio: 'inherit' });
}

'''

new_srt = r'''function createSrt(text, duration, outPath, timingPath) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const captionWords = clean ? clean.split(/\s+/) : [];
  let timings = [];
  if (timingPath && fs.existsSync(timingPath)) {
    try { timings = JSON.parse(fs.readFileSync(timingPath, 'utf8')); } catch (_) { timings = []; }
  }

  const blocks = [];
  let index = 0;

  // Use real TTS word boundaries whenever available. If token counts differ,
  // map caption words across the available spoken-word timings instead of
  // abandoning timing altogether.
  if (timings.length && captionWords.length) {
    const timingCount = timings.length;
    const wordCount = captionWords.length;
    let visibleWords = [];

    captionWords.forEach((word, i) => {
      const mapped = Math.min(timingCount - 1, Math.floor(i * timingCount / wordCount));
      const nextMapped = Math.min(timingCount - 1, Math.floor((i + 1) * timingCount / wordCount));
      const first = timings[mapped] || {};
      const last = timings[nextMapped] || first;
      const start = Math.max(0, Number(first.offset) || 0);
      let end = Number(last.offset) || start;
      if (nextMapped === mapped) end += Math.max(0.08, Number(first.duration) || 0.08);
      else end += Math.max(0.04, Number(last.duration) || 0.04);
      end = Math.min(duration, Math.max(start + 0.04, end));

      const chars = Array.from(word);
      const previous = visibleWords.join(' ');
      visibleWords.push(word);
      const step = Math.max(0.018, (end - start) / Math.max(1, chars.length));

      for (let c = 1; c <= chars.length; c++) {
        const cueStart = start + (c - 1) * step;
        const cueEnd = c === chars.length ? end : start + c * step;
        const visible = previous ? `${previous} ${chars.slice(0, c).join('')}` : chars.slice(0, c).join('');
        index++;
        blocks.push(`${index}\n${srtTime(cueStart)} --> ${srtTime(cueEnd)}\n${wrapCaption(visible)}\n`);
      }
    });
  } else {
    // Last-resort fallback when TTS timing data is unavailable.
    const chars = Array.from(clean);
    const step = duration / Math.max(1, chars.length);
    for (let i = 1; i <= chars.length; i++) {
      const start = (i - 1) * step;
      const end = i === chars.length ? duration : i * step;
      index++;
      blocks.push(`${index}\n${srtTime(start)} --> ${srtTime(end)}\n${wrapCaption(chars.slice(0, i).join(''))}\n`);
    }
  }

  fs.writeFileSync(outPath, blocks.join('\n'), 'utf8');
}

'''

s2, n1 = re.subn(r'function generateHindiVoice\(text, outPath\) \{.*?\n\}\n\nfunction probeDuration', lambda m: new_voice + 'function probeDuration', s, flags=re.S)
if n1 != 1:
    raise SystemExit(f'generateHindiVoice replacement failed: {n1}')

s3, n2 = re.subn(r'function createSrt\(text, duration, outPath\) \{.*?\n\}\n\nfunction runFfmpeg', lambda m: new_srt + 'function runFfmpeg', s2, flags=re.S)
if n2 != 1:
    raise SystemExit(f'createSrt replacement failed: {n2}')

s4, n3 = re.subn(r'createSrt\(caption, audioDuration, srtPath\);', lambda m: 'createSrt(caption, audioDuration, srtPath, `${audioPath}.words.json`);', s3)
if n3 != 1:
    raise SystemExit(f'createSrt call replacement failed: {n3}')

caption_pattern = r'CAPTION:\\n.*?\\nVISUAL:'
new_prompt = '''CAPTION:\\nWrite a Roman-script Hinglish transcription of the FACT for on-screen captions. Preserve the EXACT same spoken word order and the SAME number of words as FACT (one Roman-Hinglish word for each spoken Hindi word), with the same meaning and punctuation. Do NOT summarize, shorten, expand, or reorder anything. Use only simple Roman letters and spaces, no Devanagari, no emojis, no hashtags. Keep the wording natural to spoken Hindi.\\nVISUAL:'''
s5, n4 = re.subn(caption_pattern, lambda m: new_prompt, s4, count=1, flags=re.S)
if n4 != 1:
    raise SystemExit('CAPTION prompt replacement failed')

p.write_text(s5, encoding='utf-8')
print('Applied explicit WordBoundary TTS sync + 9px typewriter captions.')
