const fs = require('fs');

const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
// This secret contains the n8n-bot System User token. A System User token
// can list its assigned Pages through /me/accounts and receive the matching
// Page access token from that response.
const SYSTEM_USER_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const VIDEO_PATH = process.env.FACEBOOK_VIDEO_PATH || 'output/viral_fact_reel.mp4';
const CAPTION_PATH = process.env.FACEBOOK_CAPTION_PATH || 'output/caption.txt';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function getPageAccessToken() {
  const url = new URL(`${GRAPH_BASE}/me/accounts`);
  url.searchParams.set('fields', 'id,name,access_token,tasks');
  url.searchParams.set('access_token', SYSTEM_USER_TOKEN);

  const response = await fetch(url);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok || data.error) {
    console.error('Facebook /me/accounts lookup failed:', JSON.stringify(data, null, 2));
    throw new Error(`Could not list Pages for the System User (HTTP ${response.status}).`);
  }

  const pages = Array.isArray(data.data) ? data.data : [];
  const page = pages.find(item => String(item.id) === String(PAGE_ID));

  if (!page) {
    console.error('Pages visible to this System User:', JSON.stringify(
      pages.map(item => ({ id: item.id, name: item.name, tasks: item.tasks })),
      null,
      2
    ));
    throw new Error(`Page ${PAGE_ID} is not visible to the System User. Check n8n-bot asset assignment and token permissions.`);
  }

  if (!page.access_token) {
    throw new Error(`Facebook returned no Page access token for ${page.name || PAGE_ID}. Check the System User permissions and Page assignment.`);
  }

  console.log(`Resolved Page access token for ${page.name || PAGE_ID}.`);
  return page.access_token;
}

async function main() {
  if (!PAGE_ID || !SYSTEM_USER_TOKEN) {
    throw new Error('Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN GitHub secret.');
  }
  if (!fs.existsSync(VIDEO_PATH)) throw new Error(`Video not found: ${VIDEO_PATH}`);

  const caption = fs.existsSync(CAPTION_PATH)
    ? fs.readFileSync(CAPTION_PATH, 'utf8').trim()
    : '';

  console.log(`Publishing ${VIDEO_PATH} to Facebook Page ${PAGE_ID}...`);

  const pageAccessToken = await getPageAccessToken();

  const form = new FormData();
  form.append('source', new Blob([fs.readFileSync(VIDEO_PATH)], { type: 'video/mp4' }), 'viral_fact_reel.mp4');
  form.append('description', caption);
  form.append('access_token', pageAccessToken);

  const response = await fetch(`${GRAPH_BASE}/${PAGE_ID}/videos`, {
    method: 'POST',
    body: form,
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok || data.error) {
    console.error(JSON.stringify(data, null, 2));
    throw new Error(`Facebook publish failed with HTTP ${response.status}.`);
  }

  console.log(`Facebook publish successful. Video ID: ${data.id || 'unknown'}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});