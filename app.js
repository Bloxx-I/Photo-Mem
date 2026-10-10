'use strict';

/* ---------- Storage ---------- */

const STORE_KEY = 'photomem:v1';

const defaultData = () => ({ cards: [], texts: [], history: [], levels: {}, leitnerDeck: 'all', semantic: false });

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const d = raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
    d.cards.forEach((c) => { c.deck ||= 'own'; });
    // Old fixed drill difficulty → adaptive level
    const old = { leicht: 2, mittel: 10, schwer: 16, profi: 24 }[d.drillLevel];
    if (old && !d.levels.drill) d.levels.drill = { level: old, recent: [] };
    delete d.drillLevel;
    return d;
  } catch {
    return defaultData();
  }
}

let data = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    toast('Speichern fehlgeschlagen – ist der Speicher voll?');
  }
}

/* ---------- Helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function dayStr(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return dayStr(d);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

function logSession(mode, score, detail) {
  data.history.push({ mode, score: Math.round(score), detail, at: new Date().toISOString() });
  save();
  renderStreak();
}

function streak() {
  const days = new Set(data.history.map((h) => dayStr(h.at)));
  let n = 0;
  // A streak still counts if today hasn't been trained yet.
  let offset = days.has(dayStr()) ? 0 : -1;
  while (days.has(addDays(offset - n))) n++;
  return n;
}

function renderStreak() {
  const n = streak();
  const el = $('#streak');
  el.textContent = `🔥 ${n} ${n === 1 ? 'Tag' : 'Tage'}`;
  el.classList.toggle('on', n > 0);
}

/* ---------- Router ---------- */

let cleanup = null;

const routes = {
  home: renderHome,
  drill: renderDrill,
  leitner: renderLeitner,
  blurt: renderBlurt,
  stats: renderStats,
  settings: renderSettings,
};

function navigate(name) {
  if (location.hash.slice(1) !== name) location.hash = name;
  else route();
}

function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  stopMic();
  const name = routes[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  routes[name]();
  window.scrollTo(0, 0);
  view.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) navigate(nav.dataset.nav);
});

window.addEventListener('hashchange', route);

/* ---------- Home ---------- */

function dueCards() {
  return leitnerQueue().all;
}

function renderHome() {
  const due = dueCards().length;
  const trainedToday = data.history.some((h) => dayStr(h.at) === dayStr());
  view.innerHTML = `
    <h1>Trainiere dein <span class="hl">fotografisches Gedächtnis</span></h1>
    <p class="muted">Drei Methoden – jeden Tag ein paar Minuten. Die Schwierigkeit wächst mit dir. ${trainedToday ? 'Heute schon trainiert ✅' : 'Heute noch nicht trainiert.'}</p>

    <button class="card mode-card" data-nav="drill">
      <div class="emoji">🎯</div>
      <div>
        <h3>1 · Recall-Drill <span class="pill">Level ${levelOf('drill')}</span></h3>
        <p class="muted small">Wie Scharfschützen trainieren: Präge dir zufällige Objekte in wenigen Sekunden ein und rufe sie danach ab.</p>
      </div>
    </button>

    <button class="card mode-card" data-nav="leitner">
      <div class="emoji">🗂️</div>
      <div>
        <h3>2 · Leitner-System <span class="pill">Level ${levelOf('leitner')}</span> ${due ? `<span class="pill">${due} fällig</span>` : ''}</h3>
        <p class="muted small">Karteikarten in 5 Boxen – mit fertigen Themenpaketen von Weltraum bis Denkfehler. Richtig → nächste Box, falsch → zurück in Box 1.</p>
      </div>
    </button>

    <button class="card mode-card" data-nav="blurt">
      <div class="emoji">📝</div>
      <div>
        <h3>3 · Blurting <span class="pill">Level ${levelOf('blurt')}</span></h3>
        <p class="muted small">Spannenden Text lesen, schließen, alles aufschreiben oder diktieren – die App prüft, welche Kernaussagen fehlen.</p>
      </div>
    </button>
  `;
}

/* ---------- Adaptive difficulty ---------- */

/*
 * One staircase per mode keeps you in the "challenging but doable" zone
 * (roughly 75 % success): clearly too easy → one level up, clearly too hard
 * → one level down, otherwise stay. Two shaky rounds in a row also step down,
 * so success never gets out of reach.
 */
const ADAPT = {
  drill: { up: 90, down: 55, max: 32 },
  leitner: { up: 90, down: 65, max: 10 },
  blurt: { up: 85, down: 50, max: 8 },
};

const START_LEVEL = { drill: 1, leitner: 3, blurt: 1 };

function levelOf(mode) {
  return data.levels?.[mode]?.level || START_LEVEL[mode];
}

function setLevel(mode, level) {
  data.levels ||= {};
  data.levels[mode] = { level: Math.min(ADAPT[mode].max, Math.max(1, level)), recent: [] };
  save();
}

function adapt(mode, score) {
  const cfg = ADAPT[mode];
  data.levels ||= {};
  const st = (data.levels[mode] ||= { level: START_LEVEL[mode], recent: [] });
  const prev = st.recent.at(-1);
  let delta = 0;
  if (score >= cfg.up) delta = 1;
  else if (score < cfg.down) delta = -1;
  else if (prev !== undefined && prev < 70 && score < 70) delta = -1;
  const before = st.level;
  st.level = Math.min(cfg.max, Math.max(1, st.level + delta));
  st.recent = st.level === before ? [...st.recent, score].slice(-3) : [];
  save();
  return { before, after: st.level, delta: st.level - before };
}

function levelBanner({ before, after }, harder, easier, same) {
  if (after > before) return `<div class="card level up">⬆️ <b>Level ${after}!</b> ${harder}</div>`;
  if (after < before) return `<div class="card level down">🔽 <b>Level ${after}</b> – ${easier}</div>`;
  return `<div class="card level">➡️ <b>Level ${after}</b> – ${same}</div>`;
}

/* ---------- 1. Recall-Drill ---------- */

const OBJECTS = [
  '🍎','🍌','🍇','🍓','🍒','🍍','🥕','🌽','🥦','🍄','🧀','🥐','🍕','🍔','🍩','🍪','🎂','☕','🍵','🧃',
  '⚽','🏀','🎾','🎱','🏓','🎳','🪁','🎯','🎲','🧩','🎸','🎺','🥁','🎻','🎹','🎤','🎧','📷','📺','💡',
  '🔑','🔒','🔨','🪛','🧲','✂️','📎','📌','✏️','🖊️','📏','📚','📦','🧸','🎈','🎁','🕯️','⏰','⌛','🧭',
  '👓','🎩','👟','👜','🧤','🧣','💍','👑','🌂','🧳','🚗','🚲','🛴','✈️','🚀','⛵','🚂','🚁','🏠','⛺',
  '🌵','🌲','🌻','🌹','🍁','🌙','⭐','☀️','⚡','❄️','🔥','💧','🌈','🐶','🐱','🐭','🦊','🐻','🐼','🐸',
  '🐵','🐔','🐧','🦉','🐢','🐍','🐙','🦀','🐟','🦋','🐝','🐞','🦒','🐘','🦓','🦔','🧪','🔭','🧯','🪴',
];

