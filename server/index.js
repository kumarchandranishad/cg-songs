// server/index.js
// Node 18 compatible
const express = require('express');
const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const app = express();
app.use(helmet());
app.use(compression());

const limiter = rateLimit({ windowMs: 60 * 1000, max: 80 });
app.use(limiter);

// Cache results (seconds). Adjust TTL as needed.
const cache = new NodeCache({ stdTTL: 60 * 30 }); // 30 minutes cache

const API_KEY = process.env.YT_API_KEY;
if (!API_KEY) {
  console.error('Error: YT_API_KEY not set in env');
  process.exit(1);
}
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));

app.get('/', (req, res) => res.json({ ok: true }));

/**
 * Helper: parse ISO8601 duration (PT#H#M#S) to seconds
 */
function parseDurationToSeconds(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const hours = parseInt(m[1] || 0, 10);
  const mins = parseInt(m[2] || 0, 10);
  const secs = parseInt(m[3] || 0, 10);
  return hours * 3600 + mins * 60 + secs;
}

/**
 * /api/search?q=...&pageToken=...&maxResults=12&channels=comma,separated,ids
 *
 * channels param (optional): comma separated channel IDs to filter by.
 * If not provided, backend can use allowedChannels from config below.
 */
const DEFAULT_MAX = 12;

// Default allowed channels (replace with your channel IDs or pass via query)
const DEFAULT_ALLOWED_CHANNELS = [
  // Example placeholders — replace with real channel IDs like "UCxxxxx..."
  // "UC6wE1QldDPmYWwGyuudy3Tg",
  // "UCxxxxxxxxxxxxxxxxx2"
];

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || 'Chhattisgarhi song').trim();
    const pageToken = req.query.pageToken || '';
    const maxResults = Math.min(parseInt(req.query.maxResults || DEFAULT_MAX, 10), 50);
    // channels override: comma separated list of channelIds from frontend (optional)
    const channelsParam = (req.query.channels || '').trim();
    const allowedChannels = channelsParam
      ? channelsParam.split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_CHANNELS;

    const cacheKey = `search:${q}:${pageToken}:${maxResults}:${allowedChannels.join('|')}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=600');
      return res.json(cached);
    }

    // 1) call search endpoint (returns video IDs & snippets)
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(q)}&regionCode=IN&pageToken=${pageToken}&key=${API_KEY}`;
    const sresp = await fetch(searchUrl);
    const sdata = await sresp.json();
    if (sdata.error) return res.status(500).json(sdata);

    const items = sdata.items || [];
    const videoIds = items.map(it => (it.id && (it.id.videoId || it.id)) ).filter(Boolean);
    if (videoIds.length === 0) {
      cache.set(cacheKey, sdata, 60);
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(sdata);
    }

    // 2) fetch videos details (contentDetails, status, snippet)
    const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics&id=${videoIds.join(',')}&key=${API_KEY}`;
    const vresp = await fetch(vidUrl);
    const vdata = await vresp.json();
    if (vdata.error) return res.status(500).json(vdata);

    // Map by videoId for quick lookup
    const videoById = {};
    (vdata.items || []).forEach(v => {
      videoById[v.id] = v;
    });

    // 3) Filter: allowed channels (if provided) and only long videos (>60s) and embeddable
    const filteredItems = (items || []).map(it => {
      const vid = it.id && (it.id.videoId || it.id);
      const full = videoById[vid];
      // combine snippet from search with contentDetails/status from videos if available
      return { searchItem: it, video: full };
    }).filter(obj => {
      const v = obj.video;
      const s = obj.searchItem;
      if (!v) return false; // safety
      // If allowedChannels list is non-empty, require match
      if (allowedChannels.length > 0) {
        const channelId = v.snippet?.channelId || s.snippet?.channelId;
        if (!allowedChannels.includes(channelId)) return false;
      }
      // embeddable?
      if (v.status && v.status.embeddable === false) return false;
      // duration > 60 seconds?
      const dur = parseDurationToSeconds(v.contentDetails?.duration);
      if (dur <= 60) return false;
      return true;
    }).map(obj => obj.video); // return the video resource objects

    const out = {
      originalSearch: { ...sdata, items }, // keep original items for pagination tokens
      items: filteredItems,
    };

    cache.set(cacheKey, out, 60 * 30); // cache 30min
    res.set('Cache-Control', 'public, max-age=600');
    return res.json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

/**
 * /api/videos?ids=comma,separated
 * Returns full video resources (cached)
 */
app.get('/api/videos', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0,50).join(',');
    if (!ids) return res.status(400).json({ error: 'ids required' });

    const cacheKey = `videos:${ids}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json(cached);
    }

    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status,statistics&id=${ids}&key=${API_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.status(500).json(data);

    // filter by duration > 60 if you want globally here (optional)
    // const items = (data.items || []).filter(v => parseDurationToSeconds(v.contentDetails?.duration) > 60);

    cache.set(cacheKey, data, 60 * 30);
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
