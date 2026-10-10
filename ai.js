'use strict';

/*
 * Connection to your own AI server:
 *   - an OpenAI-compatible LLM (Ollama, llama.cpp, LM Studio, vLLM, …) for
 *     grading blurting answers and generating new topics
 *   - a Whisper server for dictation (faster-whisper/speaches, whisper.cpp,
 *     whisper-asr-webservice)
 *
 * When the app is served by serve.py, both are reachable on the same origin
 * under /api/llm and /api/whisper, which avoids CORS and mixed-content issues.
 */

const AI = (() => {
  const LLM_PORTS = [11434, 8080, 1234, 8000, 5000];
  const WHISPER_PORTS = [8000, 9000, 8080, 8081, 8001, 8002];

  const cfg = () => (data.ai ||= { llmUrl: '', llmModel: '', whisperUrl: '', whisperType: '', whisperModel: '', useLlm: true, useWhisper: true });

  let proxy = null; // { llm: bool, whisper: bool } when served by serve.py

  const base = (url) => url.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  const proxyUrl = (name) => new URL(`api/${name}`, location.href).href.replace(/\/$/, '');

  async function fetchJSON(url, opts = {}, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return text ? JSON.parse(text) : {};
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Zeitüberschreitung');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function explain(err, url) {
    if (location.protocol === 'https:' && url.startsWith('http:')) {
      return 'Die App läuft über HTTPS, der Server über HTTP – das blockiert der Browser. Öffne die App über serve.py auf dem Server oder gib dem Server HTTPS (siehe README).';
    }
    if (err instanceof TypeError) return 'Nicht erreichbar oder CORS blockiert (siehe README → KI-Server).';
    return err.message;
  }

  /* ---- discovery ---- */

  async function detectProxy() {
    if (proxy) return proxy;
    try {
      proxy = await fetchJSON(new URL('api/status', location.href).href, {}, 2000);
    } catch {
      proxy = { llm: false, whisper: false };
    }
    return proxy;
  }

  async function listModels(url) {
    try {
      const j = await fetchJSON(`${url}/v1/models`, {}, 4000);
      return (j.data || []).map((m) => m.id);
    } catch (err) {
      const j = await fetchJSON(`${url}/api/tags`, {}, 4000).catch(() => { throw err; }); // Ollama native
      return (j.models || []).map((m) => m.name);
    }
  }

  const isWhisperModel = (id) => /whisper|distil/i.test(id);

  async function probeWhisper(url) {
    try {
      const ids = await listModels(url);
      const w = ids.find(isWhisperModel);
      if (w) return { type: 'openai', model: w };
    } catch { /* not OpenAI-style */ }
    try {
      const spec = await fetchJSON(`${url}/openapi.json`, {}, 4000);
      if (spec.paths?.['/asr']) return { type: 'asr', model: '' };
      if (spec.paths?.['/v1/audio/transcriptions']) return { type: 'openai', model: '' };
    } catch { /* no OpenAPI spec */ }
    const res = await fetch(`${url}/`, { method: 'GET' }); // whisper.cpp serves a page at /
    if (res.ok && /whisper/i.test(await res.text())) return { type: 'whispercpp', model: '' };
    throw new Error('Kein Whisper-Server erkannt');
  }

  function hostCandidates(input, ports) {
    input = input.trim();
    if (!input) return [];
    if (/^https?:\/\//.test(input)) {
      const u = new URL(input);
      return u.port ? [base(input)] : [base(input), ...ports.map((p) => `${u.protocol}//${u.hostname}:${p}`)];
    }
    if (/:\d+$/.test(input)) return [`http://${input}`];
    return ports.map((p) => `http://${input}:${p}`);
  }

  /* Scans a host for an LLM and a Whisper server and stores what it finds. */
  async function discover(host, onLog = () => {}) {
    const c = cfg();
    const found = { llm: null, whisper: null };
    const p = await detectProxy();

    const llmCands = [...(p.llm ? [proxyUrl('llm')] : []), ...hostCandidates(host, LLM_PORTS)];
    for (const url of llmCands) {
      try {
        const ids = (await listModels(url)).filter((id) => !isWhisperModel(id) && !/embed/i.test(id));
        if (!ids.length) continue;
        found.llm = { url, models: ids };
        onLog(`✓ LLM gefunden: ${url} (${ids.length} Modelle)`);
        break;
      } catch { /* try next */ }
    }

    const wCands = [...(p.whisper ? [proxyUrl('whisper')] : []), ...hostCandidates(host, WHISPER_PORTS)];
    for (const url of wCands) {
      try {
        const w = await probeWhisper(url);
        found.whisper = { url, ...w };
        onLog(`✓ Whisper gefunden: ${url} (${w.type})`);
        break;
      } catch { /* try next */ }
    }

    if (found.llm) {
      c.llmUrl = found.llm.url;
      if (!found.llm.models.includes(c.llmModel)) c.llmModel = pickModel(found.llm.models);
    }
    if (found.whisper) {
      c.whisperUrl = found.whisper.url;
      c.whisperType = found.whisper.type;
      c.whisperModel = found.whisper.model;
    }
    save();
    return found;
  }

  /* Prefer a mid-sized instruct model over tiny or huge ones. */
  function pickModel(ids) {
    const size = (id) => Number((id.match(/(\d+(?:\.\d+)?)b\b/i) || [])[1] || 8);
    return [...ids].sort((a, b) => Math.abs(size(a) - 14) - Math.abs(size(b) - 14))[0];
  }

  async function check() {
    const c = cfg();
    const out = { llm: null, whisper: null };
    if (c.llmUrl) {
      try {
        const ids = await listModels(c.llmUrl);
        out.llm = { ok: true, models: ids.filter((id) => !isWhisperModel(id)) };
      } catch (err) {
        out.llm = { ok: false, error: explain(err, c.llmUrl) };
      }
    }
    if (c.whisperUrl) {
      try {
        const w = await probeWhisper(c.whisperUrl);
        if (!c.whisperType) { c.whisperType = w.type; c.whisperModel ||= w.model; save(); }
        out.whisper = { ok: true, type: c.whisperType };
      } catch (err) {
        out.whisper = { ok: false, error: explain(err, c.whisperUrl) };
      }
    }
    return out;
  }

  const llmOn = () => !!(cfg().useLlm && cfg().llmUrl && cfg().llmModel);
  const whisperOn = () => !!(cfg().useWhisper && cfg().whisperUrl && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  /* ---- LLM ---- */

  function parseJSON(text) {
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Antwort enthielt kein JSON');
    return JSON.parse(text.slice(a, b + 1));
  }

  async function chat(system, user, { ms = 120000 } = {}) {
    const c = cfg();
    const body = {
      model: c.llmModel,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2,
      stream: false,
      response_format: { type: 'json_object' },
    };
    const send = (b) => fetchJSON(`${c.llmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    }, ms);
    let j;
    try {
      j = await send(body);
    } catch (err) {
      if (!/HTTP 4\d\d/.test(err.message)) throw err;
      delete body.response_format; // some servers don't support JSON mode
      j = await send(body);
    }
    return parseJSON(j.choices?.[0]?.message?.content || '');
  }

  const GRADE_SYSTEM = `Du bist ein fairer Prüfer für die Lernmethode Blurting. Jemand hat einen Text gelesen und danach aus dem Gedächtnis aufgeschrieben oder diktiert, was er noch weiß.
Prüfe für jede Kernaussage, ob sie inhaltlich in der Antwort vorkommt. Bewerte den Sinn, nicht den Wortlaut: Synonyme, Umschreibungen, andere Reihenfolge, Rechtschreib- und Diktierfehler, fehlende Satzzeichen und ausgeschriebene Zahlen sind in Ordnung.
- "got": Kernaussage sinngemäß vorhanden und richtig.
- "partial": nur teilweise, ungenau oder ein wichtiges Detail fehlt oder ist falsch (z. B. falsche Zahl).
- "missed": fehlt oder ist falsch.
Sei großzügig bei der Formulierung, aber werte nichts, was nicht dasteht.
Antworte ausschließlich mit JSON: {"facts":[{"i":0,"status":"got"}],"feedback":"1–2 kurze Sätze auf Deutsch, per du: was gut war und welcher Punkt noch fehlt"}`;

  async function grade(facts, attempt) {
    const list = facts.map((f, i) => `${i}. ${f.a}`).join('\n');
    const j = await chat(GRADE_SYSTEM, `Kernaussagen:\n${list}\n\nAntwort:\n"""${attempt}"""`);
    const statuses = facts.map((_, i) => {
      const s = (j.facts || []).find((x) => Number(x.i) === i)?.status;
      return ['got', 'partial', 'missed'].includes(s) ? s : null;
    });
    if (statuses.every((s) => s === null)) throw new Error('Unerwartete Antwort vom Modell');
    return { statuses, feedback: typeof j.feedback === 'string' ? j.feedback : '' };
  }

  async function generateText(topic, avoid) {
    const j = await chat(
      'Du schreibst kurze, spannende und faktisch korrekte Lerntexte auf Deutsch für Gedächtnistraining. Antworte nur mit JSON.',
      `Thema: ${topic || 'Wähle selbst ein überraschendes Thema aus Wissenschaft, Geschichte, Natur, Psychologie oder Technik.'}
${avoid.length ? `Nicht diese Themen: ${avoid.join(', ')}.` : ''}
Schreibe 90–130 Wörter mit 6–8 konkreten, überprüfbaren Fakten (Zahlen, Namen, Ursachen). Nichts erfinden – im Zweifel weglassen.
JSON-Format:
{"title":"kurzer Titel","emoji":"ein passendes Emoji","body":"der Text","facts":[{"q":"Frage zum Fakt","a":"der Fakt als kurzer Satz","keys":[["schlüsselwort","synonym"],["zweites schlüsselwort"]]}]}
"keys": 1–3 Gruppen pro Fakt mit kleingeschriebenen Schlüsselwörtern und Synonymen. Jeder Fakt muss im Text stehen.`,
      { ms: 180000 },
    );
    if (typeof j.body !== 'string' || !Array.isArray(j.facts)) throw new Error('Unerwartete Antwort vom Modell');
    const facts = j.facts
      .filter((f) => f && typeof f.a === 'string')
      .map((f) => ({
        q: String(f.q || f.a),
        a: f.a,
        keys: Array.isArray(f.keys) && f.keys.every(Array.isArray) && f.keys.length
          ? f.keys.map((g) => g.map(String)).filter((g) => g.length)
          : Recall.autoFacts(f.a)[0]?.keys || [[f.a]],
      }));
    if (facts.length < 3) throw new Error('Zu wenige Fakten erzeugt');
    return { title: String(j.title || topic || 'Neues Thema'), emoji: String(j.emoji || '✨').slice(0, 4), body: j.body, facts };
  }

  async function generateDeck(topic, avoid) {
    const j = await chat(
      'Du erstellst spannende, faktisch korrekte Karteikarten auf Deutsch. Antworte nur mit JSON.',
      `Thema: ${topic || 'Wähle selbst ein überraschendes Wissensthema.'}
${avoid.length ? `Nicht diese Themen: ${avoid.join(', ')}.` : ''}
Erstelle 12 Karteikarten mit überraschenden Fakten. Frage kurz und eindeutig, Antwort maximal ein Satz. Nichts erfinden.
JSON-Format: {"title":"kurzer Titel","emoji":"ein Emoji","cards":[{"q":"Frage","a":"Antwort"}]}`,
      { ms: 180000 },
    );
    const cards = (j.cards || []).filter((c) => c && c.q && c.a).map((c) => [String(c.q), String(c.a)]);
    if (cards.length < 4) throw new Error('Zu wenige Karten erzeugt');
    return { title: String(j.title || topic || 'KI-Paket'), emoji: String(j.emoji || '✨').slice(0, 4), cards };
  }

  /* ---- Whisper ---- */

  function encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
    return new Blob([buf], { type: 'audio/wav' });
  }

  /* 16 kHz mono WAV works with every Whisper server, including whisper.cpp without ffmpeg. */
  async function toWav16k(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    return encodeWav((await off.startRendering()).getChannelData(0), 16000);
  }

  async function transcribe(blob) {
    const c = cfg();
    const wav = await toWav16k(blob);
    const form = new FormData();
    let url;
    if (c.whisperType === 'asr') {
      form.append('audio_file', wav, 'audio.wav');
      url = `${c.whisperUrl}/asr?task=transcribe&language=de&output=json`;
    } else if (c.whisperType === 'whispercpp') {
      form.append('file', wav, 'audio.wav');
      form.append('response_format', 'json');
      form.append('language', 'de');
      url = `${c.whisperUrl}/inference`;
    } else {
      form.append('file', wav, 'audio.wav');
      form.append('model', c.whisperModel || 'whisper-1');
      form.append('language', 'de');
      form.append('response_format', 'json');
      url = `${c.whisperUrl}/v1/audio/transcriptions`;
    }
    const j = await fetchJSON(url, { method: 'POST', body: form }, 180000);
    return String(j.text || '').trim();
  }

  /* Push-to-talk recorder: start() → stop() resolves with the transcript. */
  function recorder() {
    let rec;
    let stream;
    const chunks = [];
    return {
      async start() {
        if (!window.isSecureContext) throw new Error('Mikrofon braucht HTTPS oder localhost (siehe README → KI-Server).');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.start();
      },
      stop() {
        return new Promise((resolve, reject) => {
          if (!rec) return resolve('');
          rec.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            try {
              resolve(chunks.length ? await transcribe(new Blob(chunks, { type: rec.mimeType })) : '');
            } catch (err) {
              reject(err);
            }
          };
          rec.stop();
        });
      },
      cancel() {
        try { rec?.stop(); } catch { /* already stopped */ }
        stream?.getTracks().forEach((t) => t.stop());
      },
    };
  }

  return { cfg, discover, check, detectProxy, llmOn, whisperOn, grade, generateText, generateDeck, recorder, explain };
})();