/* Odd levels add an object, even levels cut the viewing time by 20 %. */
function drillParams(level) {
  const count = Math.min(20, 5 + Math.floor((level - 1) / 2));
  const perItem = Math.max(0.6, 2 - 0.1 * (count - 5));
  const seconds = Math.max(3, Math.round(count * perItem * (level % 2 === 0 ? 0.8 : 1)));
  const cols = count <= 6 ? 3 : count <= 12 ? 4 : 5;
  const recallCols = count * 2 <= 12 ? 4 : count * 2 <= 24 ? 5 : 6;
  return { count, seconds, cols, recallCols };
}

function renderDrill() {
  const level = levelOf('drill');
  const p = drillParams(level);
  const best = data.history.filter((h) => h.mode === 'drill').reduce((m, h) => Math.max(m, h.detail?.level || 0), 0);

  view.innerHTML = `
    <h1>🎯 Recall-Drill</h1>
    <p class="muted">Präge dir die Objekte ein und markiere sie danach in einer gemischten Auswahl.</p>
    <div class="card stack">
      <div class="row between">
        <div><span class="muted small">Dein Level</span><div class="big-num">${level}</div></div>
        <div class="right">
          <b>${p.count} Objekte</b><br><span class="muted">${p.seconds} Sekunden</span>
        </div>
      </div>
      <p class="muted small" style="margin:0">Die Schwierigkeit passt sich an: ab 90 % geht's hoch (mehr Objekte oder weniger Zeit), unter 55 % wieder runter. ${best ? `Höchstes Level bisher: <b>${best}</b>.` : ''}</p>
      <button class="btn primary block" id="start">Los geht's</button>
      <div class="row between">
        <span class="muted small">Level selbst wählen</span>
        <div class="row" style="gap:6px">
          <button class="btn ghost small-btn" id="minus" aria-label="Leichter" ${level <= 1 ? 'disabled' : ''}>−</button>
          <button class="btn ghost small-btn" id="plus" aria-label="Schwerer" ${level >= ADAPT.drill.max ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>
    <p class="muted small">Tipp: Verknüpfe die Objekte zu einer kleinen Geschichte oder lege sie gedanklich in Räume deiner Wohnung.</p>
  `;

  $('#minus').addEventListener('click', () => { setLevel('drill', level - 1); renderDrill(); });
  $('#plus').addEventListener('click', () => { setLevel('drill', level + 1); renderDrill(); });
  $('#start').addEventListener('click', () => drillMemorize());
}

function drillMemorize() {
  const level = levelOf('drill');
  const p = drillParams(level);
  const pool = shuffle(OBJECTS);
  const shown = pool.slice(0, p.count);
  const distractors = pool.slice(p.count, p.count * 2);

  view.innerHTML = `
    <div class="row between"><h1>Einprägen <span class="pill">Level ${level}</span></h1><span class="big-num" id="secs">${p.seconds}</span></div>
    <div class="timer"><div id="bar"></div></div>
    <div class="grid" style="--cols:${p.cols}">
      ${shown.map((o) => `<div class="tile">${o}</div>`).join('')}
    </div>
    <p></p>
    <button class="btn ghost block" id="skip">Ich bin bereit</button>
  `;

  const start = performance.now();
  const total = p.seconds * 1000;
  let raf;
  const tick = (now) => {
    const left = Math.max(0, total - (now - start));
    $('#bar').style.transform = `scaleX(${left / total})`;
    $('#secs').textContent = Math.ceil(left / 1000);
    if (left <= 0) return done();
    raf = requestAnimationFrame(tick);
  };
  const done = () => {
    cancelAnimationFrame(raf);
    cleanup = null;
    drillRecall(level, shown, distractors);
  };
  raf = requestAnimationFrame(tick);
  cleanup = () => cancelAnimationFrame(raf);
  $('#skip').addEventListener('click', done);
}

function drillRecall(level, shown, distractors) {
  const p = drillParams(level);
  const options = shuffle([...shown, ...distractors]);
  const picked = new Set();

  view.innerHTML = `
    <h1>Was hast du gesehen?</h1>
    <p class="muted">Markiere genau die <b>${p.count}</b> Objekte von eben. <span id="count">0</span>/${p.count} gewählt.</p>
    <div class="grid" style="--cols:${p.recallCols}" id="opts">
      ${options.map((o, i) => `<button class="tile" data-i="${i}" aria-pressed="false">${o}</button>`).join('')}
    </div>
    <p></p>
    <button class="btn primary block" id="check">Auswerten</button>
  `;

  $('#opts').addEventListener('click', (e) => {
    const t = e.target.closest('[data-i]');
    if (!t) return;
    const o = options[t.dataset.i];
    picked.has(o) ? picked.delete(o) : picked.add(o);
    t.classList.toggle('picked', picked.has(o));
    t.setAttribute('aria-pressed', picked.has(o));
    $('#count').textContent = picked.size;
  });

  $('#check').addEventListener('click', () => {
    const shownSet = new Set(shown);
    const hits = [...picked].filter((o) => shownSet.has(o)).length;
    const wrong = picked.size - hits;
    const score = Math.max(0, (hits - wrong) / p.count) * 100;
    logSession('drill', score, { level, hits, wrong, count: p.count });
    const change = adapt('drill', score);
    const next = drillParams(change.after);
    const what = next.count > p.count
      ? `Nächste Runde: <b>${next.count} Objekte</b> (${next.seconds} s).`
      : `Nächste Runde: nur noch <b>${next.seconds} s</b> statt ${p.seconds} s für ${next.count} Objekte.`;

    view.innerHTML = `
      <h1>${score >= 90 ? 'Stark! 🧠' : score >= 60 ? 'Gut gemacht 👍' : 'Weiter üben 💪'}</h1>
      <div class="card">
        <div class="kpis">
          <div class="kpi"><b>${Math.round(score)}%</b><small>Score</small></div>
          <div class="kpi"><b>${hits}/${p.count}</b><small>Treffer</small></div>
          <div class="kpi"><b>${wrong}</b><small>Falsch</small></div>
        </div>
      </div>
      ${levelBanner(change, what, `etwas leichter: ${next.count} Objekte, ${next.seconds} s.`, 'genau richtig gefordert. Ab 90 % geht\'s hoch.')}
      <div class="legend">
        <span class="l-got">richtig</span><span class="l-missed">falsch gewählt</span><span>gestrichelt = übersehen</span>
      </div>
      <div class="grid" style="--cols:${p.recallCols}">
        ${options.map((o) => {
          const cls = shownSet.has(o) ? (picked.has(o) ? 'hit' : 'miss') : (picked.has(o) ? 'wrong' : 'dim');
          return `<div class="tile ${cls}">${o}</div>`;
        }).join('')}
      </div>
      <p></p>
      <div class="row">
        <button class="btn primary" id="again">Nächste Runde</button>
        <button class="btn" id="back">Übersicht</button>
      </div>
    `;
    $('#again').addEventListener('click', () => drillMemorize());
    $('#back').addEventListener('click', renderDrill);
  });
}

/* ---------- 2. Leitner-System ---------- */

const BOX_INTERVALS = [1, 2, 4, 8, 16]; // base days until next review, for boxes 1–5

/* Higher level = more new cards per day and longer gaps between reviews. */
function leitnerParams(level = levelOf('leitner')) {
  const ease = 1 + 0.1 * (level - 1);
  return {
    newPerDay: 3 + level,
    intervals: BOX_INTERVALS.map((d, i) => (i === 0 ? 1 : Math.max(2, Math.round(d * ease)))),
  };
}

function boxLabel(days) {
  return days === 1 ? 'täglich' : `alle ${days} T.`;
}

