import './styles.css';

const CACHE_KEY = 'ton-meme-map.tokens.v2';
const REFRESH_MS = 60_000;

const FALLBACK_TOKENS = [
  ['Resistance Dog', 'REDO', 12.8, 42.1, 18.4, 76.6, 29800000, 1100000, 0.782, 'EQD-redo-ton-fallback', 'https://dd.dexscreener.com/ds-data/tokens/ton/EQAQXlWJvGbbFfE8F3oS8s87lIgdovS455IsWFaRdmJetTon.png?size=lg'],
  ['Ton Inu', 'TINU', -3.2, 8.7, 15.5, 61.4, 7400000, 520000, 0.00091, 'EQD-tinu-ton-fallback', ''],
  ['Notcoin', 'NOT', 0.7, 2.9, -5.1, 9.2, 1710000000, 58000000, 0.0167, 'EQD-not-ton-fallback', ''],
  ['Povel Durev', 'DUREV', 4.8, 19.3, 38.7, 91.3, 12500000, 880000, 0.041, 'EQD-durev-ton-fallback', ''],
  ['Fish TON', 'FISH', -8.5, -12.9, 4.4, 33.1, 9200000, 760000, 0.000000043, 'EQD-fish-ton-fallback', ''],
  ['TON Cat', 'TCAT', 15.3, 31.8, 49.2, 122.6, 4800000, 350000, 0.006, 'EQD-tcat-ton-fallback', '']
].map(([name, symbol, m5, h1, h6, h24, marketCap, liquidity, price, address, imageUrl], i) => ({
  id: address, pairAddress: address, name, symbol, imageUrl, address, price, marketCap, liquidity,
  fdv: marketCap * 1.18, volume24h: liquidity * (1.1 + i * .23),
  priceChange: { m5, h1, h6, h24 },
  pairCreatedAt: Date.now() - (i + 1) * 86400000,
  dexUrl: 'https://dexscreener.com/ton',
  verified: i % 3 !== 1,
  lpBurned: 'unknown'
}));

const state = {
  mode: 'canvas',
  metric: 'h24',
  filter: 'gainers',
  minMarketCap: 0,
  tokens: [],
  selected: null,
  rects: [],
  images: new Map(),
  imageUrls: new Map(),
  failedImages: new Set(),
  view: { scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 }
};

const KNOWN_TOKEN_IMAGES = {
  redo: 'https://dd.dexscreener.com/ds-data/tokens/ton/EQAQXlWJvGbbFfE8F3oS8s87lIgdovS455IsWFaRdmJetTon.png?size=lg',
  not: 'https://assets.coingecko.com/coins/images/33453/large/rFmThDiD_400x400.jpg',
  fish: 'https://assets.coingecko.com/coins/images/39195/large/fish.png',
  durev: 'https://assets.coingecko.com/coins/images/38549/large/durev.png'
};

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="sigil"><img src="/logo.jpg" alt=""></span>
        <div><h1><span>Ton</span><b>Memes</b></h1><span id="status" hidden></span></div>
      </div>
      <div class="controls">
        <div class="seg" data-control="mode">
          <button class="active" data-value="canvas">Canvas</button>
          <button data-value="table">Table</button>
        </div>
        <div class="seg" data-control="metric">
          <button data-value="m5">5m</button>
          <button data-value="h1">1h</button>
          <button data-value="h6">6h</button>
          <button class="active" data-value="h24">24h</button>
        </div>
        <label class="field"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="12" y1="18" x2="20" y2="18"/></svg><input id="minMc" inputmode="numeric" placeholder="Min MC"></label>
        <div class="dropdown" id="filterWrap">
          <button class="dropdown-toggle" id="filterBtn">🔥 Top Gainers<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <div class="dropdown-menu" id="filterMenu">
            <button data-value="gainers" class="active">🔥 Top Gainers</button>
            <button data-value="losers">📉 Top Losers</button>
            <button data-value="mcap">ðŸ’Ž Market Cap</button>
            <button data-value="lowcap">🔬 Low Cap Gems</button>
            <button data-value="newest">🆕 New Launches</button>
            <button data-value="volume">📈 Volume</button>
            <button data-value="liquidity">💧 Liquidity</button>
          </div>
        </div>
        <button id="resetView" class="ghost">⟳ Reset</button>
      </div>
    </header>
    <section class="stage">
      <canvas id="mapCanvas"></canvas>
      <div id="tokenTable" class="token-table" hidden></div>
      <div id="hoverTag" hidden></div>
    </section>
    <aside id="drawer" class="drawer" aria-live="polite"></aside>
  </main>
