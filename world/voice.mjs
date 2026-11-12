// Voice: characters speak their lines aloud, and you can talk to them by mic.
// Voices are ElevenLabs (supabase/functions/voice: one voice per character, kept); if that
// fails - no credits, offline - the browser's own speech takes over, with a profile per
// character (pitch, pace, voice names to prefer) so two men still sound different.
import { SUPABASE_URL, SUPABASE_ANON, CHARACTERS } from './mind.mjs';
const FN = `${SUPABASE_URL}/functions/v1/voice`, AUTH = { Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON };
const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;

// who sounds how (pitch 0-2, rate 0.1-10; 1 is the device's normal)
export const VOICES = {
  marco: { pitch: 0.85, rate: 0.98, prefer: [/en-US/i], avoid: /female|woman|samantha|victoria|karen|zira|susan|fiona|moira|tessa/i, male: /male|daniel|alex|fred|david|mark|guy|aaron|arthur|tom|google us english/i },
  dante: { pitch: 0.72, rate: 1.06, prefer: [/en-GB|en-AU|en-US/i], avoid: /female|woman|samantha|victoria|karen|zira|susan|fiona|moira|tessa/i, male: /male|daniel|alex|fred|david|mark|guy|aaron|arthur|tom|rishi|oliver|google uk english male/i },
};

let voices = [];
const load = () => { voices = synth ? synth.getVoices() : []; };
if (synth) { load(); synth.onvoiceschanged = load; }

// a different voice for each character where the device has more than one man's voice
const chosen = {};
function pick(key) {
  if (chosen[key] !== undefined) return chosen[key];
  const P = VOICES[key] || VOICES.marco, en = voices.filter(v => /^en/i.test(v.lang) && !P.avoid.test(v.name));
  const taken = new Set(Object.values(chosen).filter(Boolean).map(v => v.name));
  const rank = v => (P.male.test(v.name) ? 4 : 0) + (P.prefer.some(r => r.test(v.lang)) ? 2 : 0) + (v.localService ? 1 : 0) - (taken.has(v.name) ? 5 : 0);
  return chosen[key] = en.sort((a, b) => rank(b) - rank(a))[0] || null;
}

export const voice = {
  on: true,
  get available() { return !!synth; },
  // speak a line as `key`; resolves when it's done (or straight away when voice is off)
  // ElevenLabs first (supabase/functions/voice); the browser's voice if that fails (no credits, offline)
  engine: 'eleven',
  // what is being said right now, for the face (world/face.mjs): { key, text, t0, alignment?, audio? }
  // alignment = { chars, start, end } in seconds from the start of the audio; the browser's own
  // voice gives word boundaries instead (bound: { char, at }), updated as it goes
  current: null,
  async speak(key, text, opts = {}) {
    if (!this.on || !text) { opts.onEnd?.(); return; }
    if (this.engine === 'eleven' && CHARACTERS[key]) {
      try {
        const r = await fetch(FN, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'speak', character_id: CHARACTERS[key], text, timing: true }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
        const d = await r.json(); if (!d.audio) throw new Error('no audio');
        const bytes = Uint8Array.from(atob(d.audio), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })), a = this.audio = new Audio(url);
        const cur = this.current = { key, text, audio: a, alignment: d.alignment && d.alignment.chars?.length ? d.alignment : null, t0: 0 };
        const done = () => { if (this.current === cur) this.current = null; };
        return await new Promise(res => { a.onplay = () => { cur.t0 = performance.now(); opts.onStart?.(); }; a.onended = a.onerror = () => { URL.revokeObjectURL(url); done(); opts.onEnd?.(); res(); }; a.play().catch(() => { done(); opts.onEnd?.(); res(); }); });
      } catch (e) { console.warn('voice: falling back to the browser -', e.message || e); }
    }
    return this._browser(key, text, opts);
  },
  _browser(key, text, { onStart, onEnd } = {}) {
    if (!synth) { onEnd?.(); return Promise.resolve(); }
    if (!voices.length) load();
    const P = VOICES[key] || VOICES.marco, u = new SpeechSynthesisUtterance(text);
    const v = pick(key); if (v) u.voice = v;
    u.pitch = P.pitch; u.rate = P.rate; u.lang = v?.lang || 'en-US';
    const cur = this.current = { key, text, alignment: null, bound: null, t0: 0 };
    const done = () => { if (this.current === cur) this.current = null; };
    u.onboundary = e => { cur.bound = { char: e.charIndex || 0, at: performance.now() }; };
    return new Promise(res => { u.onstart = () => { cur.t0 = performance.now(); onStart?.(); }; u.onend = u.onerror = () => { done(); onEnd?.(); res(); }; synth.speak(u); });
  },
  // seconds into the current line, and the character being spoken (from the alignment, or the
  // browser's last word boundary); null when nobody is talking
  spoken() {
    const c = this.current; if (!c) return null;
    if (c.audio) { const t = c.audio.currentTime; const A = c.alignment; let i = -1; if (A) { let lo = 0, hi = A.start.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (A.start[m] <= t) { i = m; lo = m + 1; } else hi = m - 1; } if (i >= 0 && t > A.end[i] + 0.05) i = -1; } return { key: c.key, t, char: i >= 0 ? A.chars[i] : null, next: i >= 0 ? A.chars[i + 1] || '' : '', text: c.text, index: i }; }
    const t = (performance.now() - c.t0) / 1000, b = c.bound; const i = b ? Math.min(c.text.length - 1, b.char + Math.floor((performance.now() - b.at) / 70)) : -1;
    return { key: c.key, t, char: i >= 0 ? c.text[i] : null, next: i >= 0 ? c.text[i + 1] || '' : '', text: c.text, index: i };
  },
  stop() { synth?.cancel(); if (this.audio) { this.audio.pause(); this.audio = null; } this.current = null; },
};

