// ═══════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════
const API         = 'https://pokeapi.co/api/v2';
const SPR_ART     = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
const SPR_DEFAULT = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const SMOGON_SETS = 'https://pkmn.github.io/smogon/data/sets/';

const GEN_RANGES = {
  0:[1,1025],1:[1,151],2:[152,251],3:[252,386],
  4:[387,493],5:[494,649],6:[650,721],7:[722,809],
  8:[810,905],9:[906,1025]
};

// Noms FR des types
const TYPE_FR = {
  normal:'Normal', fire:'Feu', water:'Eau', electric:'Électrik',
  grass:'Plante', ice:'Glace', fighting:'Combat', poison:'Poison',
  ground:'Sol', flying:'Vol', psychic:'Psy', bug:'Insecte',
  rock:'Roche', ghost:'Spectre', dragon:'Dragon', dark:'Ténèbres',
  steel:'Acier', fairy:'Fée'
};

const TYPE_COLORS = {
  normal:'#A8A878', fire:'#F08030', water:'#6890F0', electric:'#F8D030',
  grass:'#78C850', ice:'#98D8D8', fighting:'#C03028', poison:'#A040A0',
  ground:'#E0C068', flying:'#A890F0', psychic:'#F85888', bug:'#A8B820',
  rock:'#B8A038', ghost:'#705898', dragon:'#7038F8', dark:'#705848',
  steel:'#B8B8D0', fairy:'#EE99AC'
};

const TYPE_CHART = {
  normal:   {rock:.5,ghost:0,steel:.5},
  fire:     {fire:.5,water:.5,grass:2,ice:2,bug:2,rock:.5,dragon:.5,steel:2},
  water:    {fire:2,water:.5,grass:.5,ground:2,rock:2,dragon:.5},
  electric: {water:2,electric:.5,grass:.5,ground:0,flying:2,dragon:.5},
  grass:    {fire:.5,water:2,grass:.5,poison:.5,ground:2,flying:.5,bug:.5,rock:2,dragon:.5,steel:.5},
  ice:      {water:.5,grass:2,ice:.5,ground:2,flying:2,dragon:2,steel:.5},
  fighting: {normal:2,ice:2,poison:.5,flying:.5,psychic:.5,bug:.5,rock:2,ghost:0,dark:2,steel:2,fairy:.5},
  poison:   {grass:2,poison:.5,ground:.5,rock:.5,ghost:.5,steel:0,fairy:2},
  ground:   {fire:2,electric:2,grass:.5,poison:2,flying:0,bug:.5,rock:2,steel:2},
  flying:   {electric:.5,grass:2,fighting:2,bug:2,rock:.5,steel:.5},
  psychic:  {fighting:2,poison:2,psychic:.5,dark:0,steel:.5},
  bug:      {fire:.5,grass:2,fighting:.5,flying:.5,psychic:2,ghost:.5,dark:2,steel:.5,fairy:.5},
  rock:     {fire:2,ice:2,fighting:.5,ground:.5,flying:2,bug:2,steel:.5},
  ghost:    {normal:0,psychic:2,ghost:2,dark:.5},
  dragon:   {dragon:2,steel:.5,fairy:0},
  dark:     {fighting:.5,psychic:2,ghost:2,dark:.5,fairy:.5},
  steel:    {fire:.5,water:.5,electric:.5,ice:2,rock:2,steel:.5,fairy:2},
  fairy:    {fire:.5,fighting:2,poison:.5,dragon:2,dark:2,steel:.5}
};

const TYPES = Object.keys(TYPE_COLORS);

// Noms FR des stats
const STAT_FR = {
  hp:'PV', attack:'Att', defense:'Déf',
  'special-attack':'Att.Sp', 'special-defense':'Déf.Sp', speed:'Vit'
};
const STAT_COLORS = {
  hp:'#e74c3c', attack:'#e67e22', 'special-attack':'#9b59b6',
  defense:'#3498db', 'special-defense':'#1abc9c', speed:'#f1c40f'
};

// Noms FR des méthodes d'apprentissage
const METHOD_FR = {
  'level-up':'Niveau', 'machine':'CT/CS', 'tutor':'Donneur',
  'egg':'Œuf', 'stadium-surfing-pikachu':'Spécial',
  'light-ball-egg':'Spécial', 'colosseum-purification':'Purification',
  'xd-shadow':'Ombre', 'xd-purification':'Purification',
  'form-change':'Forme', 'zygarde-cube':'Cube Zygarde'
};

// Catégories FR
const CAT_FR = { physical:'Physique', special:'Spéciale', status:'Statut' };

// ═══════════════════════════════════════════════
// FETCH THROTTLÉ
// ═══════════════════════════════════════════════
const _cache = {};
const _queue = { running:0, max:3, pending:[] };

function _drain() {
  while (_queue.running < _queue.max && _queue.pending.length > 0) {
    const {fn,resolve,reject} = _queue.pending.shift();
    _queue.running++;
    fn().then(v=>{_queue.running--;resolve(v);_drain();})
        .catch(e=>{_queue.running--;reject(e);_drain();});
  }
}