`;

const canvas = document.querySelector('#mapCanvas');
const ctx = canvas.getContext('2d');
const tokenTable = document.querySelector('#tokenTable');
const statusEl = document.querySelector('#status');
const drawer = document.querySelector('#drawer');
const hoverTag = document.querySelector('#hoverTag');

function fmtUsd(value) {
  if (!Number.isFinite(value) || value === 0) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${Number(value).toLocaleString(undefined, { maximumSignificantDigits: 4 })}`;
}

function parseMoney(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[$,\s]/g, '');
  const num = Number(raw.replace(/[kmb]$/, ''));
  if (!Number.isFinite(num)) return 0;
  if (raw.endsWith('b')) return num * 1e9;
  if (raw.endsWith('m')) return num * 1e6;
  if (raw.endsWith('k')) return num * 1e3;
  return num;
}

function pct(value) {
  if (!Number.isFinite(value)) return 'n/a';
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : '';
  if (abs >= 1e6) return `${sign}${(value / 1e6).toFixed(1)}M%`;
  if (abs >= 1e4) return `${sign}${(value / 1e3).toFixed(0)}K%`;
  return `${sign}${value.toFixed(abs > 99 ? 0 : 1)}%`;
}

function ageLabel(ms) {
  if (!ms) return 'unknown';
  const days = Math.max(0, (Date.now() - ms) / 86400000);
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

function colorFor(value) {
  if (value >= 30) return '#32d74b';
  if (value >= 5) return '#30d158';
  if (value >= 0) return '#ffd60a';
  if (value >= -15) return '#ff9f0a';
  return '#ff453a';
}

function darkFor(value) {
  if (value >= 0) return '#061f18';
  return '#260711';
}

function metricValue(token) {
  return Number(token.priceChange?.[state.metric] || 0);
}

function sizeValue(token) {
  const f = state.filter;
  if (f === 'gainers' || f === 'losers' || f === 'lowcap') return 12 + Math.min(70, Math.log1p(Math.abs(metricValue(token))) * 10);
  if (f === 'mcap') return 10 + Math.min(78, Math.log1p(Number(token.marketCap || token.fdv || 0)) * 3.6);
  if (f === 'volume') return 10 + Math.min(78, Math.log1p(Number(token.volume24h || 0)) * 3.6);
  if (f === 'liquidity') return 10 + Math.min(78, Math.log1p(Number(token.liquidity || 0)) * 3.6);
  if (f === 'newest') return 10 + Math.min(78, Math.log1p(Number(token.volume24h || 0)) * 3.6);
  return 12 + Math.min(70, Math.log1p(Math.abs(metricValue(token))) * 10);
}

async function fetchTokens() {
  const pairs = await fetchDexPairs();
  const filteredPairs = pairs
    .filter(pair => pair.chainId === 'ton' && pair.baseToken && pair.quoteToken)
    .filter(pair => (pair.liquidity?.usd || 0) > 1000);

  const byToken = new Map();
  const infoByToken = new Map();
  for (const pair of filteredPairs) {
    const key = pair.baseToken.address || pair.pairAddress;
    const prev = byToken.get(key);
    if (!prev || (pair.liquidity?.usd || 0) > (prev.liquidity?.usd || 0)) byToken.set(key, pair);
    // Keep info from ANY pair that has it (the best liquidity pair might not have info)
    if (pair.info && !infoByToken.has(key)) infoByToken.set(key, pair.info);
  }

  const tokens = [...byToken.values()].map((pair, i) => {
    const key = pair.baseToken.address || pair.pairAddress;
    const info = infoByToken.get(key) || pair.info || {};
    return {
      id: key || String(i),
      pairAddress: pair.pairAddress || '',
      name: pair.baseToken.name || pair.baseToken.symbol || 'Unknown',
      symbol: pair.baseToken.symbol || '???',
      imageUrl: info.imageUrl || '',
      imageCandidates: [
        info.imageUrl,
        KNOWN_TOKEN_IMAGES[String(pair.baseToken.symbol || '').toLowerCase()],
        pair.baseToken.address ? `https://dd.dexscreener.com/ds-data/tokens/ton/${pair.baseToken.address}.png?size=lg` : ''
      ].filter(Boolean),
      address: pair.baseToken.address || '',
      price: Number(pair.priceUsd),
      marketCap: Number(pair.marketCap || pair.fdv || 0),
      fdv: Number(pair.fdv || pair.marketCap || 0),
      liquidity: Number(pair.liquidity?.usd || 0),
      volume24h: Number(pair.volume?.h24 || 0),
      priceChange: {
        m5: Number(pair.priceChange?.m5 || 0),
        h1: Number(pair.priceChange?.h1 || 0),
        h6: Number(pair.priceChange?.h6 || 0),
        h24: Number(pair.priceChange?.h24 || 0)
      },
      pairCreatedAt: pair.pairCreatedAt || 0,
      dexUrl: pair.url,
      links: normalizeLinks(info),
      verified: Boolean(info.websites?.length || info.socials?.length),
      lpBurned: 'unknown'
    };
  });

  if (tokens.length >= 6) {
    hydrateTonMetadata(tokens);
    hydrateTonApiImages(tokens);
    return tokens;
  }
  return FALLBACK_TOKENS;
}

async function fetchDexPairs() {
  try {
    const res = await fetch('/api/tokens', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.pairs)) return data.pairs;
    }
  } catch {}

  const queries = ['TON meme', 'TON', 'NOT TON', 'REDO TON', 'FISH TON', 'DUREV TON', 'CAT TON', 'DOG TON'];
  const results = await Promise.allSettled(queries.map(q =>
    fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`).then(r => r.json())
  ));
  return results.flatMap(r => r.status === 'fulfilled' ? (r.value.pairs || []) : []);
}

function normalizeLinks(info = {}) {
  const seen = new Set();
  const links = [];
  function add(type, url) {
    if (!url || seen.has(type)) return;
    seen.add(type);
    links.push({ type, url });
  }
  for (const site of info.websites || []) {
    if (site?.url) add('web', site.url);
  }
  for (const social of info.socials || []) {
    const type = String(social.type || '').toLowerCase();
    if (!social.url) continue;
    if (type.includes('telegram')) add('tg', social.url);
    else if (type.includes('twitter') || type.includes('x')) add('x', social.url);
  }
  return links;
}

async function hydrateTonApiImages(tokens) {
  const targets = tokens.filter(t => !t.imageUrl && t.address).slice(0, 35);
  await Promise.allSettled(targets.map(async token => {
    const data = await fetch(`https://tonapi.io/v2/jettons/${encodeURIComponent(token.address)}`).then(r => r.json());
    const image = data?.preview || data?.metadata?.image || data?.metadata?.image_data;
    if (!image) return;
    const normalized = normalizeImageUrl(image);
    token.imageUrl = normalized;
    token.imageCandidates = [normalized, ...(token.imageCandidates || [])].filter(Boolean);
  }));
  loadTokenImages(targets);
  render();
}

