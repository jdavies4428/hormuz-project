// Vercel Serverless Function — proxies NASA FIRMS fire hotspot data

const FIRMS_KEY = process.env.FIRMS_MAP_KEY;
const COUNTRIES = ['IRN', 'IRQ', 'SAU', 'ARE', 'QAT', 'OMN', 'KWT', 'BHR'];

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
    // Skip low confidence detections
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

  const allFires = [];

  await Promise.all(
    COUNTRIES.map(async (country) => {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${FIRMS_KEY}/VIIRS_SNPP_NRT/${country}/1`;
        const response = await fetchWithTimeout(url, 10000);
        if (!response.ok) return;
        const text = await response.text();
        const fires = parseCsv(text);
        allFires.push(...fires);
      } catch (e) {
        // Skip failed country
      }
    })
  );

  return res.status(200).json(allFires);
}