function apiFetch(url, retries=4) {
  if (_cache[url]) return Promise.resolve(_cache[url]);
  return new Promise((resolve,reject) => {
    _queue.pending.push({ resolve, reject, fn: async () => {
      for (let i=0; i<retries; i++) {
        try {
          const r = await fetch(url);
          if (r.status===429||r.status>=500) { await sleep(800*(i+1)); continue; }
          if (!r.ok) throw new Error('HTTP '+r.status);
          const d = await r.json();
          _cache[url] = d;
          return d;
        } catch(e) {
          if (i===retries-1) throw e;
          await sleep(600*(i+1));
        }
      }
    }});
    _drain();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════
// ÉTAT GLOBAL
// ═══════════════════════════════════════════════
let allPokemon       = [];   // {id, name, url}
let filteredPokemon  = [];
let currentPage      = 1;
const PER_PAGE       = 40;

// Cache des types par id Pokémon — clé du filtre temps réel
const typeCache      = {};   // { id: ['water','flying'] }

let activeType1      = '';   // filtre type 1 pokédex
let activeType2      = '';   // filtre type 2 pokédex
let movesTypeFilter  = '';   // filtre type capacités
let typeCardObserver = null;

let movesData        = [];
let filteredMoves    = [];
let movesPage        = 1;
let movesSortKey     = 'name';
let movesSortAsc     = true;

let abilitiesData    = [];
let filteredAbilities= [];
let abilitiesPage    = 1;

let cmpData          = [null, null];
let teamData         = new Array(6).fill(null);

let activeFormFilter = 'all'; // all | base | mega | gmax | regional
let formVariants     = [];    // Pokémon mega/gmax/régionaux ajoutés dynamiquement
let currentModalId   = null;
let currentModalShiny = false;
let currentModalSprites = { normal:'', shiny:'' };

// Noms FR persistés en localStorage entre sessions
const STORAGE_NAMES = 'pokedex_names_fr_v1';
const STORAGE_TYPES = 'pokedex_types_v1';
const STORAGE_THEME = 'pokedex_theme';

let nameFRCache = {};
try { nameFRCache = JSON.parse(localStorage.getItem(STORAGE_NAMES) || '{}'); } catch(e) {}

// Charger le cache types depuis localStorage
try {
  const cached = JSON.parse(localStorage.getItem(STORAGE_TYPES) || '{}');
  Object.assign(typeCache, cached);
} catch(e) {}

// ═══════════════════════════════════════════════
// THÈME CLAIR/SOMBRE
// ═══════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.textContent = theme === 'light' ? '☀️' : '🌙';
  try { localStorage.setItem(STORAGE_THEME, theme); } catch(e) {}
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Appliquer le thème sauvegardé avant toute requête réseau
(function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem(STORAGE_THEME) || 'dark'; } catch(e) {}
  applyTheme(saved);
})();

// Sauvegarde périodique des caches en localStorage
function persistCaches() {
  try {
    localStorage.setItem(STORAGE_NAMES, JSON.stringify(nameFRCache));
    localStorage.setItem(STORAGE_TYPES, JSON.stringify(typeCache));
  } catch(e) {}
}
setInterval(persistCaches, 8000);
window.addEventListener('beforeunload', persistCaches);

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function init() {
  try {
    const data = await apiFetch(`${API}/pokemon?limit=1025&offset=0`);
    allPokemon = data.results.map((p,i) => ({...p, id:i+1}));
    filteredPokemon = [...allPokemon];

    buildTypeButtons();
    renderPokedex();
    renderTeamDisplay();
    hideLoader();

    // Précharger types + noms FR en arrière-plan
    preloadPokemonData();
    preloadFormVariants();
  } catch(e) {
    console.error('Init failed:', e);
    document.getElementById('loading-overlay').innerHTML =
      '<div style="color:#e74c3c;font-family:Rajdhani,sans-serif;font-size:1.2rem;letter-spacing:2px">Erreur — recharge la page</div>';
  }
}

function hideLoader() {
  const el = document.getElementById('loading-overlay');
  el.style.opacity = '0';
  setTimeout(() => el.style.display='none', 500);
}

// Précharge types ET noms FR de tous les Pokémon
async function preloadPokemonData() {
  const BATCH = 18;
  for (let i=0; i<allPokemon.length; i+=BATCH) {
    const batch = allPokemon.slice(i, i+BATCH);
    await Promise.allSettled(batch.map(async p => {
      // Types
      if (!typeCache[p.id]) {
        try {
          const d = await apiFetch(p.url);
          typeCache[p.id] = d.types.map(t => t.type.name);
        } catch(e) {}
      }
      // Nom FR
      if (!nameFRCache[p.id]) {
        try {
          const sp = await apiFetch(`${API}/pokemon-species/${p.id}`);
          const fr = sp.names?.find(n => n.language.name === 'fr')?.name;
          if (fr) nameFRCache[p.id] = fr;
        } catch(e) {}
      }
    }));
    // Re-render visible cards si on est sur le pokédex pour afficher les noms FR fraîchement chargés
    if (document.getElementById('page-pokedex').classList.contains('active')) {
      updateVisibleCardNames();
    }
    await sleep(40);
  }
  persistCaches();
}

function updateVisibleCardNames() {
  document.querySelectorAll('.poke-card[data-id]').forEach(card => {
    const id = parseInt(card.dataset.id);
    const nameEl = card.querySelector('.poke-name');
    if (nameEl && nameFRCache[id]) nameEl.textContent = nameFRCache[id];
    const typesEl = card.querySelector('.poke-types');
    if (typesEl && typesEl.innerHTML === '' && typeCache[id]) {
      typesEl.innerHTML = typeCache[id].map(t => typeBadge(t)).join('');
    }
  });
}

// Découvre les formes spéciales (mega, gmax, régionales) en scannant les species
async function preloadFormVariants() {
  await sleep(500); // laisser preloadPokemonData prendre l'avantage
  const BATCH = 10;
  // On scanne par batches d'IDs de species (1 à 1025)
  for (let id=1; id<=1025; id+=BATCH) {
    const batch = [];
    for (let k=0; k<BATCH && id+k<=1025; k++) batch.push(id+k);
    await Promise.allSettled(batch.map(async sid => {
      try {
        const sp = await apiFetch(`${API}/pokemon-species/${sid}`);
        const varieties = sp.varieties || [];
        for (const v of varieties) {
          const formName = v.pokemon.name;
          if (formName === sp.name) continue; // forme de base, ignorée
          const formId = parseInt(v.pokemon.url.split('/').slice(-2,-1)[0]);
          let kind = null;
          if (formName.includes('-mega'))                          kind = 'mega';
          else if (formName.includes('-gmax'))                     kind = 'gmax';
          else if (/-alola|-galar|-hisui|-paldea/.test(formName))  kind = 'regional';
          if (!kind) continue;

          // Nom FR du Pokémon de base + suffixe
          const baseFR = sp.names?.find(n=>n.language.name==='fr')?.name || cap(sp.name);
          let suffix = '';
          if (kind === 'mega') {
            if (formName.endsWith('-mega-x')) suffix = ' Méga X';
            else if (formName.endsWith('-mega-y')) suffix = ' Méga Y';
            else suffix = ' Méga';
            suffix = ' (Méga' + (formName.endsWith('-mega-x')?' X':formName.endsWith('-mega-y')?' Y':'') + ')';
          } else if (kind === 'gmax') {
            suffix = ' (Gigamax)';
          } else if (kind === 'regional') {
            if (formName.includes('-alola'))  suffix = " (Forme d'Alola)";
            if (formName.includes('-galar'))  suffix = ' (Forme de Galar)';
            if (formName.includes('-hisui'))  suffix = ' (Forme de Hisui)';
            if (formName.includes('-paldea')) suffix = ' (Forme de Paldea)';
          }
          nameFRCache[formId] = baseFR + suffix;

          formVariants.push({
            id: formId,
            name: formName,
            url: v.pokemon.url,
            kind,
            baseId: sid
          });
        }
      } catch(e) {}
    }));
    await sleep(30);
  }
  persistCaches();
}

// ═══════════════════════════════════════════════
// BOUTONS DE TYPE
// ═══════════════════════════════════════════════
function buildTypeButtons() {
  // Pokédex type 1
  const b1 = document.getElementById('typeBtns1');
  b1.innerHTML = `<span class="type-pill clear-btn" onclick="setTypeFilter(1,'')">Tous</span>`
    + TYPES.map(t => `
      <span class="type-pill" id="tp1-${t}"
        style="background:${TYPE_COLORS[t]}22;border-color:${TYPE_COLORS[t]}55;color:${TYPE_COLORS[t]}"
        onclick="setTypeFilter(1,'${t}')">${TYPE_FR[t]}</span>`).join('');

  // Pokédex type 2
  const b2 = document.getElementById('typeBtns2');
  b2.innerHTML = `<span class="type-pill clear-btn" onclick="setTypeFilter(2,'')">Tous</span>`
    + TYPES.map(t => `
      <span class="type-pill" id="tp2-${t}"
        style="background:${TYPE_COLORS[t]}22;border-color:${TYPE_COLORS[t]}55;color:${TYPE_COLORS[t]}"
        onclick="setTypeFilter(2,'${t}')">${TYPE_FR[t]}</span>`).join('');

  // Capacités type
  const bm = document.getElementById('movesTypeBtns');
  bm.innerHTML = `<span class="type-pill clear-btn" onclick="setMovesType('')">Tous</span>`
    + TYPES.map(t => `
      <span class="type-pill" id="mtp-${t}"
        style="background:${TYPE_COLORS[t]}22;border-color:${TYPE_COLORS[t]}55;color:${TYPE_COLORS[t]}"
        onclick="setMovesType('${t}')">${TYPE_FR[t]}</span>`).join('');
}

function setTypeFilter(slot, type) {
  if (slot===1) { activeType1 = type; updateTypePills(1); }
  else          { activeType2 = type; updateTypePills(2); }
  currentPage = 1;
  applyTypeFilter();
}

function updateTypePills(slot) {
  const active = slot===1 ? activeType1 : activeType2;
  TYPES.forEach(t => {
    const el = document.getElementById(`tp${slot}-${t}`);
    if (!el) return;
    if (t === active) {
      el.style.background = TYPE_COLORS[t]+'aa';
      el.style.borderColor = TYPE_COLORS[t];
      el.style.color = '#fff';
      el.style.boxShadow = `0 0 10px ${TYPE_COLORS[t]}60`;
    } else {
      el.style.background = TYPE_COLORS[t]+'22';
      el.style.borderColor = TYPE_COLORS[t]+'55';
      el.style.color = TYPE_COLORS[t];
      el.style.boxShadow = '';
    }
  });
}

function setMovesType(type) {
  movesTypeFilter = type;
  TYPES.forEach(t => {
    const el = document.getElementById('mtp-'+t);
    if (!el) return;
    if (t === type) {
      el.style.background = TYPE_COLORS[t]+'aa';
      el.style.borderColor = TYPE_COLORS[t];
      el.style.color = '#fff';
      el.style.boxShadow = `0 0 10px ${TYPE_COLORS[t]}60`;
    } else {
      el.style.background = TYPE_COLORS[t]+'22';
      el.style.borderColor = TYPE_COLORS[t]+'55';
      el.style.color = TYPE_COLORS[t];
      el.style.boxShadow = '';
    }
  });
  filterMoves();
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  const map = {pokedex:0,types:1,compare:2,team:3,moves:4,abilities:5,jukebox:6};
  document.querySelectorAll('.nav-tab')[map[id]].classList.add('active');
  if (id==='types'     && !document.getElementById('typeSelector').innerHTML) initTypeCalc();
  if (id==='moves'     && movesData.length===0) loadMoves();
  if (id==='abilities' && abilitiesData.length===0) loadAbilities();
  if (id==='jukebox'   && !audioEl) initJukebox();
}

// ═══════════════════════════════════════════════
// POKÉDEX — filtres combinés (génération, recherche, type 1/2, formes)
// ═══════════════════════════════════════════════
function filterPokedex() {
  currentPage = 1;
  applyTypeFilter();
}

function setFormFilter(form) {
  activeFormFilter = form;
  document.querySelectorAll('.form-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.form === form);
  });
  currentPage = 1;
  applyTypeFilter();
}

