'use strict';

/* ---------- Storage ---------- */

const STORE_KEY = 'photomem:v1';

const defaultData = () => ({ cards: [], texts: [], history: [], drillLevel: 'mittel', leitnerDeck: 'all', semantic: false });

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const d = raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
    d.cards.forEach((c) => { c.deck ||= 'own'; });
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
};

function navigate(name) {
  if (location.hash.slice(1) !== name) location.hash = name;
  else route();
}

function route() {
  if (cleanup) { cleanup(); cleanup = null; }
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
  const today = dayStr();
  return data.cards.filter((c) => c.due <= today);
}

function renderHome() {
  const due = dueCards().length;
  const trainedToday = data.history.some((h) => dayStr(h.at) === dayStr());
  view.innerHTML = `
    <h1>Trainiere dein <span class="hl">fotografisches Gedächtnis</span></h1>
    <p class="muted">Drei Methoden – jeden Tag ein paar Minuten. ${trainedToday ? 'Heute schon trainiert ✅' : 'Heute noch nicht trainiert.'}</p>

    <button class="card mode-card" data-nav="drill">
      <div class="emoji">🎯</div>
      <div>
        <h3>1 · Recall-Drill</h3>
        <p class="muted small">Wie Scharfschützen trainieren: Präge dir zufällige Objekte in wenigen Sekunden ein und rufe sie danach ab.</p>
      </div>
    </button>

    <button class="card mode-card" data-nav="leitner">
      <div class="emoji">🗂️</div>
      <div>
        <h3>2 · Leitner-System ${due ? `<span class="pill">${due} fällig</span>` : ''}</h3>
        <p class="muted small">Karteikarten in 5 Boxen – mit fertigen Themenpaketen von Weltraum bis Denkfehler. Richtig → nächste Box, falsch → zurück in Box 1.</p>
      </div>
    </button>

    <button class="card mode-card" data-nav="blurt">
      <div class="emoji">📝</div>
      <div>
        <h3>3 · Blurting</h3>
        <p class="muted small">Spannenden Text lesen, schließen, alles aufschreiben oder diktieren – die App prüft, welche Kernaussagen fehlen.</p>
      </div>
    </button>
  `;
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

const LEVELS = {
  leicht: { label: 'Leicht', count: 6, seconds: 10, cols: 3 },
  mittel: { label: 'Mittel', count: 9, seconds: 10, cols: 3 },
  schwer: { label: 'Schwer', count: 12, seconds: 10, cols: 4 },
  profi:  { label: 'Profi',  count: 16, seconds: 8,  cols: 4 },
};

function renderDrill() {
  const lvl = LEVELS[data.drillLevel] || LEVELS.mittel;
  const best = data.history.filter((h) => h.mode === 'drill' && h.detail?.level === data.drillLevel)
    .reduce((m, h) => Math.max(m, h.score), 0);

  view.innerHTML = `
    <h1>🎯 Recall-Drill</h1>
    <p class="muted">Du siehst <b>${lvl.count} Objekte</b> für <b>${lvl.seconds} Sekunden</b>. Danach markierst du aus einer gemischten Auswahl alle, die du gesehen hast.</p>
    <div class="card stack">
      <label>Schwierigkeit</label>
      <div class="seg" id="levels">
        ${Object.entries(LEVELS).map(([k, v]) => `<button data-level="${k}" class="${k === data.drillLevel ? 'on' : ''}">${v.label}</button>`).join('')}
      </div>
      <p class="muted small">Bestwert auf dieser Stufe: <b>${best}%</b></p>
      <button class="btn primary block" id="start">Los geht's</button>
    </div>
    <p class="muted small">Tipp: Verknüpfe die Objekte zu einer kleinen Geschichte oder lege sie gedanklich in Räume deiner Wohnung.</p>
  `;

  $('#levels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]');
    if (!b) return;
    data.drillLevel = b.dataset.level;
    save();
    renderDrill();
  });
  $('#start').addEventListener('click', () => drillMemorize(data.drillLevel));
}

