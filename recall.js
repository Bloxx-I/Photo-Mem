'use strict';

/*
 * Blurting evaluation.
 *
 * Lexical layer (always on, offline): word stems, compounds, synonyms,
 * spoken number words ("dreihundert" → 300) and small typos, so dictated
 * text without punctuation works too.
 *
 * Semantic layer (optional): a multilingual sentence-embedding model that runs
 * in the browser via transformers.js. It catches paraphrases the word lists
 * don't know ("ein Drittel der Menschen starb" ≈ "tötete ein Drittel der Bevölkerung").
 */

const Recall = (() => {
  const STOPWORDS = new Set((
    'aber alle allem allen aller alles also auch auf aus bei beim bin bis bist dann darin darum das dass dein deine dem den denn der des dessen die dies diese diesem diesen dieser dieses doch dort durch eine einem einen einer eines einige euch euer für gegen hatte hatten hier hin hinter ihm ihn ihnen ihr ihre ihrem ihren ihrer ist jede jedem jeden jeder jedes jene jetzt kann kein keine können könnte machen mehr mein meine mich mir mit muss musste nach nicht nichts noch nun nur oder ohne sehr sein seine sich sie sind solche soll sollte sondern sowie über um und uns unser unter viel vom von vor war waren warum was weil weiter welche wenn wer werden wie wieder will wird wir wurde wurden zum zur zwar zwischen dabei daher damit davon dazu denen deren etwa immer ganz eher statt wobei haben habe hat etwas schon einmal sogar trotzdem genau später danach heißt ' +
    'about after also been before being both could does each from have here into just like many more most much must only other over same should some such than that their them then there these they this those through under very want were what when where which while will with would your'
  ).split(/\s+/));

  function fold(w) {
    return w.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  }

  function stem(w) {
    w = fold(w);
    if (w.length > 5 && !/^\d/.test(w)) w = w.replace(/(ern|em|en|er|es|e|n|s)$/, '');
    return w;
  }

  /* ---- spoken German numbers ---- */

  const NUM = {
    null: 0, ein: 1, eins: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
    zehn: 10, elf: 11, zwolf: 12, dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
    zwanzig: 20, dreissig: 30, vierzig: 40, funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
  };

  function parseNumber(w) {
    if (w === '') return 0;
    if (w in NUM) return NUM[w];
    for (const [word, mult] of [['tausend', 1000], ['hundert', 100]]) {
      const i = w.indexOf(word);
      if (i >= 0) {
        const head = w.slice(0, i);
        const tail = w.slice(i + word.length);
        const h = head === '' ? 1 : parseNumber(head);
        const t = parseNumber(tail);
        return h === null || t === null ? null : h * mult + t;
      }
    }
    const u = w.indexOf('und');
    if (u > 0) {
      const a = parseNumber(w.slice(0, u));
      const b = parseNumber(w.slice(u + 3));
      if (a !== null && b !== null && a < 10 && b >= 20 && b % 10 === 0) return a + b;
    }
    return null;
  }

  /* ---- synonyms ---- */

  const synIndex = new Map(); // stem -> Set of group ids
  SYNONYMS.forEach((group, id) => {
    for (const w of group) {
      const s = stem(w);
      if (!synIndex.has(s)) synIndex.set(s, new Set());
      synIndex.get(s).add(id);
    }
  });

  /* ---- tokenizing ---- */

  function normalizeDigits(text) {
    return text
      .replace(/(\d)[.\s'’](?=\d{3}\b)/g, '$1') // 384.000 / 384 000 → 384000
      .replace(/(\d),(\d)/g, '$1.$2');
  }

  function words(text) {
    return normalizeDigits(text).match(/[\p{L}\p{N}]+(?:\.\d+)?/gu) || [];
  }

  function analyzeAttempt(text) {
    const stems = new Set();
    const syns = new Set();
    for (const w of words(text)) {
      const n = parseNumber(fold(w));
      // Spoken numbers count only as their value, so "achtundvierzig" doesn't match "vierzig".
      if (n !== null && n > 0) { stems.add(String(n)); continue; }
      const s = stem(w);
      stems.add(s);
      synIndex.get(s)?.forEach((id) => syns.add(id));
    }
    return { stems: [...stems], stemSet: stems, syns };
  }

  /*
   * Edit distance where swapping two neighbouring letters costs 1, so German
   * e-elision ("teuer" → "teure", "dunkel" → "dunkle") and typos like "dsa" pass.
   */
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }

  const STRONG = 2;
  const WEAK = 1;

  /* STRONG = clearly the same word, WEAK = only part of a compound ("Milch" in "Milchstraße"). */
  function wordMatches(altWord, att) {
    const num = parseNumber(fold(altWord));
    if (num !== null && num > 0) return att.stemSet.has(String(num)) ? STRONG : 0;
    const alt = stem(altWord);
    if (/^\d/.test(alt)) return att.stemSet.has(alt) ? STRONG : 0;
    if (att.stemSet.has(alt)) return STRONG;
    const altSyns = synIndex.get(alt);
    if (altSyns) for (const id of altSyns) if (att.syns.has(id)) return STRONG;
    const tol = alt.length >= 8 ? 2 : alt.length >= 5 ? 1 : 0;
    let best = 0;
    for (const t of att.stems) {
      if (alt.length >= 3 && t.startsWith(alt)) return STRONG; // inflection: "wiederhol" → "wiederholung"
      if (alt.length >= 5 && t.includes(alt)) return STRONG; // compound: "energie" in "lichtenergie"
      if (tol && editDistance(t, alt, tol) <= tol) return STRONG; // typos, dictation slips, "teure" ≈ "teuer"
      if (t.length >= 5 && (alt.startsWith(t) || alt.endsWith(t))) best = WEAK; // "licht" → "lichtenergie"
    }
    return best;
  }

  function altMatches(alt, att) {
    return Math.min(...words(alt).map((w) => wordMatches(w, att)));
  }

  function isKeyword(w) {
    if (/^\d/.test(w)) return true;
    return w.length >= 4 && !STOPWORDS.has(w.toLowerCase());
  }

  /* Custom texts have no curated facts: every sentence becomes one fact. */
  function autoFacts(body) {
    return body
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const seen = new Set();
        const keys = [];
        for (const w of words(s)) {
          const st = stem(w);
          if (!isKeyword(w) || seen.has(st)) continue;
          seen.add(st);
          keys.push([w]);
        }
        return { q: s, a: s, keys, auto: true };
      })
      .filter((f) => f.keys.length);
  }

  function lexical(facts, attempt) {
    const att = analyzeAttempt(attempt);
    return facts.map((f) => {
      const strength = f.keys.map((group) => Math.max(...group.map((alt) => altMatches(alt, att))));
      const hits = strength.map(Boolean);
      const matched = hits.filter(Boolean).length;
      const need = Math.max(1, Math.ceil(f.keys.length * (f.auto ? 0.5 : 0.6)));
      // Compound-part matches alone are too thin to count a fact as fully recalled.
      const solid = strength.includes(STRONG);
      return { ...f, hits, matched, status: matched >= need && solid ? 'got' : matched > 0 ? 'partial' : 'missed' };
    });
  }

  /* ---- semantic layer ---- */

  const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  let extractor = null;

  const Semantic = {
    state: 'off', // off | loading | ready | error
    progress: 0,
    listeners: new Set(),
    emit() { this.listeners.forEach((fn) => fn(this)); },

    load() {
      if (!extractor) {
        this.state = 'loading';
        this.progress = 0;
        this.emit();
        const files = {};
        extractor = import(LIB)
          .then(({ pipeline, env }) => {
            env.allowLocalModels = false;
            return pipeline('feature-extraction', MODEL, {
              dtype: 'q8',
              progress_callback: (p) => {
                if (p.status !== 'progress' || !p.total) return;
                files[p.file] = [p.loaded, p.total];
                const v = Object.values(files);
                this.progress = v.reduce((s, x) => s + x[0], 0) / v.reduce((s, x) => s + x[1], 0);
                this.emit();
              },
            });
          })
          .then((ex) => {
            this.state = 'ready';
            this.emit();
            return ex;
          })
          .catch((err) => {
            extractor = null;
            this.state = 'error';
            this.emit();
            throw err;
          });
      }
      return extractor;
    },

    async embed(texts) {
      const ex = await this.load();
      const out = await ex(texts, { pooling: 'mean', normalize: true });
      return out.tolist();
    },
  };

  function chunks(attempt) {
    const ws = attempt.split(/\s+/).filter(Boolean);
    const out = new Set(attempt.split(/[.!?;\n]+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3));
    // Dictation often has no punctuation, so also slide a window over the words.
    for (let i = 0; i < ws.length; i += 5) out.add(ws.slice(i, i + 12).join(' '));
    if (ws.length <= 40) out.add(ws.join(' '));
    return [...out].filter(Boolean).slice(0, 120);
  }

  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

  async function semantic(results, attempt) {
    const parts = chunks(attempt);
    if (!parts.length) return results;
    const open = results.filter((r) => r.status !== 'got');
    if (!open.length) return results;
    const vecs = await Semantic.embed([...open.map((r) => r.a), ...parts]);
    const factVecs = vecs.slice(0, open.length);
    const partVecs = vecs.slice(open.length);
    open.forEach((r, i) => {
      r.sim = Math.max(...partVecs.map((v) => dot(factVecs[i], v)));
      if (r.sim >= 0.75 || (r.sim >= 0.6 && r.matched > 0)) r.status = 'semantic';
    });
    return results;
  }

  async function evaluate(facts, attempt, { useSemantic = false } = {}) {
    let results = lexical(facts, attempt);
    let semanticUsed = false;
    if (useSemantic && attempt.trim()) {
      try {
        results = await semantic(results, attempt);
        semanticUsed = true;
      } catch (err) {
        console.warn('Semantic check failed, using word matching only', err);
      }
    }
    const points = results.reduce((s, r) => s + (r.status === 'got' || r.status === 'semantic' ? 1 : r.status === 'partial' ? 0.5 : 0), 0);
    return { results, score: results.length ? (points / results.length) * 100 : 0, semanticUsed };
  }

  return { evaluate, autoFacts, Semantic, isKeyword, stem, words, parseNumber, analyzeAttempt, altMatches };
})();
