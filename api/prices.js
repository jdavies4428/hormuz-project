// Vercel Serverless Function — proxies Yahoo Finance chart API
// No CORS proxy needed: server-side fetch → client gets JSON directly

const SYMBOLS = ['BZ=F', 'CL=F', 'TTF=F'];

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  // Allow only GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  const results = {};

  await Promise.all(
    SYMBOLS.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
        const response = await fetchWithTimeout(url, 8000);

        if (!response.ok) {
          // Try query2 as fallback
          const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
          const response2 = await fetchWithTimeout(url2, 8000);
          if (!response2.ok) {
            results[symbol] = null;
            return;
          }
          const data2 = await response2.json();
          results[symbol] = parseChart(data2);
          return;
        }

        const data = await response.json();
        results[symbol] = parseChart(data);
      } catch (e) {
        results[symbol] = null;
      }
    })
  );

  return res.status(200).json(results);
}

function parseChart(data) {
  if (!data?.chart?.result?.[0]) return null;
  const result = data.chart.result[0];
  const meta = result.meta;
  const closes = result.indicators.quote[0].close.filter(
    (p) => p !== null && p !== undefined
  );
  if (closes.length < 2) return null;

  const price = meta.regularMarketPrice || closes[closes.length - 1];
  const prevClose = meta.chartPreviousClose || closes[closes.length - 2];
  const change = price - prevClose;
  const changePct = (change / prevClose) * 100;

  return {
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    currency: meta.currency || 'USD',
  };
}
