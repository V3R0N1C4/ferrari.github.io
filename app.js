const API = 'https://api.jolpi.ca/ergast/f1';

// Mappa circuitId Ergast -> id del tracciato in data/circuits.geojson.
const CIRCUIT_MAP = {
  albert_park: 'au-1953',
  americas: 'us-2012',
  bahrain: 'bh-2002',
  baku: 'az-2016',
  catalunya: 'es-1991',
  hockenheimring: 'de-1932',
  hungaroring: 'hu-1986',
  imola: 'it-1953',
  interlagos: 'br-1940',
  istanbul: 'tr-2005',
  jeddah: 'sa-2021',
  kyalami: 'za-1961',
  losail: 'qa-2004',
  madring: 'es-2026',
  marina_bay: 'sg-2008',
  miami: 'us-2022',
  monaco: 'mc-1929',
  monza: 'it-1922',
  mugello: 'it-1914',
  nurburgring: 'de-1927',
  paul_ricard: 'fr-1969',
  portimao: 'pt-2008',
  red_bull_ring: 'at-1969',
  rodriguez: 'mx-1962',
  sepang: 'my-1999',
  shanghai: 'cn-2004',
  singapore: 'sg-2008',
  silverstone: 'gb-1948',
  sochi: 'ru-2014',
  spa: 'be-1925',
  suzuka: 'jp-1962',
  vegas: 'us-2023',
  villeneuve: 'ca-1978',
  yas_marina: 'ae-2009',
  zandvoort: 'nl-1948',
};

let state = {
  year: 2026,
  races: [],
  ferrariDrivers: [],
  constructorStandings: [],
  driverStandings: [],
  raceHistory: [],
  raceResults: {},   // stats aggregati (pole/podi) per driverId
  dataByRound: {},   // { round: { results: [], qualifying: [], sprint: [] } } — usato anche dalla modale
};

// Cache in-memoria: una volta caricata una stagione, ricambiare anno è istantaneo.
const seasonCache = new Map();

// ============ COVER ART GP ============
// Configurazione cover art per ogni GP (percorso immagine + autore), salvata in
// localStorage. Le immagini vere vengono aggiunte a mano nel progetto (cartella cover/).

const COVER_STORAGE_KEY = 'fsa-cover-art';

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
}

function loadCoverArt() {
  try {
    return JSON.parse(localStorage.getItem(COVER_STORAGE_KEY)) || {};
  } catch (err) {
    return {};
  }
}

const coverArt = loadCoverArt(); // { [year]: { [round]: { src, author } } }

function getCover(round) {
  return coverArt[String(state.year)]?.[String(round)];
}

function raceCardHtml(race, cls) {
  const hasSprint = !!race.Sprint?.date;
  const feature = buildCircuitFeature(race.Circuit?.circuitId);
  const preview = feature ? `<div class="circuit-preview">${circuitSvg(feature)}</div>` : '';
  const cover = getCover(race.round) || {};
  const coverImg = cover.src
      ? `<img class="cover-art" src="${escapeHtml(cover.src)}" alt="" loading="lazy" onerror="this.remove()">`
      : '';
  const credit = cover.author ? `<span class="cover-credit">© ${escapeHtml(cover.author)}</span>` : '';
  return `
    <div class="race-card ${cls}" data-round="${race.round}">
      <button class="cover-btn${cover.src ? ' active' : ''}" type="button" title="Cover art" aria-label="Cover art GP ${race.round}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 22a10 10 0 1 1 10-10c0 1.7-1.1 3.2-2.6 3.6l-3.2 1.4c-.6.3-1 .9-1 1.6 0 .8-.6 1.4-1.4 1.4H12z"></path>
          <circle cx="7.5" cy="10.5" r="1"></circle>
          <circle cx="12" cy="7.5" r="1"></circle>
          <circle cx="16.5" cy="10.5" r="1"></circle>
        </svg>
      </button>
      <div class="cover-slot${cover.src ? ' has-cover' : ''}">
        ${preview}
        ${coverImg}
        ${credit}
      </div>
      <div class="race-round">Round ${race.round}</div>
      <div class="race-name">${race.raceName.replace('Grand Prix', 'GP')}${hasSprint ? ' <span class="sprint-badge">Sprint</span>' : ''}</div>
      <div class="race-location">${race.Circuit?.circuitName || ''}</div>
      <div class="race-date">${formatDate(race.date)}</div>
    </div>
  `;
}

