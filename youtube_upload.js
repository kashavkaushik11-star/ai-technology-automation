const fs = require('fs');

const VIDEO_PATH = process.env.YOUTUBE_VIDEO_PATH || 'output/viral_fact_reel.mp4';
const CAPTION_PATH = process.env.YOUTUBE_CAPTION_PATH || 'output/caption.txt';
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;
const PRIVACY_STATUS = process.env.YOUTUBE_PRIVACY_STATUS || 'public';

function requireEnv(name, value) {
  if (!value) throw new Error(`Missing ${name} GitHub secret.`);
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok || !data.access_token) {
    console.error(JSON.stringify(data, null, 2));
    throw new Error(`Google OAuth token refresh failed with HTTP ${response.status}.`);
  }
  return data.access_token;
}

function buildMetadata() {
  const caption = fs.existsSync(CAPTION_PATH)
    ? fs.readFileSync(CAPTION_PATH, 'utf8').trim()
    : '';

  const lines = caption.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  let title = lines[0] || 'आज का वायरल ट्रेंड';
  title = title.replace(/^#+\s*/, '').replace(/^Title\s*:\s*/i, '').trim();
  if (title.length > 100) title = title.slice(0, 97) + '...';

  const description = `${caption}\n\n#Shorts #Trending #Hindi #Facts`;

  return {
    snippet: {
      title,
      description,
      categoryId: '25',
      defaultLanguage: 'hi',
      defaultAudioLanguage: 'hi',
    },
    status: {
      privacyStatus: PRIVACY_STATUS,
      selfDeclaredMadeForKids: false,
    },
  };
}

async function main() {
  requireEnv('YOUTUBE_CLIENT_ID', CLIENT_ID);
  requireEnv('YOUTUBE_CLIENT_SECRET', CLIENT_SECRET);
  requireEnv('YOUTUBE_REFRESH_TOKEN', REFRESH_TOKEN);
  if (!fs.existsSync(VIDEO_PATH)) throw new Error(`Video not found: ${VIDEO_PATH}`);

  const accessToken = await getAccessToken();
  const metadata = buildMetadata();
  const stat = fs.statSync(VIDEO_PATH);
  const fileSize = stat.size;

  console.log(`Starting YouTube upload: ${VIDEO_PATH} (${fileSize} bytes), privacy=${PRIVACY_STATUS}`);

  const initResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    }
  );

  const initText = await initResponse.text();
  if (!initResponse.ok) {
    console.error(initText);
    throw new Error(`YouTube resumable upload initialization failed with HTTP ${initResponse.status}.`);
  }

  const uploadUrl = initResponse.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL.');

  const videoBuffer = fs.readFileSync(VIDEO_PATH);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'video/mp4',
      'Content-Length': String(fileSize),
    },
    body: videoBuffer,
  });

  const uploadText = await uploadResponse.text();
  let result;
  try { result = JSON.parse(uploadText); } catch { result = { raw: uploadText }; }

  if (!uploadResponse.ok || !result.id) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error(`YouTube video upload failed with HTTP ${uploadResponse.status}.`);
  }

  console.log(`YouTube upload successful. Video ID: ${result.id}`);
  console.log(`YouTube URL: https://www.youtube.com/watch?v=${result.id}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
