import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100;

type MapSearchResult = {
  name: string;
  lat: number;
  lng: number;
  type: string | null;
  importance: number | null;
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  importance?: number | string;
};

const cache = new Map<string, { expiresAt: number; data: MapSearchResult[] }>();
let lastRequestAt = 0;
let rateLimitQueue = Promise.resolve();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForNominatimSlot() {
  const run = rateLimitQueue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastRequestAt = Date.now();
  });

  rateLimitQueue = run.catch(() => undefined);
  await run;
}

function formatResults(results: NominatimResult[]): MapSearchResult[] {
  return results
    .map(item => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!item.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      const importance = item.importance === undefined ? null : Number(item.importance);
      return {
        name: item.display_name,
        lat,
        lng,
        type: item.type || null,
        importance: Number.isFinite(importance) ? importance : null,
      };
    })
    .filter((item): item is MapSearchResult => item !== null);
}

router.get('/search', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    if (query.length > 200) {
      return res.status(400).json({ error: 'Search query is too long' });
    }

    const requestedLimit = Number(req.query.limit || 5);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(10, requestedLimit)) : 5;
    const cacheKey = `${query.toLowerCase()}|${limit}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    await waitForNominatimSlot();

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: String(limit),
    });

    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'riigait-ims-map-search/1.0',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to search location' });
    }

    const results = formatResults(await response.json() as NominatimResult[]);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: results });

    return res.json(results);
  } catch (error) {
    return    next(error);
  }
});

router.get('/reverse', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Valid lat and lng are required' });
    }

    const cacheKey = `reverse|${lat.toFixed(6)}|${lng.toFixed(6)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data[0] || null);
    }

    await waitForNominatimSlot();

    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'json' });
    const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'riigait-ims-map-search/1.0',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to reverse geocode' });
    }

    const data = await response.json() as NominatimResult;
    const result = formatResults([data]);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });

    return res.json(result[0] || null);
  } catch (error) {
    return    next(error);
  }
});

export default router;
