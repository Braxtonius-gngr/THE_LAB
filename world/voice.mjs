// Voice: characters speak their lines aloud, and you can talk to them by mic.
// Now: the browser's own speech (free; voices vary by device). Each character has a
// profile - pitch, pace, and voice names to prefer - so two men sound different.
// Later: a paid voice service slots in as another `engine` with the same speak().
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
  speak(key, text, { onStart, onEnd } = {}) {
    if (!this.on || !synth || !text) { onEnd?.(); return Promise.resolve(); }
    if (!voices.length) load();
    const P = VOICES[key] || VOICES.marco, u = new SpeechSynthesisUtterance(text);
    const v = pick(key); if (v) u.voice = v;
    u.pitch = P.pitch; u.rate = P.rate; u.lang = v?.lang || 'en-US';
    return new Promise(res => { u.onstart = () => onStart?.(); u.onend = u.onerror = () => { onEnd?.(); res(); }; synth.speak(u); });
  },
  stop() { synth?.cancel(); },
};

// the mic: one phrase at a time, the words handed to `onText`
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const ears = {
  get available() { return !!SR; },
  listening: false,
  listen({ onText, onPartial, onState }) {
    if (!SR || this.listening) return;
    const r = new SR(); r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
    this.listening = true; onState?.(true); voice.stop();   // (don't hear him over yourself)
    let final = '';
    r.onresult = e => { let part = ''; for (const res of e.results) (res.isFinal ? (final = res[0].transcript) : (part += res[0].transcript)); onPartial?.(final || part); };
    r.onerror = e => { this.listening = false; onState?.(false, e.error); };
    r.onend = () => { this.listening = false; onState?.(false); if (final.trim()) onText(final.trim()); };
    r.start(); this.rec = r;
  },
  stop() { this.rec?.stop(); },
};
