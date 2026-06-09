// ═══════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════
const API          = 'https://pokeapi.co/api/v2';
const SPR_ART      = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';
const SPR_DEFAULT  = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const SMOGON_SETS  = 'https://pkmn.github.io/smogon/data/sets/';

const GEN_RANGES = {
  0:[1,1025], 1:[1,151],   2:[152,251],  3:[252,386],
  4:[387,493],5:[494,649], 6:[650,721],  7:[722,809],
  8:[810,905],9:[906,1025]
};

const TYPE_COLORS = {
  normal:'#A8A878',  fire:'#F08030',    water:'#6890F0',
  electric:'#F8D030',grass:'#78C850',   ice:'#98D8D8',
  fighting:'#C03028',poison:'#A040A0',  ground:'#E0C068',
  flying:'#A890F0',  psychic:'#F85888', bug:'#A8B820',
  rock:'#B8A038',    ghost:'#705898',   dragon:'#7038F8',
  dark:'#705848',    steel:'#B8B8D0',   fairy:'#EE99AC'
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

const STAT_COLORS = {
  hp:'#e74c3c', attack:'#e67e22', 'special-attack':'#9b59b6',
  defense:'#3498db', 'special-defense':'#1abc9c', speed:'#f1c40f'
};
const STAT_FR = {
  hp:'PV', attack:'Att', defense:'Déf',
  'special-attack':'Att.Sp', 'special-defense':'Déf.Sp', speed:'Vit'
};

// ═══════════════════════════════════════════════
// FETCH THROTTLÉ  — max 3 requêtes en parallèle,
// retry auto sur 429/5xx, backoff exponentiel
// ═══════════════════════════════════════════════
const _cache = {};
const _queue = { running: 0, max: 3, pending: [] };

function _drain() {
  while (_queue.running < _queue.max && _queue.pending.length > 0) {
    const { fn, resolve, reject } = _queue.pending.shift();
    _queue.running++;
    fn()
      .then(v  => { _queue.running--; resolve(v); _drain(); })
      .catch(e => { _queue.running--; reject(e);  _drain(); });
  }
}

function apiFetch(url, retries = 4) {
  if (_cache[url]) return Promise.resolve(_cache[url]);
  return new Promise((resolve, reject) => {
    _queue.pending.push({
      resolve, reject,
      fn: async () => {
        for (let i = 0; i < retries; i++) {
          try {
            const r = await fetch(url);
            if (r.status === 429 || r.status >= 500) {
              await sleep(800 * (i + 1));
              continue;
            }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            _cache[url] = d;
            return d;
          } catch (e) {
            if (i === retries - 1) throw e;
            await sleep(600 * (i + 1));
          }
        }
      }
    });
    _drain();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════
// ÉTAT GLOBAL
// ═══════════════════════════════════════════════
let allPokemon      = [];
let filteredPokemon = [];
let currentPage     = 1;
const PER_PAGE      = 40;

let movesData       = [];
let filteredMoves   = [];
let movesPage       = 1;
let movesSortKey    = 'name';
let movesSortAsc    = true;

let abilitiesData   = [];
let filteredAbilities = [];
let abilitiesPage   = 1;

let cmpData         = [null, null];
let teamData        = new Array(6).fill(null);

let typeCardObserver = null;

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function init() {
  try {
    const data = await apiFetch(`${API}/pokemon?limit=1025&offset=0`);
    allPokemon = data.results.map((p, i) => ({ ...p, id: i + 1 }));
    filteredPokemon = [...allPokemon];

    // Peupler les selects de type
    TYPES.forEach(t => {
      ['typeFilter', 'teamType', 'movesTypeFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const o = document.createElement('option');
        o.value = t; o.textContent = cap(t);
        el.appendChild(o);
      });
    });

    renderPokedex();
    renderTeamDisplay();
    hideLoader();
  } catch (e) {
    console.error('Init failed:', e);
    document.getElementById('loading-overlay').innerHTML =
      '<div style="color:#e74c3c;font-family:Rajdhani,sans-serif;font-size:1.2rem;letter-spacing:2px">Erreur de connexion — recharge la page</div>';
  }
}

function hideLoader() {
  const el = document.getElementById('loading-overlay');
  el.style.opacity = '0';
  setTimeout(() => el.style.display = 'none', 500);
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const map = { pokedex:0, types:1, compare:2, team:3, moves:4, abilities:5 };
  document.querySelectorAll('.nav-tab')[map[id]].classList.add('active');

  if (id === 'types'     && !document.getElementById('typeSelector').innerHTML) initTypeCalc();
  if (id === 'moves'     && movesData.length === 0) loadMoves();
  if (id === 'abilities' && abilitiesData.length === 0) loadAbilities();
}

// ═══════════════════════════════════════════════
// POKÉDEX
// ═══════════════════════════════════════════════
function filterPokedex() {
  const q   = document.getElementById('mainSearch').value.toLowerCase().trim();
  const gen = parseInt(document.getElementById('genFilter').value);
  const [mn, mx] = GEN_RANGES[gen];

  filteredPokemon = allPokemon.filter(p => {
    const inGen    = p.id >= mn && p.id <= mx;
    const inSearch = !q || p.name.includes(q) || String(p.id).includes(q);
    return inGen && inSearch;
  });
  currentPage = 1;
  renderPokedex();
}

function renderPokedex() {
  const grid  = document.getElementById('pokedexGrid');
  const total = Math.ceil(filteredPokemon.length / PER_PAGE);
  const slice = filteredPokemon.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  // Déconnecter l'ancien observer si présent
  if (typeCardObserver) typeCardObserver.disconnect();

  if (slice.length === 0) {
    grid.innerHTML = `<div class="empty-state"><span>🔍</span><div>Aucun Pokémon trouvé</div></div>`;
    document.getElementById('pokedexPagination').innerHTML = '';
    return;
  }

  grid.innerHTML = slice.map(p => `
    <div class="poke-card" onclick="openModal(${p.id})"
         data-url="${p.url}" data-id="${p.id}">
      <div class="poke-num">#${String(p.id).padStart(4, '0')}</div>
      <img class="poke-sprite"
           src="${SPR_DEFAULT}${p.id}.png"
           onerror="this.src='${SPR_ART}${p.id}.png'"
           alt="${p.name}" loading="lazy">
      <div class="poke-name">${p.name.replace(/-/g, ' ')}</div>
      <div class="poke-types" id="pt-${p.id}"></div>
    </div>`).join('');

  // Observer : charger les types seulement quand la carte est visible
  typeCardObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const card = entry.target;
      typeCardObserver.unobserve(card);
      apiFetch(card.dataset.url)
        .then(d => {
          const el = document.getElementById('pt-' + card.dataset.id);
          if (el) el.innerHTML = d.types.map(t => typeBadge(t.type.name)).join('');
        })
        .catch(() => {});
    });
  }, { rootMargin: '100px' });

  grid.querySelectorAll('.poke-card').forEach(c => typeCardObserver.observe(c));

  renderPagination('pokedexPagination', currentPage, total, pg => {
    currentPage = pg;
    renderPokedex();
    window.scrollTo(0, 128);
  });
}