function drillMemorize(levelKey) {
  const lvl = LEVELS[levelKey];
  const pool = shuffle(OBJECTS);
  const shown = pool.slice(0, lvl.count);
  const distractors = pool.slice(lvl.count, lvl.count * 2);

  view.innerHTML = `
    <div class="row between"><h1>Einprägen</h1><span class="big-num" id="secs">${lvl.seconds}</span></div>
    <div class="timer"><div id="bar"></div></div>
    <div class="grid" style="--cols:${lvl.cols}">
      ${shown.map((o) => `<div class="tile">${o}</div>`).join('')}
    </div>
    <p></p>
    <button class="btn ghost block" id="skip">Ich bin bereit</button>
  `;

  const start = performance.now();
  const total = lvl.seconds * 1000;
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
    drillRecall(levelKey, shown, distractors);
  };
  raf = requestAnimationFrame(tick);
  cleanup = () => cancelAnimationFrame(raf);
  $('#skip').addEventListener('click', done);
}

function drillRecall(levelKey, shown, distractors) {
  const lvl = LEVELS[levelKey];
  const options = shuffle([...shown, ...distractors]);
  const picked = new Set();
  const cols = lvl.count * 2 > 16 ? 6 : 4;

  view.innerHTML = `
    <h1>Was hast du gesehen?</h1>
    <p class="muted">Markiere genau die <b>${lvl.count}</b> Objekte von eben. <span id="count">0</span>/${lvl.count} gewählt.</p>
    <div class="grid" style="--cols:${cols}" id="opts">
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
    const score = Math.max(0, (hits - wrong) / lvl.count) * 100;
    logSession('drill', score, { level: levelKey, hits, wrong, count: lvl.count });

    view.innerHTML = `
      <h1>${score >= 90 ? 'Stark! 🧠' : score >= 60 ? 'Gut gemacht 👍' : 'Weiter üben 💪'}</h1>
      <div class="card">
        <div class="kpis">
          <div class="kpi"><b>${Math.round(score)}%</b><small>Score</small></div>
          <div class="kpi"><b>${hits}/${lvl.count}</b><small>Treffer</small></div>
          <div class="kpi"><b>${wrong}</b><small>Falsch</small></div>
        </div>
      </div>
      <div class="legend">
        <span class="l-got">richtig</span><span class="l-missed">falsch gewählt</span><span>gestrichelt = übersehen</span>
      </div>
      <div class="grid" style="--cols:${cols}">
        ${options.map((o) => {
          const cls = shownSet.has(o) ? (picked.has(o) ? 'hit' : 'miss') : (picked.has(o) ? 'wrong' : 'dim');
          return `<div class="tile ${cls}">${o}</div>`;
        }).join('')}
      </div>
      <p></p>
      <div class="row">
        <button class="btn primary" id="again">Nochmal</button>
        <button class="btn" id="back">Stufe ändern</button>
      </div>
    `;
    $('#again').addEventListener('click', () => drillMemorize(levelKey));
    $('#back').addEventListener('click', renderDrill);
  });
}

/* ---------- 2. Leitner-System ---------- */

const BOX_INTERVALS = [1, 2, 4, 8, 16]; // days until next review, for boxes 1–5
const BOX_LABELS = ['täglich', 'alle 2 T.', 'alle 4 T.', 'alle 8 T.', 'alle 16 T.'];
const NEW_PER_DAY = 6; // a new pack is released gradually instead of all at once

const OWN_DECKS = {
  own: { emoji: '✍️', title: 'Eigene Karten' },
  blurt: { emoji: '📝', title: 'Aus Blurting' },
};

function deckInfo(id) {
  return DECKS.find((d) => d.id === id) || OWN_DECKS[id] || OWN_DECKS.own;
}

function addCard(front, back, deck = 'own', due = dayStr()) {
  front = front.trim();
  back = back.trim();
  if (!front || !back) return false;
  if (data.cards.some((c) => c.front === front && c.deck === deck)) return false;
  data.cards.push({ id: uid(), front, back, box: 1, due, deck });
  return true;
}

function addPack(deck) {
  shuffle(deck.cards).forEach(([front, back], i) => addCard(front, back, deck.id, addDays(Math.floor(i / NEW_PER_DAY))));
  save();
}

function renderLeitner() {
  const filter = data.leitnerDeck || 'all';
  const inDeck = (c) => filter === 'all' || c.deck === filter;
  const cards = data.cards.filter(inDeck);
  const due = dueCards().filter(inDeck);
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
      ${counts.map((n, i) => `<div class="box"><small>Box ${i + 1}</small><b>${n}</b><small>${BOX_LABELS[i]}</small></div>`).join('')}
    </div>

    <button class="btn primary block" id="learn" ${due.length ? '' : 'disabled'}>
      ${due.length ? `${due.length} Karte${due.length === 1 ? '' : 'n'} lernen` : data.cards.length ? 'Heute nichts fällig 🎉' : 'Wähle unten ein Themenpaket'}
    </button>

    <h2>Themenpakete</h2>
    <p class="muted small">Neue Pakete werden schrittweise freigeschaltet – ${NEW_PER_DAY} neue Karten pro Tag.</p>
    <div class="card" id="packs">
      ${DECKS.map((d) => {
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

  $('#learn').addEventListener('click', () => leitnerSession(shuffle(due)));

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
      const deck = DECKS.find((d) => d.id === add.dataset.add);
      addPack(deck);
      toast(`${deck.emoji} ${deck.title} hinzugefügt`);
      renderLeitner();
    }
    if (rem && confirm('Paket samt Lernfortschritt entfernen?')) {
      data.cards = data.cards.filter((c) => c.deck !== rem.dataset.remove);
      if (data.leitnerDeck === rem.dataset.remove) data.leitnerDeck = 'all';
      save();
      renderLeitner();
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
      <div class="row between"><h1>Karte ${i + 1}/${queue.length}</h1><span class="pill">Box ${c.box}</span></div>
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
      card.box = ok ? Math.min(5, card.box + 1) : 1;
      card.due = addDays(BOX_INTERVALS[card.box - 1]);
      save();
    }
    if (ok) right++;
    i++;
    show();
  };

  const finish = () => {
    const score = queue.length ? (right / queue.length) * 100 : 0;
    logSession('leitner', score, { right, total: queue.length });
    view.innerHTML = `
      <h1>Fertig für heute ✅</h1>
      <div class="card">
        <div class="kpis">
          <div class="kpi"><b>${Math.round(score)}%</b><small>richtig</small></div>
          <div class="kpi"><b>${right}</b><small>gewusst</small></div>
          <div class="kpi"><b>${queue.length - right}</b><small>zurück in Box 1</small></div>
        </div>
      </div>
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
    ...data.texts.map((t) => ({ ...t, key: t.id, emoji: '✍️', facts: Recall.autoFacts(t.body) })),
  ];
}