function openCoverModal(round) {
  const race = state.races.find(r => r.round === round);
  if (!race) return;

  const modal = document.getElementById('cover-modal');
  const body = document.getElementById('cover-modal-body');
  const current = getCover(round) || {};

  body.innerHTML = `
    <h2>Cover Art</h2>
    <div class="race-meta">${escapeHtml(race.raceName)} · Round ${round}</div>
    <p class="cover-hint">Indica il file dell'immagine che aggiungerai al progetto (verticale, 2743 × 3840). Salvala nella cartella <code>cover/</code> e inserisci qui il percorso, es. <code>cover/gp-${round}.jpg</code>.</p>
    <label class="cover-field">
      <span>Immagine</span>
      <input type="text" id="cover-src" placeholder="cover/gp-${round}.jpg" value="${escapeHtml(current.src || '')}">
    </label>
    <label class="cover-field">
      <span>Autore</span>
      <input type="text" id="cover-author" placeholder="Nome dell'autore" value="${escapeHtml(current.author || '')}">
    </label>
    <div id="cover-preview" class="cover-preview"></div>
    <div class="cover-actions">
      <button class="cover-save" id="cover-save" type="button">Salva</button>
      ${current.src || current.author ? '<button class="cover-clear" id="cover-clear" type="button">Rimuovi</button>' : ''}
    </div>
  `;

  modal.classList.remove('hidden');
  bindCoverPreview();

  document.getElementById('cover-save').addEventListener('click', () => saveCover(round));
  const clearBtn = document.getElementById('cover-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => clearCover(round));
}

function bindCoverPreview() {
  const srcInput = document.getElementById('cover-src');
  const preview = document.getElementById('cover-preview');
  if (!srcInput || !preview) return;

  const render = () => {
    const v = srcInput.value.trim();
    preview.classList.remove('missing');
    if (!v) {
      preview.innerHTML = '<span>Nessuna immagine</span>';
      return;
    }
    preview.innerHTML = `<img src="${escapeHtml(v)}" onerror="this.closest('#cover-preview').classList.add('missing')">`;
  };
  srcInput.addEventListener('input', render);
  render();
}

function saveCover(round) {
  const src = document.getElementById('cover-src').value.trim();
  const author = document.getElementById('cover-author').value.trim();
  const y = String(state.year);
  if (!coverArt[y]) coverArt[y] = {};
  if (src || author) {
    coverArt[y][String(round)] = { src, author };
  } else {
    delete coverArt[y][String(round)];
  }
  localStorage.setItem(COVER_STORAGE_KEY, JSON.stringify(coverArt));
  closeCoverModal();
  renderRaceCalendar();
}

function clearCover(round) {
  const y = String(state.year);
  if (coverArt[y]) delete coverArt[y][String(round)];
  localStorage.setItem(COVER_STORAGE_KEY, JSON.stringify(coverArt));
  closeCoverModal();
  renderRaceCalendar();
}

function closeCoverModal() {
  document.getElementById('cover-modal').classList.add('hidden');
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchWithRetry(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetchJSON(url);
    } catch (e) {
      if (i === tries) throw e;
      await new Promise(r => setTimeout(r, 400 * i));
    }
  }
}

// Scarica un endpoint "a lista" (results/qualifying/sprint) gestendo la paginazione,
// così l'intera stagione arriva in 1 (raramente 2) chiamate invece che una per round.
async function fetchAllPages(baseUrl, pageSize = 1000) {
  let offset = 0;
  let allRaces = [];
  while (true) {
    const data = await fetchWithRetry(`${baseUrl}?limit=${pageSize}&offset=${offset}`);
    const races = data?.MRData?.RaceTable?.Races || [];
    allRaces = allRaces.concat(races);

    const total = parseInt(data?.MRData?.total || '0', 10);
    // Il server può applicare un limit più basso di quello richiesto (lo segnala in MRData.limit):
    // bisogna avanzare l'offset in base a quello REALMENTE usato, non a quello chiesto.
    const actualLimit = parseInt(data?.MRData?.limit || pageSize, 10) || pageSize;
    const actualOffset = parseInt(data?.MRData?.offset || offset, 10);

    if (races.length === 0 || actualLimit === 0) break;

    offset = actualOffset + actualLimit;
    if (offset >= total) break;
  }
  return allRaces;
}