function newLeft() {
  const t = data.newToday;
  return Math.max(0, leitnerParams().newPerDay - (t?.day === dayStr() ? t.n : 0));
}

/* Today's session: due reviews plus as many new cards as today's budget allows. */
function leitnerQueue(inDeck = () => true) {
  const today = dayStr();
  const reviews = data.cards.filter((c) => !c.isNew && c.due <= today && inDeck(c));
  const fresh = data.cards.filter((c) => c.isNew && inDeck(c)).slice(0, newLeft());
  return { reviews, fresh, all: [...shuffle(reviews), ...fresh] };
}

const OWN_DECKS = {
  own: { emoji: '✍️', title: 'Eigene Karten' },
  blurt: { emoji: '📝', title: 'Aus Blurting' },
};

/* Built-in packs plus packs your KI server generated. */
function allDecks() {
  return [...DECKS, ...(data.decks || [])];
}

function deckInfo(id) {
  return allDecks().find((d) => d.id === id) || OWN_DECKS[id] || OWN_DECKS.own;
}

function addCard(front, back, deck = 'own', isNew = false) {
  front = front.trim();
  back = back.trim();
  if (!front || !back) return false;
  if (data.cards.some((c) => c.front === front && c.deck === deck)) return false;
  data.cards.push({ id: uid(), front, back, box: 1, due: dayStr(), deck, ...(isNew && { isNew: true }) });
  return true;
}

function addPack(deck) {
  shuffle(deck.cards).forEach(([front, back]) => addCard(front, back, deck.id, true));
  save();
}

function renderLeitner() {
  const filter = data.leitnerDeck || 'all';
  const inDeck = (c) => filter === 'all' || c.deck === filter;
  const cards = data.cards.filter(inDeck);
  const q = leitnerQueue(inDeck);
  const due = q.all;
  const lp = leitnerParams();
  const counts = [1, 2, 3, 4, 5].map((b) => cards.filter((c) => c.box === b).length);
  const usedDecks = [...new Set(data.cards.map((c) => c.deck || 'own'))];

  view.innerHTML = `
    <h1>🗂️ Leitner-System</h1>
    <p class="muted">Richtig beantwortete Karten wandern eine Box weiter und kommen seltener dran. Falsche fallen zurück in Box 1.</p>

    ${usedDecks.length > 1 ? `
      <div class="seg" id="filter" style="margin-bottom:4px">
        <button data-deck="all" class="${filter === 'all' ? 'on' : ''}">Alle</button>
        ${usedDecks.map((id) => `<button data-deck="${id}" class="${filter === id ? 'on' : ''}">${deckInfo(id).emoji} ${esc(deckInfo(id).title)}</button>`).join('')}
      </div>` : ''}

    <div class="boxes">
      ${counts.map((n, i) => `<div class="box"><small>Box ${i + 1}</small><b>${n}</b><small>${boxLabel(lp.intervals[i])}</small></div>`).join('')}
    </div>
    <p class="muted small" style="margin:-4px 0 12px">Level ${levelOf('leitner')} · ${lp.newPerDay} neue Karten pro Tag${q.fresh.length ? ` · heute ${q.reviews.length} Wiederholungen + ${q.fresh.length} neue` : ''}</p>

    <button class="btn primary block" id="learn" ${due.length ? '' : 'disabled'}>
      ${due.length ? `${due.length} Karte${due.length === 1 ? '' : 'n'} lernen` : data.cards.length ? 'Heute nichts fällig 🎉' : 'Wähle unten ein Themenpaket'}
    </button>

    <h2>Themenpakete</h2>
    <p class="muted small">Neue Karten kommen schrittweise dazu. Wie viele pro Tag, passt sich deinem Lernerfolg an.</p>
    <div class="card" id="packs">
      ${allDecks().map((d) => {
        const n = data.cards.filter((c) => c.deck === d.id).length;
        return `
        <div class="list-item">
          <div class="text"><b>${d.emoji} ${esc(d.title)}</b><br><span class="muted small">${d.cards.length} Karten${n ? ` · ${data.cards.filter((c) => c.deck === d.id && c.box >= 4).length} sitzen schon` : ''}</span></div>
          ${n
            ? `<button class="btn ghost small-btn" data-remove="${d.id}">Entfernen</button>`
            : `<button class="btn primary small-btn" data-add="${d.id}">+ Hinzufügen</button>`}
        </div>`;
      }).join('')}
    </div>

    ${AI.llmOn() ? `
    <form class="card stack" id="genDeck">
      <h3>🪄 Neues Paket von deinem KI-Server</h3>
      <input type="text" id="deckTopic" placeholder="Thema, z. B. Römisches Reich (leer = Überraschung)" autocomplete="off">
      <button class="btn block" type="submit" id="deckBtn">12 Karten erzeugen</button>
    </form>` : ''}

    <h2>Eigene Karte</h2>
    <form class="card stack" id="add">
      <div><label for="front">Vorderseite (Frage)</label><input type="text" id="front" required autocomplete="off"></div>
      <div><label for="back">Rückseite (Antwort)</label><input type="text" id="back" required autocomplete="off"></div>
      <button class="btn block" type="submit">Hinzufügen</button>
    </form>

    <details class="card">
      <summary><b>Mehrere Karten importieren</b></summary>
      <p class="muted small" style="margin-top:8px">Eine Karte pro Zeile: <code>Frage ; Antwort</code> (auch Tab oder <code>|</code> als Trenner).</p>
      <textarea id="bulk" placeholder="Hauptstadt von Australien ; Canberra&#10;Pi (5 Stellen) ; 3,14159"></textarea>
      <p></p>
      <button class="btn block" id="import">Importieren</button>
    </details>

    <details class="card">
      <summary><b>Karten ansehen (${cards.length})</b></summary>
      <div id="list" style="margin-top:8px">
        ${cards.length ? cards.map((c) => `
          <div class="list-item">
            <div class="text"><b>${esc(c.front)}</b><br><span class="muted small">${esc(c.back)}</span></div>
            <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
              <span class="pill">Box ${c.box}</span>
              <button class="btn ghost small-btn" data-del="${c.id}" aria-label="Karte löschen">✕</button>
            </div>
          </div>`).join('') : '<p class="muted center" style="margin:0">Keine Karten.</p>'}
      </div>
    </details>
  `;

  $('#learn').addEventListener('click', () => leitnerSession(due));

  $('#filter')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-deck]');
    if (!b) return;
    data.leitnerDeck = b.dataset.deck;
    save();
    renderLeitner();
  });

  $('#packs').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const rem = e.target.closest('[data-remove]');
    if (add) {
      const deck = allDecks().find((d) => d.id === add.dataset.add);
      addPack(deck);
      toast(`${deck.emoji} ${deck.title} hinzugefügt`);
      renderLeitner();
    }
    if (rem && confirm('Paket samt Lernfortschritt entfernen?')) {
      data.cards = data.cards.filter((c) => c.deck !== rem.dataset.remove);
      data.decks = (data.decks || []).filter((d) => d.id !== rem.dataset.remove);
      if (data.leitnerDeck === rem.dataset.remove) data.leitnerDeck = 'all';
      save();
      renderLeitner();
    }
  });

  $('#genDeck')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#deckBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Dein Server erstellt Karten …';
    try {
      const d = await AI.generateDeck($('#deckTopic').value.trim(), allDecks().map((x) => x.title));
      const deck = { id: `ai:${uid()}`, ...d };
      (data.decks ||= []).push(deck);
      addPack(deck);
      toast(`${deck.emoji} ${deck.title}: ${deck.cards.length} Karten`);
      if (location.hash.slice(1) === 'leitner') renderLeitner();
    } catch (err) {
      toast(`Fehler: ${AI.explain(err, AI.cfg().llmUrl)}`);
      if (btn.isConnected) { btn.disabled = false; btn.textContent = '12 Karten erzeugen'; }
    }
  });

  $('#add').addEventListener('submit', (e) => {
    e.preventDefault();
    if (addCard($('#front').value, $('#back').value)) {
      save();
      renderLeitner();
      toast('Karte angelegt');
      $('#front').focus();
    }
  });

  $('#import').addEventListener('click', () => {
    let n = 0;
    for (const line of $('#bulk').value.split('\n')) {
      const m = line.split(/\s*(?:;|\t|\|)\s*/);
      if (m.length >= 2 && addCard(m[0], m.slice(1).join(' ; '))) n++;
    }
    save();
    renderLeitner();
    toast(n ? `${n} Karte${n === 1 ? '' : 'n'} importiert` : 'Keine gültigen Zeilen gefunden');
  });

  $('#list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Diese Karte löschen?')) return;
    data.cards = data.cards.filter((c) => c.id !== b.dataset.del);
    save();
    renderLeitner();
  });
}

