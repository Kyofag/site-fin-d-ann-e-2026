// ── ÉTAT GLOBAL ───────────────────────────────────────────────
const S = {
  tab: 'games',
  price: null,       // 'free' | 'paid' | null
  platform: null,    // 'web' | 'download' | null
  tags: [],
  sort: 'popular',
  search: '',
  page: 1,
  perPage: 20,
  items: [],
};

const GAME_TAGS = [
  'roguelike','rpg','platformer','puzzle','horror','action',
  'adventure','simulation','strategy','metroidvania','visual-novel',
  'arcade','survival','multiplayer','pixel-art','2d','3d',
  'fighting','shooter','indie'
];

const ASSET_TAGS = [
  'tileset','16x16','32x32','fantasy','sci-fi','medieval',
  'nature','dungeon','top-down','platformer','rpg','pixel-art',
  'isometric','modern','space'
];

// ── CONSTRUCTION URL RSS ──────────────────────────────────────
function buildRssUrl() {
  let parts = [];

  if (S.tab === 'games') {
    let base = 'https://itch.io/games';

    if (S.price === 'free')  parts.push('price-free');
    if (S.price === 'paid')  parts.push('price-paid');

    if (S.platform === 'web') parts.push('platform-web');

    // L'API RSS ne supporte qu'un seul tag à la fois
    if (S.tags.length > 0) parts.push('tag-' + S.tags[0]);

    if (S.sort === 'new')       parts.push('newest');
    if (S.sort === 'top_rated') parts.push('top-rated');

    const path = parts.length ? '/' + parts.join('/') : '';
    return base + path + '.xml';

  } else {
    let base = 'https://itch.io/game-assets';

    if (S.price === 'free') parts.push('free');
    if (S.price === 'paid') parts.push('paid');

    // Tag tileset toujours présent pour cette section
    const tagList = ['tileset', ...S.tags.filter(t => t !== 'tileset')];
    parts.push('tag-' + tagList[0]);

    if (S.sort === 'new')       parts.push('newest');
    if (S.sort === 'top_rated') parts.push('top-rated');

    const path = parts.length ? '/' + parts.join('/') : '';
    return base + path + '.xml';
  }
}

// ── FETCH RSS ─────────────────────────────────────────────────
async function fetchRss(url) {
  // corsproxy.io pour contourner les restrictions CORS du navigateur
  const proxy = 'https://corsproxy.io/?' + encodeURIComponent(url);
  const res = await fetch(proxy);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

// ── PARSING RSS ───────────────────────────────────────────────
function parseRss(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = Array.from(doc.querySelectorAll('item'));

  return items.map(item => {
    const title = item.querySelector('title')?.textContent || '';
    const link  = item.querySelector('link')?.textContent || '';
    const desc  = item.querySelector('description')?.textContent || '';
    const thumb = item.querySelector('thumbnail')?.getAttribute('url') || '';

    // Extraire image depuis la description HTML si pas de thumbnail
    let cover = thumb;
    if (!cover) {
      const match = desc.match(/src="([^"]+\.(jpg|png|gif|webp))"/i);
      if (match) cover = match[1];
    }

    // Extraire auteur depuis l'URL (format : auteur.itch.io/jeu)
    const urlParts = link.replace('https://', '').split('/');
    const author = urlParts[0]?.replace('.itch.io', '') || '';

    // Extraire prix depuis la description
    let price = 'free';
    let priceLabel = 'GRATUIT';
    const priceMatch = desc.match(/\$([0-9]+(?:\.[0-9]{2})?)/);
    if (priceMatch) {
      price = 'paid';
      priceLabel = priceMatch[1] + ' $';
    }

    // Détecter plateforme navigateur
    const hasWeb = desc.toLowerCase().includes('browser') || desc.toLowerCase().includes('html5');

    return { title, link, cover, author, price, priceLabel, hasWeb };
  });
}

// ── CHARGEMENT ────────────────────────────────────────────────
async function loadResults() {
  S.sort = document.getElementById('sortSelect').value;
  S.page = 1;
  showSkeleton();
  renderPills();

  try {
    const url = buildRssUrl();
    const xml = await fetchRss(url);
    S.items = parseRss(xml);

    // Filtrage côté client par recherche
    if (S.search.trim()) {
      const q = S.search.toLowerCase();
      S.items = S.items.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.author.toLowerCase().includes(q)
      );
    }

    // Filtrage côté client par prix (pour s'assurer que le résultat est exact)
    if (S.price === 'free') {
      S.items = S.items.filter(i => i.price === 'free');
    } else if (S.price === 'paid') {
      S.items = S.items.filter(i => i.price === 'paid');
    }

    renderGrid();
  } catch(e) {
    console.error(e);
    showError();
  }
}

// ── RENDU GRILLE ──────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('grid');

  if (S.items.length === 0) {
    grid.innerHTML = `
      <div class="state">
        <div class="state-emoji">🔍</div>
        <div class="state-title">Aucun résultat</div>
        <div class="state-sub">Essaie de modifier tes filtres ou ta recherche</div>
      </div>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  const start = (S.page - 1) * S.perPage;
  const paged = S.items.slice(start, start + S.perPage);

  grid.innerHTML = paged.map(item => {
    const coverHtml = item.cover
      ? `<img class="card-cover" src="${item.cover}" alt="${item.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholder = `<div class="card-cover-placeholder" ${item.cover ? 'style="display:none"' : ''}>${S.tab === 'games' ? '🎮' : '🗺️'}</div>`;

    const badges = item.hasWeb ? `<span class="card-badge badge-web">Web</span>` : '';

    return `
      <a class="card" href="${item.link}" target="_blank" rel="noopener">
        ${coverHtml}${placeholder}
        <div class="card-body">
          <div class="card-title" title="${item.title}">${item.title}</div>
          <div class="card-author">${item.author || '—'}</div>
          <div class="card-foot">
            <span class="card-price ${item.price === 'free' ? 'price-free' : 'price-paid'}">${item.priceLabel}</span>
            <div class="card-tags">${badges}</div>
          </div>
        </div>
      </a>`;
  }).join('');

  renderPagination();
}

