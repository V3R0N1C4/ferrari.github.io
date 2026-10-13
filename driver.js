const API = 'https://api.jolpi.ca/ergast/f1';

const params = new URLSearchParams(location.search);
const DRIVER_ID = params.get('id') || params.get('driver');

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

function raceOutcomeCategory(status = '') {
  const categories = {
    'Did not start': 'DNS',
    'Not started': 'DNS',
    Withdrew: 'DNS',
    Disqualified: 'DSQ',
    Excluded: 'DSQ',
  };
  if (categories[status]) return categories[status];
  if (status && status !== 'Finished' && !/^\+\s*\d+\s+Lap/.test(status)) return 'DNF';
  return null;
}
function findDriver(races) {
  for (const race of races) {
    const res = race.Results?.[0];
    if (res?.Driver) return res.Driver;
  }
  return null;
}

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (!loader) return;
  loader.classList.remove('active');
  loader.setAttribute('aria-hidden', 'true');
}

async function init() {
  const nameEl = document.getElementById('driver-name');
  const codeEl = document.getElementById('driver-code');
  const natEl = document.getElementById('driver-nationality');
  const statsEl = document.getElementById('driver-stats');
  const sprintStatsEl = document.getElementById('driver-sprint-stats');
  const rateStatsEl = document.getElementById('driver-rate-stats');
  const seasonsEl = document.getElementById('driver-seasons');

  if (!DRIVER_ID) {
    nameEl.textContent = 'Nessun pilota selezionato';
    hideLoader();
    return;
  }

  try {
    const [resultsRaces, qualiRaces, sprintRaces] = await Promise.all([
      fetchAllPages(`${API}/drivers/${DRIVER_ID}/results.json`),
      fetchAllPages(`${API}/drivers/${DRIVER_ID}/qualifying.json`),
      fetchAllPages(`${API}/drivers/${DRIVER_ID}/sprint.json`),
    ]);

    const driver = findDriver(resultsRaces) || findDriver(qualiRaces);
    if (!driver) {
      nameEl.textContent = 'Pilota non trovato';
      hideLoader();
      return;
    }

    const code = driver.code || DRIVER_ID.toUpperCase();
    const given = driver.givenName || '';
    const family = driver.familyName || '';

    if (nameEl) nameEl.textContent = `${given} ${family}`;
    if (codeEl) codeEl.textContent = `Pilota · ${code}`;
    if (natEl) natEl.textContent = driver.nationality || '—';

    // ---- Statistiche di carriera ----
    let gps = 0, wins = 0, podiums = 0, points = 0, dnfs = 0, pointsFinishes = 0;
    let gpEntries = 0, startedFirst = 0, startedSecond = 0, frontRowStarts = 0;
    const outcomeCounts = { DNF: 0, DNS: 0, DSQ: 0, 'Fuori punti': 0, 'A punti': 0 };
    const seasons = new Set();
    const startedRaceKeys = new Set();
    resultsRaces.forEach(race => {
      const res = race.Results?.[0];
      if (!res) return;
      gpEntries++;
      const outcome = raceOutcomeCategory(res.status);
      if (outcome) outcomeCounts[outcome]++;
      else if (Number.isFinite(parseInt(res.position, 10)) && !(parseFloat(res.points) > 0)) outcomeCounts['Fuori punti']++;
      const didNotStart = ['Did not start', 'Not started', 'Withdrew'].includes(res.status);
      if (!didNotStart) {
        gps++;
        startedRaceKeys.add(`${race.season}-${race.round}`);
        const grid = parseInt(res.grid, 10);
        if (grid === 1) startedFirst++;
        if (grid === 2) startedSecond++;
        if (grid === 1 || grid === 2) frontRowStarts++;
      }
      if (race.season) seasons.add(race.season);
      points += parseFloat(res.points) || 0;
      const pos = res.positionText;
      if (!didNotStart && pos === '1') wins++;
      if (!didNotStart && (pos === '1' || pos === '2' || pos === '3')) podiums++;
      if (!didNotStart && parseFloat(res.points) > 0) {
        pointsFinishes++;
        outcomeCounts['A punti']++;
      }
      if (outcome === 'DNF') dnfs++;
    });

    let poles = 0, startedRacePoles = 0;
    qualiRaces.forEach(race => {
      const q = race.QualifyingResults?.[0];
      if (q && q.position === '1') {
        poles++;
        if (startedRaceKeys.has(`${race.season}-${race.round}`)) startedRacePoles++;
      }
    });

    let sprintStarts = 0, sprintWins = 0, sprintPodiums = 0, sprintPoles = 0;
    sprintRaces.forEach(race => {
      const result = race.SprintResults?.[0];
      if (!result || ['Did not start', 'Not started'].includes(result.status)) return;
      sprintStarts++;
      const position = result.positionText || result.position;
      if (position === '1') sprintWins++;
      if (position === '1' || position === '2' || position === '3') sprintPodiums++;
      if (parseInt(result.grid, 10) === 1) sprintPoles++;
    });

    const seasonSet = new Set();
    resultsRaces.forEach(race => { if (race.season) seasonSet.add(race.season); });
    const orderedSeasons = [...seasonSet].sort((a, b) => b.localeCompare(a));

    const seasonFilter = document.getElementById('driver-chart-season');
    const sessionFilter = document.getElementById('driver-chart-session');
    const positionChart = document.getElementById('driver-position-chart');
    const outcomes = resultsRaces.map(race => {
      const result = race.Results?.[0];
      if (!result) return null;
      const category = raceOutcomeCategory(result.status);
      const position = parseInt(result.position, 10);
      return { season: race.season, session: 'race', result: category || (Number.isFinite(position) ? position : null) };
    }).filter(outcome => outcome && outcome.result !== null);
    const gridOutcomes = resultsRaces.map(race => {
      const result = race.Results?.[0];
      const gridPosition = parseInt(result?.grid, 10);
      return result && Number.isFinite(gridPosition) && gridPosition > 0
        ? { season: race.season, session: 'qualifying', result: gridPosition }
        : null;
    }).filter(Boolean);
    outcomes.push(...gridOutcomes);

    const renderPositionChart = () => {
      const season = seasonFilter.value;
      const session = sessionFilter.value;
      const sessionOutcomes = outcomes.filter(outcome => outcome.session === session);
      const filtered = sessionOutcomes.filter(outcome => season === 'all' || outcome.season === season);
      if (!filtered.length) {
        positionChart.innerHTML = '<p class="loading">Nessun risultato disponibile per questa selezione</p>';
        return;
      }

      const counts = new Map();
      filtered.forEach(outcome => counts.set(outcome.result, (counts.get(outcome.result) || 0) + 1));
      const maxPosition = Math.max(1, ...sessionOutcomes.map(outcome => typeof outcome.result === 'number' ? outcome.result : 0));
      const categories = Array.from({ length: maxPosition }, (_, index) => index + 1);
      if (session === 'race') {
        ['DNF', 'DNS', 'DSQ'].forEach(category => {
          if (sessionOutcomes.some(outcome => outcome.result === category)) categories.push(category);
        });
      }
      const maxCount = Math.max(...counts.values(), 1);
      const maxY = Math.max(4, Math.ceil(maxCount / 4) * 4);
      const ml = 38, mr = 18, mt = 18, mb = 38, step = 46;
      const plotH = 190;
      const plotW = categories.length * step;
      const width = ml + plotW + mr;
      const height = mt + plotH + mb;
      const y = value => mt + plotH - (value / maxY) * plotH;

      let grid = '';
      for (let tick = 0; tick <= 4; tick++) {
        const value = maxY * tick / 4;
        grid += `<line x1='${ml}' y1='${y(value)}' x2='${ml + plotW}' y2='${y(value)}' class='driver-chart-grid'/>`;
        grid += `<text x='${ml - 8}' y='${y(value) + 4}' text-anchor='end' class='driver-chart-axis'>${value}</text>`;
      }

      const bars = categories.map((category, index) => {
        const value = counts.get(category) || 0;
        const x = ml + index * step + (step - 24) / 2;
        const barY = y(value);
        const isSpecial = typeof category === 'string';
        const label = isSpecial ? category : `P${category}`;
        const barClass = isSpecial ? ` ${category.toLowerCase()}` : '';
        return `<g><rect x='${x}' y='${barY}' width='24' height='${mt + plotH - barY}' rx='2' class='driver-chart-bar${barClass}'><title>${label}: ${value} GP</title></rect>${value ? `<text x='${x + 12}' y='${barY - 6}' text-anchor='middle' class='driver-chart-count'>${value}</text>` : ''}<text x='${ml + index * step + step / 2}' y='${height - 12}' text-anchor='middle' class='driver-chart-axis'>${label}</text></g>`;
      }).join('');

      const selectedLabel = season === 'all' ? 'tutte le stagioni' : season;
      const sessionLabel = session === 'race' ? 'gara' : 'qualifiche';
      const note = session === 'race' ? 'Piazzamenti finali per GP · DNF, DNS e DSQ separati' : 'Posizione sulla griglia di partenza per GP';
      positionChart.innerHTML = `<svg class='driver-position-svg' viewBox='0 0 ${width} ${height}' role='img' aria-label='Distribuzione delle posizioni in ${sessionLabel}, ${selectedLabel}'>${grid}<line x1='${ml}' y1='${mt + plotH}' x2='${ml + plotW}' y2='${mt + plotH}' class='driver-chart-axis-line'/>${bars}</svg><p class='driver-chart-note'>${note}</p>`;
    };

    if (seasonFilter && sessionFilter && positionChart) {
      seasonFilter.innerHTML = `<option value='all'>Tutte le stagioni</option>${orderedSeasons.map(season => `<option value='${escapeHtml(season)}'>${escapeHtml(season)}</option>`).join('')}`;
      seasonFilter.addEventListener('change', renderPositionChart);
      sessionFilter.addEventListener('change', renderPositionChart);
      renderPositionChart();
    }

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
    const rateMetrics = [
      { label: 'Vittorie', count: wins },
      { label: 'Podi', count: podiums },
      { label: 'Pole', count: startedRacePoles, firstCount: startedFirst, secondCount: startedSecond, frontRowCount: frontRowStarts },
    ];
    const outcomeHtml = ['DNF', 'DNS', 'DSQ', 'Fuori punti', 'A punti'].map(label => {
      const count = outcomeCounts[label];
      const percentage = gpEntries ? count / gpEntries * 100 : 0;
      const value = gpEntries ? `${percentage.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';
      return `<div class="driver-outcome-metric ${label === 'Fuori punti' ? 'outside-points' : label === 'A punti' ? 'in-points' : label.toLowerCase()}">
        <span class="driver-outcome-label">${label}</span>
        <strong class="driver-outcome-value">${value}</strong>
        <div class="driver-outcome-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage.toFixed(1)}" aria-label="${label}: ${value}"><span style="width:${Math.min(100, percentage)}%"></span></div>
        <span class="driver-outcome-count">${count} / ${gpEntries} GP</span>
      </div>`;
    }).join('');
    if (rateStatsEl) {
      rateStatsEl.innerHTML = `<div class="driver-rate-grid">${rateMetrics.map(metric => {
        const percentage = gps ? metric.count / gps * 100 : 0;
        const value = gps ? `${percentage.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—';
        const firstPercentage = gps && metric.firstCount != null ? metric.firstCount / gps * 100 : 0;
        const secondPercentage = gps && metric.secondCount != null ? metric.secondCount / gps * 100 : 0;
        const barPercentage = metric.frontRowCount == null ? percentage : gps ? metric.frontRowCount / gps * 100 : 0;
        const bar = metric.firstCount == null
          ? `<div class='driver-rate-track' role='progressbar' aria-valuemin='0' aria-valuemax='100' aria-valuenow='${percentage.toFixed(1)}' aria-label='${metric.label}: ${value}'><span style='width:${Math.min(100, percentage)}%'></span></div>`
          : `<div class='driver-rate-track driver-rate-track-frontrow' role='progressbar' aria-valuemin='0' aria-valuemax='100' aria-valuenow='${barPercentage.toFixed(1)}' aria-label='Partenze in prima fila: ${barPercentage.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%'><span class='p1' style='width:${Math.min(100, firstPercentage)}%'></span><span class='p2' style='width:${Math.min(100, secondPercentage)}%'></span></div><div class='driver-rate-breakdown'><span class='driver-rate-key pole'>Pole P1 ${metric.firstCount}</span><span class='driver-rate-key second'>Partito 2° ${metric.secondCount}</span></div>`;
        return `<div class="driver-rate-item">
          <div class="driver-rate-label">${metric.label}</div>
          <strong class="driver-rate-value">${value}</strong>
          ${bar}
        </div>`;
      }).join('')}</div><section class="driver-rate-outcomes"><h3>Esiti GP</h3><div class="driver-outcome-cell">${outcomeHtml}</div></section>`;
    }
    if (sprintStatsEl) {
      sprintStatsEl.innerHTML = `
        <span class="driver-sprint-heading">Sprint</span>
        <span class="driver-sprint-item"><strong>${sprintStarts}</strong> disputate</span>
        <span class="driver-sprint-item"><strong>${sprintWins}</strong> vittorie</span>
        <span class="driver-sprint-item"><strong>${sprintPodiums}</strong> podi</span>
        <span class="driver-sprint-item"><strong>${sprintPoles}</strong> pole SQ</span>
      `;
    }

    // ---- Tabella stagioni ----
    if (!seasonList.length) {
      seasonsEl.innerHTML = '<p class="loading">Nessun dato disponibile</p>';
      hideLoader();
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
  hideLoader();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