function leitnerSession(queue) {
  let i = 0;
  let right = 0;

  const show = () => {
    if (i >= queue.length) return finish();
    const c = queue[i];
    const d = deckInfo(c.deck);
    view.innerHTML = `
      <div class="row between"><h1>Karte ${i + 1}/${queue.length}</h1><span class="pill">${c.isNew ? '✨ Neu' : `Box ${c.box}`}</span></div>
      <p class="muted small">${d.emoji} ${esc(d.title)}</p>
      <div class="card flash" id="flash">
        <div>${esc(c.front)}</div>
      </div>
      <div id="actions"><button class="btn primary block" id="reveal">Antwort zeigen</button></div>
      <p class="muted small center">Erst im Kopf beantworten – dann aufdecken.</p>
    `;
    $('#reveal').addEventListener('click', () => {
      $('#flash').insertAdjacentHTML('beforeend', `<div class="answer">${esc(c.back)}</div>`);
      $('#actions').innerHTML = `
        <div class="row" style="flex-wrap:nowrap">
          <button class="btn bad block" id="no">✗ Nicht gewusst</button>
          <button class="btn good block" id="yes">✓ Gewusst</button>
        </div>`;
      $('#no').addEventListener('click', () => answer(false));
      $('#yes').addEventListener('click', () => answer(true));
    });
  };

  const answer = (ok) => {
    const card = data.cards.find((c) => c.id === queue[i].id);
    if (card) {
      if (card.isNew) {
        delete card.isNew;
        const t = data.newToday?.day === dayStr() ? data.newToday : { day: dayStr(), n: 0 };
        data.newToday = { day: t.day, n: t.n + 1 };
      }
      card.box = ok ? Math.min(5, card.box + 1) : 1;
      card.due = addDays(leitnerParams().intervals[card.box - 1]);
      save();
    }
    if (ok) right++;
    i++;
    show();
  };

  const finish = () => {
    const score = queue.length ? (right / queue.length) * 100 : 0;
    logSession('leitner', score, { right, total: queue.length });
    // Tiny sessions say little about your level, so only adapt from 4 cards on.
    let banner = '';
    if (queue.length >= 4) {
      const change = adapt('leitner', score);
      const np = leitnerParams(change.after);
      banner = levelBanner(change,
        `Du sitzt sicher – ab jetzt <b>${np.newPerDay} neue Karten</b> pro Tag und längere Abstände zwischen den Wiederholungen.`,
        `etwas ruhiger: ${np.newPerDay} neue Karten pro Tag und kürzere Abstände, damit's wieder sitzt.`,
        'gutes Tempo. Ab 90 % richtig gibt\'s mehr neue Karten.');
    }
    view.innerHTML = `
      <h1>Fertig für heute ✅</h1>
      <div class="card">
        <div class="kpis">
          <div class="kpi"><b>${Math.round(score)}%</b><small>richtig</small></div>
          <div class="kpi"><b>${right}</b><small>gewusst</small></div>
          <div class="kpi"><b>${queue.length - right}</b><small>zurück in Box 1</small></div>
        </div>
      </div>
      ${banner}
      <button class="btn primary block" data-nav="leitner">Zur Übersicht</button>
    `;
  };

  show();
}

/* ---------- 3. Blurting ---------- */

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function blurtTexts() {
  return [
    ...TEXTS.map((t) => ({ ...t, key: `b:${t.id}`, builtin: true })),
    ...data.texts.map((t) => ({ ...t, key: t.id, emoji: t.emoji || '✍️', facts: t.facts || Recall.autoFacts(t.body) })),
  ];
}

/* Suggest the topic you've practised least or scored lowest on. */
function suggestText(exceptKey) {
  const list = blurtTexts().filter((t) => t.key !== exceptKey);
  const rank = (t) => lastBlurt(t.key)?.score ?? -1;
  return list.sort((a, b) => rank(a) - rank(b))[0] || blurtTexts()[0];
}

function lastBlurt(key) {
  return data.history.filter((h) => h.mode === 'blurt' && h.detail?.textId === key).pop();
}

/*
 * Level 1: read as long as you like. From level 2 the text hides itself after a
 * reading time that shrinks per level; from level 5 a short distraction task
 * sits between reading and writing, so you recall from memory, not from echo.
 */
const SECONDS_PER_WORD = [null, null, 0.75, 0.6, 0.5, 0.42, 0.36, 0.3, 0.26];

function blurtParams(level = levelOf('blurt')) {
  return { spw: SECONDS_PER_WORD[level], pause: level >= 7 ? 25 : level >= 5 ? 15 : 0 };
}

function readSeconds(text, p = blurtParams()) {
  return p.spw ? Math.max(15, Math.round(Recall.words(text.body).length * p.spw)) : null;
}

function blurtLevelText(level = levelOf('blurt')) {
  const p = blurtParams(level);
  if (!p.spw) return 'Lesen ohne Zeitlimit.';
  const per100 = Math.round(p.spw * 100);
  return `Lesezeit ca. ${per100} s pro 100 Wörter${p.pause ? ` + ${p.pause} s Ablenkung vor dem Schreiben` : ''}.`;
}

function semanticStatus() {
  const s = Recall.Semantic;
  if (!data.semantic) return 'Aus – Abgleich über Wörter, Wortformen, Synonyme und Zahlwörter.';
  if (s.state === 'ready') return 'Bereit ✓ – läuft lokal auf deinem Gerät.';
  if (s.state === 'loading') return `Lädt Sprachmodell … ${Math.round(s.progress * 100)}%`;
  if (s.state === 'error') return '⚠️ Laden fehlgeschlagen (offline?). Es wird nur der Wortabgleich genutzt.';
  return 'An – beim ersten Prüfen wird einmalig ein Sprachmodell (~120 MB) geladen und danach offline gespeichert.';
}