// ── PAGINATION ────────────────────────────────────────────────
function renderPagination() {
  const pg = document.getElementById('pagination');
  const total = Math.ceil(S.items.length / S.perPage);
  if (total <= 1) { pg.innerHTML = ''; return; }

  let html = `<button class="pg-btn" onclick="goPage(${S.page - 1})" ${S.page === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - S.page) <= 2) {
      html += `<button class="pg-btn ${i === S.page ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    } else if (Math.abs(i - S.page) === 3) {
      html += `<span class="pg-dots">…</span>`;
    }
  }
  html += `<button class="pg-btn" onclick="goPage(${S.page + 1})" ${S.page === total ? 'disabled' : ''}>›</button>`;
  pg.innerHTML = html;
}

function goPage(p) {
  S.page = p;
  renderGrid();
  window.scrollTo(0, 130);
}

// ── SIDEBAR ───────────────────────────────────────────────────
function renderSidebar() {
  const tags = S.tab === 'games' ? GAME_TAGS : ASSET_TAGS;
  const sb = document.getElementById('sidebar');

  const priceSection = `
    <div class="filter-group">
      <div class="section-title">Prix</div>
      <button class="filter-btn f-free ${S.price === 'free' ? 'active' : ''}" onclick="setFilter('price','free')">
        <span class="dot dot-green"></span> Gratuit
      </button>
      <button class="filter-btn f-paid ${S.price === 'paid' ? 'active' : ''}" onclick="setFilter('price','paid')">
        <span class="dot dot-amber"></span> Payant
      </button>
    </div>`;

  const platformSection = S.tab === 'games' ? `
    <div class="filter-group">
      <div class="section-title">Plateforme</div>
      <button class="filter-btn f-web ${S.platform === 'web' ? 'active' : ''}" onclick="setFilter('platform','web')">
        <span class="dot dot-blue"></span> Navigateur
      </button>
    </div>` : '';

  const tagsSection = `
    <div class="filter-group">
      <div class="section-title">Tags</div>
      <div class="tags-wrap">
        ${tags.map(t => `
          <div class="tag-btn ${S.tags.includes(t) ? 'active' : ''}" onclick="toggleTag('${t}')">${t}</div>
        `).join('')}
      </div>
    </div>`;

  sb.innerHTML = priceSection + platformSection + tagsSection;
}

// ── FILTRES ───────────────────────────────────────────────────
function setFilter(key, val) {
  S[key] = S[key] === val ? null : val;
  renderSidebar();
  loadResults();
}

function toggleTag(tag) {
  const i = S.tags.indexOf(tag);
  if (i > -1) S.tags.splice(i, 1);
  else S.tags = [tag]; // un seul tag à la fois (limite de l'API RSS)
  renderSidebar();
  loadResults();
}

// ── PILLS FILTRES ACTIFS ──────────────────────────────────────
function renderPills() {
  const wrap = document.getElementById('activePills');
  const pills = [];

  if (S.price)    pills.push({ label: S.price === 'free' ? 'Gratuit' : 'Payant', key: 'price' });
  if (S.platform) pills.push({ label: S.platform === 'web' ? 'Navigateur' : 'À télécharger', key: 'platform' });
  S.tags.forEach(t => pills.push({ label: t, key: 'tag', val: t }));

  if (pills.length === 0) {
    wrap.innerHTML = `<span style="font-size:13px;color:var(--muted)">Tous les ${S.tab === 'games' ? 'jeux' : 'tilesets'}</span>`;
    return;
  }

  wrap.innerHTML = pills.map(p => `
    <div class="active-pill">
      ${p.label}
      <button onclick="${p.key === 'tag' ? `toggleTag('${p.val}')` : `setFilter('${p.key}', null)`}">✕</button>
    </div>`).join('');
}

// ── TABS ──────────────────────────────────────────────────────
function switchTab(tab) {
  S.tab = tab;
  S.price = null;
  S.platform = null;
  S.tags = [];
  S.page = 1;
  document.getElementById('tab-games').classList.toggle('active', tab === 'games');
  document.getElementById('tab-assets').classList.toggle('active', tab === 'assets');
  renderSidebar();
  loadResults();
}

// ── RECHERCHE ─────────────────────────────────────────────────
function doSearch() {
  S.search = document.getElementById('searchInput').value.trim();
  S.page = 1;
  loadResults();
}

document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});

// ── ÉTATS VISUELS ─────────────────────────────────────────────
function showSkeleton() {
  document.getElementById('grid').innerHTML = Array(12).fill(`
    <div class="skeleton">
      <div class="skel-img"></div>
      <div class="skel-body">
        <div class="skel-line" style="width:75%"></div>
        <div class="skel-line" style="width:45%"></div>
      </div>
    </div>`).join('');
  document.getElementById('pagination').innerHTML = '';
}

function showError() {
  document.getElementById('grid').innerHTML = `
    <div class="state">
      <div class="state-emoji">⚠️</div>
      <div class="state-title">Erreur de chargement</div>
      <div class="state-sub">Impossible de récupérer les données depuis itch.io. Réessaie dans un moment.</div>
    </div>`;
}

// ── INIT ──────────────────────────────────────────────────────
renderSidebar();
renderPills();
loadResults();