async function hydrateTonMetadata(tokens) {
  const targets = tokens.filter(t => !t.imageUrl && t.address).slice(0, 60);
  if (!targets.length) return;
  try {
    const url = `https://toncenter.com/api/v3/metadata?${targets.map(t => `address=${encodeURIComponent(t.address)}`).join('&')}`;
    const data = await fetch(url).then(r => r.json());
    for (const token of targets) {
      const meta = data?.[token.address]?.token_info?.metadata || data?.[token.address]?.metadata || data?.[token.address];
      const image = meta?.image || meta?.image_data || meta?.logoURI || meta?.uri;
      if (!image) continue;
      const normalized = normalizeImageUrl(image);
      token.imageUrl = normalized;
      token.imageCandidates = [normalized, ...(token.imageCandidates || [])].filter(Boolean);
    }
    loadTokenImages(targets);
  } catch {}
}

function normalizeImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${url.replace('ipfs://', '')}`;
  return url;
}

function proxiedImageUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  const clean = url.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=256&h=256&fit=cover`;
}

function readTokenCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(cached?.tokens) ? cached.tokens : [];
  } catch {
    return [];
  }
}

function writeTokenCache(tokens) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), tokens }));
  } catch {}
}

async function refreshTokens({ quiet = false } = {}) {
  if (!quiet) statusEl.textContent = 'loading tokens';
  try {
    const tokens = await fetchTokens();
    mergeKnownImages(tokens);
    state.tokens = tokens;
    writeTokenCache(tokens);
    loadTokenImages(tokens);
    render();
  } catch {
    if (!state.tokens.length) {
      state.tokens = FALLBACK_TOKENS;
      loadTokenImages(FALLBACK_TOKENS);
      render();
    }
  }
}

function mergeKnownImages(tokens) {
  const previous = new Map(state.tokens.map(token => [token.id, token]));
  for (const token of tokens) {
    const known = state.imageUrls.get(token.id) || previous.get(token.id)?.displayImageUrl || previous.get(token.id)?.imageUrl;
    if (!known) continue;
    token.imageUrl = known;
    token.displayImageUrl = known;
    token.imageCandidates = [known, ...(token.imageCandidates || [])].filter(Boolean);
  }
}