function renderBlurt() {
  const list = blurtTexts();
  const item = (t) => {
    const last = lastBlurt(t.key);
    return `
      <div class="list-item">
        <div class="text"><b>${t.emoji} ${esc(t.title)}</b><br><span class="muted small">${t.facts.length} Kernaussagen${last ? ` · zuletzt ${last.score}%` : ''}</span></div>
        <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
          <button class="btn primary small-btn" data-start="${t.key}">Start</button>
          ${t.builtin ? '' : `<button class="btn ghost small-btn" data-del="${t.key}" aria-label="Text löschen">✕</button>`}
        </div>
      </div>`;
  };

  view.innerHTML = `
    <h1>📝 Blurting</h1>
    <p class="muted">Lies einen Text, verdecke ihn und schreib oder <b>diktiere</b> alles, was du noch weißt. Die App prüft, welche Kernaussagen du erinnert hast – auch wenn du andere Worte benutzt.</p>

    <div class="card row" style="flex-wrap:nowrap">
      <div class="big-num" style="min-width:2ch;text-align:center">${levelOf('blurt')}</div>
      <div><h3>Dein Level</h3><p class="muted small" style="margin:0">${blurtLevelText()} Ab 85 % wird es schwerer, unter 50 % leichter.</p></div>
    </div>

    ${AI.llmOn() ? `
    <div class="card">
      <div class="row between" style="flex-wrap:nowrap">
        <div><h3>🖥️ KI-Server aktiv</h3><p class="muted small" style="margin:0">${esc(AI.cfg().llmModel)} bewertet deine Antworten sinngemäß${AI.whisperOn() ? ' · Diktat über Whisper' : ''}.</p></div>
        <button class="btn ghost small-btn" data-nav="settings">⚙️</button>
      </div>
    </div>
    <form class="card stack" id="gen">
      <h3>🪄 Neues Thema erzeugen</h3>
      <input type="text" id="genTopic" placeholder="Thema (leer = Überraschung)" autocomplete="off">
      <button class="btn block" type="submit" id="genBtn">Text erzeugen</button>
    </form>` : `
    <div class="card">
      <div class="row between" style="flex-wrap:nowrap">
        <div><h3>🧠 KI-Abgleich</h3><p class="muted small" style="margin:0" id="semStatus">${semanticStatus()}</p></div>
        <label class="switch" aria-label="KI-Abgleich"><input type="checkbox" id="semToggle" ${data.semantic ? 'checked' : ''}><span></span></label>
      </div>
      <p class="muted small" style="margin:8px 0 0">Erkennt Umschreibungen und Sätze mit ganz anderen Worten. Ohne KI-Abgleich klappen Synonyme, Wortformen und Zahlwörter trotzdem. Eigener KI-Server? <a href="#settings">Hier verbinden</a>.</p>
    </div>`}

    <h2>Themen</h2>
    <div class="card" id="texts">${list.filter((t) => t.builtin).map(item).join('')}</div>

    <h2>Eigene Texte</h2>
    <div class="card" id="own">
      ${list.some((t) => !t.builtin) ? list.filter((t) => !t.builtin).map(item).join('') : '<p class="muted center" style="margin:0">Noch keine eigenen Texte.</p>'}
    </div>

    <form class="card stack" id="add">
      <h3>Neuer Text</h3>
      <div><label for="title">Titel</label><input type="text" id="title" placeholder="z. B. Photosynthese" required autocomplete="off"></div>
      <div><label for="body">Text</label><textarea id="body" placeholder="Absatz aus Buch, Skript oder Notizen einfügen…" required></textarea></div>
      <button class="btn block" type="submit">Speichern</button>
    </form>
  `;

  const onSem = () => { const el = $('#semStatus'); if (el) el.textContent = semanticStatus(); };
  Recall.Semantic.listeners.add(onSem);
  cleanup = () => Recall.Semantic.listeners.delete(onSem);

  $('#gen')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#genBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Dein Server schreibt …';
    try {
      const t = await AI.generateText($('#genTopic').value.trim(), blurtTexts().map((x) => x.title));
      const item = { id: uid(), ...t, ai: true, created: new Date().toISOString() };
      data.texts.push(item);
      save();
      if (location.hash.slice(1) !== 'blurt') return;
      toast(`${t.emoji} ${t.title} erstellt`);
      blurtRead(blurtTexts().find((x) => x.key === item.id));
    } catch (err) {
      toast(`Fehler: ${AI.explain(err, AI.cfg().llmUrl)}`);
      if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Text erzeugen'; }
    }
  });

  $('#semToggle')?.addEventListener('change', (e) => {
    data.semantic = e.target.checked;
    save();
    onSem();
    if (data.semantic) Recall.Semantic.load().catch(() => {});
  });

  $('#add').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#title').value.trim();
    const body = $('#body').value.trim();
    if (!title || !body) return;
    data.texts.push({ id: uid(), title, body, created: new Date().toISOString() });
    save();
    renderBlurt();
    toast('Text gespeichert');
  });

  const onListClick = (e) => {
    const s = e.target.closest('[data-start]');
    const d = e.target.closest('[data-del]');
    if (s) return blurtRead(blurtTexts().find((t) => t.key === s.dataset.start));
    if (d && confirm('Diesen Text löschen?')) {
      data.texts = data.texts.filter((t) => t.id !== d.dataset.del);
      save();
      renderBlurt();
    }
  };
  $('#texts').addEventListener('click', onListClick);
  $('#own').addEventListener('click', onListClick);
}

function blurtRead(text) {
  if (cleanup) { cleanup(); cleanup = null; }
  // Warm up the model while the user is reading.
  if (data.semantic) Recall.Semantic.load().catch(() => {});
  const p = blurtParams();
  const limit = readSeconds(text, p);
  view.innerHTML = `
    <div class="row between"><h1>Lesen <span class="pill">Level ${levelOf('blurt')}</span></h1><span class="pill" id="clock">${limit ? fmtTime(limit) : '0:00'}</span></div>
    ${limit ? '<div class="timer"><div id="bar"></div></div>' : ''}
    <p class="muted">Schritt 1/3 – ${limit ? `Du hast <b>${limit} Sekunden</b>, dann wird der Text verdeckt.` : 'Lies aufmerksam. Danach wird der Text verdeckt.'}</p>
    <div class="card"><h3>${text.emoji} ${esc(text.title)}</h3><div class="source-text">${esc(text.body)}</div></div>
    <button class="btn primary block" id="hide">${limit ? 'Fertig gelesen' : 'Text schließen & aufschreiben'}</button>
  `;
  window.scrollTo(0, 0);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const s = (Date.now() - t0) / 1000;
    const el = $('#clock');
    if (!el) return;
    if (!limit) { el.textContent = fmtTime(Math.floor(s)); return; }
    el.textContent = fmtTime(Math.max(0, Math.ceil(limit - s)));
    $('#bar').style.transform = `scaleX(${Math.max(0, 1 - s / limit)})`;
    if (s >= limit) next();
  }, 250);
  const next = () => {
    clearInterval(iv);
    cleanup = null;
    p.pause ? blurtPause(text, p.pause) : blurtWrite(text);
  };
  cleanup = () => clearInterval(iv);
  $('#hide').addEventListener('click', next);
}

