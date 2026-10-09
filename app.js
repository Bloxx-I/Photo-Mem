'use strict';

/* ---------- Storage ---------- */

const STORE_KEY = 'photomem:v1';

const defaultData = () => ({ cards: [], texts: [], history: [], drillLevel: 'mittel' });

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...defaultData(), ...JSON.parse(raw) } : defaultData();
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
        <p class="muted small">Karteikarten in 5 Boxen. Richtig → nächste Box (seltener wiederholen). Falsch → zurück in Box 1.</p>
      </div>
    </button>

    <button class="card mode-card" data-nav="blurt">
      <div class="emoji">📝</div>
      <div>
        <h3>3 · Blurting</h3>
        <p class="muted small">Lesen, schließen, alles auf ein leeres Blatt schreiben – dann prüfen, was du vergessen hast.</p>
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

function addCard(front, back) {
  front = front.trim();
  back = back.trim();
  if (!front || !back) return false;
  data.cards.push({ id: uid(), front, back, box: 1, due: dayStr() });
  return true;
}

function renderLeitner() {
  const due = dueCards();
  const counts = [1, 2, 3, 4, 5].map((b) => data.cards.filter((c) => c.box === b).length);

  view.innerHTML = `
    <h1>🗂️ Leitner-System</h1>
    <p class="muted">Richtig beantwortete Karten wandern eine Box weiter und kommen seltener dran. Falsche fallen zurück in Box 1.</p>

    <div class="boxes">
      ${counts.map((n, i) => `<div class="box"><small>Box ${i + 1}</small><b>${n}</b><small>${BOX_LABELS[i]}</small></div>`).join('')}
    </div>

    <button class="btn primary block" id="learn" ${due.length ? '' : 'disabled'}>
      ${due.length ? `${due.length} Karte${due.length === 1 ? '' : 'n'} lernen` : 'Heute nichts fällig 🎉'}
    </button>

    <h2>Neue Karte</h2>
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

    <h2>Alle Karten (${data.cards.length})</h2>
    <div class="card" id="list">
      ${data.cards.length ? data.cards.map((c) => `
        <div class="list-item">
          <div class="text"><b>${esc(c.front)}</b><br><span class="muted small">${esc(c.back)}</span></div>
          <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
            <span class="pill">Box ${c.box}</span>
            <button class="btn ghost" data-del="${c.id}" aria-label="Karte löschen" style="min-height:32px;padding:4px 10px">✕</button>
          </div>
        </div>`).join('') : '<p class="muted center" style="margin:0">Noch keine Karten. Lege oben deine erste an.</p>'}
    </div>
  `;

  $('#learn').addEventListener('click', () => leitnerSession(shuffle(due)));

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
    view.innerHTML = `
      <div class="row between"><h1>Karte ${i + 1}/${queue.length}</h1><span class="pill">Box ${c.box}</span></div>
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

const STOPWORDS = new Set((
  'aber alle allem allen aller alles also auch auf aus bei beim bin bis bist dann darin darum das dass dein deine dem den denn der des dessen die dies diese diesem diesen dieser dieses doch dort durch eine einem einen einer eines einige euch euer für gegen hatte hatten hier hin hinter ihm ihn ihnen ihr ihre ihrem ihren ihrer ist jede jedem jeden jeder jedes jene jetzt kann kein keine können könnte machen mehr mein meine mich mir mit muss musste nach nicht nichts noch nun nur oder ohne sehr sein seine sich sie sind so solche soll sollte sondern sowie über um und uns unser unter viel vom von vor war waren warum was weil weiter welche wenn wer werden wie wieder will wird wir wurde wurden zum zur zwar zwischen dabei daher damit davon dazu denen deren etwa immer ganz eher statt wobei sowie eines einem wird werden haben habe hat ' +
  'about after also been before being both could does each from have here into just like many more most much must only other over same should some such than that their them then there these they this those through under very want were what when where which while will with would your yours'
).split(/\s+/));

function normalizeWord(w) {
  w = w.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  // Rough stemming so "Gedächtnis" and "Gedächtnisses" count as the same word.
  if (w.length > 5) w = w.replace(/(ern|em|en|er|es|ens|e|n|s)$/, '');
  return w;
}

function isKeyword(w) {
  if (/^\d+([.,]\d+)?$/.test(w)) return true;
  return w.length >= 4 && !STOPWORDS.has(w.toLowerCase());
}

// Exact stem match, or a recalled word inside a compound ("Licht" → "Lichtenergie").
function wasRecalled(n, recalled) {
  if (recalled.has(n)) return true;
  for (const r of recalled) if (r.length >= 5 && n.includes(r)) return true;
  return false;
}

function analyzeBlurt(source, attempt) {
  const recalled = new Set((attempt.match(/[\p{L}\p{N}]+(?:[.,]\d+)?/gu) || []).map(normalizeWord));
  const keys = new Map(); // normalized -> got?
  const parts = [];
  const re = /[\p{L}\p{N}]+(?:[.,]\d+)?/gu;
  let last = 0;
  let m;
  while ((m = re.exec(source))) {
    parts.push(esc(source.slice(last, m.index)));
    const w = m[0];
    if (isKeyword(w)) {
      const n = normalizeWord(w);
      const got = wasRecalled(n, recalled);
      keys.set(n, got);
      parts.push(`<span class="${got ? 'got' : 'missed'}">${esc(w)}</span>`);
    } else {
      parts.push(esc(w));
    }
    last = re.lastIndex;
  }
  parts.push(esc(source.slice(last)));
  const total = keys.size;
  const got = [...keys.values()].filter(Boolean).length;
  const missed = [...keys.entries()].filter(([, g]) => !g).map(([k]) => k);
  return { html: parts.join(''), total, got, missed, score: total ? (got / total) * 100 : 0 };
}

function sentencesWithGaps(source, missed) {
  const missedSet = new Set(missed);
  const sentences = source.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const cards = [];
  for (const s of sentences) {
    let hasGap = false;
    const front = s.replace(/[\p{L}\p{N}]+(?:[.,]\d+)?/gu, (w) => {
      if (isKeyword(w) && missedSet.has(normalizeWord(w))) { hasGap = true; return '____'; }
      return w;
    });
    if (hasGap) cards.push({ front, back: s });
  }
  return cards;
}

function renderBlurt() {
  view.innerHTML = `
    <h1>📝 Blurting</h1>
    <p class="muted">Füge einen Lerntext ein. Lies ihn, verdecke ihn und schreibe alles auf, was du noch weißt. Die App zeigt dir, welche Begriffe gefehlt haben.</p>

    <h2>Deine Texte</h2>
    <div class="card" id="texts">
      ${data.texts.length ? data.texts.map((t) => {
        const last = data.history.filter((h) => h.mode === 'blurt' && h.detail?.textId === t.id).pop();
        return `
        <div class="list-item">
          <div class="text"><b>${esc(t.title)}</b><br><span class="muted small">${t.body.length} Zeichen${last ? ` · zuletzt ${last.score}%` : ''}</span></div>
          <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
            <button class="btn primary" data-start="${t.id}" style="min-height:36px;padding:6px 14px">Start</button>
            <button class="btn ghost" data-del="${t.id}" aria-label="Text löschen" style="min-height:36px;padding:6px 10px">✕</button>
          </div>
        </div>`;
      }).join('') : '<p class="muted center" style="margin:0">Noch keine Texte.</p>'}
    </div>

    <h2>Neuer Text</h2>
    <form class="card stack" id="add">
      <div><label for="title">Titel</label><input type="text" id="title" placeholder="z. B. Photosynthese" required autocomplete="off"></div>
      <div><label for="body">Text</label><textarea id="body" placeholder="Absatz aus Buch, Skript oder Notizen einfügen…" required></textarea></div>
      <button class="btn block" type="submit">Speichern</button>
    </form>
  `;

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

  $('#texts').addEventListener('click', (e) => {
    const s = e.target.closest('[data-start]');
    const d = e.target.closest('[data-del]');
    if (s) blurtRead(data.texts.find((t) => t.id === s.dataset.start));
    if (d && confirm('Diesen Text löschen?')) {
      data.texts = data.texts.filter((t) => t.id !== d.dataset.del);
      save();
      renderBlurt();
    }
  });
}

function blurtRead(text) {
  view.innerHTML = `
    <div class="row between"><h1>Lesen</h1><span class="pill" id="clock">0:00</span></div>
    <p class="muted">Schritt 1/3 – Lies aufmerksam. Danach wird der Text verdeckt.</p>
    <div class="card"><h3>${esc(text.title)}</h3><div class="source-text">${esc(text.body)}</div></div>
    <button class="btn primary block" id="hide">Text schließen & aufschreiben</button>
  `;
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
    <p class="muted">Schritt 2/3 – Schreib alles auf, was du über <b>${esc(text.title)}</b> noch weißt. Stichworte reichen.</p>
    <textarea id="attempt" style="min-height:45dvh" placeholder="Einfach drauflos schreiben…"></textarea>
    <p></p>
    <button class="btn primary block" id="check">Prüfen, was fehlt</button>
  `;
  $('#attempt').focus();
  $('#check').addEventListener('click', () => blurtResult(text, $('#attempt').value));
}