// ═══════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════
async function openModal(id) {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Reset rapide
  document.getElementById('modalSprite').src = `${SPR_ART}${id}.png`;
  document.getElementById('modalNum').textContent = `#${String(id).padStart(4, '0')}`;
  document.getElementById('modalName').textContent = '…';
  document.getElementById('modalTypes').innerHTML = '';
  document.getElementById('modalInfo').innerHTML = '';
  document.getElementById('modalStats').innerHTML = '<div style="color:var(--text3);font-size:13px">Chargement…</div>';
  document.getElementById('statTotal').textContent = '0';
  ['evolutions','moves','smogon','forms'].forEach(t =>
    document.getElementById('mtab-' + t).innerHTML =
      '<div style="padding:2rem;color:var(--text3)">Chargement…</div>');

  document.querySelectorAll('.modal-tab').forEach((t,i) => t.classList.toggle('active', i === 0));
  document.querySelectorAll('.modal-tab-content').forEach((c,i) => c.classList.toggle('active', i === 0));

  try {
    const [poke, species] = await Promise.all([
      apiFetch(`${API}/pokemon/${id}`),
      apiFetch(`${API}/pokemon-species/${id}`).catch(() => null)
    ]);

    document.getElementById('modalName').textContent = cap(poke.name);
    document.getElementById('modalTypes').innerHTML  = poke.types.map(t => typeBadge(t.type.name, 'large')).join('');

    const flav = species?.flavor_text_entries?.find(f => f.language.name === 'fr')?.flavor_text
               || species?.flavor_text_entries?.find(f => f.language.name === 'en')?.flavor_text
               || '—';

    document.getElementById('modalInfo').innerHTML = `
      <div class="info-box"><div class="info-label">Taille</div><div class="info-val">${(poke.height/10).toFixed(1)} m</div></div>
      <div class="info-box"><div class="info-label">Poids</div><div class="info-val">${(poke.weight/10).toFixed(1)} kg</div></div>
      <div class="info-box" style="grid-column:1/-1">
        <div class="info-label">Talents</div>
        <div class="info-val">${poke.abilities.map(a => cap(a.ability.name.replace(/-/g,' '))).join(', ')}</div>
      </div>
      <div class="info-box" style="grid-column:1/-1">
        <div class="info-label">Description</div>
        <div class="info-val" style="font-size:12px;font-weight:400;color:var(--text2);line-height:1.5">
          ${flav.replace(/\f/g,' ')}
        </div>
      </div>`;

    const total = poke.stats.reduce((s, st) => s + st.base_stat, 0);
    document.getElementById('statTotal').textContent = total;
    document.getElementById('modalStats').innerHTML = poke.stats.map(st => {
      const col   = STAT_COLORS[st.stat.name] || '#fff';
      const pct   = Math.min(100, (st.base_stat / 255) * 100);
      const label = STAT_FR[st.stat.name] || st.stat.name;
      return `<div class="stat-row">
        <div class="stat-name">${label}</div>
        <div class="stat-val">${st.base_stat}</div>
        <div class="stat-bar-bg"><div class="stat-bar" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
    }).join('');

    // Onglets chargés séparément pour ne pas bloquer l'affichage
    if (species?.evolution_chain?.url) loadEvolutions(species.evolution_chain.url, id);
    else document.getElementById('mtab-evolutions').innerHTML =
      '<div style="padding:2rem;color:var(--text3)">Pas de chaîne d\'évolution.</div>';

    loadModalMoves(poke.moves);
    loadSmogon(poke.name, poke.types.map(t => t.type.name));
    loadForms(species, poke.name);

  } catch (e) {
    console.error(e);
    document.getElementById('modalName').textContent = 'Erreur';
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function switchModalTab(name) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
  const idx = ['evolutions','moves','smogon','forms'].indexOf(name);
  document.querySelectorAll('.modal-tab')[idx].classList.add('active');
  document.getElementById('mtab-' + name).classList.add('active');
}

// ── Évolutions ──
async function loadEvolutions(url, currentId) {
  try {
    const chain = await apiFetch(url);
    const nodes = [];

    function walk(node, trigger) {
      const id = node.species.url.split('/').slice(-2,-1)[0];
      nodes.push({ id, name: node.species.name, trigger });
      for (const child of node.evolves_to) {
        const d = child.evolution_details[0];
        let trig = '';
        if (d) {
          if (d.min_level)               trig = `Niv. ${d.min_level}`;
          else if (d.item)               trig = cap(d.item.name.replace(/-/g,' '));
          else if (d.trigger?.name === 'trade') trig = 'Échange';
          else if (d.min_happiness)      trig = 'Amitié';
          else                           trig = cap((d.trigger?.name || '').replace(/-/g,' '));
        }
        walk(child, trig);
      }
    }
    walk(chain.chain, null);

    if (nodes.length <= 1) {
      document.getElementById('mtab-evolutions').innerHTML =
        '<div style="padding:2rem;color:var(--text3)">Ce Pokémon n\'évolue pas.</div>';
      return;
    }

    let html = '<div class="evo-chain">';
    nodes.forEach((n, i) => {
      if (i > 0 && n.trigger !== null) {
        html += `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div class="evo-arrow">→</div>
          <div class="evo-trigger">${n.trigger}</div>
        </div>`;
      }
      html += `<div class="evo-mon" onclick="closeModal();openModal(${n.id})">
        <img src="${SPR_DEFAULT}${n.id}.png" onerror="this.src='${SPR_ART}${n.id}.png'" alt="${n.name}">
        <div class="evo-name">${cap(n.name)}</div>
        ${String(n.id) === String(currentId)
          ? '<div style="width:6px;height:6px;border-radius:50%;background:var(--teal2);margin:0 auto"></div>' : ''}
      </div>`;
    });
    html += '</div>';
    document.getElementById('mtab-evolutions').innerHTML = html;
  } catch(e) {
    document.getElementById('mtab-evolutions').innerHTML =
      '<div style="padding:2rem;color:var(--text3)">Impossible de charger les évolutions.</div>';
  }
}

// ── Moves du modal ──
function loadModalMoves(moves) {
  const sorted = moves
    .map(m => {
      const d = m.version_group_details.find(x => x.move_learn_method.name === 'level-up')
             || m.version_group_details[0];
      return { name: m.move.name, level: d?.level_learned_at || 0, method: d?.move_learn_method.name || '—' };
    })
    .sort((a,b) => a.level - b.level);

  document.getElementById('mtab-moves').innerHTML = `
    <div style="overflow-x:auto">
      <table class="moves-table">
        <thead><tr><th>Niv.</th><th>Capacité</th><th>Méthode</th></tr></thead>
        <tbody>${sorted.slice(0, 100).map(m => `
          <tr>
            <td style="font-family:'Share Tech Mono',monospace;color:var(--gold2)">${m.level || '—'}</td>
            <td>${cap(m.name.replace(/-/g,' '))}</td>
            <td style="font-size:11px;color:var(--text3);text-transform:capitalize">${m.method.replace(/-/g,' ')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Formes ──
function loadForms(species, currentName) {
  const forms = (species?.varieties || []).filter(v => v.pokemon.name !== currentName);
  if (forms.length === 0) {
    document.getElementById('mtab-forms').innerHTML =
      '<div style="padding:2rem;color:var(--text3)">Aucune forme alternative.</div>';
    return;
  }
  const ids = forms.map(f => f.pokemon.url.split('/').slice(-2,-1)[0]);
  document.getElementById('mtab-forms').innerHTML =
    `<div style="display:flex;flex-wrap:wrap;gap:1rem;padding-bottom:1rem">
      ${ids.map(fid => `
        <div class="evo-mon" onclick="closeModal();openModal(${fid})">
          <img src="${SPR_DEFAULT}${fid}.png" onerror="this.src='${SPR_ART}${fid}.png'">
          <div class="evo-name">#${fid}</div>
        </div>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════
// SMOGON
// ═══════════════════════════════════════════════
const TIER_INFO = {
  Uber:{ label:'Uber',         cls:'tier-Uber', desc:'Trop forts pour l\'OU. Légendaires dominants.' },
  OU:  { label:'Overused',     cls:'tier-OU',   desc:'Tier principal. Utilisés dans >4.52% des équipes.' },
  UUBL:{ label:'UU Banlist',   cls:'tier-UU',   desc:'Trop forts pour l\'UU, interdits en dessous de l\'OU.' },
  UU:  { label:'Underused',    cls:'tier-UU',   desc:'Tier secondaire, méta varié et équilibré.' },
  RUBL:{ label:'RU Banlist',   cls:'tier-RU',   desc:'Trop forts pour le RU.' },
  RU:  { label:'RarelyUsed',   cls:'tier-RU',   desc:'Peu vus en OU/UU mais compétitifs à leur niveau.' },
  NUBL:{ label:'NU Banlist',   cls:'tier-NU',   desc:'Trop forts pour le NU.' },
  NU:  { label:'NeverUsed',    cls:'tier-NU',   desc:'Rarement utilisés mais jouables dans ce tier.' },
  PUBL:{ label:'PU Banlist',   cls:'tier-PU',   desc:'Trop forts pour le PU.' },
  PU:  { label:'PU',           cls:'tier-PU',   desc:'Tier le plus bas officiel.' },
  LC:  { label:'Little Cup',   cls:'tier-LC',   desc:'1er stade d\'évolution, niveau 5 maximum.' },
};

const STRAT_PROFILES = {
  fire:     'Offensif puissant. Couvre Acier, Glace, Plante, Insecte. Faible à Eau, Sol, Roche.',
  water:    'Polyvalent, bonnes résistances (Feu, Eau, Glace, Acier). Faible à Électrik, Plante.',
  grass:    'Support et contrôle. Contre Eau, Sol, Roche. Nombreuses faiblesses (Feu, Insecte, Poison…).',
  electric: 'Top offensif spécial. Seule faiblesse : Sol. Thunderbolt parmi les meilleures attaques.',
  psychic:  'Fort en début de partie. Faible à Ténèbres, Spectre, Insecte.',
  dragon:   'Très offensif. Faible à Glace, Fée, Dragon. Dragon Danse = setup incontournable.',
  dark:     'Immunité Psy. Bon cleaner late game ou en Trick Room.',
  steel:    'Meilleur type défensif (10 résistances). Pivot, hazard setter ou tank.',
  fairy:    'Immunité Dragon. Neutralise Ténèbres/Combat. Faible à Poison, Acier.',
  ghost:    'Double immunité (Normal, Combat). Bloque Rapid Spin. Bon offensivement.',
  fighting: 'Couverture offensive large. Contre Normal, Acier, Roche, Glace, Ténèbres.',
  rock:     'Stealth Rock disponible. Couvre Feu, Insecte, Vol, Glace. Beaucoup de faiblesses.',
  ground:   'Immunité Électrik. Excellent offensivement. Faible à Eau, Plante, Glace.',
  ice:      'Fort offensivement (Dragon, Sol, Vol, Plante). Défensivement très fragile.',
  poison:   'Bon contre Plante/Fée. Toxic Spikes setter ou pivot.',
  bug:      'U-turn/Pivot. Peu utilisé compétitivement mais utile comme lead.',
  flying:   'Immunité Sol. Defog. Faible à Électrik, Roche, Glace.',
  normal:   'Immunités: aucune. Mais movepool gigantesque. Support/stall efficace.',
};

async function loadSmogon(name, types) {
  const container = document.getElementById('mtab-smogon');

  // Section explication des tiers (statique, toujours présente)
  let html = `
    <div style="margin-bottom:1.5rem">
      <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:.75rem">Explication des tiers</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1rem">
        ${Object.entries(TIER_INFO).map(([,v]) =>
          `<span class="tier-badge ${v.cls}" title="${v.desc}" style="cursor:help">${v.label}</span>`
        ).join('')}
      </div>
      <div class="tier-card" style="font-size:12px;color:var(--text2);line-height:1.7">
        Les tiers Smogon classifient les Pokémon selon leur taux d'utilisation.
        Un Pokémon monte de tier dès qu'il dépasse <span style="color:var(--gold2)">4.52%</span> d'utilisation
        au palier Elo 1695. Un <em>Banlist</em> (BL) signifie que le Pokémon est trop fort pour son tier
        sans atteindre le seuil du tier supérieur.
      </div>
    </div>`;

  // Profil stratégique (basé sur les types, toujours disponible)
  const profile = types.map(t => STRAT_PROFILES[t]).filter(Boolean).join('<br><br>');
  html += `
    <div style="margin-bottom:1.5rem">
      <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:.75rem">Profil stratégique</div>
      <div class="tier-card"><div class="smogon-desc">${profile || 'Profil non disponible.'}</div></div>
    </div>`;

  container.innerHTML = html;

  // Sets Smogon (optionnel — peut échouer silencieusement)
  try {
    const setsData = await apiFetch(`${SMOGON_SETS}gen9ou.json`);
    const key = Object.keys(setsData).find(k =>
      k.toLowerCase() === name.toLowerCase() ||
      k.toLowerCase().replace(/[^a-z]/g,'') === name.toLowerCase().replace(/[^a-z]/g,'')
    );

    if (key && setsData[key]) {
      let setsHtml = `
        <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:.75rem">Sets Gen 9 OU</div>`;
      Object.entries(setsData[key]).forEach(([setName, set]) => {
        const item    = Array.isArray(set.item)    ? set.item.join(' / ')    : (set.item || '');
        const ability = Array.isArray(set.ability) ? set.ability.join(' / ') : (set.ability || '');
        const nature  = Array.isArray(set.nature)  ? set.nature.join(' / ')  : (set.nature || '');
        const moves   = (set.moves || []).map(m => Array.isArray(m) ? m.join(' / ') : m);
        setsHtml += `
          <div class="tier-card">
            <div style="font-family:'Rajdhani',sans-serif;font-weight:700;color:var(--gold2);margin-bottom:.5rem">${setName}</div>
            <div style="font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--text2);line-height:2">
              ${item    ? `<div>@ ${item}</div>` : ''}
              ${ability ? `<div>Talent : ${ability}</div>` : ''}
              ${nature  ? `<div>Nature : ${nature}</div>` : ''}
              ${moves.length ? `<div style="margin-top:.3rem">${moves.map(m=>`<div>– ${m}</div>`).join('')}</div>` : ''}
            </div>
          </div>`;
      });
      container.innerHTML += setsHtml;
    } else {
      container.innerHTML += `
        <div class="tier-card" style="font-size:13px;color:var(--text3)">
          Aucun set Gen 9 OU trouvé. Ce Pokémon est probablement dans un autre tier.
        </div>`;
    }
  } catch(e) {
    container.innerHTML += `
      <div class="tier-card" style="font-size:13px;color:var(--text3)">
        Données Smogon indisponibles pour le moment.
      </div>`;
  }
}

// ═══════════════════════════════════════════════
// CALCULATEUR DE TYPES
// ═══════════════════════════════════════════════
let selectedTypes = [];

function initTypeCalc() {
  document.getElementById('typeSelector').innerHTML = TYPES.map(t => `
    <button class="type-select-btn" id="tsbtn-${t}"
      style="border-color:${TYPE_COLORS[t]}40;color:${TYPE_COLORS[t]}"
      onclick="toggleTypeSelect('${t}')">${cap(t)}</button>`).join('');
  renderTypeTable();
}

function toggleTypeSelect(t) {
  selectedTypes = selectedTypes.includes(t)
    ? selectedTypes.filter(x => x !== t)
    : selectedTypes.length < 2
      ? [...selectedTypes, t]
      : [selectedTypes[1], t];

  TYPES.forEach(tp => {
    const btn = document.getElementById('tsbtn-' + tp);
    const sel = selectedTypes.includes(tp);
    btn.style.background   = sel ? TYPE_COLORS[tp] + '30' : '';
    btn.style.borderColor  = sel ? TYPE_COLORS[tp] : TYPE_COLORS[tp] + '40';
    btn.style.boxShadow    = sel ? `0 0 10px ${TYPE_COLORS[tp]}50` : '';
  });
  renderTypeResult();
}

function renderTypeResult() {
  const c = document.getElementById('typeResult');
  if (!selectedTypes.length) { c.innerHTML = ''; return; }

  const eff = {};
  TYPES.forEach(atk => {
    let m = 1;
    selectedTypes.forEach(def => { m *= (TYPE_CHART[atk]?.[def] ?? 1); });
    eff[atk] = m;
  });

  const groups = { '4x':[], '2x':[], '1x':[], '0.5x':[], '0.25x':[], '0x':[] };
  Object.entries(eff).forEach(([t,m]) => {
    const k = m===4?'4x':m===2?'2x':m===1?'1x':m===.5?'0.5x':m===.25?'0.25x':'0x';
    groups[k].push(t);
  });

  const clsMap = {'4x':'mult-4x','2x':'mult-2x','1x':'mult-1x','0.5x':'mult-05x','0.25x':'mult-025x','0x':'mult-0x'};
  const lblMap = {'4x':'×4','2x':'×2','1x':'×1','0.5x':'×½','0.25x':'×¼','0x':'×0 Immunité'};

  c.innerHTML = `
    <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1rem;letter-spacing:1px;color:var(--text);margin-bottom:1rem">
      Défense : ${selectedTypes.map(t=>`<span style="color:${TYPE_COLORS[t]}">${cap(t)}</span>`).join(' / ')}
    </div>
    ${Object.entries(groups).filter(([,a]) => a.length).map(([m,ts]) => `
      <div class="matchup-row">
        <div style="display:flex;flex-wrap:wrap;gap:4px">${ts.map(t => typeBadge(t)).join('')}</div>
        <span class="matchup-mult ${clsMap[m]}">${lblMap[m]}</span>
      </div>`).join('')}`;
}

function renderTypeTable() {
  const c = document.getElementById('typeTable');
  c.innerHTML = `<table style="border-collapse:collapse;font-size:10px">
    <thead><tr>
      <th style="padding:3px;color:var(--text3);font-family:'Rajdhani',sans-serif;letter-spacing:.5px">ATK↓ DEF→</th>
      ${TYPES.map(t=>`<th style="padding:3px 2px;writing-mode:vertical-lr;transform:rotate(180deg);color:${TYPE_COLORS[t]};font-family:'Rajdhani',sans-serif;font-weight:700;font-size:9px">${cap(t)}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${TYPES.map(atk=>`<tr>
        <td style="padding:3px 6px;color:${TYPE_COLORS[atk]};font-family:'Rajdhani',sans-serif;font-weight:700;white-space:nowrap;font-size:9px">${cap(atk)}</td>
        ${TYPES.map(def=>{
          const m = TYPE_CHART[atk]?.[def] ?? 1;
          const bg = m===4?'rgba(231,76,60,.5)':m===2?'rgba(231,76,60,.3)':m===.5?'rgba(26,188,156,.2)':m===0?'rgba(0,0,0,.4)':'transparent';
          const txt = m===1?'':m===0?'✕':`${m}×`;
          return `<td style="text-align:center;padding:2px;background:${bg};border:1px solid rgba(255,255,255,.03);font-family:'Share Tech Mono',monospace;font-size:9px;color:${m>1?'#e74c3c':m<1&&m>0?'#1abc9c':m===0?'#7f8c8d':'var(--text3)'}">${txt}</td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody>
  </table>`;
}

// ═══════════════════════════════════════════════
// COMPARATEUR
// ═══════════════════════════════════════════════
const _cmpTimers = [null, null];

function suggestCompare(slot) {
  clearTimeout(_cmpTimers[slot-1]);
  const val = document.getElementById(`cmp${slot}Input`).value.trim().toLowerCase();
  const el  = document.getElementById(`cmp${slot}Suggestions`);
  if (val.length < 2) { el.innerHTML = ''; return; }
  _cmpTimers[slot-1] = setTimeout(() => {
    const hits = allPokemon.filter(p => p.name.includes(val)).slice(0, 8);
    el.innerHTML = hits.length
      ? `<div class="suggest-wrap">${hits.map(p =>
          `<button class="suggest-btn" onclick="loadCompare(${slot},${p.id})">${p.name}</button>`
        ).join('')}</div>`
      : '';
  }, 300);
}

async function loadCompare(slot, id) {
  document.getElementById(`cmp${slot}Suggestions`).innerHTML = '';
  try {
    const poke = await apiFetch(`${API}/pokemon/${id}`);
    cmpData[slot-1] = poke;
    const types = poke.types.map(t => t.type.name);
    document.getElementById(`cmp${slot}Card`).innerHTML = `
      <img class="compare-sprite" src="${SPR_ART}${id}.png" onerror="this.src='${SPR_DEFAULT}${id}.png'" alt="${poke.name}">
      <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.2rem;text-transform:capitalize">${cap(poke.name)}</div>
      <div style="display:flex;gap:6px">${types.map(t => typeBadge(t)).join('')}</div>`;
    if (cmpData[0] && cmpData[1]) renderCompareStats();
  } catch(e) { console.error(e); }
}

function renderCompareStats() {
  const [a, b] = cmpData;
  const keys = ['hp','attack','defense','special-attack','special-defense','speed'];
  const aS = {}; a.stats.forEach(s => aS[s.stat.name] = s.base_stat);
  const bS = {}; b.stats.forEach(s => bS[s.stat.name] = s.base_stat);

  document.getElementById('compareStats').innerHTML = `
    <div style="font-family:'Rajdhani',sans-serif;letter-spacing:2px;text-transform:uppercase;font-size:.8rem;color:var(--text3);margin-bottom:1rem;text-align:center">Comparaison des statistiques</div>
    ${keys.map(k => {
      const av = aS[k]||0, bv = bS[k]||0;
      const col = STAT_COLORS[k]||'#fff';
      const lbl = STAT_FR[k]||k;
      return `<div style="display:grid;grid-template-columns:1fr auto auto auto 1fr;gap:8px;align-items:center;margin-bottom:8px">
        <div style="text-align:right">
          <div style="height:6px;background:${col};border-radius:3px;width:${(av/255*100).toFixed(1)}%;margin-left:auto;opacity:.7"></div>
        </div>
        <div class="cmp-val ${av>bv?'winner':av<bv?'loser':''}">${av}</div>
        <div class="cmp-label">${lbl}</div>
        <div class="cmp-val ${bv>av?'winner':bv<av?'loser':''}">${bv}</div>
        <div>
          <div style="height:6px;background:${col};border-radius:3px;width:${(bv/255*100).toFixed(1)}%;opacity:.7"></div>
        </div>
      </div>`;
    }).join('')}
    <div style="display:grid;grid-template-columns:1fr auto auto auto 1fr;gap:8px;align-items:center;margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem">
      <div></div>
      <div class="cmp-val ${a.stats.reduce((s,x)=>s+x.base_stat,0) >= b.stats.reduce((s,x)=>s+x.base_stat,0)?'winner':'loser'}" style="font-size:1rem">
        ${a.stats.reduce((s,x)=>s+x.base_stat,0)}
      </div>
      <div class="cmp-label">TOTAL</div>
      <div class="cmp-val ${b.stats.reduce((s,x)=>s+x.base_stat,0) >= a.stats.reduce((s,x)=>s+x.base_stat,0)?'winner':'loser'}" style="font-size:1rem">
        ${b.stats.reduce((s,x)=>s+x.base_stat,0)}
      </div>
      <div></div>
    </div>`;
}

// ═══════════════════════════════════════════════
// TEAM BUILDER
// ═══════════════════════════════════════════════
function renderTeamDisplay() {
  document.getElementById('teamDisplay').innerHTML = teamData.map((p, i) => `
    <div class="team-slot">
      ${p
        ? `<img src="${SPR_DEFAULT}${p.id}.png" onerror="this.src='${SPR_ART}${p.id}.png'"
               alt="${p.name}" onclick="openModal(${p.id})" style="cursor:pointer">
           <div class="team-slot-name">${p.name.replace(/-/g,' ')}</div>
           <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--text3)">#${String(p.id).padStart(3,'0')}</div>
           <button class="btn-small" onclick="teamData[${i}]=null;renderTeamDisplay()">✕ Retirer</button>`
        : `<div style="color:var(--text3);font-family:'Rajdhani',sans-serif;letter-spacing:2px;font-size:.75rem;text-transform:uppercase">Slot ${i+1}</div>`
      }
    </div>`).join('');
}

async function generateTeam() {
  const gen = parseInt(document.getElementById('teamGen').value);
  const [mn, mx] = GEN_RANGES[gen];
  let pool = allPokemon.filter(p => p.id >= mn && p.id <= mx);
  if (pool.length < 6) pool = allPokemon;
  teamData = pool.sort(() => Math.random() - .5).slice(0, 6);
  renderTeamDisplay();

  // Analyse des types
  const typeCount = {};
  for (const p of teamData) {
    try {
      const d = await apiFetch(`${API}/pokemon/${p.id}`);
      d.types.forEach(t => { typeCount[t.type.name] = (typeCount[t.type.name]||0) + 1; });
    } catch(e) {}
  }
  if (Object.keys(typeCount).length) {
    document.getElementById('teamTypeChart').innerHTML = `
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
  teamData = new Array(6).fill(null);
  renderTeamDisplay();
  document.getElementById('teamTypeChart').innerHTML = '';
}

// ═══════════════════════════════════════════════
// CAPACITÉS
// ═══════════════════════════════════════════════
async function loadMoves() {
  document.getElementById('movesBody').innerHTML =
    '<tr><td colspan="7" style="text-align:center;padding:3rem;color:var(--text3)">Chargement…</td></tr>';
  try {
    const list = await apiFetch(`${API}/move?limit=850&offset=0`);
    movesData = list.results.slice(0, 250).map(m => ({
      name: m.name, url: m.url,
      power: null, accuracy: null, pp: null,
      type: null, category: null, effect: null
    }));
    filteredMoves = [...movesData];
    renderMoves();
    // Charger les détails progressivement, 10 à la fois
    loadMovesDetails();
  } catch(e) {
    document.getElementById('movesBody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--ruby2)">Erreur de chargement</td></tr>';
  }
}

async function loadMovesDetails() {
  const BATCH = 10;
  for (let i = 0; i < movesData.length; i += BATCH) {
    const batch = movesData.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async (m, j) => {
      try {
        const d = await apiFetch(m.url);
        const effect = d.effect_entries?.find(e => e.language.name === 'en')?.short_effect || '—';
        movesData[i+j] = {
          ...movesData[i+j],
          power: d.power, accuracy: d.accuracy, pp: d.pp,
          type: d.type?.name, category: d.damage_class?.name, effect
        };
      } catch(e) {}
    }));
    filteredMoves = applyMovesFilter();
    renderMoves();
    await sleep(50); // petit délai entre batches
  }
}

function applyMovesFilter() {
  const q    = document.getElementById('movesSearch').value.toLowerCase();
  const type = document.getElementById('movesTypeFilter').value;
  const cat  = document.getElementById('movesCatFilter').value;
  return movesData.filter(m =>
    (!q    || m.name.includes(q)) &&
    (!type || m.type === type) &&
    (!cat  || m.category === cat)
  );
}

function filterMoves() { filteredMoves = applyMovesFilter(); movesPage = 1; renderMoves(); }

function sortMoves(key) {
  movesSortAsc = movesSortKey === key ? !movesSortAsc : true;
  movesSortKey = key;
  filteredMoves.sort((a,b) => {
    const av = a[key] ?? -1, bv = b[key] ?? -1;
    if (typeof av === 'string') return movesSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return movesSortAsc ? av - bv : bv - av;
  });
  renderMoves();
}

function renderMoves() {
  const slice = filteredMoves.slice((movesPage-1)*50, movesPage*50);
  document.getElementById('movesBody').innerHTML = slice.map(m => `
    <tr>
      <td style="font-family:'Rajdhani',sans-serif;font-weight:600">${cap(m.name.replace(/-/g,' '))}</td>
      <td>${m.type ? typeBadge(m.type, 'small') : '—'}</td>
      <td class="cat-${m.category}">${m.category ? cap(m.category) : '—'}</td>
      <td style="font-family:'Share Tech Mono',monospace;text-align:center;color:var(--gold2)">${m.power || '—'}</td>
      <td style="font-family:'Share Tech Mono',monospace;text-align:center">${m.accuracy != null ? m.accuracy+'%' : '—'}</td>
      <td style="font-family:'Share Tech Mono',monospace;text-align:center">${m.pp || '—'}</td>
      <td style="font-size:11px;max-width:200px">${m.effect || '…'}</td>
    </tr>`).join('');
  renderPagination('movesPagination', movesPage, Math.ceil(filteredMoves.length/50), pg => { movesPage = pg; renderMoves(); });
}

// ═══════════════════════════════════════════════
// TALENTS
// ═══════════════════════════════════════════════
async function loadAbilities() {
  document.getElementById('abilitiesList').innerHTML =
    '<div style="color:var(--text3);padding:2rem">Chargement…</div>';
  try {
    const list = await apiFetch(`${API}/ability?limit=400&offset=0`);
    abilitiesData = list.results.map(a => ({ name: a.name, url: a.url, desc: null }));
    filteredAbilities = [...abilitiesData];
    renderAbilities();
    loadAbilitiesDetails();
  } catch(e) {}
}

async function loadAbilitiesDetails() {
  const BATCH = 15;
  for (let i = 0; i < abilitiesData.length; i += BATCH) {
    const batch = abilitiesData.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async (a, j) => {
      try {
        const d = await apiFetch(a.url);
        abilitiesData[i+j].desc = d.effect_entries?.find(e => e.language.name === 'en')?.short_effect || '—';
      } catch(e) {}
    }));
    filteredAbilities = applyAbilitiesFilter();
    renderAbilities();
    await sleep(50);
  }
}

function applyAbilitiesFilter() {
  const q = document.getElementById('abilitiesSearch').value.toLowerCase();
  return abilitiesData.filter(a => !q || a.name.includes(q) || (a.desc||'').toLowerCase().includes(q));
}
function filterAbilities() { filteredAbilities = applyAbilitiesFilter(); abilitiesPage = 1; renderAbilities(); }

function renderAbilities() {
  const slice = filteredAbilities.slice((abilitiesPage-1)*30, abilitiesPage*30);
  document.getElementById('abilitiesList').innerHTML = slice.map(a => `
    <div class="ability-card">
      <div class="ability-name">${cap(a.name.replace(/-/g,' '))}</div>
      <div class="ability-desc">${a.desc || 'Chargement…'}</div>
    </div>`).join('');
  renderPagination('abilitiesPagination', abilitiesPage, Math.ceil(filteredAbilities.length/30), pg => { abilitiesPage = pg; renderAbilities(); });
}

// ═══════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function typeBadge(type, size = '') {
  const col = TYPE_COLORS[type] || '#888';
  const fs  = size === 'large' ? '12px' : size === 'small' ? '9px' : '10px';
  const pad = size === 'large' ? '3px 12px' : '2px 7px';
  return `<span class="type-badge" style="background:${col}25;border:1px solid ${col}60;color:${col};font-size:${fs};padding:${pad}">${cap(type)}</span>`;
}

function renderPagination(containerId, current, total, onPage) {
  const el = document.getElementById(containerId);
  if (!el || total <= 1) { if(el) el.innerHTML = ''; return; }
  let html = `<button class="pg-btn" onclick="(${onPage.toString()})(${current-1})" ${current===1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1)
      html += `<button class="pg-btn ${i===current?'active':''}" onclick="(${onPage.toString()})(${i})">${i}</button>`;
    else if (Math.abs(i - current) === 2)
      html += `<span style="color:var(--text3);padding:0 4px">…</span>`;
  }
  html += `<button class="pg-btn" onclick="(${onPage.toString()})(${current+1})" ${current===total?'disabled':''}>›</button>`;
  el.innerHTML = html;
}

// Fermer modal avec Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ═══════════════════════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════════════════════
init();