function fmtTime(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/* Distraction task: blocks rehearsal, so writing has to come from memory. */
function blurtPause(text, seconds) {
  const from = 80 + Math.floor(Math.random() * 40);
  view.innerHTML = `
    <div class="row between"><h1>Kurze Ablenkung 🧩</h1><span class="big-num" id="secs">${seconds}</span></div>
    <div class="timer"><div id="bar"></div></div>
    <div class="card center">
      <p>Zähle laut oder im Kopf in <b>3er-Schritten rückwärts</b>:</p>
      <div class="big-num">${from} → ${from - 3} → …</div>
    </div>
    <p class="muted small center">Nicht an den Text denken – danach geht's ans Aufschreiben.</p>
  `;
  const t0 = Date.now();
  const iv = setInterval(() => {
    const s = (Date.now() - t0) / 1000;
    $('#secs').textContent = Math.max(0, Math.ceil(seconds - s));
    $('#bar').style.transform = `scaleX(${Math.max(0, 1 - s / seconds)})`;
    if (s >= seconds) { clearInterval(iv); cleanup = null; blurtWrite(text); }
  }, 250);
  cleanup = () => clearInterval(iv);
}

/* ---- Dictation ---- */

/*
 * Only one microphone session exists at a time. It is always switched off when
 * the user stops it, checks the answer, leaves the page or the app goes to the
 * background – browsers otherwise keep the mic open.
 */
let micOff = null;

function stopMic() {
  const off = micOff;
  micOff = null;
  return off ? off() : Promise.resolve();
}

document.addEventListener('visibilitychange', () => { if (document.hidden) stopMic(); });
window.addEventListener('pagehide', () => stopMic());

/* Browser speech recognition (Chrome, Edge, Safari). Returns a function that kills it. */
function startSpeech({ onText, onInterim, onEnd }) {
  const rec = new SpeechRec();
  let active = true;
  let idle;
  rec.lang = 'de-DE';
  rec.continuous = true;
  rec.interimResults = true;

  const kill = () => {
    if (!active) return;
    active = false;
    clearTimeout(idle);
    rec.onresult = rec.onend = rec.onerror = null;
    try { rec.abort(); } catch { /* already ended */ }
    onEnd();
  };
  // Safety net: switch off after a long silence even if the user forgets.
  const armIdle = () => { clearTimeout(idle); idle = setTimeout(() => { toast('Diktat nach 45 s Stille beendet'); kill(); }, 45000); };

  rec.onresult = (e) => {
    if (!active) return;
    armIdle();
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) onText(r[0].transcript.trim());
      else interim += r[0].transcript;
    }
    onInterim(interim);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
      toast('Mikrofon nicht verfügbar – bitte im Browser freigeben');
      kill();
    }
  };
  // Browsers end recognition after a pause; restart only while still active.
  rec.onend = () => {
    if (!active) return;
    try { rec.start(); } catch { kill(); }
  };
  rec.start();
  armIdle();
  return kill;
}

/* Why dictation is unavailable, and what helps. */
function dictationHint() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const system = touch
    ? 'das 🎤 auf deiner Handy-Tastatur antippen'
    : /Mac/.test(navigator.platform) ? 'am Mac zweimal die Fn- bzw. 🌐-Taste drücken' : 'unter Windows Win + H drücken';
  if (!window.isSecureContext) {
    const https = `https://${location.host}${location.pathname}#blurt`;
    return `🔒 Der Browser erlaubt das Mikrofon nur über eine sichere Verbindung. <a href="${esc(https)}">Über HTTPS öffnen</a> (Warnung einmal bestätigen) – oder ${system}.`;
  }
  return `Dein Browser hat keine eingebaute Spracheingabe (z. B. Firefox). Nutze Chrome, Edge oder Safari, verbinde Whisper unter ⚙️ – oder ${system}.`;
}

function blurtWrite(text) {
  const whisper = AI.whisperOn();
  const canDictate = window.isSecureContext && (whisper || SpeechRec);
  view.innerHTML = `
    <h1>Leeres Blatt</h1>
    <p class="muted">Schritt 2/3 – Schreib oder diktiere alles, was du über <b>${esc(text.title)}</b> noch weißt. Stichworte reichen, Reihenfolge egal.</p>
    ${canDictate ? `
      <button class="btn block mic" id="mic" aria-pressed="false">🎤 Diktieren${whisper ? ' (Whisper)' : ''}</button>
      <p class="muted small" id="interim" style="min-height:1.5em;margin:6px 0"></p>`
    : `<p class="muted small">${dictationHint()}</p>`}
    <textarea id="attempt" style="min-height:40dvh" placeholder="Einfach drauflos …"></textarea>
    <p></p>
    <button class="btn primary block" id="check">Prüfen, was fehlt</button>
  `;
  const area = $('#attempt');
  const mic = $('#mic');
  const interim = $('#interim');
  window.scrollTo(0, 0);

  const append = (t) => {
    if (!t) return;
    area.value += (area.value && !/\s$/.test(area.value) ? ' ' : '') + t;
  };
  const setMic = (state) => {
    if (!mic) return;
    mic.disabled = state === 'busy';
    mic.classList.toggle('on', state === 'on');
    mic.setAttribute('aria-pressed', String(state === 'on'));
    mic.textContent = state === 'on' ? '⏹ Diktat stoppen' : state === 'busy' ? '⏳ Transkribiere …' : `🎤 Diktieren${whisper ? ' (Whisper)' : ''}`;
    if (state !== 'on' && interim) interim.textContent = '';
  };

  const startWhisper = async () => {
    const r = AI.recorder();
    try {
      await r.start();
    } catch (err) {
      toast(err.message || 'Mikrofon nicht verfügbar');
      return;
    }
    setMic('on');
    interim.textContent = '● Aufnahme läuft – zum Beenden nochmal tippen';
    micOff = async () => {
      setMic('busy');
      try {
        append(await r.stop());
      } catch (err) {
        toast(`Whisper: ${AI.explain(err, AI.cfg().whisperUrl)}`);
      } finally {
        setMic('off');
      }
    };
  };

  mic?.addEventListener('click', () => {
    if (micOff) return stopMic();
    if (whisper) return startWhisper();
    try {
      micOff = startSpeech({
        onText: append,
        onInterim: (t) => { if (interim) interim.textContent = t ? `… ${t}` : ''; },
        onEnd: () => { micOff = null; setMic('off'); },
      });
      setMic('on');
    } catch {
      micOff = null;
      toast('Spracheingabe konnte nicht gestartet werden');
    }
  });

  // Leaving the page switches the mic off (pending Whisper audio is transcribed but discarded).
  cleanup = () => { stopMic(); };

  $('#check').addEventListener('click', async () => {
    $('#check').disabled = true;
    await stopMic(); // finishes a running Whisper recording first
    cleanup = null;
    blurtResult(text, area.value);
  });
}

const STATUS_UI = {
  got: { icon: '✓', cls: 'got', label: 'erinnert' },
  semantic: { icon: '≈', cls: 'got', label: 'sinngemäß erinnert' },
  partial: { icon: '◐', cls: 'partial', label: 'teilweise' },
  missed: { icon: '✗', cls: 'missed', label: 'vergessen' },
};

function gapCard(r) {
  if (!r.auto) return { front: r.q, back: r.a };
  const missing = new Set(r.keys.filter((_, i) => !r.hits[i]).map(([w]) => Recall.stem(w)));
  const front = r.a.replace(/[\p{L}\p{N}]+/gu, (w) => (missing.has(Recall.stem(w)) ? '____' : w));
  return { front, back: r.a };
}