function loadTokenImages(tokens) {
  for (const token of tokens) {
    // Already loaded successfully
    if (state.images.get(token.id) instanceof Image) continue;

    // Always build fresh proxied candidate list from source URLs
    const sources = [
      token.imageUrl,
      KNOWN_TOKEN_IMAGES[String(token.symbol || '').toLowerCase()],
      token.address ? `https://dd.dexscreener.com/ds-data/tokens/ton/${token.address}.png?size=lg` : ''
    ].filter(Boolean);
    // Always proxy every URL â€” canvas requires CORS headers
    token.imageCandidates = [...new Set(sources.map(u => proxiedImageUrl(u)).filter(Boolean))];

    if (!token.imageCandidates.length) continue;

    // Use previously resolved URL if available
    if (state.imageUrls.has(token.id)) {
      token.imageUrl = state.imageUrls.get(token.id);
      token.displayImageUrl = token.imageUrl;
    }

    const loadNext = () => {
      const nextUrl = token.imageCandidates.shift();
      if (!nextUrl) {
        state.failedImages.add(token.id);
        state.images.set(token.id, null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        token.displayImageUrl = token.imageUrl || nextUrl;
        state.imageUrls.set(token.id, nextUrl);
        state.images.set(token.id, img);
        state.failedImages.delete(token.id);
        render();
      };
      img.onerror = () => loadNext();
      img.src = nextUrl;
    };

    loadNext();
  }
}

function visibleTokens() {
  const tokens = state.tokens.filter(t => (t.marketCap || t.fdv || 0) >= state.minMarketCap);
  const f = state.filter;
  if (f === 'losers') tokens.sort((a, b) => metricValue(a) - metricValue(b));
  else if (f === 'newest') tokens.sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0));
  else if (f === 'mcap') tokens.sort((a, b) => (b.marketCap || b.fdv || 0) - (a.marketCap || a.fdv || 0));
  else if (f === 'lowcap') tokens.sort((a, b) => (a.marketCap || a.fdv || Infinity) - (b.marketCap || b.fdv || Infinity));
  else if (f === 'volume') tokens.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  else if (f === 'liquidity') tokens.sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0));
  else tokens.sort((a, b) => metricValue(b) - metricValue(a));
  const isMobile = window.innerWidth <= 860;
  // Fewer tiles on mobile = faster treemap + less canvas drawing
  const maxCanvas = isMobile ? 16 : 26;
  const maxGlobe  = isMobile ? 20 : 28;
  return tokens.slice(0, state.mode === 'globe' ? maxGlobe : maxCanvas);
}

function layoutTreemap(items, x, y, w, h) {
  const rects = [];
  function split(group, x0, y0, w0, h0) {
    if (group.length === 1) {
      rects.push({ ...group[0], x: x0, y: y0, w: w0, h: h0 });
      return;
    }
    const total = group.reduce((sum, item) => sum + item.weight, 0) || 1;
    let acc = 0;
    let idx = 0;
    for (; idx < group.length - 1; idx++) {
      if (acc + group[idx].weight >= total / 2) break;
      acc += group[idx].weight;
    }
    const first = group.slice(0, idx + 1);
    const second = group.slice(idx + 1);
    const ratio = first.reduce((sum, item) => sum + item.weight, 0) / total;
    if (w0 >= h0) {
      split(first, x0, y0, w0 * ratio, h0);
      split(second, x0 + w0 * ratio, y0, w0 * (1 - ratio), h0);
    } else {
      split(first, x0, y0, w0, h0 * ratio);
      split(second, x0, y0 + h0 * ratio, w0, h0 * (1 - ratio));
    }
  }
  split(items, x, y, w, h);
  return rects;
}

function worldBounds() {
  const rect = canvas.getBoundingClientRect();
  const isMobile = window.innerWidth <= 860;
  // On mobile, world is only slightly larger than the viewport so tiles stay visible
  const minW = isMobile ? rect.width * 1.2 : 1600;
  const minH = isMobile ? rect.height * 1.2 : 1050;
  const width = Math.max(minW, rect.width * (isMobile ? 1.3 : 1.8));
  const height = Math.max(minH, rect.height * (isMobile ? 1.3 : 1.8));
  return { width, height };
}

function screenToWorld(x, y) {
  return {
    x: (x - state.view.x) / state.view.scale,
    y: (y - state.view.y) / state.view.scale
  };
}