function resetFilters() {
  // Réinitialiser tous les états de filtre
  activeType1 = '';
  activeType2 = '';
  activeFormFilter = 'all';
  currentPage = 1;

  // Reset des champs UI
  document.getElementById('mainSearch').value = '';
  document.getElementById('genFilter').value = '0';

  // Reset visuel des boutons de type
  updateTypePills(1);
  updateTypePills(2);

  // Reset visuel des boutons de forme
  document.querySelectorAll('.form-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.form === 'all');
  });

  applyTypeFilter();
}

function getPokemonPool() {
  // Selon le filtre formes, on construit le pool de départ
  if (activeFormFilter === 'all')      return [...allPokemon, ...formVariants];
  if (activeFormFilter === 'base')     return [...allPokemon];
  return formVariants.filter(v => v.kind === activeFormFilter);
}

function applyTypeFilter() {
  const q   = document.getElementById('mainSearch').value.toLowerCase().trim();
  const gen = parseInt(document.getElementById('genFilter').value);
  const [mn,mx] = GEN_RANGES[gen];

  const pool = getPokemonPool();

  filteredPokemon = pool.filter(p => {
    // Pour les formes, on utilise baseId pour le filtre génération
    const checkId = p.baseId || p.id;
    if (checkId < mn || checkId > mx) return false;

    // Recherche : nom anglais, français ou ID
    if (q) {
      const enName = p.name.toLowerCase();
      const frName = (nameFRCache[p.id] || '').toLowerCase();
      if (!enName.includes(q) && !frName.includes(q) && !String(p.id).includes(q))
        return false;
    }

    // Filtre type — strict si les types sont en cache
    if (activeType1 || activeType2) {
      const types = typeCache[p.id];
      if (!types) {
        // Types pas encore chargés : on inclut, ils seront filtrés au rendu
        return true;
      }
      if (activeType1 && !types.includes(activeType1)) return false;
      if (activeType2 && !types.includes(activeType2)) return false;
    }
    return true;
  });

  renderPokedex();
}

function renderPokedex() {
  const grid  = document.getElementById('pokedexGrid');
  const total = Math.ceil(filteredPokemon.length / PER_PAGE);
  const slice = filteredPokemon.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE);

  if (typeCardObserver) typeCardObserver.disconnect();

  if (slice.length===0) {
    grid.innerHTML = `<div class="empty-state"><span>🔍</span><div>Aucun Pokémon trouvé</div></div>`;
    document.getElementById('pokedexPagination').innerHTML = '';
    return;
  }

  grid.innerHTML = slice.map(p => {
    const typesHtml = typeCache[p.id]
      ? typeCache[p.id].map(t => typeBadge(t)).join('')
      : '';
    const displayName = nameFRCache[p.id] || p.name.replace(/-/g,' ');
    return `
      <div class="poke-card" onclick="openModal(${p.id})"
           data-url="${p.url}" data-id="${p.id}">
        <div class="poke-num">#${String(p.id).padStart(4,'0')}</div>
        <img class="poke-sprite"
             src="${SPR_DEFAULT}${p.id}.png"
             onerror="this.src='${SPR_ART}${p.id}.png'"
             alt="${p.name}" loading="lazy">
        <div class="poke-name">${displayName}</div>
        <div class="poke-types" id="pt-${p.id}">${typesHtml}</div>
      </div>`;
  }).join('');

  // Observer pour charger les types des cartes pas encore en cache
  // Note: on évite de re-render à chaque carte pour ne pas créer de boucle infinie
  // — on masque juste la carte non-conforme, et on debounce le re-filtrage global
  let refilterTimer = null;
  const scheduleRefilter = () => {
    if (!(activeType1 || activeType2)) return;
    clearTimeout(refilterTimer);
    refilterTimer = setTimeout(() => applyTypeFilter(), 400);
  };

  typeCardObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      const pid  = parseInt(card.dataset.id);
      typeCardObserver.unobserve(card);

      const checkAndMaybeHide = () => {
        if (!(activeType1 || activeType2)) return;
        const types = typeCache[pid];
        if (!types) return;
        const ok = (!activeType1 || types.includes(activeType1))
                && (!activeType2 || types.includes(activeType2));
        if (!ok) {
          card.style.display = 'none';
          scheduleRefilter();
        }
      };

      if (typeCache[pid]) {
        checkAndMaybeHide();
        return;
      }

      apiFetch(card.dataset.url).then(d => {
        typeCache[pid] = d.types.map(t => t.type.name);
        const el = document.getElementById('pt-'+pid);
        if (el) el.innerHTML = typeCache[pid].map(t => typeBadge(t)).join('');
        checkAndMaybeHide();
      }).catch(()=>{});
    });
  }, {rootMargin:'120px'});

  grid.querySelectorAll('.poke-card').forEach(c => {
    if (!typeCache[parseInt(c.dataset.id)]) typeCardObserver.observe(c);
  });

  renderPagination('pokedexPagination', currentPage, total, pg => {
    currentPage = pg; renderPokedex(); window.scrollTo(0,128);
  });
}

