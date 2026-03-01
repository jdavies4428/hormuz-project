// Vercel Serverless Function — detects current YouTube live video ID
// Scrapes channel /live page for video ID + isLiveContent flag

const CHANNELS = {
  '@AlJazeeraEnglish': { fallback: 'gCNeDWCI0vo', name: 'Al Jazeera' },
  '@Bloomberg':        { fallback: 'iEpJwprxDdk', name: 'Bloomberg' },
  '@SkyNews':          { fallback: 'YDvsBbKfLPA', name: 'Sky News' },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=240, stale-while-revalidate=60');

  const handle = req.query.channel;

  // If no channel specified, return all channels
  if (!handle) {
    const results = {};
    await Promise.all(
      Object.entries(CHANNELS).map(async ([ch, info]) => {
        results[ch] = await detectLive(ch, info);
      })
    );
    return res.status(200).json(results);
  }

  const info = CHANNELS[handle];
  if (!info) {
    return res.status(400).json({ error: 'Unknown channel', channels: Object.keys(CHANNELS) });
  }

  const result = await detectLive(handle, info);
  return res.status(200).json(result);
}

async function detectLive(handle, info) {
  try {
    const url = `https://www.youtube.com/${handle}/live`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HormuzDashboard/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      return { videoId: info.fallback, name: info.name, live: false, source: 'fallback' };
    }

    const html = await response.text();

    // Extract video ID from canonical URL or og:url
    const canonicalMatch = html.match(
      /"canonicalBaseUrl":"\/watch\?v=([a-zA-Z0-9_-]{11})"/
    );
    const ogMatch = html.match(
      /meta property="og:url" content="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/
    );
    const videoId = canonicalMatch?.[1] ?? ogMatch?.[1];

    // Check if actually live
    const isLive = html.includes('"isLiveContent":true');

    if (videoId && isLive) {
      return { videoId, name: info.name, live: true, source: 'scraped' };
    }

    return { videoId: info.fallback, name: info.name, live: false, source: 'fallback' };
  } catch (e) {
    return { videoId: info.fallback, name: info.name, live: false, source: 'fallback' };
  }
}
