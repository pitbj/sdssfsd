const QUERIES = ['TON meme', 'TON', 'NOT TON', 'REDO TON', 'FISH TON', 'DUREV TON', 'CAT TON', 'DOG TON'];

export async function onRequestGet({ env }) {
  const cache = caches.default;
  const cacheKey = new Request('https://memeway.internal/api/tokens');
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const results = await Promise.allSettled(
    QUERIES.map(query =>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, {
        headers: { accept: 'application/json' }
      }).then(res => res.json())
    )
  );

  const pairs = results.flatMap(result => result.status === 'fulfilled' ? (result.value.pairs || []) : []);
  const body = JSON.stringify({ at: Date.now(), pairs });
  const response = new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=30, s-maxage=30',
      'access-control-allow-origin': '*'
    }
  });

  await cache.put(cacheKey, response.clone());
  return response;
}