async function blurtResult(text, attempt) {
  const useLlm = AI.llmOn() && attempt.trim().length > 0;
  const useSemantic = !useLlm && !!data.semantic && attempt.trim().length > 0;
  view.innerHTML = `
    <h1>Auswertung</h1>
    <div class="card center"><p style="margin:0" id="wait">${useLlm ? '🖥️ Dein KI-Server prüft deine Antwort …' : 'Prüfe deine Antwort …'}</p></div>
  `;
  const onSem = () => { const el = $('#wait'); if (el && Recall.Semantic.state === 'loading') el.textContent = semanticStatus(); };
  Recall.Semantic.listeners.add(onSem);
  let res;
  try {
    res = await Recall.evaluate(text.facts, attempt, { useSemantic });
    if (useLlm) {
      try {
        const g = await AI.grade(text.facts, attempt);
        res.results.forEach((r, i) => {
          const s = g.statuses[i];
          if (!s) return;
          r.status = s === 'got' && r.status !== 'got' ? 'semantic' : s;
        });
        res.score = Recall.scoreOf(res.results);
        res.feedback = g.feedback;
        res.llmUsed = true;
      } catch (err) {
        res.llmError = AI.explain(err, AI.cfg().llmUrl);
      }
    }
  } finally {
    Recall.Semantic.listeners.delete(onSem);
  }
  if (location.hash.slice(1) !== 'blurt' && location.hash) return; // user navigated away meanwhile

  const { results, score } = res;
  const level = levelOf('blurt');
  logSession('blurt', score, { textId: text.key, level, got: results.filter((r) => r.status !== 'missed').length, total: results.length });
  const change = adapt('blurt', score);
  const banner = levelBanner(change,
    `Nächstes Mal: ${blurtLevelText(change.after)}`,
    `etwas leichter: ${blurtLevelText(change.after)}`,
    'gute Herausforderung. Ab 85 % geht\'s eine Stufe hoch.');
  const toLearn = results.filter((r) => r.status === 'missed' || r.status === 'partial');
  const n = (s) => results.filter((r) => r.status === s).length;

  view.innerHTML = `
    <h1>Auswertung</h1>
    <p class="muted">Schritt 3/3 – Das hat dein Gehirn schon gespeichert – und das noch nicht.</p>
    <div class="card">
      <div class="row between"><b>${n('got') + n('semantic')} von ${results.length} Kernaussagen</b><b>${Math.round(score)}%</b></div>
      <p></p>
      <div class="meter"><div style="width:${score}%"></div></div>
      ${useSemantic && !res.semanticUsed ? '<p class="muted small" style="margin:8px 0 0">⚠️ KI-Abgleich nicht verfügbar – nur Wortabgleich.</p>' : ''}
      ${res.llmError ? `<p class="muted small" style="margin:8px 0 0">⚠️ KI-Server nicht erreichbar – nur Wortabgleich. (${esc(res.llmError)})</p>` : ''}
    </div>
    ${res.feedback ? `<div class="card"><h3>🖥️ Feedback</h3><p style="margin:0">${esc(res.feedback)}</p></div>` : ''}
    ${banner}

    <div class="card facts">
      ${results.map((r) => {
        const ui = STATUS_UI[r.status];
        return `<div class="fact ${ui.cls}"><span class="ficon" title="${ui.label}">${ui.icon}</span><span>${esc(r.a)}${r.status === 'semantic' ? ' <span class="pill">sinngemäß</span>' : ''}</span></div>`;
      }).join('')}
    </div>
    <div class="legend"><span class="l-got">✓ / ≈ erinnert</span><span class="l-partial">◐ teilweise</span><span class="l-missed">✗ vergessen</span></div>

    <details class="card"><summary><b>Originaltext</b></summary><div class="source-text" style="margin-top:8px">${esc(text.body)}</div></details>
    <details class="card"><summary><b>Dein Text</b></summary><div class="source-text" style="margin-top:8px">${esc(attempt) || '<span class="muted">(leer)</span>'}</div></details>

    <div class="stack">
      ${toLearn.length ? `<button class="btn block" id="cards">🗂️ ${toLearn.length} Lücke${toLearn.length === 1 ? '' : 'n'} als Leitner-Karte${toLearn.length === 1 ? '' : 'n'} anlegen</button>` : ''}
      <button class="btn primary block" id="again">Nochmal lesen & wiederholen</button>
      <button class="btn block" id="nextText">Nächstes Thema</button>
      <button class="btn ghost block" data-nav="blurt">Zur Übersicht</button>
    </div>
  `;
  window.scrollTo(0, 0);

  $('#again').addEventListener('click', () => blurtRead(text));
  $('#nextText').addEventListener('click', () => blurtRead(suggestText(text.key)));
  $('#cards')?.addEventListener('click', (e) => {
    const added = toLearn.map(gapCard).filter((c) => addCard(c.front, c.back, 'blurt')).length;
    save();
    e.target.disabled = true;
    toast(added ? `${added} Karte${added === 1 ? '' : 'n'} im Leitner-System angelegt` : 'Diese Karten gibt es schon');
  });
}


/* ---------- Statistik ---------- */

const MODE_LABELS = { drill: '🎯 Recall-Drill', leitner: '🗂️ Leitner', blurt: '📝 Blurting' };