function drawIcon(token, x, y, size) {
  const img = state.images.get(token.id);
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
  ctx.clip();
  if (img) ctx.drawImage(img, x, y, size, size);
  else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#5e5ce6');
    g.addColorStop(1, '#32d74b');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(12, size * .34)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(token.symbol.slice(0, 3), x + size / 2, y + size / 2);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.2)';
  ctx.lineWidth = Math.max(1, size * .02);
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function fitText(text, maxWidth, maxSize, minSize = 10) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `900 ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

// Layout cache â€” only recalculate treemap when data changes, not on every pan/zoom
let _layoutDirty = true;
function invalidateCanvasCache() { _layoutDirty = true; }

function drawCanvas() {
  const isMobile = window.innerWidth <= 860;
  // Full DPR for sharp rendering â€” the lag fix is caching layout, not reducing quality
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 3);
  const bounds = canvas.getBoundingClientRect();
  const newW = Math.floor(bounds.width * dpr);
  const newH = Math.floor(bounds.height * dpr);
  if (canvas.width !== newW || canvas.height !== newH) {
    canvas.width = newW;
    canvas.height = newH;
    _layoutDirty = true; // viewport changed, redo layout
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, bounds.width, bounds.height);

  // Only recalculate treemap layout when data/filter/metric changed
  if (_layoutDirty || !state.rects) {
    const world = worldBounds();
    const tokens = visibleTokens();
    const items = tokens.map(token => ({ token, weight: sizeValue(token) })).sort((a, b) => b.weight - a.weight);
    state.rects = layoutTreemap(items, 0, 0, world.width, world.height);
    _layoutDirty = false;
  }

  const world = worldBounds();
  ctx.save();
  ctx.translate(state.view.x, state.view.y);
  ctx.scale(state.view.scale, state.view.scale);

  for (const rect of state.rects) {
    const token = rect.token;
    const change = metricValue(token);
    const pad = 6;
    const x = rect.x + pad, y = rect.y + pad, w = Math.max(0, rect.w - pad * 2), h = Math.max(0, rect.h - pad * 2);
    if (w < 10 || h < 10) continue;
    const radius = Math.min(32, Math.min(w, h) * 0.15);
    
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (change >= 0) {
      grad.addColorStop(0, 'rgba(50, 215, 75, 0.2)');
      grad.addColorStop(1, 'rgba(50, 215, 75, 0.05)');
    } else {
      grad.addColorStop(0, 'rgba(255, 69, 58, 0.2)');
      grad.addColorStop(1, 'rgba(255, 69, 58, 0.05)');
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = grad;
    ctx.fill();
    
    ctx.strokeStyle = state.selected?.id === token.id ? '#ffffff' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = state.selected?.id === token.id ? 3 : 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(x, y, w, Math.max(radius, h * 0.4), radius);
    const glass = ctx.createLinearGradient(x, y, x, y + h * 0.4);
    glass.addColorStop(0, 'rgba(255,255,255,0.1)');
    glass.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glass;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();

    const iconSize = Math.min(64, Math.max(28, Math.min(w * .25, h * .3)));
    if (w > 64 && h > 64) {
      const img = state.images.get(token.id);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + 16 + iconSize / 2, y + 16 + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x + 16, y + 16, iconSize, iconSize);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(x + 16 + iconSize / 2, y + 16 + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    const tx = x + (w > 100 && h > 64 ? iconSize + 28 : 16);
    const available = Math.max(20, w - (tx - x) - 16);
    const symbol = token.symbol.slice(0, 9);
    
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    
    const titleSize = fitText(symbol, available, Math.min(36, Math.max(14, w / 7)), 10);
    ctx.font = `700 ${titleSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    
    if (w > 70 && h > 48) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.fillText(symbol, tx, y + (w > 100 && h > 64 ? 20 : 16), available);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowColor = 'transparent';
    }
    
    if (w > 90 && h > 90) {
      const bodyY = y + (w > 100 && h > 64 ? iconSize + 28 : 50);
      const pctSize = Math.min(40, Math.max(16, Math.min(w / 6, h / 8)));
      ctx.font = `600 ${pctSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
      ctx.fillStyle = change >= 0 ? '#32d74b' : '#ff453a';
      ctx.fillText(pct(change), x + 16, bodyY, w - 32);
      ctx.font = `500 ${Math.min(18, Math.max(11, pctSize * .45))}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillText(`${fmtUsd(token.marketCap || token.fdv)} \u00B7 ${ageLabel(token.pairCreatedAt)}`, x + 16, bodyY + pctSize + 8, w - 32);
    } else if (w > 54 && h > 64) {
      ctx.font = `600 ${Math.min(18, Math.max(11, w / 6))}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
      ctx.fillStyle = change >= 0 ? '#32d74b' : '#ff453a';
      ctx.fillText(pct(change), x + 12, y + (w > 100 && h > 64 ? 20 + titleSize + 4 : 40), w - 24);
    }
    ctx.restore();
  }
  ctx.restore();
}

// â”€â”€ Table view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderTable() {
  const tokens = visibleTokens();

  if (tokens.length === 0) {
    tokenTable.innerHTML = `<div class="tbl-empty">No tokens match your filters.</div>`;
    return;
  }

  const col = (val, metric) => {
    if (!Number.isFinite(val)) return `<td class="tbl-chg">-</td>`;
    const cls = val >= 0 ? 'up' : 'down';
    const active = state.metric === metric ? ' tbl-active-col' : '';
    return `<td class="tbl-chg ${cls}${active}">${pct(val)}</td>`;
  };

  const rows = tokens.map((token, i) => {
    const imgUrl = token.displayImageUrl || state.imageUrls.get(token.id) || token.imageUrl || '';
    const avatar = imgUrl
      ? `<img src="${imgUrl}" alt="" class="tbl-logo" loading="lazy" onerror="this.style.display='none'">`
      : `<span class="tbl-logo tbl-logo-placeholder">${token.symbol.slice(0,2)}</span>`;
    const mc = token.marketCap || token.fdv;
    const selected = state.selected?.id === token.id ? ' tbl-row-selected' : '';
    return `
      <tr class="tbl-row${selected}" data-id="${token.id}" tabindex="0">
        <td class="tbl-rank">${i + 1}</td>
        <td class="tbl-token">
          ${avatar}
          <div class="tbl-names">
            <span class="tbl-sym">${token.symbol}</span>
            <span class="tbl-name">${token.name.slice(0, 20)}</span>
          </div>
        </td>
        ${col(token.priceChange?.m5, 'm5')}
        ${col(token.priceChange?.h1, 'h1')}
        ${col(token.priceChange?.h6, 'h6')}
        ${col(token.priceChange?.h24, 'h24')}
        <td class="tbl-mc">${fmtUsd(mc)}</td>
      </tr>`;
  }).join('');

  tokenTable.innerHTML = `
    <table class="tbl">
      <thead>
        <tr>
          <th class="tbl-rank">#</th>
          <th class="tbl-token">Token</th>
          <th class="tbl-chg${state.metric === 'm5' ? ' tbl-active-col' : ''}">5m</th>
          <th class="tbl-chg${state.metric === 'h1' ? ' tbl-active-col' : ''}">1h</th>
          <th class="tbl-chg${state.metric === 'h6' ? ' tbl-active-col' : ''}">6h</th>
          <th class="tbl-chg${state.metric === 'h24' ? ' tbl-active-col' : ''}">24h</th>
          <th class="tbl-mc">MCap</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Row click â†’ select token (drawer)
  tokenTable.querySelectorAll('.tbl-row').forEach(row => {
    const id = row.dataset.id;
    const token = tokens.find(t => t.id === id);
    if (!token) return;
    row.addEventListener('click', () => selectToken(token));
    row.addEventListener('keydown', e => { if (e.key === 'Enter') selectToken(token); });
  });
}
// â”€â”€ End table view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€