function getYearOptions() {
  const year = new Date().getFullYear();
  const years = [];
  for (let y = year; y >= 2018; y--) years.push(y);
  return years;
}

function extractRaces(data) {
  return data?.MRData?.RaceTable?.Races || [];
}

function extractConstructorStandings(data) {
  return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
}

function extractDriverStandings(data) {
  return data?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============ TRACCIATI CIRCUITI ============
// I layout vengono da data/circuits.geojson (dataset "f1-circuits", MIT): ogni tracciato è
// una LineString di coordinate [lon, lat]. Qui si proietta e si disegna come SVG puro.

let circuitFeatures = null;

async function loadCircuits() {
  if (circuitFeatures) return;
  try {
    const res = await fetch('data/circuits.geojson');
    const data = await res.json();
    circuitFeatures = new Map((data.features || []).map(f => [f.properties.id, f]));
  } catch (err) {
    console.warn('Tracciati non disponibili', err);
    circuitFeatures = new Map();
  }
}

function buildCircuitFeature(circuitId) {
  if (!circuitFeatures) return null;
  const gid = CIRCUIT_MAP[circuitId];
  return gid ? circuitFeatures.get(gid) || null : null;
}

function circuitSvg(feature, { stroke = 1.5, start = 2.4 } = {}) {
  const coords = feature?.geometry?.coordinates;
  if (!coords || coords.length < 3) return '';

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  coords.forEach(([lon, lat]) => {
    if (lon < minX) minX = lon;
    if (lon > maxX) maxX = lon;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  });

  const w = maxX - minX;
  const h = maxY - minY;
  const s = Math.max(w, h) || 1;
  const pad = 0.16;

  const pts = coords.map(([lon, lat]) => [
    (lon - minX) / s + pad,
    (maxY - lat) / s + pad,
  ]);
  const viewW = w / s + pad * 2;
  const viewH = h / s + pad * 2;

  // Linea di partenza/arrivo: perpendicolare alla direzione del tracciato sul primo punto.
  const p0 = pts[0];
  const p1 = pts[1] || pts[pts.length - 1];
  let mdx = p1[0] - p0[0];
  let mdy = p1[1] - p0[1];
  const mm = Math.hypot(mdx, mdy) || 1;
  mdx /= mm; mdy /= mm;
  const half = 0.045;
  const sx1 = p0[0] - mdy * half, sy1 = p0[1] + mdx * half;
  const sx2 = p0[0] + mdy * half, sy2 = p0[1] - mdx * half;

  // ---- Tracciato completo: una sola linea continua ----
  const arcPath = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');

  return `
    <svg viewBox="0 0 ${viewW.toFixed(3)} ${viewH.toFixed(3)}" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">
      <path d="${arcPath(pts)}" class="circuit-path" stroke-width="${stroke}" vector-effect="non-scaling-stroke"/>
      <line x1="${sx1.toFixed(3)}" y1="${sy1.toFixed(3)}" x2="${sx2.toFixed(3)}" y2="${sy2.toFixed(3)}" class="circuit-start" stroke-width="${start}" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function formatKm(meters) {
  if (!meters) return '';
  return (meters / 1000).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' km';
}

async function init() {
  const yearSelect = document.getElementById('year');
  getYearOptions().forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === state.year) opt.selected = true;
    yearSelect.appendChild(opt);
  });

  yearSelect.addEventListener('change', () => {
    state.year = parseInt(yearSelect.value);
    loadSeason();
  });

  await loadCircuits();
  await loadSeason();
}

async function loadSeason() {
  // Stagione già vista in questa sessione: nessuna richiesta di rete, rendering immediato.
  if (seasonCache.has(state.year)) {
    state = { ...seasonCache.get(state.year) };
    render();
    return;
  }

  showSplash();
  document.querySelectorAll('.loading').forEach(el => el.textContent = '⏳ Caricamento...');

  try {
    const [raceData, constructorData, driverData, resultsRaces, qualifyingRaces, sprintRaces] = await Promise.all([
      fetchJSON(`${API}/${state.year}.json`).catch(() => ({ MRData: { RaceTable: { Races: [] } } })),
      fetchJSON(`${API}/${state.year}/constructorStandings.json`).catch(() => ({ MRData: { StandingsTable: { StandingsLists: [] } } })),
      fetchJSON(`${API}/${state.year}/driverStandings.json`).catch(() => ({ MRData: { StandingsTable: { StandingsLists: [] } } })),
      fetchAllPages(`${API}/${state.year}/results.json`).catch(() => []),
      fetchAllPages(`${API}/${state.year}/qualifying.json`).catch(() => []),
      fetchAllPages(`${API}/${state.year}/sprint.json`).catch(() => []),
    ]);

    state.races = extractRaces(raceData);
    state.constructorStandings = extractConstructorStandings(constructorData);
    state.driverStandings = extractDriverStandings(driverData);
    state.ferrariDrivers = state.driverStandings.filter(d =>
        d.Constructors && d.Constructors.some(c => c.name === 'Ferrari')
    );

    // Raggruppa i dati bulk per round, e li tiene pronti anche per la modale (niente fetch al click).
    state.dataByRound = buildDataByRound(resultsRaces, qualifyingRaces, sprintRaces);

    state.raceResults = computeRaceStats(state.dataByRound);
    state.raceHistory = computeStandingsHistory(state.races, state.dataByRound);

    seasonCache.set(state.year, { ...state, dataByRound: { ...state.dataByRound } });

    render();
    hideSplash();
  } catch (err) {
    console.error(err);
    document.querySelectorAll('.loading').forEach(el => el.textContent = '❌ Errore caricamento dati');
    hideSplash();
  }
}

function showSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('visible');
  el.classList.remove('leaving');
}

function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('leaving');
  setTimeout(() => el.classList.remove('visible'), 420);
}

function buildDataByRound(resultsRaces, qualifyingRaces, sprintRaces) {
  const byRound = {};

  // Una gara può comparire più volte nell'elenco se i suoi risultati sono stati
  // spezzati su due pagine dell'API (il confine di pagina è per riga, non per gara):
  // qui uniamo sempre invece di sovrascrivere, altrimenti si perde metà dei punti.
  resultsRaces.forEach(race => {
    const round = parseInt(race.round, 10);
    byRound[round] = byRound[round] || {};
    byRound[round].results = (byRound[round].results || []).concat(race.Results || []);
  });

  qualifyingRaces.forEach(race => {
    const round = parseInt(race.round, 10);
    byRound[round] = byRound[round] || {};
    byRound[round].qualifying = (byRound[round].qualifying || []).concat(race.QualifyingResults || []);
  });

  sprintRaces.forEach(race => {
    const round = parseInt(race.round, 10);
    byRound[round] = byRound[round] || {};
    byRound[round].sprint = (byRound[round].sprint || []).concat(race.SprintResults || []);
  });

  return byRound;
}

// Sostituisce loadResultsHistory(): stessa logica di pole/podi, ma sui dati già scaricati in bulk.
function computeRaceStats(dataByRound) {
  const stats = {};

  Object.values(dataByRound).forEach(({ results = [], qualifying = [] }) => {
    const sortedRes = [...results].sort((a, b) => parseInt(a.position) - parseInt(b.position));
    sortedRes.slice(0, 3).forEach(d => {
      const id = d.Driver?.driverId;
      if (!id) return;
      if (!stats[id]) stats[id] = { poles: 0, podiums: 0 };
      stats[id].podiums++;
    });

    const sortedQual = [...qualifying].sort((a, b) => parseInt(a.position) - parseInt(b.position));
    if (sortedQual[0]) {
      const id = sortedQual[0].Driver?.driverId;
      if (id) {
        if (!stats[id]) stats[id] = { poles: 0, podiums: 0 };
        stats[id].poles++;
      }
    }
  });

  return stats;
}

// Sostituisce loadStandingsHistory(): niente chiamate a driverStandings per ogni round,
// i punti cumulativi si calcolano dai risultati già scaricati.
function computeStandingsHistory(races, dataByRound) {
  const cumulative = new Map();
  const history = [];

  const sortedRaces = [...races].sort((a, b) => parseInt(a.round) - parseInt(b.round));

  const addPoints = (entries) => {
    entries.forEach(r => {
      const id = r.Driver?.driverId;
      if (!id) return;
      const prev = cumulative.get(id) || {
        Driver: r.Driver,
        Constructors: [r.Constructor],
        points: 0,
      };
      prev.points += parseFloat(r.points) || 0;
      prev.Constructors = [r.Constructor]; // aggiorna in caso di cambio team
      cumulative.set(id, prev);
    });
  };

  sortedRaces.forEach(race => {
    const round = parseInt(race.round, 10);
    const results = dataByRound[round]?.results;
    const sprint = dataByRound[round]?.sprint || [];
    if (!results || !results.length) return; // gara non ancora disputata

    // I punti della Sprint sono un endpoint separato dai punti della gara: vanno sommati entrambi.
    addPoints(sprint);
    addPoints(results);

    const standings = Array.from(cumulative.values()).map(d => ({ ...d }));
    history.push({ round, standings });
  });

  return history;
}

function render() {
  renderHeroStats();
  renderOverview();
  renderPointsChart();
  renderRaceCalendar();
  renderNextCountdown();
}

let countdownTimer = null;

function renderNextCountdown() {
  const el = document.getElementById('next-countdown');
  if (!el) return;

  const now = new Date();
  const upcoming = state.races
      .filter(race => new Date(race.date + 'T' + (race.time || '23:59:59Z')) > now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!upcoming.length) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }

  const next = upcoming[0];
  const target = new Date(next.date + 'T' + (next.time || '23:59:59Z'));
  const name = next.raceName.replace('Grand Prix', 'GP');

  el.classList.remove('hidden');

  const tick = () => {
    const diff = target - new Date();
    if (diff <= 0) { renderNextCountdown(); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.innerHTML = `
      <span class="cd-label">Prossimo GP · ${escapeHtml(name)}</span>
      <span class="cd-val">${d}d ${h}h ${m}m ${s}s</span>`;
  };

  tick();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);
}

function renderHeroStats() {
  const yearEl = document.getElementById('hero-year');
  const metaEl = document.getElementById('hero-meta');
  const statsEl = document.getElementById('hero-stats');
  if (!statsEl) return;

  if (yearEl) yearEl.textContent = state.year;

  const ferrari = state.constructorStandings.find(c => c.Constructor?.name === 'Ferrari');

  let meta = ` · ${state.races.length} gare`;
  if (metaEl) metaEl.textContent = meta;

  const wins = state.ferrariDrivers.reduce((a, d) => a + (parseInt(d.wins) || 0), 0);
  let podiums = 0;
  let poles = 0;
  state.ferrariDrivers.forEach(d => {
    const s = state.raceResults[d.Driver?.driverId] || {};
    podiums += s.podiums || 0;
    poles += s.poles || 0;
  });
  const pts = ferrari
      ? parseFloat(ferrari.points) || 0
      : state.ferrariDrivers.reduce((a, d) => a + (parseFloat(d.points) || 0), 0);

  const stats = [
    { value: ferrari ? `P${ferrari.position}ª` : '—', label: 'Posizione' },
    { value: pts, label: 'Punti' },
    { value: wins, label: 'Vittorie' },
    { value: podiums, label: 'Podi' },
  ];

  statsEl.innerHTML = stats.map(s => `
    <div class="stat">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');
}

function renderOverview() {
  const container = document.getElementById('constructor-standings');
  if (!state.constructorStandings.length) {
    container.innerHTML = '<p class="loading">Nessun dato disponibile</p>';
    return;
  }

  let html = '<div class="constructor-list">';
  state.constructorStandings.forEach(c => {
    const isFerrari = c.Constructor?.name === 'Ferrari';
    html += `
      <div class="constructor-row ${isFerrari ? 'ferrari' : ''}">
        <span class="constructor-pos">${c.position}.</span>
        <span class="constructor-name">${c.Constructor?.name || ''}</span>
        <span class="constructor-pts">${c.points} pt</span>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;

  const driverContainer = document.getElementById('ferrari-drivers');
  if (!state.ferrariDrivers.length) {
    driverContainer.innerHTML = '<p class="loading">Nessun dato disponibile</p>';
    return;
  }

  let dhtml = '';
  state.ferrariDrivers.forEach(d => {
    const given = d.Driver?.givenName || '';
    const family = d.Driver?.familyName || '';
    const num = d.Driver?.permanentNumber || '';
    const wins = d.wins || '0';
    const id = d.Driver?.driverId;
    const s = state.raceResults[id] || { poles: 0, podiums: 0 };
    dhtml += `
      <a class="driver-card" href="driver.html?id=${escapeHtml(id)}">
        <div class="driver-number">${num || '?'}</div>
        <div class="driver-info">
          <div class="driver-name">${given} ${family}</div>
          <div class="driver-stat">${wins} vittorie · ${s.poles} pole · ${s.podiums} podi · Pos. ${d.position}</div>
        </div>
        <div class="driver-pts">${d.points}<span class="driver-pts-unit">pt</span></div>
      </a>
    `;
  });
  driverContainer.innerHTML = dhtml;
}

function renderRaceCalendar() {
  const container = document.getElementById('race-list');
  if (!state.races.length) {
    container.innerHTML = '<p class="loading">Nessuna gara trovata</p>';
    return;
  }

  const now = new Date();
  const past = [], upcoming = [];
  state.races.forEach(race => {
    const raceDate = new Date(race.date + 'T' + (race.time || '23:59:59Z'));
    (raceDate < now ? past : upcoming).push(race);
  });

  const total = state.races.length;
  const pct = total ? Math.round((past.length / total) * 100) : 0;

  let html = `
    <div class="progress-bar-container">
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="progress-label">${past.length}/${total} gare</span>
    </div>
  `;

  if (past.length) {
    html += '<h3 class="section-label section-past">GP Disputati</h3><div class="race-grid">';
    past.forEach(race => { html += raceCardHtml(race, 'race-past'); });
    html += '</div>';
  }

  if (upcoming.length) {
    html += '<h3 class="section-label section-upcoming">GP da Disputare</h3><div class="race-grid">';
    upcoming.forEach(race => { html += raceCardHtml(race, 'race-upcoming'); });
    html += '</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('.race-card.race-past').forEach(el => {
    el.addEventListener('click', () => openRaceModal(el.dataset.round));
  });

  container.querySelectorAll('.cover-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openCoverModal(btn.closest('.race-card').dataset.round);
    });
  });
}

const CHART_PALETTE = ['#1f77b4', '#2ca02c', '#ff7f0e', '#9467bd', '#17becf', '#e377c2', '#bcbd22', '#8c564b'];

function buildSeries(history) {
  const drivers = new Map();
  history.forEach(entry => {
    entry.standings.forEach(s => {
      const id = s.Driver?.driverId;
      if (!id) return;
      if (!drivers.has(id)) {
        drivers.set(id, {
          id,
          code: s.Driver.code || '',
          name: s.Driver.familyName || '',
          team: s.Constructors?.[0]?.name || '',
          isFerrari: s.Constructors?.some(c => c.name === 'Ferrari'),
          series: [],
        });
      }
      drivers.get(id).series[entry.round - 1] = parseFloat(s.points) || 0;
    });
  });

  const n = history.length;
  drivers.forEach(d => {
    let last = 0;
    const filled = [];
    for (let i = 0; i < n; i++) {
      if (d.series[i] != null) last = d.series[i];
      filled.push(last);
    }
    d.series = filled;
  });
  return drivers;
}

function renderPointsChart() {
  const container = document.getElementById('points-chart');
  const legend = document.getElementById('chart-legend');
  if (!state.raceHistory || !state.raceHistory.length) {
    container.innerHTML = '<p class="loading">Nessun dato disponibile</p>';
    legend.innerHTML = '';
    return;
  }

  const drivers = buildSeries(state.raceHistory);
  const n = state.raceHistory.length;

  const order = [...state.driverStandings]
      .sort((a, b) => parseFloat(b.points) - parseFloat(a.points))
      .map(s => s.Driver?.driverId)
      .filter(Boolean);

  const selected = new Set();
  if (order[0] && drivers.has(order[0])) selected.add(order[0]);
  state.ferrariDrivers.forEach(d => {
    const id = d.Driver?.driverId;
    if (id && drivers.has(id)) selected.add(id);
  });

  const lastPts = id => drivers.get(id).series[n - 1];
  const selectedList = [...selected].sort((a, b) => lastPts(b) - lastPts(a));

  const allMax = Math.max(...selectedList.map(id => Math.max(...drivers.get(id).series)), 1);
  const maxY = Math.ceil((allMax * 1.08) / 10) * 10;

  const ml = 42, mr = 18, mt = 14, mb = 30;
  const step = Math.max(44, Math.floor(560 / n));
  const plotW = Math.max(step * (n - 1), 360);
  const W = plotW + ml + mr;
  const H = 320;
  const plotH = H - mt - mb;

  const x = i => ml + i * step;
  const y = v => mt + plotH - (v / maxY) * plotH;

  const colorFor = id => {
    const d = drivers.get(id);
    if (d.isFerrari) return d.code === state.ferrariDrivers[0]?.Driver?.code ? '#D40000' : '#C89700';
    return CHART_PALETTE[selectedList.indexOf(id) % CHART_PALETTE.length];
  };

  legend.innerHTML = selectedList.map(id => {
    const d = drivers.get(id);
    return `
      <span class="legend-item">
        <span class="legend-swatch" style="background:${colorFor(id)}"></span>
        <span class="legend-name ${d.isFerrari ? 'ferrari' : ''}">${d.code || d.name}</span>
        <span class="legend-pts">${d.series[n - 1]} pt</span>
      </span>
    `;
  }).join('');

  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const v = Math.round((maxY * g) / 4);
    grid += `<line x1="${ml}" y1="${y(v)}" x2="${ml + plotW}" y2="${y(v)}" class="grid-line"/>`;
    grid += `<text x="${ml - 8}" y="${y(v) + 4}" text-anchor="end" class="axis-label">${v}</text>`;
  }

  let xlabels = '';
  for (let i = 0; i < n; i++) {
    if (n > 16 && i % 2 !== 0) continue;
    const round = state.raceHistory[i].round;
    xlabels += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="axis-label axis-round" data-round="${round}">${round}</text>`;
  }

  const lines = selectedList.map(id => {
    const d = drivers.get(id);
    const pts = d.series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const last = n - 1;
    const dotColor = colorFor(id);
    const isFerrari = d.isFerrari;
    return `
      <polyline points="${pts}" fill="none" stroke="${dotColor}" stroke-width="${isFerrari ? 3.2 : 2.2}" stroke-linecap="round" stroke-linejoin="round" class="${isFerrari ? 'line-ferrari' : ''}"/>
      <circle cx="${x(last)}" cy="${y(d.series[last])}" r="${isFerrari ? 5 : 4}" fill="${dotColor}" stroke="#fff" stroke-width="1.5"/>
    `;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" preserveAspectRatio="xMidYMin meet">
      ${grid}
      <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + plotH}" class="axis-line"/>
      <line x1="${ml}" y1="${mt + plotH}" x2="${ml + plotW}" y2="${mt + plotH}" class="axis-line"/>
      ${xlabels}
      ${lines}
    </svg>
    <div class="chart-caption">Punti cumulativi per round · ${state.year}</div>
  `;

  container.querySelectorAll('.axis-round').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const round = el.dataset.round;
      openRaceModal(round);
    });
  });
}

async function openRaceModal(round) {
  const race = state.races.find(r => r.round === round);
  if (!race) return;

  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  modal.classList.remove('hidden');

  const feature = buildCircuitFeature(race.Circuit?.circuitId);
  const circuitPanel = feature ? `
    <div class="circuit-panel">
      <div class="circuit-panel-art">${circuitSvg(feature, { stroke: 2, start: 3, labels: true })}</div>
      <div class="circuit-panel-meta">
        <span class="circuit-panel-name">${race.Circuit?.circuitName || ''}</span>
        ${feature.properties?.length ? `<span class="circuit-panel-length">${formatKm(feature.properties.length)}</span>` : ''}
      </div>
    </div>
  ` : '';

  body.innerHTML = `
    <h2>${race.raceName}</h2>
    <div class="race-meta">${race.Circuit?.circuitName || ''} · ${race.Circuit?.Location?.locality || ''} · ${formatDate(race.date)}</div>
    ${circuitPanel}
    <div class="session-tabs" id="session-tabs">
      <button class="session-tab active" data-type="race">Gara</button>
      <button class="session-tab" data-type="qualifying">Qualifiche</button>
      ${race.Sprint?.date ? '<button class="session-tab" data-type="sprint-quali">SQ</button>' : ''}
      ${race.Sprint?.date ? '<button class="session-tab" data-type="sprint">Sprint</button>' : ''}
    </div>
    <div id="session-results"></div>
  `;

  renderSessionResults(round, 'race');

  document.getElementById('session-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.session-tab');
    if (!tab) return;
    document.querySelectorAll('.session-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderSessionResults(round, tab.dataset.type);
  });
}

// Prima faceva una fetch di rete ad ogni click sulla gara/tab: ora i dati sono già in
// state.dataByRound (scaricati in bulk con loadSeason), quindi la modale è istantanea.
function renderSessionResults(round, type) {
  const container = document.getElementById('session-results');
  const roundData = state.dataByRound[parseInt(round, 10)] || {};

  let results;
  if (type === 'qualifying') {
    results = roundData.qualifying || [];
  } else if (type === 'sprint' || type === 'sprint-quali') {
    results = roundData.sprint || [];
  } else {
    results = roundData.results || [];
  }

  if (!results.length) {
    container.innerHTML = '<p class="loading">Nessun risultato disponibile</p>';
    return;
  }

  let sorted = [...results];
  if (type === 'sprint-quali') {
    sorted.sort((a, b) => parseInt(a.grid) - parseInt(b.grid));
  } else {
    sorted.sort((a, b) => parseInt(a.position) - parseInt(b.position));
  }

  const showPoints = type === 'sprint';
  const showGrid = type !== 'qualifying';
  let html = `<table class="result-table"><thead><tr><th>Pos</th>${showGrid ? '<th>Griglia</th>' : ''}<th>Pilota</th><th>Team</th><th>Tempo</th>${showPoints ? '<th>Pts</th>' : ''}</tr></thead><tbody>`;
  sorted.forEach(r => {
    const isFerrari = r.Constructor?.name === 'Ferrari';
    const pos = type === 'sprint-quali' ? r.grid : r.position;
    const status = r.status || '';
    const isFinished = status === 'Finished' || status === '' || status.startsWith('+');
    let posHtml;
    if (isFinished) {
      const posClass = parseInt(pos) <= 3 ? 'podium' : '';
      posHtml = `<td class="${posClass}">P${pos}</td>`;
    } else {
      const labels = { 'Retired': 'DNF', 'Disqualified': 'DSQ', 'Did not start': 'DNS', 'Excluded': 'EXC', 'Withdrew': 'WDN' };
      const label = labels[status] || status;
      posHtml = `<td class="status-badge status-${label.toLowerCase()}">${label}</td>`;
    }
    const timeHtml = type === 'qualifying'
        ? (r.Q3 || r.Q2 || r.Q1 || '')
        : (r.Time?.time || '');
    html += `
      <tr class="${isFerrari ? 'ferrari-row' : ''}">
        ${posHtml}
        ${showGrid ? `<td>${r.grid || ''}</td>` : ''}
        <td><strong>${r.Driver?.code || ''}</strong> ${r.Driver?.givenName || ''} ${r.Driver?.familyName || ''}</td>
        <td>${r.Constructor?.name || ''}</td>
        <td>${timeHtml}</td>
        ${showPoints ? `<td>+${r.points || 0}</td>` : ''}
      </tr>
    `;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});

document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('modal').classList.add('hidden');
  }
});

document.getElementById('cover-modal-close').addEventListener('click', closeCoverModal);

document.getElementById('cover-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeCoverModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCoverModal();
});

document.addEventListener('DOMContentLoaded', init);

// ============ PAGE TRANSITION LOADER ============

const pageLoader = document.getElementById('page-loader');

function showLoader() {
  if (!pageLoader) return;
  pageLoader.setAttribute('aria-hidden', 'false');
  pageLoader.classList.add('active');
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a.driver-card');
  if (!link) return;
  e.preventDefault();
  const href = link.getAttribute('href');
  if (!href) return;
  showLoader();
  setTimeout(() => { window.location.href = href; }, 350);
});

// ============ MEGA MENU ============

const menuToggle = document.getElementById('menu-toggle');
const megaMenu = document.getElementById('mega-menu');
const navMegaTrigger = document.querySelector('[data-mega="true"]');

function setMenu(open) {
  if (!menuToggle || !megaMenu) return;
  menuToggle.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  megaMenu.classList.toggle('open', open);
  megaMenu.setAttribute('aria-hidden', String(!open));
}

if (menuToggle && megaMenu) {
  menuToggle.addEventListener('click', () => {
    setMenu(!megaMenu.classList.contains('open'));
  });

  megaMenu.addEventListener('click', e => {
    if (e.target.closest('.mega-link')) setMenu(false);
  });

  document.addEventListener('click', e => {
    if (megaMenu.classList.contains('open') &&
        !e.target.closest('.site-header')) {
      setMenu(false);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setMenu(false);
  });
}

if (navMegaTrigger && megaMenu) {
  navMegaTrigger.addEventListener('mouseenter', () => setMenu(true));
}