function renderStats() {
  const h = data.history;
  const week = h.filter((x) => new Date(x.at) >= new Date(Date.now() - 7 * 864e5));
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, x) => s + x.score, 0) / arr.length) : 0);
  const days = Array.from({ length: 14 }, (_, i) => addDays(i - 13));
  const perDay = days.map((d) => h.filter((x) => dayStr(x.at) === d).length);
  const max = Math.max(1, ...perDay);

  view.innerHTML = `
    <h1>📈 Statistik</h1>
    <div class="card">
      <div class="kpis">
        <div class="kpi"><b>${streak()}</b><small>Tage Serie</small></div>
        <div class="kpi"><b>${h.length}</b><small>Einheiten</small></div>
        <div class="kpi"><b>${avg(week)}%</b><small>Ø 7 Tage</small></div>
      </div>
    </div>

    <div class="card">
      <h3>Einheiten der letzten 14 Tage</h3>
      <div class="spark" role="img" aria-label="Trainingseinheiten pro Tag">
        ${perDay.map((n, i) => `<div style="height:${(n / max) * 100}%" title="${days[i]}: ${n}"></div>`).join('')}
      </div>
    </div>

    <h2>Nach Methode</h2>
    ${Object.entries(MODE_LABELS).map(([k, label]) => {
      const list = h.filter((x) => x.mode === k);
      const recent = list.slice(-10);
      return `
        <div class="card">
          <div class="row between"><h3>${label} <span class="pill">Level ${levelOf(k)}</span></h3><span class="muted small">${list.length} ${list.length === 1 ? 'Einheit' : 'Einheiten'}</span></div>
          <p class="muted small" style="margin:0">Ø letzte 10: <b>${avg(recent)}%</b> · Bestwert: <b>${list.reduce((m, x) => Math.max(m, x.score), 0)}%</b></p>
        </div>`;
    }).join('')}

    <h2>Daten</h2>
    <div class="card stack">
      <p class="muted small">Alles wird nur lokal auf diesem Gerät gespeichert. Mach ab und zu ein Backup.</p>
      <div class="row">
        <button class="btn" id="export">⬇️ Backup exportieren</button>
        <label class="btn" style="margin:0">⬆️ Backup laden<input type="file" id="importFile" accept="application/json" hidden></label>
        <button class="btn ghost" id="reset">Fortschritt löschen</button>
      </div>
    </div>

    <h2>App entfernen</h2>
    <div class="card stack">
      <p class="muted small">Löscht alle Daten, den Offline-Speicher und das KI-Sprachmodell von diesem Gerät. Danach kannst du das App-Symbol entfernen:<br>
      <b>iPhone/Android:</b> Symbol lange drücken → „App entfernen“ / „Deinstallieren“.<br>
      <b>Chrome/Edge am PC:</b> In der App oben ⋮ → „Photo-Mem deinstallieren“.</p>
      <button class="btn bad" id="uninstall">🗑️ Alles von diesem Gerät löschen</button>
    </div>
  `;

  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `photo-mem-backup-${dayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.cards) || !Array.isArray(parsed.history)) throw new Error();
      data = { ...defaultData(), ...parsed };
      save();
      renderStreak();
      renderStats();
      toast('Backup geladen');
    } catch {
      toast('Ungültige Backup-Datei');
    }
  });

  $('#uninstall').addEventListener('click', async () => {
    if (!confirm('Wirklich ALLES löschen – Karten, Texte, Statistik, Offline-Daten und Sprachmodell?')) return;
    try {
      localStorage.removeItem(STORE_KEY);
      if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
      if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    } catch { /* best effort */ }
    data = defaultData();
    view.innerHTML = `
      <h1>Gelöscht ✅</h1>
      <p>Alle Daten von Photo-Mem wurden von diesem Gerät entfernt.</p>
      <p class="muted">Entferne jetzt noch das App-Symbol (lange drücken → Entfernen) oder schließe einfach diesen Tab.</p>
      <button class="btn" onclick="location.reload()">Doch weiter benutzen</button>`;
    renderStreak();
  });

  $('#reset').addEventListener('click', () => {
    if (!confirm('Wirklich alle Karten, eigenen Texte und Statistiken löschen?')) return;
    data = defaultData();
    save();
    renderStreak();
    renderStats();
  });
}

/* ---------- Einstellungen: KI-Server ---------- */

function renderSettings() {
  const c = AI.cfg();
  view.innerHTML = `
    <h1>⚙️ KI-Server</h1>
    <p class="muted">Verbinde Photo-Mem mit deinem eigenen Server: ein LLM bewertet Blurting sinngemäß und erzeugt neue Themen, Whisper transkribiert dein Diktat.</p>

    <form class="card stack" id="scan">
      <div><label for="host">Server-Adresse</label>
      <input type="text" id="host" placeholder="z. B. 192.168.178.50 oder r9700.local" autocomplete="off" value="${esc(data.aiHost || '')}"></div>
      <button class="btn primary block" type="submit">🔍 Server suchen</button>
      <p class="muted small" style="margin:0">Sucht nach Ollama, llama.cpp, LM Studio, vLLM und Whisper auf den üblichen Ports. Läuft die App über <code>serve.py</code> auf dem Server, wird alles automatisch gefunden.</p>
      <div id="log" class="small"></div>
    </form>

    <div class="card stack">
      <h3>🧠 LLM</h3>
      <div><label for="llmUrl">Adresse</label><input type="text" id="llmUrl" value="${esc(c.llmUrl)}" placeholder="http://192.168.178.50:11434" autocomplete="off"></div>
      <div><label for="llmModel">Modell</label><select id="llmModel"><option>${esc(c.llmModel || '–')}</option></select></div>
      <label class="row" style="font-weight:normal"><input type="checkbox" id="useLlm" ${c.useLlm ? 'checked' : ''}> Blurting damit bewerten & Themen erzeugen</label>
      <p class="small" id="llmStatus"></p>
    </div>

    <div class="card stack">
      <h3>🎤 Whisper</h3>
      <div><label for="whisperUrl">Adresse</label><input type="text" id="whisperUrl" value="${esc(c.whisperUrl)}" placeholder="http://192.168.178.50:8000" autocomplete="off"></div>
      <div><label for="whisperType">Server-Typ</label>
        <select id="whisperType">
          <option value="">automatisch erkennen</option>
          <option value="openai" ${c.whisperType === 'openai' ? 'selected' : ''}>OpenAI-kompatibel (speaches, faster-whisper-server, LocalAI)</option>
          <option value="whispercpp" ${c.whisperType === 'whispercpp' ? 'selected' : ''}>whisper.cpp server</option>
          <option value="asr" ${c.whisperType === 'asr' ? 'selected' : ''}>whisper-asr-webservice</option>
        </select></div>
      <label class="row" style="font-weight:normal"><input type="checkbox" id="useWhisper" ${c.useWhisper ? 'checked' : ''}> Diktat über Whisper statt Browser</label>
      <p class="small" id="whisperStatus"></p>
    </div>

    <button class="btn block" id="test">Verbindung testen</button>
    <p class="muted small">Klappt die Verbindung nicht? Meist blockiert der Browser HTTP-Server von einer HTTPS-Seite aus oder der Server erlaubt kein CORS. Die einfachste Lösung: Photo-Mem direkt auf dem Server mit <code>serve.py</code> starten – siehe README.</p>
  `;

  const show = async () => {
    $('#llmStatus').textContent = c.llmUrl ? 'Prüfe …' : 'Nicht eingerichtet';
    $('#whisperStatus').textContent = c.whisperUrl ? 'Prüfe …' : 'Nicht eingerichtet';
    const st = await AI.check();
    if (!$('#llmStatus')) return;
    if (st.llm) {
      $('#llmStatus').textContent = st.llm.ok ? `✓ Verbunden – ${st.llm.models.length} Modelle` : `✗ ${st.llm.error}`;
      if (st.llm.ok) {
        $('#llmModel').innerHTML = st.llm.models.map((m) => `<option ${m === c.llmModel ? 'selected' : ''}>${esc(m)}</option>`).join('');
        if (!st.llm.models.includes(c.llmModel)) { c.llmModel = st.llm.models[0] || ''; save(); }
      }
    }
    if (st.whisper) $('#whisperStatus').textContent = st.whisper.ok ? `✓ Verbunden (${st.whisper.type})` : `✗ ${st.whisper.error}`;
  };

  const field = (id, key, transform = (v) => v) => $(id).addEventListener('change', (e) => {
    c[key] = transform(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    save();
    if (key.endsWith('Url') || key === 'whisperType') show();
  });
  const url = (v) => v.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  field('#llmUrl', 'llmUrl', url);
  field('#llmModel', 'llmModel');
  field('#useLlm', 'useLlm');
  field('#whisperUrl', 'whisperUrl', url);
  field('#whisperType', 'whisperType');
  field('#useWhisper', 'useWhisper');

  $('#scan').addEventListener('submit', async (e) => {
    e.preventDefault();
    data.aiHost = $('#host').value.trim();
    save();
    const log = $('#log');
    log.textContent = 'Suche …';
    const lines = [];
    const found = await AI.discover(data.aiHost, (l) => { lines.push(l); log.textContent = lines.join('\n'); });
    if (!$('#log')) return;
    if (!found.llm) lines.push('✗ Kein LLM gefunden');
    if (!found.whisper) lines.push('✗ Kein Whisper gefunden');
    renderSettings();
    $('#log').style.whiteSpace = 'pre-line';
    $('#log').textContent = lines.join('\n');
  });
  $('#test').addEventListener('click', show);
  show();
}

/* ---------- Start ---------- */

renderStreak();
route();

// Served by serve.py on your AI server? Then connect automatically.
AI.detectProxy().then((p) => {
  const c = AI.cfg();
  if ((p.llm && !c.llmUrl) || (p.whisper && !c.whisperUrl)) AI.discover('').catch(() => {});
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