function showHover(token, x, y) {
  if (!token) { hoverTag.hidden = true; return; }
  hoverTag.hidden = false;
  hoverTag.style.left = `${x + 14}px`;
  hoverTag.style.top = `${y + 14}px`;
  hoverTag.textContent = `${token.symbol} ${pct(metricValue(token))}`;
}

function selectToken(token) {
  const imageUrl = token.displayImageUrl || state.imageUrls.get(token.id) || token.imageUrl;
  state.selected = token;
  drawer.classList.add('open');
  const changes = [
    ['5m', token.priceChange.m5],
    ['1h', token.priceChange.h1],
    ['6h', token.priceChange.h6],
    ['24h', token.priceChange.h24]
  ];
  const socialIcons = {
    web: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    tg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
    dex: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  };
  const allLinks = [...(token.links || [])];
  if (token.dexUrl) allLinks.push({ type: 'dex', url: token.dexUrl });
  const linkBtns = allLinks.filter(l => l.url).slice(0, 4).map(link => {
    const label = link.type === 'x' ? 'X' : link.type === 'tg' ? 'Telegram' : link.type === 'dex' ? 'Chart' : 'Website';
    return `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="socialLink" onclick="event.stopPropagation(); window.open('${link.url.replace(/'/g, "\\'")}','_blank'); return false;">${socialIcons[link.type] || socialIcons.web}<span>${label}</span></a>`;
  }).join('');

  drawer.innerHTML = `
    <button class="close" aria-label="Close">âœ•</button>
    <div class="tokenHead">
      <div class="avatar">${imageUrl ? `<img src="${imageUrl}" alt="">` : token.symbol.slice(0, 3)}</div>
      <div>
        <h2>${token.symbol}</h2>
        <p>${token.name}</p>
        ${linkBtns ? `<div class="linkRow">${linkBtns}</div>` : ''}
      </div>
      <strong class="${metricValue(token) >= 0 ? 'up' : 'down'}">${pct(metricValue(token))}</strong>
    </div>
    <div class="changePills">
      ${changes.map(([label, value]) => `<span class="${value >= 0 ? 'good' : 'bad'}"><b>${label}</b>${pct(value)}</span>`).join('')}
    </div>
    <div class="drawerGrid">
      <span><b>price</b>${fmtUsd(token.price)}</span>
      <span><b>mcap</b>${fmtUsd(token.marketCap || token.fdv)}</span>
      <span><b>liq</b>${fmtUsd(token.liquidity)}</span>
      <span><b>vol</b>${fmtUsd(token.volume24h)}</span>
      <span><b>age</b>${ageLabel(token.pairCreatedAt)}</span>
    </div>
    <div class="address">
      <code>${token.address}</code>
      <button id="copyAddr">copy</button>
    </div>
  `;
  drawer.querySelector('.close').onclick = () => drawer.classList.remove('open');
  drawer.querySelector('#copyAddr').onclick = async () => {
    try {
      await navigator.clipboard.writeText(token.address);
      drawer.querySelector('#copyAddr').textContent = 'copied';
    } catch {
      drawer.querySelector('#copyAddr').textContent = 'blocked';
    }
  };
  drawCanvas();
}