function lastBlurt(key) {
  return data.history.filter((h) => h.mode === 'blurt' && h.detail?.textId === key).pop();
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

    <div class="card">
      <div class="row between" style="flex-wrap:nowrap">
        <div><h3>🧠 KI-Abgleich</h3><p class="muted small" style="margin:0" id="semStatus">${semanticStatus()}</p></div>
        <label class="switch" aria-label="KI-Abgleich"><input type="checkbox" id="semToggle" ${data.semantic ? 'checked' : ''}><span></span></label>
      </div>
      <p class="muted small" style="margin:8px 0 0">Erkennt Umschreibungen und Sätze mit ganz anderen Worten. Ohne KI-Abgleich klappen Synonyme, Wortformen und Zahlwörter trotzdem.</p>
    </div>

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

  $('#semToggle').addEventListener('change', (e) => {
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
  view.innerHTML = `
    <div class="row between"><h1>Lesen</h1><span class="pill" id="clock">0:00</span></div>
    <p class="muted">Schritt 1/3 – Lies aufmerksam. Danach wird der Text verdeckt.</p>
    <div class="card"><h3>${text.emoji} ${esc(text.title)}</h3><div class="source-text">${esc(text.body)}</div></div>
    <button class="btn primary block" id="hide">Text schließen & aufschreiben</button>
  `;
  window.scrollTo(0, 0);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    const el = $('#clock');
    if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
  cleanup = () => clearInterval(iv);
  $('#hide').addEventListener('click', () => {
    clearInterval(iv);
    cleanup = null;
    blurtWrite(text);
  });
}

function blurtWrite(text) {
  view.innerHTML = `
    <h1>Leeres Blatt</h1>
    <p class="muted">Schritt 2/3 – Schreib oder diktiere alles, was du über <b>${esc(text.title)}</b> noch weißt. Stichworte reichen, Reihenfolge egal.</p>
    ${SpeechRec ? `
      <button class="btn block mic" id="mic" aria-pressed="false">🎤 Diktieren</button>
      <p class="muted small" id="interim" style="min-height:1.5em;margin:6px 0"></p>`
    : '<p class="muted small">Tipp: Zum Diktieren das 🎤 auf deiner Handy-Tastatur antippen.</p>'}
    <textarea id="attempt" style="min-height:40dvh" placeholder="Einfach drauflos …"></textarea>
    <p></p>
    <button class="btn primary block" id="check">Prüfen, was fehlt</button>
  `;
  const area = $('#attempt');
  window.scrollTo(0, 0);

  let rec = null;
  let listening = false;
  const stop = () => {
    listening = false;
    rec?.stop();
    const mic = $('#mic');
    if (mic) { mic.textContent = '🎤 Diktieren'; mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); }
    const interim = $('#interim');
    if (interim) interim.textContent = '';
  };
  cleanup = stop;

  $('#mic')?.addEventListener('click', () => {
    if (listening) return stop();
    rec = new SpeechRec();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const sep = area.value && !/\s$/.test(area.value) ? ' ' : '';
          area.value += sep + r[0].transcript.trim();
        } else {
          interim += r[0].transcript;
        }
      }
      $('#interim').textContent = interim ? `… ${interim}` : '';
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast('Mikrofon nicht erlaubt – bitte in den Browser-Einstellungen freigeben');
        stop();
      }
    };
    // Browsers end recognition after a pause; keep going until the user stops.
    rec.onend = () => { if (listening) { try { rec.start(); } catch { stop(); } } };
    try {
      rec.start();
      listening = true;
      const mic = $('#mic');
      mic.textContent = '⏹ Diktat stoppen';
      mic.classList.add('on');
      mic.setAttribute('aria-pressed', 'true');
    } catch {
      toast('Spracheingabe konnte nicht gestartet werden');
    }
  });

  $('#check').addEventListener('click', () => {
    stop();
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
  const useSemantic = !!data.semantic && attempt.trim().length > 0;
  view.innerHTML = `
    <h1>Auswertung</h1>
    <div class="card center"><p style="margin:0" id="wait">Prüfe deine Antwort …</p></div>
  `;
  const onSem = () => { const el = $('#wait'); if (el && Recall.Semantic.state === 'loading') el.textContent = semanticStatus(); };
  Recall.Semantic.listeners.add(onSem);
  let res;
  try {
    res = await Recall.evaluate(text.facts, attempt, { useSemantic });
  } finally {
    Recall.Semantic.listeners.delete(onSem);
  }
  if (location.hash.slice(1) !== 'blurt' && location.hash) return; // user navigated away meanwhile

  const { results, score } = res;
  logSession('blurt', score, { textId: text.key, got: results.filter((r) => r.status !== 'missed').length, total: results.length });
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
    </div>

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
      <button class="btn ghost block" data-nav="blurt">Zur Übersicht</button>
    </div>
  `;
  window.scrollTo(0, 0);

  $('#again').addEventListener('click', () => blurtRead(text));
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
          <div class="row between"><h3>${label}</h3><span class="muted small">${list.length} ${list.length === 1 ? 'Einheit' : 'Einheiten'}</span></div>
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

/* ---------- Start ---------- */

renderStreak();
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
