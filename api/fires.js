// Vercel Serverless Function — proxies NASA FIRMS fire hotspot data
// Uses area/bounding-box endpoint (country endpoint is broken)

const FIRMS_KEY = process.env.FIRMS_MAP_KEY;
// Bounding box: west,south,east,north covering Iran/Iraq/Gulf region
const BBOX = '35,12,65,42';

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const brightIdx = headers.indexOf('bright_ti4');
  const confIdx = headers.indexOf('confidence');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');

  if (latIdx < 0 || lonIdx < 0) return [];

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < headers.length) continue;
    const confidence = (cols[confIdx] || '').trim().toLowerCase();
    if (confidence === 'low') continue;
    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;
    results.push({
      lat,
      lon,
      brightness: parseFloat(cols[brightIdx]) || 0,
      confidence: confidence || 'nominal',
      datetime: `${cols[dateIdx] || ''} ${(cols[timeIdx] || '').padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2')} UTC`,
    });
  }
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/${BBOX}/1`;
    const response = await fetchWithTimeout(url, 12000);
    if (!response.ok) {
      return res.status(502).json({ error: 'FIRMS API error', status: response.status });
    }
    const text = await response.text();
    const fires = parseCsv(text);
    return res.status(200).json(fires);
  } catch (e) {
    return res.status(502).json({ error: 'FIRMS fetch failed' });
  }
}
