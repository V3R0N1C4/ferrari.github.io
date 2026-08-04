const API = 'https://api.jolpi.ca/ergast/f1';

const params = new URLSearchParams(location.search);
const DRIVER_ID = params.get('id');

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchAllPages(baseUrl, pageSize = 1000) {
  let offset = 0;
  let allRaces = [];
  while (true) {
    const data = await fetchJSON(`${baseUrl}?limit=${pageSize}&offset=${offset}`);
    const races = data?.MRData?.RaceTable?.Races || [];
    allRaces = allRaces.concat(races);
    const total = parseInt(data?.MRData?.total || '0', 10);
    const actualLimit = parseInt(data?.MRData?.limit || pageSize, 10) || pageSize;
    const actualOffset = parseInt(data?.MRData?.offset || offset, 10);
    if (races.length === 0 || actualLimit === 0) break;
    offset = actualOffset + actualLimit;
    if (offset >= total) break;
  }
  return allRaces;
}

function raceText(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function findDriver(races) {
  for (const race of races) {
    const res = race.Results?.[0];
    if (res?.Driver) return res.Driver;
  }
  return null;
}

async function init() {
  const nameEl = document.getElementById('driver-name');
  const codeEl = document.getElementById('driver-code');
  const natEl = document.getElementById('driver-nationality');
  const statsEl = document.getElementById('driver-stats');
  const seasonsEl = document.getElementById('driver-seasons');

  if (!DRIVER_ID) {
    nameEl.textContent = 'Nessun pilota selezionato';
    return;
  }

  try {
    const [resultsRaces, qualiRaces] = await Promise.all([
      fetchAllPages(`${API}/drivers/${DRIVER_ID}/results.json`),
      fetchAllPages(`${API}/drivers/${DRIVER_ID}/qualifying.json`),
    ]);

    const driver = findDriver(resultsRaces) || findDriver(qualiRaces);
    if (!driver) {
      nameEl.textContent = 'Pilota non trovato';
      return;
    }

    const code = driver.code || DRIVER_ID.toUpperCase();
    const given = driver.givenName || '';
    const family = driver.familyName || '';

    if (nameEl) nameEl.textContent = `${given} ${family}`;
    if (codeEl) codeEl.textContent = `Pilota · ${code}`;
    if (natEl) natEl.textContent = driver.nationality || '—';

    // ---- Statistiche di carriera ----
    let gps = 0, wins = 0, podiums = 0, points = 0, dnfs = 0;
    const seasons = new Set();
    resultsRaces.forEach(race => {
      const res = race.Results?.[0];
      if (!res) return;
      gps++;
      if (race.season) seasons.add(race.season);
      points += parseFloat(res.points) || 0;
      const pos = res.positionText;
      if (pos === '1') wins++;
      if (pos === '1' || pos === '2' || pos === '3') podiums++;
      if (res.status === 'Retired') dnfs++;
    });

    let poles = 0;
    qualiRaces.forEach(race => {
      const q = race.QualifyingResults?.[0];
      if (q && q.position === '1') poles++;
    });

    const seasonSet = new Set();
    resultsRaces.forEach(race => { if (race.season) seasonSet.add(race.season); });
    const orderedSeasons = [...seasonSet].sort((a, b) => b.localeCompare(a));

    // Standings di carriera: il mirror non espone un endpoint unico per pilota,
    // quindi si recuperano le classifiche stagione per stagione a partire dalle
    // stagioni trovate nei risultati.
    const seasonList = [];
    const standingsBySeason = await Promise.all(
      orderedSeasons.map(async season => {
        const data = await fetchJSON(`${API}/${season}/driverStandings.json`)
            .catch(() => ({ MRData: { StandingsTable: { StandingsLists: [] } } }));
        const list = data?.MRData?.StandingsTable?.StandingsLists?.[0];
        return list;
      })
    );
    standingsBySeason.forEach((list, i) => {
      const s = list?.DriverStandings?.find(d => d.Driver?.driverId === DRIVER_ID);
      if (s) seasonList.push({ season: list.season, position: s.position, points: s.points, wins: s.wins, team: s.Constructors?.[0]?.name || '' });
    });
    // Stagioni senza voce in classifica (es. sostituto) ricadute sui dati dei risultati.
    seasonList.sort((a, b) => b.season.localeCompare(a.season));

    let titles = 0;
    seasonList.forEach(s => { if (s.position === '1') titles++; });

    const stats = [
      { value: gps, label: 'GP totali' },
      { value: wins, label: 'Vittorie' },
      { value: podiums, label: 'Podi' },
      { value: poles, label: 'Pole' },
      { value: titles, label: 'Titoli' },
      { value: Math.round(points), label: 'Punti' },
    ];

    statsEl.innerHTML = stats.map(s => `
      <div class="stat">
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    `).join('');

    // ---- Tabella stagioni ----
    if (!seasonList.length) {
      seasonsEl.innerHTML = '<p class="loading">Nessun dato disponibile</p>';
      return;
    }

    const rows = seasonList.map(s => {
      const champion = s.position === '1';
      return `
        <div class="driver-row ${champion ? 'champion' : ''}">
          <span class="driver-row-season">${s.season}</span>
          <span class="driver-row-name">${s.team || ''}</span>
          <span class="driver-row-pos">${s.position ? s.position + 'ª' : '—'}${champion ? ' <span class="crown">Titolo</span>' : ''}</span>
          <span class="driver-row-pts">${s.points} pt</span>
        </div>
      `;
    }).join('');

    seasonsEl.innerHTML = `<div class="driver-season-list">${rows}</div>`;
  } catch (err) {
    console.error(err);
    nameEl.textContent = 'Errore caricamento dati';
  }
}

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (!loader) return;
  loader.classList.remove('active');
  loader.setAttribute('aria-hidden', 'true');
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  setTimeout(hideLoader, 300);
});