// the mic: tap to start, tap again (or 20 s) to stop; the recording goes to ElevenLabs Scribe.
// Where recording isn't available, the browser's own recognition does it.
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const canRecord = typeof window !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
export const ears = {
  get available() { return canRecord || !!SR; },
  listening: false,
  async listen({ onText, onPartial, onState }) {
    if (this.listening) return;
    voice.stop();   // (don't hear him over yourself)
    if (!canRecord) return this._browser({ onText, onPartial, onState });
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { onState?.(false, 'not-allowed'); return; }
    const rec = this.rec = new MediaRecorder(stream), parts = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); this.listening = false; clearTimeout(this.cap);
      onState?.(false); onPartial?.('…');
      try { const text = await transcribe(new Blob(parts, { type: rec.mimeType || 'audio/webm' }), 'hear'); onPartial?.(text); if (text) onText(text); }
      catch (e) { onPartial?.(''); onState?.(false, 'could not hear that - ' + (e.message || e)); }
    };
    rec.start(); this.listening = true; onState?.(true); this.cap = setTimeout(() => this.stop(), 20000);
  },
  stop() { if (this.rec && this.rec.state === 'recording') this.rec.stop(); else this.sr?.stop(); },
  _browser({ onText, onPartial, onState }) {
    if (!SR) return;
    const r = new SR(); r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
    this.listening = true; onState?.(true);
    let final = '';
    r.onresult = e => { let part = ''; for (const res of e.results) (res.isFinal ? (final = res[0].transcript) : (part += res[0].transcript)); onPartial?.(final || part); };
    r.onerror = e => { this.listening = false; onState?.(false, e.error); };
    r.onend = () => { this.listening = false; onState?.(false); if (final.trim()) onText(final.trim()); };
    r.start(); this.sr = r;
  },
};

// speech or a song's vocals to text (ElevenLabs Scribe)
export async function transcribe(blob, action = 'hear') {
  const f = new FormData(); f.append('action', action); f.append('audio', blob, blob.name || (action === 'lyrics' ? 'song.mp3' : 'speech.webm'));
  const r = await fetch(FN, { method: 'POST', headers: AUTH, body: f }); const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || r.status); return d.text || '';
}
