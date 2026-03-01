// Vercel Serverless Function — fetches Google News RSS server-side
// Returns parsed JSON items, no CORS proxy needed

const FEEDS = [
  'https://news.google.com/rss/search?q=iran+hormuz+oil+strait+middle+east+when:7d&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=oil+price+crude+OPEC+energy+when:3d&hl=en-US&gl=US&ceid=US:en',
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  try {
    const results = await Promise.allSettled(
      FEEDS.map(async (url) => {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!response.ok) return [];
        const xml = await response.text();
        return parseRss(xml);
      })
    );

    const items = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    // Deduplicate by title
    const seen = new Set();
    const deduped = items.filter((item) => {
      const key = item.title.slice(0, 50).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort newest first
    deduped.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    return res.status(200).json({ items: deduped.slice(0, 30) });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch feeds' });
  }
}

function parseRss(xml) {
  const items = [];
  // Simple regex-based RSS parser (no DOMParser on server)
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g);
  if (!itemMatches) return items;

  for (const itemXml of itemMatches) {
    const title = extract(itemXml, 'title');
    const link = extract(itemXml, 'link');
    const pubDate = extract(itemXml, 'pubDate');
    const source = extract(itemXml, 'source') || 'Google News';

    if (title) {
      items.push({
        title: stripHtml(title),
        link: link || '',
        pubDate: pubDate || '',
        source,
      });
    }
  }
  return items;
}

function extract(xml, tag) {
  // Handle both <tag>text</tag> and <tag><![CDATA[text]]></tag>
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)
  );
  return match ? match[1].trim() : null;
}

function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
