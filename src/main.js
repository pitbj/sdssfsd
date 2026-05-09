import * as THREE from 'three';
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
  view: { scale: 1, x: 0, y: 0, dragging: false, lastX: 0, lastY: 0 },
  globe: null,
  needsGlobeRefresh: false
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
          <button data-value="globe">Bubbles</button>
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
            <button data-value="mcap">💎 Market Cap</button>
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
      <div id="globeMount" hidden></div>
      <div id="hoverTag" hidden></div>
    </section>
    <aside id="drawer" class="drawer" aria-live="polite"></aside>
  </main>
`;

const canvas = document.querySelector('#mapCanvas');
const ctx = canvas.getContext('2d');
const globeMount = document.querySelector('#globeMount');
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
  return `${value > 0 ? '+' : ''}${value.toFixed(Math.abs(value) > 99 ? 0 : 1)}%`;
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
    // Always proxy every URL — canvas requires CORS headers
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

// --- Offscreen canvas cache for smooth pan/zoom ---
let _offscreen = null;
let _offCtx = null;
let _cacheW = 0, _cacheH = 0;
let _cacheDirty = true;

function invalidateCanvasCache() { _cacheDirty = true; }

function rebuildCanvasCache() {
  const world = worldBounds();
  const tokens = visibleTokens();
  const items = tokens.map(token => ({ token, weight: sizeValue(token) })).sort((a, b) => b.weight - a.weight);
  state.rects = layoutTreemap(items, 0, 0, world.width, world.height);

  // Size offscreen to world bounds (capped to avoid huge allocations)
  const maxDim = 2048;
  _cacheW = Math.min(maxDim, Math.ceil(world.width));
  _cacheH = Math.min(maxDim, Math.ceil(world.height));
  if (!_offscreen) {
    _offscreen = document.createElement('canvas');
    _offCtx = _offscreen.getContext('2d');
  }
  _offscreen.width = _cacheW;
  _offscreen.height = _cacheH;

  // Scale factor if world exceeds maxDim
  const sx = _cacheW / world.width;
  const sy = _cacheH / world.height;
  _offCtx.setTransform(sx, 0, 0, sy, 0, 0);
  _offCtx.clearRect(0, 0, world.width, world.height);

  for (const rect of state.rects) {
    const token = rect.token;
    const change = metricValue(token);
    const pad = 6;
    const x = rect.x + pad, y = rect.y + pad, w = Math.max(0, rect.w - pad * 2), h = Math.max(0, rect.h - pad * 2);
    if (w < 10 || h < 10) continue;
    const radius = Math.min(32, Math.min(w, h) * 0.15);
    
    const grad = _offCtx.createLinearGradient(x, y, x, y + h);
    if (change >= 0) {
      grad.addColorStop(0, 'rgba(50, 215, 75, 0.2)');
      grad.addColorStop(1, 'rgba(50, 215, 75, 0.05)');
    } else {
      grad.addColorStop(0, 'rgba(255, 69, 58, 0.2)');
      grad.addColorStop(1, 'rgba(255, 69, 58, 0.05)');
    }
    
    _offCtx.beginPath();
    _offCtx.roundRect(x, y, w, h, radius);
    _offCtx.fillStyle = grad;
    _offCtx.fill();
    
    _offCtx.strokeStyle = state.selected?.id === token.id ? '#ffffff' : 'rgba(255,255,255,0.1)';
    _offCtx.lineWidth = state.selected?.id === token.id ? 3 : 1;
    _offCtx.stroke();

    _offCtx.beginPath();
    _offCtx.roundRect(x, y, w, Math.max(radius, h * 0.4), radius);
    const glass = _offCtx.createLinearGradient(x, y, x, y + h * 0.4);
    glass.addColorStop(0, 'rgba(255,255,255,0.1)');
    glass.addColorStop(1, 'rgba(255,255,255,0)');
    _offCtx.fillStyle = glass;
    _offCtx.fill();

    _offCtx.save();
    _offCtx.beginPath();
    _offCtx.roundRect(x, y, w, h, radius);
    _offCtx.clip();

    const iconSize = Math.min(64, Math.max(28, Math.min(w * .25, h * .3)));
    if (w > 64 && h > 64) {
      // Draw icon directly on offscreen
      const img = state.images.get(token.id);
      if (img) {
        _offCtx.save();
        _offCtx.beginPath();
        _offCtx.arc(x + 16 + iconSize / 2, y + 16 + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
        _offCtx.clip();
        _offCtx.drawImage(img, x + 16, y + 16, iconSize, iconSize);
        _offCtx.restore();
      } else {
        _offCtx.fillStyle = 'rgba(255,255,255,0.1)';
        _offCtx.beginPath();
        _offCtx.arc(x + 16 + iconSize / 2, y + 16 + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
        _offCtx.fill();
      }
    }
    
    const tx = x + (w > 100 && h > 64 ? iconSize + 28 : 16);
    const available = Math.max(20, w - (tx - x) - 16);
    const symbol = token.symbol.slice(0, 9);
    
    _offCtx.fillStyle = '#fff';
    _offCtx.textBaseline = 'top';
    _offCtx.textAlign = 'left';
    
    const titleSize = fitText(symbol, available, Math.min(36, Math.max(14, w / 7)), 10);
    _offCtx.font = `700 ${titleSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    
    if (w > 70 && h > 48) {
      _offCtx.shadowColor = 'rgba(0,0,0,0.5)';
      _offCtx.shadowBlur = 4;
      _offCtx.shadowOffsetY = 1;
      _offCtx.fillText(symbol, tx, y + (w > 100 && h > 64 ? 20 : 16), available);
      _offCtx.shadowBlur = 0;
      _offCtx.shadowOffsetY = 0;
      _offCtx.shadowColor = 'transparent';
    }
    
    if (w > 90 && h > 90) {
      const bodyY = y + (w > 100 && h > 64 ? iconSize + 28 : 50);
      const pctSize = Math.min(40, Math.max(16, Math.min(w / 6, h / 8)));
      _offCtx.font = `600 ${pctSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
      _offCtx.fillStyle = change >= 0 ? '#32d74b' : '#ff453a';
      _offCtx.fillText(pct(change), x + 16, bodyY, w - 32);
      
      _offCtx.font = `500 ${Math.min(18, Math.max(11, pctSize * .45))}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
      _offCtx.fillStyle = 'rgba(255,255,255,.6)';
      _offCtx.fillText(`${fmtUsd(token.marketCap || token.fdv)} \u00B7 ${ageLabel(token.pairCreatedAt)}`, x + 16, bodyY + pctSize + 8, w - 32);
    } else if (w > 54 && h > 64) {
      _offCtx.font = `600 ${Math.min(18, Math.max(11, w / 6))}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
      _offCtx.fillStyle = change >= 0 ? '#32d74b' : '#ff453a';
      _offCtx.fillText(pct(change), x + 12, y + (w > 100 && h > 64 ? 20 + titleSize + 4 : 40), w - 24);
    }
    _offCtx.restore();
  }
  _cacheDirty = false;
}

function drawCanvas() {
  // Rebuild offscreen cache if data changed (NOT during pan/zoom)
  if (_cacheDirty || !_offscreen) rebuildCanvasCache();

  const isMobile = window.innerWidth <= 860;
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
  const bounds = canvas.getBoundingClientRect();
  const newW = Math.floor(bounds.width * dpr);
  const newH = Math.floor(bounds.height * dpr);
  if (canvas.width !== newW || canvas.height !== newH) {
    canvas.width = newW;
    canvas.height = newH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, bounds.width, bounds.height);

  // Fast blit: just draw the cached offscreen canvas with current pan/zoom transform
  const world = worldBounds();
  ctx.save();
  ctx.translate(state.view.x, state.view.y);
  ctx.scale(state.view.scale, state.view.scale);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(_offscreen, 0, 0, world.width, world.height);
  ctx.restore();
}

function makeIconTexture(token) {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 160;
  const cx = c.getContext('2d');
  cx.clearRect(0, 0, 160, 160);
  cx.save();
  cx.beginPath();
  cx.arc(80, 80, 74, 0, Math.PI * 2);
  cx.clip();
  const img = state.images.get(token.id);
  if (img) cx.drawImage(img, 0, 0, 160, 160);
  else {
    cx.fillStyle = colorFor(metricValue(token));
    cx.fillRect(0, 0, 160, 160);
    cx.fillStyle = 'rgba(0,0,0,.2)';
    cx.font = '800 42px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(token.symbol.slice(0, 4), 80, 82);
  }
  cx.restore();
  cx.strokeStyle = 'rgba(255,255,255,.3)';
  cx.lineWidth = 4;
  cx.beginPath();
  cx.arc(80, 80, 74, 0, Math.PI * 2);
  cx.stroke();
  return new THREE.CanvasTexture(c);
}

function initGlobe() {
  const scene = new THREE.Scene();
  const distance = 50;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  globeMount.appendChild(renderer.domElement);
  
  const root = new THREE.Group();
  scene.add(root);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  
  state.globe = { 
    scene, camera, renderer, root, 
    items: [], territories: [], 
    raycaster: new THREE.Raycaster(), 
    pointer: new THREE.Vector2(), 
    draggingItem: null, draggingCamera: false, 
    moved: false, lastX: 0, lastY: 0, distance 
  };
  
  globeMount.addEventListener('pointerdown', e => {
    state.globe.moved = false;
    state.globe.lastX = e.clientX;
    state.globe.lastY = e.clientY;
    
    const rect = globeMount.getBoundingClientRect();
    state.globe.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.globe.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    state.globe.raycaster.setFromCamera(state.globe.pointer, state.globe.camera);
    
    const hits = state.globe.raycaster.intersectObjects(state.globe.territories, true);
    if (hits.length) {
      const obj = hits[0].object;
      state.globe.draggingItem = state.globe.items.find(i => i.group === obj);
      if (state.globe.draggingItem) state.globe.draggingItem.dragging = true;
    } else {
      state.globe.draggingCamera = true;
    }
  });
  
  window.addEventListener('pointerup', () => { 
    if (state.globe) {
      if (state.globe.draggingItem) state.globe.draggingItem.dragging = false;
      state.globe.draggingItem = null;
      state.globe.draggingCamera = false;
    }
  });
  
  globeMount.addEventListener('pointermove', onGlobeMove);
  globeMount.addEventListener('wheel', onGlobeWheel, { passive: false });
  globeMount.addEventListener('click', onGlobeClick);
  animateGlobe();
}

function makeTokenBadgeTexture(token, radiusPixels = 256) {
  const c = document.createElement('canvas');
  c.width = radiusPixels * 2;
  c.height = radiusPixels * 2;
  const cx = c.getContext('2d');
  const change = metricValue(token);
  const cxX = radiusPixels, cxY = radiusPixels;
  
  cx.clearRect(0, 0, c.width, c.height);
  cx.fillStyle = change >= 0 ? 'rgba(50, 215, 75, 0.12)' : 'rgba(255, 69, 58, 0.12)';
  cx.beginPath();
  cx.arc(cxX, cxY, radiusPixels - 4, 0, Math.PI * 2);
  cx.fill();
  
  cx.strokeStyle = change >= 0 ? 'rgba(50, 215, 75, 0.8)' : 'rgba(255, 69, 58, 0.8)';
  cx.lineWidth = 4;
  cx.stroke();
  
  const img = state.images.get(token.id);
  const iconSize = radiusPixels * 0.55;
  cx.save();
  cx.beginPath();
  cx.arc(cxX, cxY - radiusPixels * 0.15, iconSize/2, 0, Math.PI * 2);
  cx.clip();
  if (img) {
    cx.drawImage(img, cxX - iconSize/2, cxY - iconSize/2 - radiusPixels * 0.15, iconSize, iconSize);
  } else {
    cx.fillStyle = colorFor(change);
    cx.fill();
  }
  cx.restore();
  
  cx.fillStyle = '#fff';
  cx.font = `600 ${radiusPixels * 0.18}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
  cx.textAlign = 'center';
  cx.fillText(token.symbol.slice(0, 12), cxX, cxY + radiusPixels * 0.18);
  
  cx.fillStyle = colorFor(change);
  cx.font = `800 ${radiusPixels * 0.22}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
  cx.fillText(pct(change), cxX, cxY + radiusPixels * 0.48);
  
  // price/mcap label removed — too cluttered at small sizes

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBubble(token, maxVal) {
  const value = sizeValue(token);
  // Calculate relative radius (area proportional to value)
  const ratio = maxVal > 0 ? Math.sqrt(value / maxVal) : 0;
  // Scale up bubble radius on mobile so they fill the smaller viewport
  const isMobile = window.innerWidth <= 860;
  const minR = isMobile ? 5 : 3;
  const maxR = isMobile ? 26 : 17;
  const radius = minR + ratio * maxR;
  
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeTokenBadgeTexture(token, 256), transparent: true })
  );
  sprite.scale.set(radius * 2, radius * 2, 1);
  sprite.userData.token = token;
  
  return { group: sprite, r: radius, v: new THREE.Vector3(), dragging: false };
}

function rebuildGlobe() {
  if (!state.globe) initGlobe();
  state.globe.renderer.setClearColor(0x000000, 0);
  
  for (const item of state.globe.items) {
    if (item.group.material.map) item.group.material.map.dispose();
    if (item.group.material) item.group.material.dispose();
    state.globe.root.remove(item.group);
  }
  state.globe.items = [];
  state.globe.territories = [];
  
  const tokens = visibleTokens();
  if (tokens.length === 0) return;
  
  let maxVal = 0;
  for (const t of tokens) maxVal = Math.max(maxVal, sizeValue(t));
  
  let totalArea = 0;
  for (const t of tokens) {
    const val = sizeValue(t);
    const ratio = maxVal > 0 ? Math.sqrt(val / maxVal) : 0;
    const r = 3 + ratio * 17;
    totalArea += Math.PI * r * r;
  }
  
  const b = globeMount.getBoundingClientRect();
  const aspect = b.width / Math.max(1, b.height);
  let optimalDistance = Math.sqrt(totalArea / (0.25 * aspect));
  state.globe.distance = Math.max(30, Math.min(300, optimalDistance));
  
  // Scatter bubbles across the top half so they rain down naturally
  const viewW = state.globe.distance * aspect;
  for (let i = 0; i < tokens.length; i++) {
    const bubble = makeBubble(tokens[i], maxVal);
    const x = (Math.random() - 0.5) * viewW * 0.85;
    const y = Math.random() * state.globe.distance * 0.4 + state.globe.distance * 0.1;
    bubble.group.position.set(x, y, 0);
    state.globe.root.add(bubble.group);
    state.globe.items.push(bubble);
    state.globe.territories.push(bubble.group);
  }
  
  resizeGlobe();
}

function animateGlobe() {
  if (!state.globe) return;
  requestAnimationFrame(animateGlobe);

  // Throttle to ~30fps on mobile to save battery/CPU
  const isMobile = window.innerWidth <= 860;
  if (isMobile) {
    const now = performance.now();
    if (!state.globe._lastFrame) state.globe._lastFrame = 0;
    if (now - state.globe._lastFrame < 32) return; // ~30fps
    state.globe._lastFrame = now;
  }

  const items = state.globe.items || [];
  const cam = state.globe.camera;
  const floorY = cam.bottom + cam.position.y + 0.5;
  const leftWall = cam.left + cam.position.x + 0.5;
  const rightWall = cam.right + cam.position.x - 0.5;
  
  const GRAVITY = -0.015;
  const DAMPING = 0.995;
  const FLOOR_BOUNCE = 0.45;
  const SEPARATION_STRENGTH = 0.4;
  
  // --- Apply forces ---
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.dragging) continue;
    
    // Gravity
    a.v.y += GRAVITY;
    
    // Very light air friction — momentum sustains
    a.v.x *= DAMPING;
    a.v.y *= DAMPING;
    
    // Clamp max speed
    const speed = Math.sqrt(a.v.x * a.v.x + a.v.y * a.v.y);
    const maxSpeed = 2.5;
    if (speed > maxSpeed) {
      a.v.x = (a.v.x / speed) * maxSpeed;
      a.v.y = (a.v.y / speed) * maxSpeed;
    }
    
    // Integrate position
    a.group.position.x += a.v.x;
    a.group.position.y += a.v.y;
    
    // Floor collision
    if (a.group.position.y - a.r < floorY) {
      a.group.position.y = floorY + a.r;
      if (a.v.y < 0) a.v.y *= -FLOOR_BOUNCE;
      a.v.x *= 0.97;
    }
    
    // Side wall collisions
    if (a.group.position.x - a.r < leftWall) {
      a.group.position.x = leftWall + a.r;
      if (a.v.x < 0) a.v.x *= -FLOOR_BOUNCE;
    }
    if (a.group.position.x + a.r > rightWall) {
      a.group.position.x = rightWall - a.r;
      if (a.v.x > 0) a.v.x *= -FLOOR_BOUNCE;
    }
  }
  
  // --- Collision resolution (position-only, no impulse explosions) ---
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const dx = a.group.position.x - b.group.position.x;
        const dy = a.group.position.y - b.group.position.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.r + b.r;
        
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          
          // Mass-weighted push-apart
          const massA = a.r * a.r;
          const massB = b.r * b.r;
          const total = massA + massB;
          const pushA = a.dragging ? 0 : (b.dragging ? 1 : massB / total);
          const pushB = b.dragging ? 0 : (a.dragging ? 1 : massA / total);
          
          const push = overlap * SEPARATION_STRENGTH;
          a.group.position.x += nx * push * pushA;
          a.group.position.y += ny * push * pushA;
          b.group.position.x -= nx * push * pushB;
          b.group.position.y -= ny * push * pushB;
          
          // Transfer real velocity on collision
          if (a.dragging && !b.dragging) {
            // Dragged bubble hitting b — give b the dragged bubble's speed along collision normal
            const hitSpeed = Math.abs(a.v.x * nx + a.v.y * ny);
            const kick = Math.max(hitSpeed * 0.6, overlap * 0.05);
            b.v.x -= nx * kick;
            b.v.y -= ny * kick;
          } else if (b.dragging && !a.dragging) {
            const hitSpeed = Math.abs(b.v.x * nx + b.v.y * ny);
            const kick = Math.max(hitSpeed * 0.6, overlap * 0.05);
            a.v.x += nx * kick;
            a.v.y += ny * kick;
          } else {
            // Normal bubble-to-bubble: transfer momentum
            const nudge = overlap * 0.12;
            if (!a.dragging) {
              a.v.x += nx * nudge;
              a.v.y += ny * nudge;
            }
            if (!b.dragging) {
              b.v.x -= nx * nudge;
              b.v.y -= ny * nudge;
            }
          }
        }
      }
    }
  }
  
  state.globe.renderer.render(state.globe.scene, state.globe.camera);
}

function resizeGlobe() {
  if (!state.globe) return;
  const b = globeMount.getBoundingClientRect();
  const aspect = b.width / Math.max(1, b.height);
  const viewHeight = state.globe.distance;
  const viewWidth = viewHeight * aspect;
  
  state.globe.camera.left = -viewWidth / 2;
  state.globe.camera.right = viewWidth / 2;
  state.globe.camera.top = viewHeight / 2;
  state.globe.camera.bottom = -viewHeight / 2;
  state.globe.camera.updateProjectionMatrix();
  state.globe.renderer.setSize(b.width, b.height);
}

function onGlobeWheel(e) {
  e.preventDefault();
  state.globe.distance = Math.min(200, Math.max(15, state.globe.distance + Math.sign(e.deltaY) * 2));
  resizeGlobe();
}

function pickGlobe(e) {
  const rect = globeMount.getBoundingClientRect();
  state.globe.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  state.globe.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  state.globe.raycaster.setFromCamera(state.globe.pointer, state.globe.camera);
  const hits = state.globe.raycaster.intersectObjects(state.globe.territories, true);
  return hits.find(hit => hit.object.userData.token)?.object.userData.token || null;
}

function onGlobeMove(e) {
  if (!state.globe) return;
  const rect = globeMount.getBoundingClientRect();
  state.globe.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  state.globe.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  if (state.globe.draggingItem) {
    const vec = new THREE.Vector3(state.globe.pointer.x, state.globe.pointer.y, 0);
    vec.unproject(state.globe.camera);
    state.globe.draggingItem.v.x = (vec.x - state.globe.draggingItem.group.position.x) * 0.4;
    state.globe.draggingItem.v.y = (vec.y - state.globe.draggingItem.group.position.y) * 0.4;
    state.globe.draggingItem.group.position.x = vec.x;
    state.globe.draggingItem.group.position.y = vec.y;
    state.globe.moved = true;
  } else if (state.globe.draggingCamera) {
    const dx = e.clientX - state.globe.lastX;
    const dy = e.clientY - state.globe.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.globe.moved = true;
    
    const v1 = new THREE.Vector3(0, 0, 0).unproject(state.globe.camera);
    const v2 = new THREE.Vector3(dx / rect.width * 2, -dy / rect.height * 2, 0).unproject(state.globe.camera);
    state.globe.camera.position.x -= (v2.x - v1.x);
    state.globe.camera.position.y -= (v2.y - v1.y);
  }
  
  state.globe.lastX = e.clientX;
  state.globe.lastY = e.clientY;
  showHover(pickGlobe(e), e.clientX, e.clientY);
}

function onGlobeClick(e) {
  if (state.globe.moved) return;
  const token = pickGlobe(e);
  if (token) selectToken(token);
}

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
    <button class="close" aria-label="Close">✕</button>
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
    if (state.globe) {
      state.globe.distance = 50;
      state.globe.camera.position.set(0, 0, 10);
    }
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
      // Starting a pinch — record world-space anchor at current midpoint
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

  // rAF flag — ensures drawCanvas fires at most once per animation frame
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
      // 2→1 finger: reset pan origin to remaining finger so there's no jump
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

  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return; // handled by touch events
    state.view.dragging = true;
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
    if (Math.abs(e.clientX - state.view.lastX) > 3 || Math.abs(e.clientY - state.view.lastY) > 3) return;
    const hit = canvasHit(e.clientX, e.clientY);
    if (hit) selectToken(hit.token);
  });
  window.addEventListener('resize', render);
}

function render() {
  statusEl.textContent = `${visibleTokens().length}/${state.tokens.length} tokens`;
  const isCanvas = state.mode === 'canvas';
  canvas.hidden = !isCanvas;
  globeMount.hidden = isCanvas;
  if (isCanvas) {
    invalidateCanvasCache(); // data/filter/metric changed — rebuild offscreen on next draw
    drawCanvas();
  } else {
    rebuildGlobe();
    requestAnimationFrame(() => state.globe?.renderer.render(state.globe.scene, state.globe.camera));
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