// ═══════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════
async function openModal(id) {
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  currentModalId = id;
  currentModalShiny = false;
  document.getElementById('shinyToggle')?.classList.remove('active');

  document.getElementById('modalSprite').src = `${SPR_ART}${id}.png`;
  document.getElementById('modalNum').textContent = `#${String(id).padStart(4,'0')}`;
  document.getElementById('modalName').textContent = '…';
  document.getElementById('modalTypes').innerHTML = '';
  document.getElementById('modalInfo').innerHTML = '';
  document.getElementById('modalStats').innerHTML = '<div style="color:var(--text3);font-size:13px">Chargement…</div>';
  document.getElementById('statTotal').textContent = '0';
  ['evolutions','moves','smogon','forms'].forEach(t =>
    document.getElementById('mtab-'+t).innerHTML = '<div style="padding:2rem;color:var(--text3)">Chargement…</div>');
  document.querySelectorAll('.modal-tab').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.querySelectorAll('.modal-tab-content').forEach((c,i)=>c.classList.toggle('active',i===0));

  try {
    const [poke, species] = await Promise.all([
      apiFetch(`${API}/pokemon/${id}`),
      apiFetch(`${API}/pokemon-species/${id}`).catch(()=>null)
    ]);

    // Stocker les deux sprites (normal et shiny) depuis poke.sprites
    const artNorm  = poke.sprites?.other?.['official-artwork']?.front_default || `${SPR_ART}${id}.png`;
    const artShiny = poke.sprites?.other?.['official-artwork']?.front_shiny   || poke.sprites?.front_shiny || `${SPR_ART}shiny/${id}.png`;
    currentModalSprites = { normal: artNorm, shiny: artShiny };
    document.getElementById('modalSprite').src = artNorm;

    // Nom FR depuis species
    const nameFR = species?.names?.find(n=>n.language.name==='fr')?.name
                || species?.names?.find(n=>n.language.name==='en')?.name
                || cap(poke.name);
    nameFRCache[id] = nameFR;
    document.getElementById('modalName').textContent = nameFR;

    const types = poke.types.map(t=>t.type.name);
    typeCache[id] = types;
    document.getElementById('modalTypes').innerHTML = types.map(t=>typeBadge(t,'large')).join('');

    // Talents avec noms FR
    const abilitiesHtml = await Promise.all(
      poke.abilities.map(async a => {
        try {
          const d = await apiFetch(a.ability.url);
          return d.names?.find(n=>n.language.name==='fr')?.name || cap(a.ability.name.replace(/-/g,' '));
        } catch(e) {
          return cap(a.ability.name.replace(/-/g,' '));
        }
      })
    );

    const flav = species?.flavor_text_entries?.find(f=>f.language.name==='fr')?.flavor_text
              || species?.flavor_text_entries?.find(f=>f.language.name==='en')?.flavor_text
              || '—';

    // Catégorie FR
    const genus = species?.genera?.find(g=>g.language.name==='fr')?.genus
               || species?.genera?.find(g=>g.language.name==='en')?.genus
               || '';

    document.getElementById('modalInfo').innerHTML = `
      <div class="info-box"><div class="info-label">Taille</div><div class="info-val">${(poke.height/10).toFixed(1)} m</div></div>
      <div class="info-box"><div class="info-label">Poids</div><div class="info-val">${(poke.weight/10).toFixed(1)} kg</div></div>
      ${genus ? `<div class="info-box" style="grid-column:1/-1"><div class="info-label">Catégorie</div><div class="info-val">${genus}</div></div>` : ''}
      <div class="info-box" style="grid-column:1/-1">
        <div class="info-label">Talents</div>
        <div class="info-val">${abilitiesHtml.join(', ')}</div>
      </div>
      <div class="info-box" style="grid-column:1/-1">
        <div class="info-label">Description</div>
        <div class="info-val" style="font-size:12px;font-weight:400;color:var(--text2);line-height:1.5">
          ${flav.replace(/\f/g,' ')}
        </div>
      </div>`;

    const total = poke.stats.reduce((s,st)=>s+st.base_stat,0);
    document.getElementById('statTotal').textContent = total;
    document.getElementById('modalStats').innerHTML = poke.stats.map(st => {
      const col   = STAT_COLORS[st.stat.name]||'#fff';
      const pct   = Math.min(100,(st.base_stat/255)*100);
      const label = STAT_FR[st.stat.name]||st.stat.name;
      return `<div class="stat-row">
        <div class="stat-name">${label}</div>
        <div class="stat-val">${st.base_stat}</div>
        <div class="stat-bar-bg"><div class="stat-bar" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
    }).join('');

    if (species?.evolution_chain?.url) loadEvolutions(species.evolution_chain.url, id);
    else document.getElementById('mtab-evolutions').innerHTML =
      '<div style="padding:2rem;color:var(--text3)">Pas de chaîne d\'évolution.</div>';

    loadModalMoves(poke.moves);
    loadSmogon(poke.name, types);
    loadForms(species, poke.name);

  } catch(e) {
    console.error(e);
    document.getElementById('modalName').textContent = 'Erreur';
  }
}

function closeModal(e) {
  if (e && e.target!==document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function toggleShiny() {
  currentModalShiny = !currentModalShiny;
  const btn = document.getElementById('shinyToggle');
  btn.classList.toggle('active', currentModalShiny);
  const img = document.getElementById('modalSprite');
  img.src = currentModalShiny ? currentModalSprites.shiny : currentModalSprites.normal;
}

function switchModalTab(name) {
  document.querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-content').forEach(c=>c.classList.remove('active'));
  const idx = ['evolutions','moves','smogon','forms'].indexOf(name);
  document.querySelectorAll('.modal-tab')[idx].classList.add('active');
  document.getElementById('mtab-'+name).classList.add('active');
}

// ── Évolutions (arbre branché) ──
async function loadEvolutions(url, currentId) {
  try {
    const chain = await apiFetch(url);

    function buildTree(node) {
      const id = parseInt(node.species.url.split('/').slice(-2,-1)[0]);
      const children = node.evolves_to.map(child => {
        const d = child.evolution_details[0];
        let trig = '';
        if (d) {
          if (d.min_level)                    trig = `Niv. ${d.min_level}`;
          else if (d.item)                    trig = cap(d.item.name.replace(/-/g,' '));
          else if (d.trigger?.name==='trade') trig = 'Échange';
          else if (d.min_happiness)           trig = 'Amitié';
          else if (d.held_item)               trig = `Tient ${cap(d.held_item.name.replace(/-/g,' '))}`;
          else if (d.known_move)              trig = `Connaît ${cap(d.known_move.name.replace(/-/g,' '))}`;
          else if (d.location)                trig = cap(d.location.name.replace(/-/g,' '));
          else if (d.time_of_day)             trig = d.time_of_day==='day'?'Jour':'Nuit';
          else                                trig = cap((d.trigger?.name||'').replace(/-/g,' '));
        }
        return { trigger: trig, tree: buildTree(child) };
      });
      return { id, name: node.species.name, children };
    }

    const tree = buildTree(chain.chain);

    if (tree.children.length === 0) {
      document.getElementById('mtab-evolutions').innerHTML =
        '<div style="padding:2rem;color:var(--text3)">Ce Pokémon n\'évolue pas.</div>';
      return;
    }

    function renderNode(node) {
      const isCurrent = String(node.id) === String(currentId);
      return `<div class="evo-mon" onclick="closeModal();openModal(${node.id})">
        <img src="${SPR_DEFAULT}${node.id}.png" onerror="this.src='${SPR_ART}${node.id}.png'" alt="${node.name}">
        <div class="evo-name">${nameFRCache[node.id] || cap(node.name)}</div>
        ${isCurrent ? '<div style="width:6px;height:6px;border-radius:50%;background:var(--teal2);margin:0 auto"></div>' : ''}
      </div>`;
    }

    function renderArrow(trigger) {
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:60px">
        <div class="evo-arrow">→</div>
        <div class="evo-trigger">${trigger || ''}</div>
      </div>`;
    }

    function renderTree(node) {
      if (node.children.length === 0) return renderNode(node);

      if (node.children.length === 1) {
        // Branche unique : ligne horizontale
        const child = node.children[0];
        return `${renderNode(node)}${renderArrow(child.trigger)}${renderTree(child.tree)}`;
      }

      // Plusieurs évolutions : on empile les branches verticalement à droite du parent
      const branchesHtml = node.children.map(child => `
        <div class="evo-branch-line">
          ${renderArrow(child.trigger)}
          ${renderTree(child.tree)}
        </div>
      `).join('');

      return `${renderNode(node)}<div class="evo-branch-group">${branchesHtml}</div>`;
    }

    const html = `<div class="evo-tree"><div class="evo-stage">${renderTree(tree)}</div></div>`;
    document.getElementById('mtab-evolutions').innerHTML = html;

  } catch(e) {
    console.error(e);
    document.getElementById('mtab-evolutions').innerHTML =
      '<div style="padding:2rem;color:var(--text3)">Impossible de charger les évolutions.</div>';
  }
}

// ── Capacités du modal avec noms FR ──
async function loadModalMoves(moves) {
  const sorted = moves.map(m => {
    const d = m.version_group_details.find(x=>x.move_learn_method.name==='level-up')
           || m.version_group_details[0];
    return {name:m.move.name, url:m.move.url, level:d?.level_learned_at||0, method:d?.move_learn_method.name||'—'};
  }).sort((a,b)=>a.level-b.level);

  // Affichage rapide sans noms FR
  const renderTable = (rows) => {
    document.getElementById('mtab-moves').innerHTML = `
      <div style="overflow-x:auto">
        <table class="moves-table">
          <thead><tr><th>Niv.</th><th>Capacité</th><th>Type</th><th>Méthode</th></tr></thead>
          <tbody>${rows.map(m=>`
            <tr>
              <td style="font-family:'Share Tech Mono',monospace;color:var(--gold2)">${m.level||'—'}</td>
              <td>${m.nameFR||cap(m.name.replace(/-/g,' '))}</td>
              <td>${m.type?typeBadge(m.type,'small'):'—'}</td>
              <td style="font-size:11px;color:var(--text3)">${METHOD_FR[m.method]||cap(m.method.replace(/-/g,' '))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  };

  const top = sorted.slice(0,80);
  renderTable(top);

  // Charger les détails (type + nom FR) par batch
  const BATCH = 10;
  for (let i=0; i<top.length; i+=BATCH) {
    await Promise.allSettled(top.slice(i,i+BATCH).map(async (m,j) => {
      try {
        const d = await apiFetch(m.url);
        top[i+j].nameFR = d.names?.find(n=>n.language.name==='fr')?.name
                        || d.names?.find(n=>n.language.name==='en')?.name
                        || cap(m.name.replace(/-/g,' '));
        top[i+j].type = d.type?.name;
      } catch(e) {}
    }));
    renderTable(top);
    await sleep(30);
  }
}

// ── Formes ──
function loadForms(species, currentName) {
  const forms = (species?.varieties||[]).filter(v=>v.pokemon.name!==currentName);
  if (!forms.length) {
    document.getElementById('mtab-forms').innerHTML =
      '<div style="padding:2rem;color:var(--text3)">Aucune forme alternative.</div>';
    return;
  }
  const ids = forms.map(f=>f.pokemon.url.split('/').slice(-2,-1)[0]);
  document.getElementById('mtab-forms').innerHTML =
    `<div style="display:flex;flex-wrap:wrap;gap:1rem;padding-bottom:1rem">
      ${ids.map(fid=>`
        <div class="evo-mon" onclick="closeModal();openModal(${fid})">
          <img src="${SPR_DEFAULT}${fid}.png" onerror="this.src='${SPR_ART}${fid}.png'">
          <div class="evo-name">${nameFRCache[fid]||'#'+fid}</div>
        </div>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════
// SMOGON
// ═══════════════════════════════════════════════
const TIER_INFO = {
  Uber:{ label:'Uber',       cls:'tier-Uber', desc:'Trop forts pour l\'OU. Légendaires dominants.' },
  OU:  { label:'Overused',   cls:'tier-OU',   desc:'Tier principal. Utilisés dans >4.52% des équipes.' },
  UUBL:{ label:'UU Banlist', cls:'tier-UU',   desc:'Trop forts pour l\'UU.' },
  UU:  { label:'Underused',  cls:'tier-UU',   desc:'Tier secondaire, méta varié.' },
  RUBL:{ label:'RU Banlist', cls:'tier-RU',   desc:'Trop forts pour le RU.' },
  RU:  { label:'RarelyUsed', cls:'tier-RU',   desc:'Peu vus en OU/UU mais compétitifs.' },
  NUBL:{ label:'NU Banlist', cls:'tier-NU',   desc:'Trop forts pour le NU.' },
  NU:  { label:'NeverUsed',  cls:'tier-NU',   desc:'Rarement utilisés en compétitif.' },
  PUBL:{ label:'PU Banlist', cls:'tier-PU',   desc:'Trop forts pour le PU.' },
  PU:  { label:'PU',         cls:'tier-PU',   desc:'Tier le plus bas officiel.' },
  LC:  { label:'Little Cup', cls:'tier-LC',   desc:'1er stade, niveau 5 max.' },
};

const STRAT_PROFILES = {
  fire:'Offensif puissant. Couvre Acier, Glace, Plante, Insecte. Faible à Eau, Sol, Roche.',
  water:'Polyvalent. Bonnes résistances (Feu, Eau, Glace, Acier). Faible à Électrik, Plante.',
  grass:'Support/contrôle. Contre Eau, Sol, Roche. Nombreuses faiblesses (Feu, Insecte, Poison…).',
  electric:'Top offensif spécial. Seule faiblesse : Sol. Thunderbolt parmi les meilleures attaques.',
  psychic:'Fort en early-game. Faible à Ténèbres, Spectre, Insecte.',
  dragon:'Très offensif. Faible à Glace, Fée, Dragon. Dragon Danse = setup incontournable.',
  dark:'Immunité Psy. Bon cleaner late game ou en Trick Room.',
  steel:'Meilleur type défensif (10 résistances). Pivot, hazard setter ou tank.',
  fairy:'Immunité Dragon. Neutralise Ténèbres/Combat. Faible à Poison, Acier.',
  ghost:'Double immunité (Normal, Combat). Bloque Rapid Spin. Bon offensivement.',
  fighting:'Large couverture offensive. Contre Normal, Acier, Roche, Glace, Ténèbres.',
  rock:'Stealth Rock disponible. Couvre Feu, Insecte, Vol, Glace. Beaucoup de faiblesses.',
  ground:'Immunité Électrik. Excellent offensivement. Faible à Eau, Plante, Glace.',
  ice:'Fort offensivement (Dragon, Sol, Vol, Plante). Défensivement très fragile.',
  poison:'Bon contre Plante/Fée. Toxic Spikes setter ou pivot.',
  bug:'U-turn/Pivot. Peu utilisé mais utile comme lead ou scout.',
  flying:'Immunité Sol. Defog. Faible à Électrik, Roche, Glace.',
  normal:'Pas d\'immunités. Movepool gigantesque. Support/stall efficace.',
};

async function loadSmogon(name, types) {
  const container = document.getElementById('mtab-smogon');
  let html = `
    <div style="margin-bottom:1.5rem">
      <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:.75rem">Explication des tiers</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1rem">
        ${Object.entries(TIER_INFO).map(([,v])=>
          `<span class="tier-badge ${v.cls}" title="${v.desc}" style="cursor:help">${v.label}</span>`
        ).join('')}
      </div>
      <div class="tier-card" style="font-size:12px;color:var(--text2);line-height:1.7">
        Les tiers Smogon classifient les Pokémon selon leur taux d'utilisation.
        Un Pokémon monte dès qu'il dépasse <span style="color:var(--gold2)">4.52%</span> d'utilisation
        au palier Elo 1695. Un <em>Banlist</em> signifie trop fort pour son tier sans atteindre le tier supérieur.
      </div>
    </div>
    <div style="margin-bottom:1.5rem">
      <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:.75rem">Profil stratégique</div>
      <div class="tier-card"><div class="smogon-desc">
        ${types.map(t=>STRAT_PROFILES[t]).filter(Boolean).join('<br><br>')||'Profil non disponible.'}
      </div></div>
    </div>`;
  container.innerHTML = html;

  try {
    const setsData = await apiFetch(`${SMOGON_SETS}gen9ou.json`);
    const key = Object.keys(setsData).find(k=>
      k.toLowerCase()===name.toLowerCase()||
      k.toLowerCase().replace(/[^a-z]/g,'')=== name.toLowerCase().replace(/[^a-z]/g,'')
    );
    if (key&&setsData[key]) {
      let setsHtml = `<div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:.75rem">Sets Gen 9 OU</div>`;
      Object.entries(setsData[key]).forEach(([setName,set]) => {
        const item    = Array.isArray(set.item)?set.item.join(' / '):(set.item||'');
        const ability = Array.isArray(set.ability)?set.ability.join(' / '):(set.ability||'');
        const nature  = Array.isArray(set.nature)?set.nature.join(' / '):(set.nature||'');
        const mvs     = (set.moves||[]).map(m=>Array.isArray(m)?m.join(' / '):m);
        setsHtml += `<div class="tier-card">
          <div style="font-family:'Rajdhani',sans-serif;font-weight:700;color:var(--gold2);margin-bottom:.5rem">${setName}</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text2);line-height:2">
            ${item    ?`<div>@ ${item}</div>`:''}
            ${ability ?`<div>Talent : ${ability}</div>`:''}
            ${nature  ?`<div>Nature : ${nature}</div>`:''}
            ${mvs.length?`<div style="margin-top:.3rem">${mvs.map(m=>`<div>– ${m}</div>`).join('')}</div>`:''}
          </div>
        </div>`;
      });
      container.innerHTML += setsHtml;
    } else {
      container.innerHTML += `<div class="tier-card" style="font-size:13px;color:var(--text3)">Aucun set Gen 9 OU. Ce Pokémon est probablement dans un autre tier.</div>`;
    }
  } catch(e) {
    container.innerHTML += `<div class="tier-card" style="font-size:13px;color:var(--text3)">Données Smogon indisponibles.</div>`;
  }
}

// ═══════════════════════════════════════════════
// CALCULATEUR DE TYPES
// ═══════════════════════════════════════════════
let selectedTypes = [];
let typeMode = 'defensive'; // 'defensive' | 'offensive'

function initTypeCalc() {
  document.getElementById('typeSelector').innerHTML = TYPES.map(t=>`
    <button class="type-select-btn" id="tsbtn-${t}"
      style="border-color:${TYPE_COLORS[t]}40;color:${TYPE_COLORS[t]}"
      onclick="toggleTypeSelect('${t}')">${TYPE_FR[t]}</button>`).join('');
  renderTypeTable();
}

function setTypeMode(mode) {
  typeMode = mode;
  document.getElementById('mode-def').classList.toggle('active', mode === 'defensive');
  document.getElementById('mode-atk').classList.toggle('active', mode === 'offensive');

  const label = document.getElementById('typeModeLabel');
  const hint = document.getElementById('typeModeHint');
  if (mode === 'defensive') {
    label.textContent = 'Type(s) du Pokémon défenseur :';
    hint.textContent = 'Sélectionner 1 ou 2 types (le défenseur peut avoir un type double)';
  } else {
    label.textContent = 'Type de l\'attaque :';
    hint.textContent = 'Sélectionner 1 seul type d\'attaque (les attaques n\'ont qu\'un type)';
    // En offensive on garde un seul type
    if (selectedTypes.length > 1) selectedTypes = [selectedTypes[0]];
    refreshTypeButtons();
  }
  renderTypeResult();
}

function refreshTypeButtons() {
  TYPES.forEach(tp => {
    const btn = document.getElementById('tsbtn-'+tp);
    if (!btn) return;
    const sel = selectedTypes.includes(tp);
    btn.style.background  = sel?TYPE_COLORS[tp]+'30':'';
    btn.style.borderColor = sel?TYPE_COLORS[tp]:TYPE_COLORS[tp]+'40';
    btn.style.boxShadow   = sel?`0 0 10px ${TYPE_COLORS[tp]}50`:'';
  });
}

function toggleTypeSelect(t) {
  if (typeMode === 'offensive') {
    // En offensive, un seul type : on remplace ou on désélectionne
    selectedTypes = selectedTypes.includes(t) ? [] : [t];
  } else {
    selectedTypes = selectedTypes.includes(t)
      ? selectedTypes.filter(x=>x!==t)
      : selectedTypes.length<2 ? [...selectedTypes,t] : [selectedTypes[1],t];
  }
  refreshTypeButtons();
  renderTypeResult();
}

function renderTypeResult() {
  const c = document.getElementById('typeResult');
  if (!selectedTypes.length){c.innerHTML='';return;}

  const eff = {};
  if (typeMode === 'defensive') {
    // Mode défense : pour chaque type attaquant, multiplier les eff sur les types défenseurs
    TYPES.forEach(atk => {
      let m = 1;
      selectedTypes.forEach(def => { m *= (TYPE_CHART[atk]?.[def] ?? 1); });
      eff[atk] = m;
    });
  } else {
    // Mode offensive : un seul type attaquant, on regarde ce qu'il fait contre chaque type défenseur
    const atk = selectedTypes[0];
    TYPES.forEach(def => {
      eff[def] = TYPE_CHART[atk]?.[def] ?? 1;
    });
  }

  const groups={'4x':[],'2x':[],'1x':[],'0.5x':[],'0.25x':[],'0x':[]};
  Object.entries(eff).forEach(([t,m])=>{
    const k=m===4?'4x':m===2?'2x':m===1?'1x':m===.5?'0.5x':m===.25?'0.25x':'0x';
    groups[k].push(t);
  });
  const clsMap={'4x':'mult-4x','2x':'mult-2x','1x':'mult-1x','0.5x':'mult-05x','0.25x':'mult-025x','0x':'mult-0x'};
  // Labels dépendent du mode
  const lblDef={'4x':'×4 Faiblesse','2x':'×2 Faiblesse','1x':'×1 Neutre','0.5x':'×½ Résistance','0.25x':'×¼ Résistance','0x':'×0 Immunité'};
  const lblAtk={'4x':'×4 Super efficace','2x':'×2 Super efficace','1x':'×1 Neutre','0.5x':'×½ Peu efficace','0.25x':'×¼ Peu efficace','0x':'×0 Aucun effet'};
  const lblMap = typeMode === 'defensive' ? lblDef : lblAtk;

  const header = typeMode === 'defensive'
    ? `Défense : ${selectedTypes.map(t=>`<span style="color:${TYPE_COLORS[t]}">${TYPE_FR[t]}</span>`).join(' / ')}`
    : `Attaque de type : <span style="color:${TYPE_COLORS[selectedTypes[0]]}">${TYPE_FR[selectedTypes[0]]}</span>`;

  c.innerHTML = `
    <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1rem;letter-spacing:1px;color:var(--text);margin-bottom:1rem">
      ${header}
    </div>
    ${Object.entries(groups).filter(([,a])=>a.length).map(([m,ts])=>`
      <div class="matchup-row">
        <div style="display:flex;flex-wrap:wrap;gap:4px">${ts.map(t=>typeBadge(t)).join('')}</div>
        <span class="matchup-mult ${clsMap[m]}">${lblMap[m]}</span>
      </div>`).join('')}`;
}

function renderTypeTable() {
  // Version grid plus aérée
  const cells = [];
  // Coin haut-gauche
  cells.push(`<div class="type-cell corner">ATK ↓<br>DEF →</div>`);
  // Headers colonnes (types défenseurs en haut)
  TYPES.forEach(t => {
    cells.push(`<div class="type-cell header-col" style="color:${TYPE_COLORS[t]};background:${TYPE_COLORS[t]}15">${TYPE_FR[t]}</div>`);
  });
  // Lignes : type attaquant + 18 cellules d'efficacité
  TYPES.forEach(atk => {
    cells.push(`<div class="type-cell header-row" style="color:${TYPE_COLORS[atk]};background:${TYPE_COLORS[atk]}15">${TYPE_FR[atk]}</div>`);
    TYPES.forEach(def => {
      const m = TYPE_CHART[atk]?.[def] ?? 1;
      let bg, color, txt;
      if (m === 4)      { bg='rgba(231,76,60,.5)';   color='#fff';     txt='4×'; }
      else if (m === 2) { bg='rgba(231,76,60,.3)';   color='#e74c3c';  txt='2×'; }
      else if (m === 1) { bg='transparent';          color='var(--text3)'; txt='—'; }
      else if (m === .5){ bg='rgba(26,188,156,.2)';  color='#1abc9c';  txt='½'; }
      else if (m === .25){bg='rgba(26,188,156,.35)'; color='#27ae60';  txt='¼'; }
      else              { bg='rgba(52,73,94,.6)';    color='#fff';     txt='0'; }
      cells.push(`<div class="type-cell" style="background:${bg};color:${color}" title="${TYPE_FR[atk]} → ${TYPE_FR[def]} : ${m}×">${txt}</div>`);
    });
  });
  document.getElementById('typeTable').innerHTML =
    `<div style="overflow-x:auto"><div class="type-grid-table">${cells.join('')}</div></div>`;
}

// ═══════════════════════════════════════════════
// COMPARATEUR
// ═══════════════════════════════════════════════
const _cmpT=[null,null];
function suggestCompare(slot) {
  clearTimeout(_cmpT[slot-1]);
  const val=document.getElementById(`cmp${slot}Input`).value.trim().toLowerCase();
  const el=document.getElementById(`cmp${slot}Suggestions`);
  if(val.length<2){el.innerHTML='';return;}
  _cmpT[slot-1]=setTimeout(()=>{
    const hits=allPokemon.filter(p=>p.name.includes(val)||String(p.id)===val).slice(0,8);
    el.innerHTML=hits.length
      ?`<div class="suggest-wrap">${hits.map(p=>`<button class="suggest-btn" onclick="loadCompare(${slot},${p.id})">${nameFRCache[p.id]||p.name}</button>`).join('')}</div>`
      :'';
  },300);
}

async function loadCompare(slot,id) {
  document.getElementById(`cmp${slot}Suggestions`).innerHTML='';
  try {
    const poke=await apiFetch(`${API}/pokemon/${id}`);
    cmpData[slot-1]=poke;
    const types=poke.types.map(t=>t.type.name);
    document.getElementById(`cmp${slot}Card`).innerHTML=`
      <img class="compare-sprite" src="${SPR_ART}${id}.png" onerror="this.src='${SPR_DEFAULT}${id}.png'" alt="${poke.name}">
      <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.2rem;text-transform:capitalize">${nameFRCache[id]||cap(poke.name)}</div>
      <div style="display:flex;gap:6px">${types.map(t=>typeBadge(t)).join('')}</div>`;
    if(cmpData[0]&&cmpData[1]) renderCompareStats();
  } catch(e){console.error(e);}
}

function renderCompareStats() {
  const [a,b]=cmpData;
  const keys=['hp','attack','defense','special-attack','special-defense','speed'];
  const aS={};a.stats.forEach(s=>aS[s.stat.name]=s.base_stat);
  const bS={};b.stats.forEach(s=>bS[s.stat.name]=s.base_stat);
  document.getElementById('compareStats').innerHTML=`
    <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:1rem;text-align:center">Comparaison des statistiques</div>
    ${keys.map(k=>{
      const av=aS[k]||0,bv=bS[k]||0;
      const col=STAT_COLORS[k]||'#fff';
      return `<div style="display:grid;grid-template-columns:1fr auto auto auto 1fr;gap:8px;align-items:center;margin-bottom:8px">
        <div style="text-align:right"><div style="height:6px;background:${col};border-radius:3px;width:${(av/255*100).toFixed(1)}%;margin-left:auto;opacity:.7"></div></div>
        <div class="cmp-val ${av>bv?'winner':av<bv?'loser':''}">${av}</div>
        <div class="cmp-label">${STAT_FR[k]||k}</div>
        <div class="cmp-val ${bv>av?'winner':bv<av?'loser':''}">${bv}</div>
        <div><div style="height:6px;background:${col};border-radius:3px;width:${(bv/255*100).toFixed(1)}%;opacity:.7"></div></div>
      </div>`;
    }).join('')}
    <div style="display:grid;grid-template-columns:1fr auto auto auto 1fr;gap:8px;align-items:center;margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem">
      <div></div>
      <div class="cmp-val ${a.stats.reduce((s,x)=>s+x.base_stat,0)>=b.stats.reduce((s,x)=>s+x.base_stat,0)?'winner':'loser'}" style="font-size:1rem">${a.stats.reduce((s,x)=>s+x.base_stat,0)}</div>
      <div class="cmp-label">TOTAL</div>
      <div class="cmp-val ${b.stats.reduce((s,x)=>s+x.base_stat,0)>=a.stats.reduce((s,x)=>s+x.base_stat,0)?'winner':'loser'}" style="font-size:1rem">${b.stats.reduce((s,x)=>s+x.base_stat,0)}</div>
      <div></div>
    </div>`;
}

// ═══════════════════════════════════════════════
// TEAM BUILDER
// ═══════════════════════════════════════════════
function renderTeamDisplay() {
  document.getElementById('teamDisplay').innerHTML=teamData.map((p,i)=>`
    <div class="team-slot">
      ${p
        ?`<img src="${SPR_DEFAULT}${p.id}.png" onerror="this.src='${SPR_ART}${p.id}.png'"
               alt="${p.name}" onclick="openModal(${p.id})" style="cursor:pointer">
           <div class="team-slot-name">${nameFRCache[p.id]||p.name.replace(/-/g,' ')}</div>
           <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text3)">#${String(p.id).padStart(3,'0')}</div>
           <button class="btn-small" onclick="teamData[${i}]=null;renderTeamDisplay()">✕ Retirer</button>`
        :`<div style="color:var(--text3);font-family:'Rajdhani',sans-serif;letter-spacing:2px;font-size:.75rem;text-transform:uppercase">Slot ${i+1}</div>`
      }
    </div>`).join('');
}

async function generateTeam() {
  const gen=parseInt(document.getElementById('teamGen').value);
  const [mn,mx]=GEN_RANGES[gen];
  let pool=allPokemon.filter(p=>p.id>=mn&&p.id<=mx);
  if(pool.length<6) pool=allPokemon;
  teamData=pool.sort(()=>Math.random()-.5).slice(0,6);
  renderTeamDisplay();
  const typeCount={};
  for(const p of teamData) {
    try{const d=await apiFetch(`${API}/pokemon/${p.id}`);d.types.forEach(t=>{typeCount[t.type.name]=(typeCount[t.type.name]||0)+1;});}catch(e){}
  }
  if(Object.keys(typeCount).length) {
    document.getElementById('teamTypeChart').innerHTML=`
      <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-top:1.5rem;margin-bottom:1rem">Couverture de types</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`
          <div style="display:flex;align-items:center;gap:6px;background:${TYPE_COLORS[t]}20;border:1px solid ${TYPE_COLORS[t]}40;border-radius:20px;padding:4px 12px">
            ${typeBadge(t)}
            <span style="font-family:'Share Tech Mono',monospace;font-size:11px;color:${TYPE_COLORS[t]}">×${c}</span>
          </div>`).join('')}
      </div>`;
  }
}

function clearTeam() {
  teamData=new Array(6).fill(null);
  renderTeamDisplay();
  document.getElementById('teamTypeChart').innerHTML='';
}

// ═══════════════════════════════════════════════
// CAPACITÉS
// ═══════════════════════════════════════════════
async function loadMoves() {
  document.getElementById('movesBody').innerHTML=
    '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text3)">Chargement…</td></tr>';
  try {
    const list=await apiFetch(`${API}/move?limit=850&offset=0`);
    movesData=list.results.slice(0,250).map(m=>({
      name:m.name,url:m.url,nameFR:null,
      power:null,accuracy:null,pp:null,type:null,category:null,effect:null
    }));
    filteredMoves=[...movesData];
    renderMoves();
    loadMovesDetails();
  } catch(e) {
    document.getElementById('movesBody').innerHTML=
      '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ruby2)">Erreur de chargement</td></tr>';
  }
}

async function loadMovesDetails() {
  const BATCH=10;
  for(let i=0;i<movesData.length;i+=BATCH) {
    await Promise.allSettled(movesData.slice(i,i+BATCH).map(async(m,j)=>{
      try {
        const d=await apiFetch(m.url);
        const nameFR=d.names?.find(n=>n.language.name==='fr')?.name
                   ||d.names?.find(n=>n.language.name==='en')?.name
                   ||cap(m.name.replace(/-/g,' '));
        const effect=d.effect_entries?.find(e=>e.language.name==='fr')?.short_effect
                   ||d.effect_entries?.find(e=>e.language.name==='en')?.short_effect
                   ||'—';
        movesData[i+j]={...movesData[i+j],nameFR,power:d.power,accuracy:d.accuracy,pp:d.pp,
          type:d.type?.name,category:d.damage_class?.name,effect};
      } catch(e){}
    }));
    filteredMoves=applyMovesFilter();
    renderMoves();
    await sleep(50);
  }
}

function applyMovesFilter() {
  const q=document.getElementById('movesSearch').value.toLowerCase();
  const cat=document.getElementById('movesCatFilter').value;
  return movesData.filter(m=>
    (!q||m.name.includes(q)||(m.nameFR||'').toLowerCase().includes(q))&&
    (!movesTypeFilter||m.type===movesTypeFilter)&&
    (!cat||m.category===cat)
  );
}

function filterMoves(){filteredMoves=applyMovesFilter();movesPage=1;renderMoves();}

function sortMoves(key){
  movesSortAsc=movesSortKey===key?!movesSortAsc:true;
  movesSortKey=key;
  filteredMoves.sort((a,b)=>{
    const av=a[key]??-1,bv=b[key]??-1;
    if(typeof av==='string') return movesSortAsc?av.localeCompare(bv):bv.localeCompare(av);
    return movesSortAsc?av-bv:bv-av;
  });
  renderMoves();
}

function renderMoves(){
  const slice=filteredMoves.slice((movesPage-1)*50,movesPage*50);
  document.getElementById('movesBody').innerHTML=slice.map(m=>`
    <tr>
      <td style="font-family:'Rajdhani',sans-serif;font-weight:600">${m.nameFR||cap(m.name.replace(/-/g,' '))}</td>
      <td>${m.type?typeBadge(m.type,'small'):'—'}</td>
      <td class="cat-${m.category}">${m.category?CAT_FR[m.category]||cap(m.category):'—'}</td>
      <td style="font-family:'Share Tech Mono',monospace;text-align:center;color:var(--gold2)">${m.power||'—'}</td>
      <td style="font-family:'Share Tech Mono',monospace;text-align:center">${m.accuracy!=null?m.accuracy+'%':'—'}</td>
      <td style="font-family:'Share Tech Mono',monospace;text-align:center">${m.pp||'—'}</td>
      <td style="font-size:11px;max-width:200px">${m.effect||'…'}</td>
    </tr>`).join('');
  renderPagination('movesPagination',movesPage,Math.ceil(filteredMoves.length/50),pg=>{movesPage=pg;renderMoves();});
}

// ═══════════════════════════════════════════════
// TALENTS
// ═══════════════════════════════════════════════
async function loadAbilities(){
  document.getElementById('abilitiesList').innerHTML=
    '<div style="color:var(--text3);padding:2rem">Chargement…</div>';
  try{
    const list=await apiFetch(`${API}/ability?limit=400&offset=0`);
    abilitiesData=list.results.map(a=>({name:a.name,url:a.url,nameFR:null,desc:null}));
    filteredAbilities=[...abilitiesData];
    renderAbilities();
    loadAbilitiesDetails();
  }catch(e){}
}

async function loadAbilitiesDetails(){
  const BATCH=15;
  for(let i=0;i<abilitiesData.length;i+=BATCH){
    await Promise.allSettled(abilitiesData.slice(i,i+BATCH).map(async(a,j)=>{
      try{
        const d=await apiFetch(a.url);
        abilitiesData[i+j].nameFR=d.names?.find(n=>n.language.name==='fr')?.name||cap(a.name.replace(/-/g,' '));
        abilitiesData[i+j].desc=
          d.flavor_text_entries?.find(e=>e.language.name==='fr')?.flavor_text
          ||d.effect_entries?.find(e=>e.language.name==='fr')?.short_effect
          ||d.effect_entries?.find(e=>e.language.name==='en')?.short_effect
          ||'—';
      }catch(e){}
    }));
    filteredAbilities=applyAbilitiesFilter();
    renderAbilities();
    await sleep(50);
  }
}

function applyAbilitiesFilter(){
  const q=document.getElementById('abilitiesSearch').value.toLowerCase();
  return abilitiesData.filter(a=>!q||a.name.includes(q)||(a.nameFR||'').toLowerCase().includes(q)||(a.desc||'').toLowerCase().includes(q));
}
function filterAbilities(){filteredAbilities=applyAbilitiesFilter();abilitiesPage=1;renderAbilities();}

function renderAbilities(){
  const slice=filteredAbilities.slice((abilitiesPage-1)*30,abilitiesPage*30);
  document.getElementById('abilitiesList').innerHTML=slice.map(a=>`
    <div class="ability-card">
      <div class="ability-name">${a.nameFR||cap(a.name.replace(/-/g,' '))}</div>
      <div class="ability-desc">${a.desc||'Chargement…'}</div>
    </div>`).join('');
  renderPagination('abilitiesPagination',abilitiesPage,Math.ceil(filteredAbilities.length/30),pg=>{abilitiesPage=pg;renderAbilities();});
}

// ═══════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════
const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : '';

function typeBadge(type, size='') {
  const col=TYPE_COLORS[type]||'#888';
  const fs=size==='large'?'12px':size==='small'?'9px':'10px';
  const pad=size==='large'?'3px 12px':'2px 7px';
  return `<span class="type-badge" style="background:${col}25;border:1px solid ${col}60;color:${col};font-size:${fs};padding:${pad}">${TYPE_FR[type]||cap(type)}</span>`;
}

function renderPagination(containerId,current,total,onPage){
  const el=document.getElementById(containerId);
  if(!el||total<=1){if(el)el.innerHTML='';return;}
  let html=`<button class="pg-btn" onclick="(${onPage.toString()})(${current-1})" ${current===1?'disabled':''}>‹</button>`;
  for(let i=1;i<=total;i++){
    if(i===1||i===total||Math.abs(i-current)<=1)
      html+=`<button class="pg-btn ${i===current?'active':''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
    else if(Math.abs(i-current)===2)
      html+=`<span style="color:var(--text3);padding:0 4px">…</span>`;
  }
  html+=`<button class="pg-btn" onclick="(${onPage.toString()})(${current+1})" ${current===total?'disabled':''}>›</button>`;
  el.innerHTML=html;
}

document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

// ═══════════════════════════════════════════════
// JUKEBOX
// ═══════════════════════════════════════════════
// La playlist est définie dans index.html via les balises <source> dans #trackList
// Pour ajouter/modifier/supprimer une piste : éditer l'HTML, pas ce fichier.
let PLAYLIST = [];

function loadPlaylistFromHTML() {
  PLAYLIST = Array.from(document.querySelectorAll('#trackList source')).map(el => ({
    file: el.dataset.file,
    title: el.dataset.title || el.dataset.file.split('/').pop()
  }));
}

let currentTrackIdx = -1;
let isShuffle = false;
let isLoop = false;
let audioEl = null;

function initJukebox() {
  audioEl = document.getElementById('audioPlayer');
  if (!audioEl) return;

  // Charger la playlist depuis les balises <source> de l'HTML
  loadPlaylistFromHTML();

  // Volume initial
  audioEl.volume = 0.7;

  // Events audio
  audioEl.addEventListener('timeupdate', updateProgress);
  audioEl.addEventListener('loadedmetadata', () => {
    document.getElementById('timeTotal').textContent = formatTime(audioEl.duration);
  });
  audioEl.addEventListener('ended', () => {
    if (isLoop) { audioEl.currentTime = 0; audioEl.play(); }
    else nextTrack();
  });
  audioEl.addEventListener('play', () => {
    document.getElementById('playBtn').textContent = '⏸';
    document.getElementById('playerVinyl').classList.add('spinning');
  });
  audioEl.addEventListener('pause', () => {
    document.getElementById('playBtn').textContent = '▶';
    document.getElementById('playerVinyl').classList.remove('spinning');
  });
  audioEl.addEventListener('error', () => {
    document.getElementById('nowPlayingTitle').textContent = 'Erreur — fichier introuvable';
    document.getElementById('playerVinyl').classList.remove('spinning');
  });

  renderPlaylist();
}

function renderPlaylist() {
  const wrap = document.getElementById('playlist');
  if (!wrap) return;
  wrap.innerHTML = PLAYLIST.map((track, i) => `
    <div class="playlist-item ${i === currentTrackIdx ? 'active' : ''}" onclick="playTrack(${i})">
      <span class="playlist-num">${String(i+1).padStart(2,'0')}</span>
      <span class="playlist-name">${track.title}</span>
      <span class="playlist-icon">${i === currentTrackIdx ? '♪' : '🎵'}</span>
    </div>`).join('');
}

function playTrack(idx) {
  if (idx < 0 || idx >= PLAYLIST.length) return;
  currentTrackIdx = idx;
  audioEl.src = PLAYLIST[idx].file;
  document.getElementById('nowPlayingTitle').textContent = PLAYLIST[idx].title;
  audioEl.play().catch(e => {
    document.getElementById('nowPlayingTitle').textContent = 'Erreur de lecture';
  });
  renderPlaylist();
}

function togglePlay() {
  if (!audioEl) return;
  if (currentTrackIdx === -1) {
    playTrack(0);
    return;
  }
  if (audioEl.paused) audioEl.play();
  else audioEl.pause();
}

function nextTrack() {
  if (isShuffle) {
    let next;
    do { next = Math.floor(Math.random() * PLAYLIST.length); }
    while (next === currentTrackIdx && PLAYLIST.length > 1);
    playTrack(next);
  } else {
    playTrack((currentTrackIdx + 1) % PLAYLIST.length);
  }
}

function prevTrack() {
  if (audioEl.currentTime > 3) {
    audioEl.currentTime = 0;
    return;
  }
  playTrack((currentTrackIdx - 1 + PLAYLIST.length) % PLAYLIST.length);
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('shuffleBtn').classList.toggle('toggled', isShuffle);
}

function toggleLoop() {
  isLoop = !isLoop;
  document.getElementById('loopBtn').classList.toggle('toggled', isLoop);
}

function setVolume(v) {
  if (audioEl) audioEl.volume = v / 100;
}

function updateProgress() {
  if (!audioEl || !audioEl.duration) return;
  const pct = (audioEl.currentTime / audioEl.duration) * 100;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('timeCurrent').textContent = formatTime(audioEl.currentTime);
}

function seekTrack(e) {
  if (!audioEl || !audioEl.duration) return;
  const bar = document.getElementById('progressBar');
  const rect = bar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audioEl.currentTime = pct * audioEl.duration;
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

init();