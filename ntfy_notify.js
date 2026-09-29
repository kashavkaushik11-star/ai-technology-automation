const fs = require('fs');

const TOPIC = process.env.NTFY_TOPIC;
const TREND_PATH = process.env.TREND_PATH || 'output/selected_trend.txt';

async function main() {
  if (!TOPIC) {
    throw new Error('Missing NTFY_TOPIC GitHub secret.');
  }

  const trend = fs.existsSync(TREND_PATH)
    ? fs.readFileSync(TREND_PATH, 'utf8').trim()
    : 'Google Trend explainer';

  const message = [
    '✅ Video Posted Successfully',
    '',
    `🔥 Trend: ${trend}`,
    '📘 Page: Bhakti Palm Art',
    '🤖 Google Trends Explainer Automation'
  ].join('\n');

  const response = await fetch(`https://ntfy.sh/${encodeURIComponent(TOPIC)}`, {
    method: 'POST',
    headers: {
      'Title': 'Facebook Reel Posted',
      'Priority': 'high',
      'Tags': 'white_check_mark,fire'
    },
    body: message
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('ntfy notification failed:', text);
    throw new Error(`ntfy notification failed with HTTP ${response.status}.`);
  }

  console.log('ntfy notification sent successfully.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
