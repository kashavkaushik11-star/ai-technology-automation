from pathlib import Path
import re

p = Path('viral_video.js')
s = p.read_text(encoding='utf-8')

new_python_fn = r'''function pythonVideo(imagePath, prompt, outPath) {
  // Wan 2.2 Fast ZeroGPU can occasionally fail or time out. Try it twice,
  // then fall back to a real animated still-image clip.
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
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`Wan 2.2 attempt ${attempt}/2...`);
      execFileSync('python', ['/tmp/make_video.py', imagePath, prompt, outPath], { stdio: 'inherit', timeout: 180000 });
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return;
    } catch (error) {
      console.log(`Wan 2.2 attempt ${attempt} failed; ${attempt === 2 ? 'using fallback motion.' : 'retrying once.'}`);
    }
  }
  console.log('Wan 2.2 unavailable. Creating 4-second animated still fallback.');
  runFfmpeg([
    '-loop', '1', '-i', imagePath,
    '-vf', "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0012,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=120:s=1080x1920:fps=30,format=yuv420p",
    '-t', '4', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath
  ]);
}
'''

new_scene_fn = r'''function buildTenSecondClip(aiVideoPath, outPath) {
  const filter = [
    '[0:v]trim=start=0:end=4,setpts=PTS-STARTPTS,split=3[fwd][revsrc][tail]',
    '[revsrc]reverse[rev]',
    '[tail]trim=start=0:end=2,setpts=PTS-STARTPTS[tail2]',
    '[fwd][rev][tail2]concat=n=3:v=1:a=0,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p[outv]'
  ].join(';');
  runFfmpeg(['-i', aiVideoPath, '-filter_complex', filter, '-map', '[outv]', '-t', String(SCENE_DURATION), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', outPath]);
}
'''

s, n = re.subn(r'function pythonVideo\(imagePath, prompt, outPath\) \{.*?\n\}', new_python_fn.rstrip(), s, count=1, flags=re.S)
if n != 1: raise SystemExit(f'pythonVideo replacement failed: {n}')
s, n = re.subn(r'function buildTenSecondClip\(aiVideoPath, outPath\) \{.*?\n\}', new_scene_fn.rstrip(), s, count=1, flags=re.S)
if n != 1: raise SystemExit(f'buildTenSecondClip replacement failed: {n}')

# Show the actual spoken Hindi in the video, not the short Roman Hinglish post caption.
s, n = re.subn(r'createSrt\(caption, Math\.min\(audioDuration, TOTAL_VIDEO_DURATION\), srtPath\);', 'createSrt(fact, Math.min(audioDuration, TOTAL_VIDEO_DURATION), srtPath);', s, count=1)
if n != 1: raise SystemExit('subtitle source replacement failed')
s, n = re.subn(r'FontName=DejaVu Sans', 'FontName=Noto Sans Devanagari', s, count=1)
if n != 1: raise SystemExit('subtitle font replacement failed')

# Generate three different topic-specific images. The visual identity stays documentary-like,
# but each scene must actually show a different part of the same trending topic.
loop_pattern = r'''  for \(let i = 0; i < 3; i\+\+\) \{[\s\S]*?  \}\n\n  console\.log\('Joining 3 x 10-second scenes into exactly 30 seconds\.\.\.'\);'''
loop_replacement = '''  console.log('Generating 3 topic-specific visual scenes...');
  for (let i = 0; i < 3; i++) {
    const topicScenePrompt = `Photorealistic cinematic documentary/news visual for a vertical 9:16 Hindi trending-topic Reel. This image MUST visually represent the exact subject and action described below. No generic phone-scrolling, no generic psychology, no unrelated stock people, no abstract symbols, no fake readable text, no fake logos, no watermark. Natural realistic lighting, believable environment, editorial photography, strong subject clarity. Scene ${i + 1} of 3: ${scenePrompts[i]}`;
    console.log(`Generating topic-specific image ${i + 1}/3...`);
    await generateImage(topicScenePrompt, imagePaths[i]);
    console.log(`Generating 4-second motion ${i + 1}/3...`);
    pythonVideo(imagePaths[i], scenePrompts[i], motionPaths[i]);
    console.log(`Making scene ${i + 1} exactly ${SCENE_DURATION} seconds...`);
    buildTenSecondClip(motionPaths[i], sceneVideoPaths[i]);
  }

  console.log('Joining 3 x 10-second scenes into exactly 30 seconds...');'''
s, n = re.subn(loop_pattern, loop_replacement, s, count=1)
if n != 1: raise SystemExit(f'topic image loop replacement failed: {n}')

p.write_text(s, encoding='utf-8')
print('Patched: topic-specific scenes, Devanagari subtitles, and non-looping 10s motion.')