function canvasHit(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const p = screenToWorld(clientX - rect.left, clientY - rect.top);
  return state.rects.find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
}

function bindControls() {
  document.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const button = e.target.closest('button');
      if (!button) return;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
      state[seg.dataset.control] = button.dataset.value;
      render();
    });
  });
  // Custom dropdown logic
  const filterBtn = document.getElementById('filterBtn');
  const filterMenu = document.getElementById('filterMenu');
  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    filterMenu.classList.toggle('show');
  });
  filterMenu.querySelectorAll('button').forEach(opt => {
    opt.addEventListener('click', () => {
      filterMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      opt.classList.add('active');
      const chevron = '<svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      filterBtn.innerHTML = opt.textContent + chevron;
      state.filter = opt.dataset.value;
      filterMenu.classList.remove('show');
      render();
    });
  });
  document.addEventListener('click', () => filterMenu.classList.remove('show'));

  document.querySelector('#minMc').addEventListener('change', e => {
    state.minMarketCap = parseMoney(e.target.value);
    e.target.value = state.minMarketCap ? fmtUsd(state.minMarketCap).replace('$', '') : '';
    render();
  });
  document.querySelector('#resetView').addEventListener('click', () => {
    state.view = { ...state.view, scale: 1, x: 0, y: 0 };
    state.minMarketCap = 0;
    document.querySelector('#minMc').value = '';
    render();
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = screenToWorld(mx, my);
    state.view.scale = Math.min(5, Math.max(.25, state.view.scale * (e.deltaY < 0 ? 1.14 : .88)));
    state.view.x = mx - before.x * state.view.scale;
    state.view.y = my - before.y * state.view.scale;
    drawCanvas();
  }, { passive: false });

  // --- Touch pinch-to-zoom for canvas ---
  let _touches = {};
  let _pinchDist0 = null;
  let _pinchScale0 = null;
  // World-space anchor: the world point that was under the midpoint when the pinch started
  let _pinchWorldX = 0, _pinchWorldY = 0;
  let _touchMoved = false;

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) _touches[t.identifier] = { x: t.clientX, y: t.clientY };
    const ids = Object.keys(_touches);

    if (ids.length === 2) {
      // Starting a pinch â€” record world-space anchor at current midpoint
      const t1 = _touches[ids[0]], t2 = _touches[ids[1]];
      _pinchDist0 = Math.hypot(t2.x - t1.x, t2.y - t1.y);
      _pinchScale0 = state.view.scale;
      const rect = canvas.getBoundingClientRect();
      const midX = (t1.x + t2.x) / 2 - rect.left;
      const midY = (t1.y + t2.y) / 2 - rect.top;
      const world = screenToWorld(midX, midY);
      _pinchWorldX = world.x;
      _pinchWorldY = world.y;
      state.view.dragging = false;
    } else if (ids.length === 1) {
      state.view.dragging = true;
      state.view.lastX = e.changedTouches[0].clientX;
      state.view.lastY = e.changedTouches[0].clientY;
    }
    _touchMoved = false;
  }, { passive: false });

  // rAF flag â€” ensures drawCanvas fires at most once per animation frame
  let _rafPending = false;
  function _scheduleCanvasDraw() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => { _rafPending = false; drawCanvas(); });
  }

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) _touches[t.identifier] = { x: t.clientX, y: t.clientY };
    const ids = Object.keys(_touches);
    _touchMoved = true;

    if (ids.length === 2 && _pinchDist0 > 0) {
      const t1 = _touches[ids[0]], t2 = _touches[ids[1]];
      const dist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
      const newScale = Math.min(5, Math.max(.25, _pinchScale0 * (dist / _pinchDist0)));

      // KEY FIX: use the CURRENT midpoint between fingers (not the locked start midpoint)
      // This prevents drift when fingers slide sideways while pinching
      const rect = canvas.getBoundingClientRect();
      const curMidX = (t1.x + t2.x) / 2 - rect.left;
      const curMidY = (t1.y + t2.y) / 2 - rect.top;

      // Pin _pinchWorldX/Y under curMid at the new scale
      state.view.scale = newScale;
      state.view.x = curMidX - _pinchWorldX * newScale;
      state.view.y = curMidY - _pinchWorldY * newScale;
      _scheduleCanvasDraw();

    } else if (ids.length === 1 && state.view.dragging) {
      const t = e.changedTouches[0];
      state.view.x += t.clientX - state.view.lastX;
      state.view.y += t.clientY - state.view.lastY;
      state.view.lastX = t.clientX;
      state.view.lastY = t.clientY;
      _scheduleCanvasDraw();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) delete _touches[t.identifier];
    const ids = Object.keys(_touches);
    _pinchDist0 = null;

    if (ids.length === 1) {
      // 2â†’1 finger: reset pan origin to remaining finger so there's no jump
      const remaining = _touches[ids[0]];
      state.view.lastX = remaining.x;
      state.view.lastY = remaining.y;
      state.view.dragging = true;
    } else {
      state.view.dragging = false;
      if (!_touchMoved && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const hit = canvasHit(t.clientX, t.clientY);
        if (hit) selectToken(hit.token);
      }
    }
  }, { passive: false });
  // --- End touch pinch-to-zoom ---

  let _dragStartX = 0, _dragStartY = 0, _didDrag = false;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return; // handled by touch events
    state.view.dragging = true;
    _didDrag = false;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    state.view.lastX = e.clientX;
    state.view.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return;
    state.view.dragging = false;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (state.view.dragging) {
      const dx = e.clientX - _dragStartX;
      const dy = e.clientY - _dragStartY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) _didDrag = true;
      state.view.x += e.clientX - state.view.lastX;
      state.view.y += e.clientY - state.view.lastY;
      state.view.lastX = e.clientX;
      state.view.lastY = e.clientY;
      drawCanvas();
      return;
    }
    const hit = canvasHit(e.clientX, e.clientY);
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    showHover(hit?.token, e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseleave', () => { hoverTag.hidden = true; });
  canvas.addEventListener('click', e => {
    if (e.pointerType === 'touch') return;
    if (_didDrag) return;
    const hit = canvasHit(e.clientX, e.clientY);
    if (hit) selectToken(hit.token);
  });
  window.addEventListener('resize', render);
}

function render() {
  statusEl.textContent = `${visibleTokens().length}/${state.tokens.length} tokens`;
  const isCanvas = state.mode === 'canvas';
  const isTable  = state.mode === 'table';
  canvas.hidden     = !isCanvas;
  tokenTable.hidden = !isTable;
  if (isCanvas) {
    invalidateCanvasCache();
    drawCanvas();
  } else if (isTable) {
    renderTable();
  }
}

bindControls();
const cachedTokens = readTokenCache();
if (cachedTokens.length) {
  state.tokens = cachedTokens;
  mergeKnownImages(cachedTokens);
  loadTokenImages(cachedTokens);
  render();
}
refreshTokens({ quiet: cachedTokens.length > 0 });
setInterval(() => refreshTokens({ quiet: true }), REFRESH_MS);