function blurtResult(text, attempt) {
  const r = analyzeBlurt(text.body, attempt);
  logSession('blurt', r.score, { textId: text.id, got: r.got, total: r.total });
  const gapCards = sentencesWithGaps(text.body, r.missed);

  view.innerHTML = `
    <h1>Auswertung</h1>
    <p class="muted">Schritt 3/3 – Das hier hat dein Gehirn noch nicht abgespeichert.</p>
    <div class="card">
      <div class="row between"><b>${r.got} von ${r.total} Schlüsselbegriffen</b><b>${Math.round(r.score)}%</b></div>
      <p></p>
      <div class="meter"><div style="width:${r.score}%"></div></div>
    </div>
    <div class="legend"><span class="l-got">erinnert</span><span class="l-missed">vergessen</span></div>
    <div class="card"><h3>${esc(text.title)}</h3><div class="source-text">${r.html}</div></div>
    <details class="card"><summary><b>Dein Text</b></summary><div class="source-text" style="margin-top:8px">${esc(attempt) || '<span class="muted">(leer)</span>'}</div></details>
    <div class="stack">
      ${gapCards.length ? `<button class="btn block" id="cards">🗂️ ${gapCards.length} Lückensatz${gapCards.length === 1 ? '' : 'e'} als Leitner-Karte${gapCards.length === 1 ? '' : 'n'} anlegen</button>` : ''}
      <button class="btn primary block" id="again">Nochmal lesen & wiederholen</button>
      <button class="btn ghost block" data-nav="blurt">Zur Übersicht</button>
    </div>
  `;

  $('#again').addEventListener('click', () => blurtRead(text));
  $('#cards')?.addEventListener('click', (e) => {
    gapCards.forEach((c) => addCard(c.front, c.back));
    save();
    e.target.disabled = true;
    toast(`${gapCards.length} Karte${gapCards.length === 1 ? '' : 'n'} im Leitner-System angelegt`);
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
        <button class="btn ghost" id="reset">Alles löschen</button>
      </div>
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

  $('#reset').addEventListener('click', () => {
    if (!confirm('Wirklich alle Karten, Texte und Statistiken löschen?')) return;
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
