// server/index.js
const express = require('express');
const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
app.use(helmet());

const limiter = rateLimit({ windowMs: 60*1000, max: 60 });
app.use(limiter);

const cache = new NodeCache({ stdTTL: 3600 });
const API_KEY = process.env.YT_API_KEY;
if (!API_KEY) {
  console.error('Error: YT_API_KEY not set in env');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));

app.get('/', (req, res) => res.json({ ok: true }));

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || 'Chhattisgarhi song').trim();
    const pageToken = req.query.pageToken || '';
    const maxResults = Math.min(parseInt(req.query.maxResults) || 12, 50);
    const cacheKey = `search:${q}:${pageToken}:${maxResults}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(q)}&regionCode=IN&pageToken=${pageToken}&key=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.status(500).json(data);

    cache.set(cacheKey, data, 60*60);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0,50).join(',');
    if (!ids) return res.status(400).json({ error: 'ids required' });

    const cacheKey = `videos:${ids}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,statistics&id=${ids}&key=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.status(500).json(data);

    cache.set(cacheKey, data, 60*60);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
