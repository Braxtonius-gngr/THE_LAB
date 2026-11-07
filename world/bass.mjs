// Bass: Marco's electric bass, heard. A plucked string made in the browser (Karplus-Strong:
// a burst of noise fed through a short delay with a low-pass in the loop - the physics of a
// string, more or less), through a tone roll-off and a little amp grit, positioned in the room
// so it's louder as you walk up.
//
// He plays what he knows: a few original lines (written here - his own stuff), each a bar or
// two looped, with a bridge he's still learning. His playing is a learner's: timing that drifts,
// a muffed note now and then, the hard bridge rougher than the verse - and `skill` (0-1) eases
// all of that, so as his life logs practice he gets cleaner.
//
// Notes are MIDI numbers (E1 = 28, the low E on a 4-string). Patterns: [note|null, beats].

const RIFFS = {
  // a lazy walking line in E, the one he noodles when he's thinking
  walk_e: { bpm: 92, verse: [[28, 1], [31, 1], [33, 1], [35, 1], [36, 1], [35, 1], [33, 1], [31, 1]], bridge: [[40, 0.5], [38, 0.5], [36, 0.5], [35, 1.5], [33, 0.5], [31, 0.5], [28, 2]] },
  // a bouncy funk thing in A: eighth-note syncopation, ghost notes (null = muted pluck)
  funk_a: { bpm: 104, verse: [[33, 0.75], [null, 0.25], [33, 0.5], [45, 0.5], [null, 0.5], [43, 0.5], [40, 0.5], [null, 0.25], [36, 0.25]], bridge: [[38, 0.5], [41, 0.25], [43, 0.25], [45, 0.5], [null, 0.5], [40, 0.5], [38, 0.5], [36, 0.25], [35, 0.25], [33, 0.5]] },
  // slow and low in D, a song he's been writing
  slow_d: { bpm: 72, verse: [[26, 2], [33, 1], [31, 1], [26, 2], [29, 1], [31, 1]], bridge: [[34, 1], [36, 0.5], [38, 0.5], [41, 1], [38, 1], [36, 1.5], [33, 0.5], [29, 2]] },
};
const hz = n => 440 * Math.pow(2, (n - 69) / 12);

export class Bass {
  // at(): Vector3 of the instrument; ear(): Vector3 of the player
  constructor({ at, ear }) { this.at = at; this.ear = ear; this.ctx = null; this.playing = false; this.skill = 0.35; }

  _setup() {
    const ctx = this.ctx || (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (!this.out) {
      // tone: a bass amp's voice - roll off the top, a touch of saturation, a little room
      // (a plucked string is all harmonics; what makes a bass sound like a bass is the pickup, the
      // amp and the cab rolling everything above a few hundred Hz away - two poles of it here)
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 320; tone.Q.value = 0.9;
      const tone2 = ctx.createBiquadFilter(); tone2.type = 'lowpass'; tone2.frequency.value = 900; tone2.Q.value = 0.5;
      const shaper = ctx.createWaveShaper(); const k = 2.5, c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } shaper.curve = c; shaper.oversample = '2x';
      const amp = ctx.createGain(); amp.gain.value = 0;
      const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 80; body.gain.value = 5;
      tone.connect(tone2); tone2.connect(shaper); shaper.connect(body); body.connect(amp); amp.connect(ctx.destination);
      this.inp = tone; this.out = amp;
    }
    return ctx;
  }

  // one plucked note: Karplus-Strong on a short buffer, hand-rolled for the length we need
  _pluck(freq, when, dur, { vel = 1, muted = false } = {}) {
    const ctx = this.ctx, sr = ctx.sampleRate, N = Math.round(sr / freq), len = Math.ceil(sr * Math.min(dur + 0.4, 3));
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    // the pick: a burst of noise, softened by how hard he plays; muted = palm on the string
    const damp = muted ? 0.93 : 0.9965 - (1 - vel) * 0.003, bright = muted ? 0.25 : 0.45 + 0.35 * vel;
    // seed one period with noise, low-passed so it's a thumb not a pick; then each sample is the
    // damped average of the two samples one period back (the string's round trip)
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    for (let k = 0, passes = Math.round((1 - bright) * 6); k < passes; k++) for (let i = N - 1; i > 0; i--) d[i] = 0.5 * (d[i] + d[i - 1]);
    for (let i = N; i < len; i++) d[i] = damp * 0.5 * (d[i - N] + d[i - N + 1]);
    // (the loop also filters DC into a slow drift; take it out)
    let dc = 0; for (let i = 0; i < len; i++) { dc = dc * 0.999 + d[i] * 0.001; d[i] -= dc; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * vel, when); g.gain.setTargetAtTime(0, when + Math.max(0.05, dur - 0.05), muted ? 0.02 : 0.12);
    src.connect(g); g.connect(this.inp); src.start(when); src.stop(when + Math.min(dur + 0.4, 3));
  }

  // play a riff, looping verse / bridge like someone practising, until stop()
  async play(name = null, { onBar } = {}) {
    const ctx = this._setup(); if (ctx.state === 'suspended') await ctx.resume();
    this.stop(); this.playing = true; this.riff = RIFFS[name] || RIFFS[Object.keys(RIFFS)[Math.floor(Math.random() * 3)]];
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    let t = ctx.currentTime + 0.2, bar = 0; this.cb = { onBar };
    const schedule = () => {
      if (!this.playing) return;
      // verse twice, then the bridge, and round again; the bridge is where it falls apart
      const isBridge = bar % 3 === 2, pat = isBridge ? this.riff.bridge : this.riff.verse, beat = 60 / this.riff.bpm;
      const sk = this.skill * (isBridge ? 0.6 : 1), wobble = (1 - sk) * 0.045, fluff = (1 - sk) * (isBridge ? 0.22 : 0.07);
      const mistakes = [];
      for (const [note, beats] of pat) {
        const late = (Math.random() - 0.3) * wobble * beat, dur = beats * beat;
        if (note == null) this._pluck(hz(40), t + late, dur * 0.5, { vel: 0.5, muted: true });
        else if (Math.random() < fluff) { const r = Math.random(); if (r < 0.4) this._pluck(hz(note + (Math.random() < 0.5 ? 1 : -1)), t + late, dur, { vel: 0.7 }); else if (r < 0.7) this._pluck(hz(note), t + late + beat * 0.18, dur * 0.8, { vel: 0.5 }); else this._pluck(hz(note), t + late, dur * 0.3, { vel: 0.6, muted: true }); mistakes.push(note); }
        else this._pluck(hz(note), t + late, dur, { vel: 0.75 + 0.25 * Math.random() });
        t += dur;
      }
      this.cb.onBar?.({ bar, bridge: isBridge, mistakes: mistakes.length, notes: pat.length });
      bar++;
      // after a bad bridge he sometimes stops, mutters, and goes again from the top
      const pause = isBridge && mistakes.length >= 2 && Math.random() < 0.5 ? beat * 2 : 0; t += pause;
      this.timer = setTimeout(schedule, Math.max(50, (t - ctx.currentTime - 0.35) * 1000));
    };
    schedule();
  }
  stop() { clearTimeout(this.timer); if (this.playing && this.out) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25); this.playing = false; }
  // every frame: volume by distance
  update() { if (this.playing && this.out && this.ctx) { const d = this.at().distanceTo(this.ear()); this.out.gain.setTargetAtTime(Math.min(1, 1.3 / (0.5 + d)), this.ctx.currentTime, 0.1); } }
  get riffNames() { return Object.keys(RIFFS); }
}
