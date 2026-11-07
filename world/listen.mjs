// Listen: play a song (a file from your device) in the room, and let a character really
// listen to it. The AI behind him can't hear audio, so the page listens for him: when the
// song loads, its samples are read straight through (exact, no matter how fast the device
// draws) - loudness, low end and brightness every 50 ms, the beats, the tempo, and the
// moments a person notices (a drop, a breakdown, the end). While it plays he doesn't talk
// over it: his body moves with it (a nod on the beats once the groove settles, a look toward
// the speaker at a big moment). When it ends, the whole picture goes to his mind once, with
// your lyrics and style notes if you gave them, and he tells you what he thought.

const HOP = 0.05;   // seconds per analysis frame

export class Listener {
  // at(): Vector3 of the speaker; ear(): Vector3 of the player (volume by distance)
  constructor({ at, ear }) { this.at = at; this.ear = ear; this.ctx = null; this.playing = false; }

  async play(file, { onMoment, onBeat, onEnd } = {}) {
    this.stop();
    const ctx = this.ctx || (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') await ctx.resume();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    this.title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    this.A = analyse(buf);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const gain = ctx.createGain(); src.connect(gain); gain.connect(ctx.destination);
    Object.assign(this, { src, gain, t0: ctx.currentTime, playing: true, cb: { onMoment, onBeat, onEnd }, bi: 0, mi: 0, stoppedAt: null });
    src.onended = () => { if (!this.playing) return; this.playing = false; clearInterval(this.tick); this._finish(); };
    src.start();
    clearInterval(this.tick); this.tick = setInterval(() => this._cue(), 30);
    return { duration: buf.duration, tempo: this.A.bpm };
  }
  stop() { clearInterval(this.tick); this.playing = false; if (this.src) { try { this.src.onended = null; this.src.stop(); } catch (_) { /* done */ } this.src = null; } }
  get time() { return this.ctx && this.src ? this.ctx.currentTime - this.t0 : 0; }
  // you stopped it partway: he still has an opinion of what he heard
  cut() { if (!this.playing) return; this.stoppedAt = this.time; this.stop(); this._finish(); }

  // every frame: volume by distance from the speaker
  update() { if (this.playing && this.gain) { const d = this.at().distanceTo(this.ear()); this.gain.gain.value = Math.min(1, 1.6 / (0.6 + d)); } }
  // fire the beats and moments as the song reaches them
  _cue() {
    const t = this.time, A = this.A;
    while (this.bi < A.beats.length && A.beats[this.bi] <= t) { this.bi++; this.cb.onBeat?.(t); }
    while (this.mi < A.moments.length && A.moments[this.mi].t <= t) this.cb.onMoment?.(A.moments[this.mi++]);
  }
  _finish() { this.cb.onEnd?.(this.summary()); }

  // the song in words, for his mind: overall feel, how it moves, the moments (up to where it stopped)
  summary() {
    const A = this.A; if (!A) return null;
    const end = this.stoppedAt ?? A.dur, F = A.frames.filter(f => f.t <= end); if (!F.length) return null;
    const pct = (k, q) => { const v = A.frames.map(f => f[k]).sort((a, b) => a - b); return v[Math.floor(v.length * q)] || 1e-9; };
    const L = pct('loud', 0.9), B = pct('low', 0.9);
    const part = (a, b) => { const R = F.filter(f => f.t >= a && f.t < b); if (!R.length) return null; const av = k => R.reduce((x, f) => x + f[k], 0) / R.length;
      const loud = av('loud') / L, low = av('low') / B, br = av('bright');
      return `${fmt(a)}-${fmt(Math.min(b, end))}: ${loud > 0.75 ? 'full and loud' : loud > 0.45 ? 'medium' : 'quiet'}, ${low > 0.65 ? 'heavy low end' : low > 0.3 ? 'some bass' : 'light on bass'}, ${br > 0.25 ? 'bright' : br > 0.1 ? 'warm' : 'dark'}`; };
    const step = Math.max(15, Math.round(end / 8)), parts = [];
    for (let a = 0; a < end; a += step) { const p = part(a, a + step); if (p) parts.push(p); }
    const avg = F.reduce((x, f) => x + f.loud, 0) / F.length / L;
    return { title: this.title, length: fmt(A.dur), tempo_bpm: A.bpm || null, overall: avg > 0.6 ? 'driving, mostly full' : avg > 0.35 ? 'mid-energy, dynamic' : 'mellow, spacious',
      how_it_moves: parts, moments: A.moments.filter(m => m.t <= end).map(m => `${fmt(m.t)} ${m.kind}`), stopped_early: this.stoppedAt != null ? fmt(this.stoppedAt) : null };
  }
}

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// read the whole song: frames of loudness / low end / brightness, beats, tempo, moments
export function analyse(buf) {
  const sr = buf.sampleRate, n = buf.length, ch = buf.numberOfChannels, hop = Math.round(sr * HOP);
  const mono = new Float32Array(n); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
  // a one-pole low-pass (~150 Hz) for the bass; the high part is the sample-to-sample change
  const a = Math.exp(-2 * Math.PI * 150 / sr); let lp = 0, prev = 0;
  const frames = [];
  for (let s = 0; s + hop <= n; s += hop) {
    let e = 0, el = 0, eh = 0;
    for (let i = s; i < s + hop; i++) { const x = mono[i]; lp = a * lp + (1 - a) * x; const h = x - prev; prev = x; e += x * x; el += lp * lp; eh += h * h; }
    frames.push({ t: s / sr, loud: Math.sqrt(e / hop), low: Math.sqrt(el / hop), bright: e > 0 ? Math.sqrt(eh / e) : 0 });
  }
  // onsets in the low end: rises over the local average
  const on = frames.map((f, i) => Math.max(0, f.low - (i ? frames[i - 1].low : 0)));
  // tempo: autocorrelation of the onset curve, 70-180 bpm, folded into a likely range
  let best = 0, bpm = 0;
  for (let b = 70; b <= 180; b++) { const lag = 60 / b / HOP, l0 = Math.floor(lag), fr = lag - l0; let s = 0;
    for (let i = l0 + 1; i < on.length; i++) s += on[i] * (on[i - l0] * (1 - fr) + on[i - l0 - 1] * fr);
    if (s > best) { best = s; bpm = b; } }
  // beats: onset peaks above the local level, at least 60% of a beat apart
  const beats = [], gap = bpm ? 0.6 * 60 / bpm : 0.25, W = 20;
  for (let i = 1; i < on.length - 1; i++) {
    const lo = Math.max(0, i - W), hi = Math.min(on.length, i + W); let m = 0; for (let j = lo; j < hi; j++) m += on[j]; m /= (hi - lo);
    if (on[i] > m * 2 && on[i] >= on[i - 1] && on[i] >= on[i + 1] && on[i] > 1e-4 && (!beats.length || frames[i].t - beats[beats.length - 1] > gap)) beats.push(frames[i].t);
  }
  // moments: a second's loudness against the ~8 s before it
  const secs = []; for (let i = 0; i < frames.length; i += 20) { const R = frames.slice(i, i + 20); secs.push({ t: R[0].t, loud: R.reduce((x, f) => x + f.loud, 0) / R.length }); }
  const moments = [];
  for (let k = 6; k < secs.length; k++) {
    const back = secs.slice(Math.max(0, k - 8), k), mean = back.reduce((x, r) => x + r.loud, 0) / back.length, last = moments[moments.length - 1];
    if (last && secs[k].t - last.t < 8) continue;
    if (secs[k].loud > mean * 1.6) moments.push({ t: secs[k].t, kind: 'it hits - a drop or a big chorus' });
    else if (secs[k].loud < mean * 0.5) moments.push({ t: secs[k].t, kind: 'it pulls back - breakdown or quiet bridge' });
  }
  return { dur: buf.duration, frames, bpm, beats, moments };
}
