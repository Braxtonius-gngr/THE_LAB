// Dev-overlay for live anatomy parameter tuning.
// Gated behind WebAuthn biometric 2FA — the owner registers a credential
// from their biometric-locked phone, then authenticates each session.
//
// Usage: import and call `initDevOverlay(scene)` from the valley module
// when `?lab` is in the URL.  The overlay floats over the WebGL canvas.

import { getAnatomy, setAnatomy, rebuildAnatomy, migrateAnatomy, anatomyCm } from './figure.mjs';

// the creation values, kept for "Reset defaults" (the sliders move the live
// base with setAnatomy, so men built after a change - the lab rebuilds a
// man on every pose or outfit - take the tuned values)
const DEFAULTS = getAnatomy();

// ── Supabase constants (same as index.html) ──────────────────────────
const SB_URL = 'https://ewfvyrhlsanzkmozrmhs.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3ZnZ5cmhsc2Fuemttb3pybWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjkxODksImV4cCI6MjEwNDc0NTE4OX0.kxDXQnueexwstqLeZNJdlITffqTHulaV6z-Rdb0ZJQE';

const SESSION_KEY = 'dev_overlay_session_v1';
// (a preview deploy has no app sign-in of its own - its address is new to
// the browser - so the gate signs the owner in itself: an emailed link back
// to this page, its token kept here, apart from the app's own session)
const SIGNIN_KEY = 'dev_overlay_signin_v1';

// back from the emailed link: the token rides in the address's #fragment
(function takeSignIn() {
  try {
    if (!location.hash || location.hash.indexOf('access_token=') < 0) return;
    const q = new URLSearchParams(location.hash.slice(1));
    const at = q.get('access_token'), exp = Number(q.get('expires_at')) || (Date.now() / 1000 + Number(q.get('expires_in') || 3600));
    if (at) localStorage.setItem(SIGNIN_KEY, JSON.stringify({ access_token: at, expires_at: exp }));
    history.replaceState(null, '', location.pathname + location.search);
  } catch (_) { /* nothing to take */ }
})();

// ── helpers ──────────────────────────────────────────────────────────
const APP_TOKEN_KEY = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`;
function appSession() { try { return JSON.parse(localStorage.getItem(APP_TOKEN_KEY) || 'null'); } catch (_) { return null; } }
function sbHeaders() {
  const h = { 'Content-Type': 'application/json', apikey: SB_ANON };
  const tok = appSession();
  if (tok && tok.access_token && !(tok.expires_at && Date.now() / 1000 > tok.expires_at - 30)) h.authorization = `Bearer ${tok.access_token}`;
  if (!h.authorization) { const t = gateSignIn(); if (t) h.authorization = `Bearer ${t}`; }
  return h;
}

// the gate's own sign-in, while it lasts
function gateSignIn() {
  try {
    const t = JSON.parse(localStorage.getItem(SIGNIN_KEY) || '{}');
    return t.access_token && Date.now() / 1000 < t.expires_at - 30 ? t.access_token : null;
  } catch (_) { return null; }
}
function signedIn() { const t = appSession(); return !!(sbHeaders().authorization || (t && t.refresh_token)); }

// the app's sign-in lasts an hour and only the app's own page renews it -
// this page runs no supabase-js, so a stale token came back "Unauthorized".
// Renew it here the same way (and keep it where the app will find it).
async function renewAppSession() {
  const t = appSession();
  if (!t || !t.refresh_token || !(t.expires_at && Date.now() / 1000 > t.expires_at - 30)) return;
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_ANON },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  });
  if (!r.ok) throw new Error('Sign-in ran out: open dailyrollover.com once, then come back');
  const s = await r.json();
  if (!s.expires_at) s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in || 3600);
  try { localStorage.setItem(APP_TOKEN_KEY, JSON.stringify(s)); } catch (_) { /* storage blocked */ }
}

// email the owner a sign-in link back to this page (an existing account only)
async function emailSignIn(email) {
  const back = location.origin + location.pathname + location.search;
  const r = await fetch(`${SB_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(back)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_ANON },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!r.ok) throw new Error((await r.text()) || 'Could not send the link');
}

async function callEdge(fn, body) {
  await renewAppSession();
  const r = await fetch(`${SB_URL}/functions/v1/${fn}`, {
    method: 'POST', headers: sbHeaders(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function hasSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    return s.token && Date.now() < s.expires;
  } catch (_) { return false; }
}

function saveSession(token, expiresIn) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    token, expires: Date.now() + expiresIn * 1000,
  }));
}

// ── WebAuthn browser API calls ───────────────────────────────────────
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function webauthnRegister() {
  // step 1: get creation options
  const opts = await callEdge('webauthn-register', { step: 'options' });
  // decode the challenge and user.id
  opts.challenge = fromBase64url(opts.challenge);
  opts.user.id = fromBase64url(opts.user.id);
  if (opts.excludeCredentials) {
    opts.excludeCredentials = opts.excludeCredentials.map(c => ({
      ...c, id: fromBase64url(c.id),
    }));
  }
  // step 2: browser biometric prompt
  const cred = await navigator.credentials.create({ publicKey: opts });
  // step 3: send back for verification
  const response = {
    id: cred.id,
    rawId: base64url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: base64url(cred.response.attestationObject),
      clientDataJSON: base64url(cred.response.clientDataJSON),
      transports: cred.response.getTransports ? cred.response.getTransports() : [],
    },
  };
  return callEdge('webauthn-register', { step: 'verify', response });
}

async function webauthnAuthenticate() {
  // step 1: get request options
  const opts = await callEdge('webauthn-authenticate', { step: 'options' });
  opts.challenge = fromBase64url(opts.challenge);
  if (opts.allowCredentials) {
    opts.allowCredentials = opts.allowCredentials.map(c => ({
      ...c, id: fromBase64url(c.id),
    }));
  }
  // step 2: browser biometric prompt
  const assertion = await navigator.credentials.get({ publicKey: opts });
  // step 3: send back
  const response = {
    id: assertion.id,
    rawId: base64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: base64url(assertion.response.authenticatorData),
      clientDataJSON: base64url(assertion.response.clientDataJSON),
      signature: base64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? base64url(assertion.response.userHandle) : null,
    },
  };
  const result = await callEdge('webauthn-authenticate', { step: 'verify', response });
  if (result.verified) saveSession(result.sessionToken, result.expiresIn);
  return result;
}

// ── slider parameter definitions ─────────────────────────────────────
// grouped by part, each part its own tab: a part's Size sets the ceiling
// of the rest of that part's sliders (see the anatomy notes in figure.mjs)
const PARTS = [
  { id: 'pouch', label: 'Weight pouch', params: [
    { key: 'sizePouch', label: 'Size pouch', min: 0.5, max: 3,   step: 0.05 },
    { key: 'length',    label: 'Length',     min: 0,   max: 100, step: 1 },
    { key: 'girth',     label: 'Girth',      min: 0,   max: 100, step: 1 },
    { key: 'depth',     label: 'Depth',      min: 0,   max: 100, step: 1 },
    { key: 'gorge',     label: 'Gorge',      min: 0,   max: 100, step: 1 },
    { key: 'sway',      label: 'Sway',       min: 0,   max: 3,   step: 0.1 },
    { key: 'taper',     label: 'Taper',      min: 0,   max: 100, step: 1 },
    { key: 'elevation', label: 'Elevation',  min: 0,   max: 100, step: 1 },
    { key: 'pitch',     label: 'Pitch',      min: 0,   max: 100, step: 1 },
    { key: 'twist',     label: 'Twist L/R',  min: 0,   max: 100, step: 1 },
  ] },
  { id: 'lobes', label: 'Lobes', params: [
    { key: 'sizeLobe',  label: 'Size lobe',  min: 0.5, max: 3,   step: 0.05 },
    { key: 'fullnessL', label: 'Fullness L', min: 0,   max: 100, step: 1 },
    { key: 'fullnessR', label: 'Fullness R', min: 0,   max: 100, step: 1 },
    { key: 'hangL',     label: 'Hang L',     min: 0,   max: 100, step: 1 },
    { key: 'hangR',     label: 'Hang R',     min: 0,   max: 100, step: 1 },
    { key: 'lobeLag',   label: 'Lag R',      min: 0,   max: 100, step: 1 },
    { key: 'density',   label: 'Density',    min: 0,   max: 100, step: 1 },
  ] },
  { id: 'envelope', label: 'Envelope', params: [
    { key: 'hood',      label: 'Hood',       min: 0,   max: 100, step: 1 },
    { key: 'ring',      label: 'Ring',       min: 0,   max: 100, step: 1 },
    { key: 'tether',    label: 'Tether',     min: 0,   max: 100, step: 1 },
    { key: 'glide',     label: 'Glide',      min: 0,   max: 100, step: 1 },
    { key: 'retract',   label: 'Retract',    min: 0,   max: 100, step: 1 },
    { key: 'folds',     label: 'Folds',      min: 0,   max: 100, step: 1 },
  ] },
  { id: 'material', label: 'Material', params: [
    { key: 'modulus',   label: 'Modulus',    min: 0,   max: 100, step: 1 },
    { key: 'damping',   label: 'Damping',    min: 0,   max: 100, step: 1 },
    { key: 'resist',    label: 'Resist',     min: 0,   max: 100, step: 1 },
    { key: 'adhesion',  label: 'Adhesion',   min: 0,   max: 100, step: 1 },
  ] },
];
const PARAMS = PARTS.flatMap(p => p.params);

// ── Randomize · realism: every slider drawn from a bell curve ─────────
// Each parameter is a normal distribution about its baseline (the average
// man's), its spread a natural one; a draw past 2.2 spreads is drawn again
// (a truncated normal), so the tails stay rare and nothing reaches the
// sliders' clipping extremes. Pairs that go together are drawn together:
// the lobes' size with the pouch's (r 0.5), left and right fullness (0.7)
// and hang (0.6) - so a man is usually a little uneven, seldom lopsided.
// `sd` in the slider's own units; `corr` names the parameter it leans on.
const REALISM = {
  sizePouch: { sd: 0.12 },
  length: { sd: 12 }, girth: { sd: 11 }, depth: { sd: 10 }, gorge: { sd: 8, floor: 0 }, sway: { sd: 0.2 },
  sizeLobe: { sd: 0.1, corr: ['sizePouch', 0.5] },
  fullnessL: { sd: 10 }, fullnessR: { sd: 10, corr: ['fullnessL', 0.7] },
  hangL: { sd: 10 }, hangR: { sd: 10, corr: ['hangL', 0.6] },
  taper: { sd: 10 }, elevation: { sd: 10 }, pitch: { sd: 10 }, twist: { sd: 12 },
  lobeLag: { sd: 12 }, density: { sd: 12 },
  // (the envelope: none on about half of draws - then the rest of its cut
  // is drawn all the same, for when it is turned up)
  hood: { sd: 15, mean: 55, none: 0.5, floor: 5 }, ring: { sd: 15 }, tether: { sd: 12 }, glide: { sd: 12 }, retract: { sd: 12 }, folds: { sd: 15 },
  modulus: { sd: 12 }, damping: { sd: 12 }, resist: { sd: 12 }, adhesion: { sd: 12 },
};

// a length for the owner's eye: inches first, the centimetres beside them
// (the lab works in cm; the owner reads in inches)
export function inCm(cm, d = 1) { return `${(cm / 2.54).toFixed(d)}″ (${cm.toFixed(d)} cm)`; }

// ── the realism clamp: what a real man measures ──────────────────────
// With it on, every set - moved by hand or drawn - is held inside the
// anthropometric bounds below, in centimetres where the part has one
// (anatomyCm: the shaft's run from its root, its girth round, how far its
// front stands out): a slider pushed past one stops where the measure
// meets its bound, others bound in the slider's own units. Off, every
// slider runs its whole range, for exploring the extremes.
const CLAMP = {
  cm: { length: [8, 16], girth: [7, 14], depth: [3, 7.5] },
  units: { sizePouch: [0.5, 1.5], sizeLobe: [0.6, 1.5], fullnessL: [50, 80], fullnessR: [50, 80], hangL: [15, 85], hangR: [15, 85], gorge: [0, 100], sway: [0.4, 1.8] },
  asym: 10,   // fullness L and R at most this far apart (the natural few percent)
  via: { length: 'sizePouch', girth: 'sizePouch', depth: 'sizeLobe' },   // the size eased when a slider alone can't reach
};
const CLAMP_KEY = 'dev_overlay_clamp_v1';
export function clampOn() { try { return localStorage.getItem(CLAMP_KEY) !== '0'; } catch (_) { return true; } }
function setClampOn(on) { try { localStorage.setItem(CLAMP_KEY, on ? '1' : '0'); } catch (_) { /* storage blocked */ } }
// hold a set inside the bounds (a fresh object; the measures it ends at
// as .cm). A centimetre bound is met by searching its slider - each grows
// with its slider, the others held - after the plain bounds are applied.
export function realismClamp(vals) {
  const v = Object.assign({}, DEFAULTS, vals);
  for (const [k, [lo, hi]] of Object.entries(CLAMP.units)) if (v[k] != null) v[k] = Math.min(hi, Math.max(lo, v[k]));
  const d = v.fullnessL - v.fullnessR;
  if (Math.abs(d) > CLAMP.asym) { const mid = (v.fullnessL + v.fullnessR) / 2, h = Math.sign(d) * CLAMP.asym / 2; v.fullnessL = Math.round(mid + h); v.fullnessR = Math.round(mid - h); }
  for (const [k, [lo, hi]] of Object.entries(CLAMP.cm)) {
    const at = x => anatomyCm(Object.assign({}, v, { [k]: x }))[k], now = at(v[k]);
    if (now >= lo && now <= hi) continue;
    const want = now < lo ? lo : hi;
    let a = 0, b = 100;
    for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (at(m) < want) a = m; else b = m; }
    v[k] = Math.round(now < lo ? Math.ceil(b) : Math.floor(a));
    // (its own slider at its end and still past: the size behind it eased
    // in its bounds until the measure fits - depth grows with the lobes too)
    const sz = CLAMP.via[k], got = anatomyCm(v)[k];
    if (sz && (got < lo || got > hi)) {
      const [s0, s1] = CLAMP.units[sz], atS = x => anatomyCm(Object.assign({}, v, { [sz]: x }))[k];
      let x0 = s0, x1 = s1;
      for (let i = 0; i < 24; i++) { const m = (x0 + x1) / 2; if (atS(m) < (got < lo ? lo : hi)) x0 = m; else x1 = m; }
      v[sz] = Math.round((got < lo ? x1 : x0) * 100) / 100;
    }
  }
  return v;
}
// a standard normal (Box-Muller), and one truncated at +-t
export function gauss(rnd = Math.random) { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }
function gaussT(t, rnd) { for (let i = 0; i < 20; i++) { const z = gauss(rnd); if (Math.abs(z) <= t) return z; } return 0; }
// a full set of values about `base` (each in its slider's range): the
// standard scores are kept, so a correlated pair shares part of its draw
export function realismDraw(base = DEFAULTS, rnd = Math.random) {
  const z = {}, out = {};
  PARAMS.forEach(p => {
    const R = REALISM[p.key]; if (!R) return;
    let zi = gaussT(2.2, rnd);
    if (R.corr && z[R.corr[0]] != null) { const r = R.corr[1]; zi = Math.max(-2.2, Math.min(2.2, r * z[R.corr[0]] + Math.sqrt(1 - r * r) * zi)); }
    z[p.key] = zi;
    let v = (R.mean ?? base[p.key] ?? (p.min + p.max) / 2) + zi * R.sd;
    if (R.floor != null) v = Math.max(R.floor, Math.abs(v - R.floor) + R.floor);
    if (R.none && rnd() < R.none) v = 0;
    out[p.key] = Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step));
  });
  return out;
}

// saved slider states (this browser only; nothing loads on its own, so a
// bad set can never stick - a reload is always the baseline)
const PRESETS_KEY = 'dev_overlay_presets_v1';
function readPresets() { try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}') || {}; } catch (_) { return {}; } }
function writePresets(all) { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(all)); } catch (_) { /* storage blocked */ } }

// ── overlay DOM ──────────────────────────────────────────────────────
// One panel per target. A target is a set of men tuned together: the
// valley's men, the lab's whole line, or one model of a comparison - each
// with its own values (a target with `params` keeps its own; one without
// moves the shared base with setAnatomy, so men built later take them).
// opts.dock: 'right' | 'left' | 'below' | 'top' (where the panel sits);
// every panel folds away from its title, and every part's tab from its own.
const FOLD_KEY = 'dev_overlay_folds_v1';
function readFolds() { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (_) { return {}; } }
function writeFold(k, v) { try { const f = readFolds(); f[k] = v; localStorage.setItem(FOLD_KEY, JSON.stringify(f)); } catch (_) { /* storage blocked */ } }
const DOCK_CSS = {
  right: ['top:var(--dev-top,8px)', 'right:8px', 'width:270px', 'max-height:calc(100vh - var(--dev-top,8px) - var(--dev-bottom,8px))'],
  left: ['top:var(--dev-top,8px)', 'left:8px', 'width:270px', 'max-height:calc(100vh - var(--dev-top,8px) - var(--dev-bottom,8px))'],
  top: ['top:var(--dev-top,8px)', 'left:12px', 'right:12px', 'max-width:520px', 'margin:0 auto', 'max-height:45vh'],
  below: ['position:relative', 'max-height:40vh'],
};
function buildOverlayUI(figures, opts = {}) {
  const T = opts.target || { key: 'all', label: 'Anatomy', figures, params: null };
  const own = !!T.params;
  const root = document.createElement('div');
  root.className = 'dev-anatomy-panel';
  root.dataset.target = T.key;
  if (!document.getElementById('dev-anatomy-overlay')) root.id = 'dev-anatomy-overlay';
  const dock = opts.dock || (opts.compact ? 'top' : 'right');
  root.dataset.dock = dock;
  root.style.cssText = [
    'position:fixed', 'z-index:99999', 'overflow-y:auto', 'box-sizing:border-box',
    'background:rgba(0,0,0,0.82)', 'color:#e0e0e0',
    'font:11px/1.4 monospace', 'border-radius:8px',
    'padding:8px 10px', 'pointer-events:auto', 'user-select:none',
  ].concat(DOCK_CSS[dock] || DOCK_CSS.right).join(';');
  if (opts.top && dock !== 'below') root.style.setProperty('--dev-top', opts.top);
  if (opts.accent) root.style.borderLeft = `3px solid ${opts.accent}`;

  const folds = readFolds(), foldKey = k => `${T.key}:${k}`;
  // (the title folds the whole panel away, so the figures can be seen)
  const title = document.createElement('button');
  title.type = 'button';
  title.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:0;padding:2px 0;font:bold 13px monospace;color:#fff;cursor:pointer;';
  root.appendChild(title);
  const body = document.createElement('div');
  root.appendChild(body);
  const setPanel = open => { body.style.display = open ? '' : 'none'; title.textContent = `🔧 ${T.label} ${open ? '▾' : '▸'}`; };
  setPanel(folds[foldKey('panel')] !== false && !(opts.folded && folds[foldKey('panel')] == null));
  title.addEventListener('click', () => { const open = body.style.display === 'none'; setPanel(open); writeFold(foldKey('panel'), open); if (opts.onFold) opts.onFold(); });

  const live = Object.assign({}, getAnatomy(), own ? migrateAnatomy(T.params) : {});
  const fmt = (p, v) => (p.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2));
  // (the base set's measures, in cm - each man of the line varies a little about them)
  const cmLine = document.createElement('div');
  cmLine.style.cssText = 'margin-top:4px;color:#9fd29f;font:10px/1.4 monospace;';
  const showCm = vals => { const c = anatomyCm(vals); cmLine.textContent = `≈ length ${inCm(c.length)} · girth ${inCm(c.girth)} · depth ${inCm(c.depth)}${clampOn() ? ' · clamp on' : ''}`; };
  const apply = patch => {
    if (own) Object.assign(T.params, patch); else setAnatomy(patch);
    showCm(own ? T.params : getAnatomy());
    (T.figures || figures).forEach(fig => rebuildAnatomy(fig, patch));
    if (opts.onChange) opts.onChange(patch, T);
  };

  // each part its own tab, folded from its header
  PARTS.forEach(part => {
    const sec = document.createElement('div');
    sec.style.cssText = 'margin-top:6px;border-top:1px solid #333;padding-top:4px;';
    const head = document.createElement('button');
    head.type = 'button';
    head.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:0;padding:3px 0;font:bold 11px monospace;color:#d9b45a;cursor:pointer;letter-spacing:0.06em;text-transform:uppercase;';
    const box = document.createElement('div');
    box.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;column-gap:10px;';
    const setOpen = open => { box.style.display = open ? 'grid' : 'none'; head.textContent = `${open ? '▾' : '▸'} ${part.label}`; };
    setOpen(folds[foldKey(part.id)] !== false);
    head.addEventListener('click', () => { const open = box.style.display === 'none'; setOpen(open); writeFold(foldKey(part.id), open); if (opts.onFold) opts.onFold(); });
    sec.append(head, box);
    part.params.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:3px;' + (p.key.startsWith('size') ? 'grid-column:1/-1;' : '');
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      const span = document.createElement('span'); span.textContent = p.label;
      const val = document.createElement('span'); val.style.color = '#8cf';
      lbl.append(span, val);
      const slider = document.createElement('input');
      slider.type = 'range'; slider.dataset.key = p.key; slider._val = val;
      slider.min = p.min; slider.max = p.max; slider.step = p.step;
      slider.value = live[p.key]; val.textContent = fmt(p, live[p.key]);
      slider.setAttribute('aria-label', `${T.label}: ${p.label}`);
      slider.style.cssText = 'width:100%;margin:0;height:18px;accent-color:#4af;';
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value); val.textContent = fmt(p, v);
        // (the clamp on: the whole set held in bounds - a size moved can
        // carry the length with it - and every slider shown where it ended)
        if (clampOn()) setAll(current()); else apply({ [p.key]: v });
      });
      row.append(lbl, slider);
      box.appendChild(row);
    });
    body.appendChild(sec);
  });

  // ── whole-panel moves: baseline, the floor, the ceiling, saved states ──
  const sliders = () => [...body.querySelectorAll('input[type=range][data-key]')];
  // set every slider at once and rebuild the men a single time
  function setAll(vals) {
    vals = migrateAnatomy(vals) || {};
    // (the clamp on: anything set - a preset, All max, a draw - held in bounds)
    if (clampOn()) vals = realismClamp(vals);
    const patch = {};
    sliders().forEach(sl => {
      const p = PARAMS.find(q => q.key === sl.dataset.key);
      if (!p || vals[p.key] == null || !isFinite(vals[p.key])) return;
      const v = Math.min(p.max, Math.max(p.min, +vals[p.key]));
      sl.value = v; sl._val.textContent = fmt(p, v); patch[p.key] = v;
    });
    apply(patch);
  }
  const current = () => { const o = {}; sliders().forEach(sl => { o[sl.dataset.key] = parseFloat(sl.value); }); return o; };
  const extreme = side => { const o = {}; PARAMS.forEach(p => { o[p.key] = p[side]; }); return o; };

  const tools = document.createElement('div');
  tools.style.cssText = 'margin-top:6px;border-top:1px solid #333;padding-top:4px;';
  body.appendChild(tools);
  const btnCss = [
    'margin-top:6px', 'width:100%', 'padding:6px', 'border:1px solid #555',
    'background:#222', 'color:#ccc', 'border-radius:4px', 'cursor:pointer',
    'font:11px monospace',
  ].join(';');
  const mkBtn = (text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.style.cssText = btnCss; b.addEventListener('click', fn); return b; };

  // three across: back to the creation values, everything to its minimum, to its maximum
  const trio = document.createElement('div');
  trio.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;';
  trio.append(
    mkBtn('Baseline', () => setAll(Object.assign({}, DEFAULTS))),
    mkBtn('All min', () => setAll(extreme('min'))),
    mkBtn('All max', () => setAll(extreme('max'))),
  );
  tools.appendChild(trio);
  // (a realistic man at random: every slider off its bell curve - and the
  // host's own physical values with it, opts.onRandomize(gauss))
  tools.appendChild(mkBtn('🎲 Randomize · realism', () => { setAll(realismDraw()); if (opts.onRandomize) opts.onRandomize(gauss, T); }));
  // (the realism clamp, for every panel at once - kept in this browser)
  const clampBtn = mkBtn('', () => {
    setClampOn(!clampOn());
    document.querySelectorAll('[data-clamp-btn]').forEach(b => { b.textContent = `Realism clamp: ${clampOn() ? 'on' : 'off'}`; });
    if (clampOn()) setAll(current()); else showCm(current());
  });
  clampBtn.dataset.clampBtn = '1'; clampBtn.textContent = `Realism clamp: ${clampOn() ? 'on' : 'off'}`;
  clampBtn.title = 'On: every slider held to what a real man measures (length 3.1-6.3″ / 8-16 cm, girth 2.8-5.5″ / 7-14 cm round, depth 1.2-3.0″ / 3-7.5 cm, fullness 50-80 and within 10 of each other). Off: the whole range.';
  tools.appendChild(clampBtn);
  body.insertBefore(cmLine, body.firstChild); showCm(current());

  // saved states: named sets of slider values, kept in this browser only
  const saves = document.createElement('div');
  saves.style.cssText = 'display:grid;grid-template-columns:1fr auto auto auto;gap:6px;align-items:center;margin-top:6px;';
  const pick = document.createElement('select');
  pick.setAttribute('aria-label', `${T.label}: saved states`);
  pick.style.cssText = 'min-width:0;padding:5px;background:#111;color:#ddd;border:1px solid #555;border-radius:4px;font:11px monospace;';
  const small = b => { b.style.marginTop = '0'; b.style.width = 'auto'; b.style.padding = '5px 8px'; return b; };
  function refresh(sel) {
    const all = readPresets(), names = Object.keys(all).sort();
    pick.innerHTML = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = names.length ? 'Saved states…' : 'No saved states';
    pick.appendChild(none);
    names.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; pick.appendChild(o); });
    pick.value = sel && all[sel] ? sel : '';
  }
  const save = small(mkBtn('Save', () => {
    const name = (prompt('Name this state:', pick.value || '') || '').trim();
    if (!name) return;
    const all = readPresets(); all[name] = current(); writePresets(all); refresh(name);
  }));
  const load = small(mkBtn('Load', () => { const all = readPresets(); if (all[pick.value]) setAll(all[pick.value]); }));
  const del = small(mkBtn('Delete', () => {
    if (!pick.value || !confirm(`Delete "${pick.value}"?`)) return;
    const all = readPresets(); delete all[pick.value]; writePresets(all); refresh();
  }));
  pick.addEventListener('change', () => { const all = readPresets(); if (all[pick.value]) setAll(all[pick.value]); });
  saves.append(pick, save, load, del);
  tools.appendChild(saves);
  refresh();

  // copy-params button
  const copy = mkBtn('Copy params', () => {
    navigator.clipboard.writeText(JSON.stringify(current(), null, 2))
      .then(() => { copy.textContent = 'Copied ✓'; setTimeout(() => copy.textContent = 'Copy params', 1200); });
  });
  tools.appendChild(copy);
  // (the host's own extras for this panel - the lab's face pick, say)
  if (opts.extra) body.appendChild(opts.extra(T));
  root.setAll = setAll; root.current = current;
  return root;
}

// ── the ink panel: the burin's pitch and thresholds, tuned live ──────
// One plate at a time (every copy of it in the scene, found by the name
// its kit gave it), sliders on the uniforms the wrapped skin is cut by,
// and a copy button for the numbers to carry back into the kit.
const INK = [
  { key: 'pitch', u: 'uPitchPx', label: 'Pitch px', min: 2, max: 9, step: 0.1 },
  { key: 'form', u: 'uForm', label: 'Form', min: 0, max: 1, step: 0.02 },
  { key: 'bare', u: 'uBare', label: 'Bare', min: 0, max: 0.7, step: 0.01 },
  { key: 'tone', u: 'uTone', label: 'Tone', min: -0.8, max: 0.8, step: 0.01 },
  { key: 'lean', u: 'uLean', label: 'Lean', min: 0, max: 1, step: 0.02 },
  { key: 'stipple', u: 'uStip', label: 'Stipple', min: 0, max: 1, step: 1 },
  { key: 'cross0', u: 'uCross', i: 'x', label: 'Cross in', min: 0, max: 1, step: 0.01 },
  { key: 'cross1', u: 'uCross', i: 'y', label: 'Cross full', min: 0, max: 1, step: 0.01 },
  { key: 'core0', u: 'uCore', i: 'x', label: 'Core in', min: 0, max: 1, step: 0.01 },
  { key: 'core1', u: 'uCore', i: 'y', label: 'Core full', min: 0, max: 1, step: 0.01 },
];
const INK_KEY = 'dev_overlay_ink_v1';
function readInk() { try { return JSON.parse(localStorage.getItem(INK_KEY) || '{}') || {}; } catch (_) { return {}; } }
function writeInk(all) { try { localStorage.setItem(INK_KEY, JSON.stringify(all)); } catch (_) { /* storage blocked */ } }
// `?ink=face.bare=0.4,face.tone=-0.2;flesh.pitch=4` <-> { face: { bare, tone }, flesh: { pitch } }
function inkFromQuery() {
  const o = {};
  let q = ''; try { q = new URLSearchParams(location.search).get('ink') || ''; } catch (_) { /* no window */ }
  q.split(/[;,]/).forEach(kv => { const m = /^\s*([A-Za-z]\w*)\.(\w+)=(-?\d*\.?\d+)\s*$/.exec(kv); if (m && INK.some(p => p.key === m[2])) (o[m[1]] = o[m[1]] || {})[m[2]] = +m[3]; });
  return o;
}
function inkToQuery(all) {
  return Object.keys(all).map(n => Object.keys(all[n]).map(k => `${n}.${k}=${all[n][k]}`).join(',')).filter(Boolean).join(';');
}
// the plates worth the panel, in the order they are met
const INK_PLATES = ['face', 'flesh', 'fleshUV', 'linen', 'breech', 'skull', 'bone', 'hair'];
function buildInkPanel(ink, opts = {}) {
  const root = document.createElement('div');
  root.className = 'dev-anatomy-panel'; root.dataset.target = 'ink';
  const dock = ink.dock || 'left';
  root.dataset.dock = dock;
  root.style.cssText = [
    'position:fixed', 'z-index:99999', 'overflow-y:auto', 'box-sizing:border-box',
    'background:rgba(0,0,0,0.82)', 'color:#e0e0e0', 'font:11px/1.4 monospace', 'border-radius:8px',
    'padding:8px 10px', 'pointer-events:auto', 'user-select:none', 'border-left:3px solid #d9b45a',
  ].concat(DOCK_CSS[dock] || DOCK_CSS.left).join(';');
  const top = ink.top || opts.top;
  if (top && dock !== 'below') root.style.setProperty('--dev-top', top);
  const folds = readFolds();
  const title = document.createElement('button');
  title.type = 'button';
  title.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:0;padding:2px 0;font:bold 13px monospace;color:#fff;cursor:pointer;';
  const body = document.createElement('div');
  root.append(title, body);
  const setPanel = open => { body.style.display = open ? '' : 'none'; title.textContent = `✒ Ink ${open ? '▾' : '▸'}`; };
  // (folded to start on a phone, where it would sit over the anatomy panel)
  setPanel(folds['ink:panel'] !== false && !(window.innerWidth < 640 && folds['ink:panel'] == null));
  title.addEventListener('click', () => { const open = body.style.display === 'none'; setPanel(open); writeFold('ink:panel', open); if (opts.onFold) opts.onFold(); });

  // every burin plate in the scene by name (walked when a plate is picked)
  const byPlate = () => {
    const m = new Map();
    const take = mat => { const n = mat && mat.userData && mat.userData.plate; if (n && mat.uniforms && mat.uniforms.uForm) { if (!m.has(n)) m.set(n, new Set()); m.get(n).add(mat); } };
    const root_ = typeof ink.root === 'function' ? ink.root() : ink.root;
    if (root_) root_.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(take); });
    return m;
  };
  const pick = document.createElement('select');
  pick.style.cssText = 'width:100%;margin:4px 0;background:#222;color:#ccc;border:1px solid #555;border-radius:4px;font:11px monospace;';
  const box = document.createElement('div');
  box.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;column-gap:10px;';
  body.append(pick, box);
  let mats = [], plate = '';
  const readOf = (m, p) => { const v = m.uniforms[p.u].value; return p.i ? v[p.i] : v; };
  const writeTo = (m, p, v) => { if (p.i) m.uniforms[p.u].value[p.i] = v; else m.uniforms[p.u].value = v; };
  const read = p => (mats[0] ? readOf(mats[0], p) : 0);
  const write = (p, v) => mats.forEach(m => writeTo(m, p, v));
  const fmt = (p, v) => (p.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2));
  // what was tuned is kept (per plate, only the keys moved) and put back on
  // every plate it names at open and at each rescan - a reload, or a hop
  // from the phone to the tablet, keeps the numbers; `?ink=face.bare=0.4,
  // face.tone=-0.2;flesh.pitch=4` seeds them from the link and is kept too
  const saved = readInk(), fromLink = inkFromQuery();
  Object.keys(fromLink).forEach(n => { saved[n] = Object.assign(saved[n] || {}, fromLink[n]); });
  if (Object.keys(fromLink).length) writeInk(saved);
  const defaults = {};   // each plate's numbers as the kit cut them, from the first copy seen
  const applySaved = all => {
    all.forEach((set, n) => {
      const ms = [...set];
      if (!defaults[n]) defaults[n] = Object.fromEntries(INK.map(p => [p.key, readOf(ms[0], p)]));
      const sv = saved[n]; if (!sv) return;
      INK.forEach(p => { if (sv[p.key] != null && isFinite(sv[p.key])) ms.forEach(m => writeTo(m, p, +sv[p.key])); });
    });
  };
  const rows = INK.map(p => {
    const row = document.createElement('div'); row.style.cssText = 'margin-bottom:3px;';
    const lbl = document.createElement('label'); lbl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const span = document.createElement('span'); span.textContent = p.label;
    const val = document.createElement('span'); val.style.color = '#8cf';
    lbl.append(span, val);
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = p.min; slider.max = p.max; slider.step = p.step;
    slider.setAttribute('aria-label', `Ink: ${p.label}`);
    slider.style.cssText = 'width:100%;margin:0;height:18px;accent-color:#d9b45a;';
    slider.addEventListener('input', () => { const v = parseFloat(slider.value); val.textContent = fmt(p, v); write(p, v); (saved[plate] = saved[plate] || {})[p.key] = +fmt(p, v); writeInk(saved); if (opts.onChange) opts.onChange({ plate, [p.key]: v }); });
    row.append(lbl, slider); box.appendChild(row);
    return { p, slider, val };
  });
  const sync = () => rows.forEach(r => { const v = read(r.p); r.slider.value = v; r.val.textContent = fmt(r.p, v); });
  const choose = name => {
    const all = byPlate();
    applySaved(all);
    plate = all.has(name) ? name : (all.keys().next().value || '');
    mats = [...(all.get(plate) || [])];
    pick.replaceChildren(...[...all.keys()].sort((a, b) => (INK_PLATES.indexOf(a) + 1 || 99) - (INK_PLATES.indexOf(b) + 1 || 99)).map(n => { const o = document.createElement('option'); o.value = n; o.textContent = `${n} (${all.get(n).size})`; o.selected = n === plate; return o; }));
    sync();
  };
  pick.addEventListener('change', () => choose(pick.value));
  // (the scene may have filled since - the lab builds its men after the panel opens)
  pick.addEventListener('focus', () => { if (byPlate().size !== pick.options.length) choose(plate); });
  const current = () => { const o = {}; INK.forEach(p => { o[p.key] = +fmt(p, read(p)); }); return Object.assign({}, saved, { [plate]: o }); };
  const btnCss = 'margin-top:6px;width:100%;padding:6px;border:1px solid #555;background:#222;color:#ccc;border-radius:4px;cursor:pointer;font:11px monospace;';
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy ink'; copy.style.cssText = btnCss;
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(current(), null, 2))
      .then(() => { copy.textContent = 'Copied ✓'; setTimeout(() => copy.textContent = 'Copy ink', 1200); });
  });
  // the link: this page with every tuned number in its ?ink=
  const link = document.createElement('button'); link.type = 'button'; link.textContent = 'Copy link'; link.style.cssText = btnCss;
  link.addEventListener('click', () => {
    const u = new URL(location.href), q = inkToQuery(saved);
    if (q) u.searchParams.set('ink', q); else u.searchParams.delete('ink');
    navigator.clipboard.writeText(u.toString())
      .then(() => { link.textContent = 'Copied ✓'; setTimeout(() => link.textContent = 'Copy link', 1200); });
  });
  // the plate back to the kit's numbers, and forgotten
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset plate'; reset.style.cssText = btnCss;
  reset.addEventListener('click', () => {
    delete saved[plate]; writeInk(saved);
    const d = defaults[plate]; if (d) INK.forEach(p => write(p, d[p.key]));
    sync(); if (opts.onChange) opts.onChange({ plate, reset: true });
  });
  const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Rescan plates'; again.style.cssText = btnCss;
  again.addEventListener('click', () => choose(plate));
  body.append(copy, link, reset, again);
  choose(ink.plate || 'face');
  root.choose = choose; root.current = current; root.rescan = () => choose(plate || ink.plate || 'face');
  return root;
}

// ── auth gate UI ─────────────────────────────────────────────────────
function buildAuthGate(onAuthed) {
  const root = document.createElement('div');
  root.id = 'dev-auth-gate';
  root.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
    'z-index:99999', 'background:rgba(0,0,0,0.92)', 'color:#e0e0e0',
    'font:13px/1.5 monospace', 'border-radius:12px', 'padding:24px',
    'text-align:center', 'min-width:280px',
  ].join(';');

  const heading = document.createElement('div');
  heading.textContent = '🔒 Dev Overlay';
  heading.style.cssText = 'font-size:16px;font-weight:bold;margin-bottom:12px;color:#fff;';
  root.appendChild(heading);

  const status = document.createElement('div');
  status.style.cssText = 'margin-bottom:16px;color:#aaa;';
  status.textContent = 'Biometric authentication required';
  root.appendChild(status);

  const btnStyle = [
    'padding:10px 24px', 'border:1px solid #555', 'background:#1a1a2e',
    'color:#8cf', 'border-radius:6px', 'cursor:pointer', 'font:13px monospace',
    'margin:4px',
  ].join(';');

  // not signed in on this address (a preview): sign in first, by email link
  if (!signedIn()) {
    status.textContent = 'Sign in first: this address has no sign-in yet';
    const form = document.createElement('form');
    form.style.cssText = 'margin:0 0 12px;';
    const email = document.createElement('input');
    email.type = 'email'; email.required = true; email.placeholder = 'Owner email'; email.autocomplete = 'email';
    email.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 10px;margin-bottom:6px;border:1px solid #555;border-radius:6px;background:#111;color:#eee;font:13px monospace;';
    const send = document.createElement('button');
    send.type = 'submit'; send.textContent = '✉️ Email me a sign-in link';
    send.style.cssText = btnStyle + ';display:block;width:100%;margin:0;color:#fc8;';
    form.append(email, send);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      send.disabled = true; status.style.color = '#aaa'; status.textContent = 'Sending…';
      try { await emailSignIn(email.value.trim()); status.textContent = 'Check your email, open the link on this device'; status.style.color = '#6a6'; }
      catch (e) { status.textContent = String(e.message || e).slice(0, 120); status.style.color = '#f66'; send.disabled = false; }
    });
    root.appendChild(form);
  }

  const authBtn = document.createElement('button');
  authBtn.textContent = '🔐 Authenticate';
  authBtn.style.cssText = btnStyle;
  authBtn.addEventListener('click', async () => {
    status.textContent = 'Prompting biometric…';
    try {
      const result = await webauthnAuthenticate();
      if (result.verified) {
        root.remove();
        onAuthed();
      } else {
        status.textContent = 'Authentication failed';
        status.style.color = '#f66';
      }
    } catch (e) {
      status.textContent = String(e.message || e).slice(0, 120);
      status.style.color = '#f66';
    }
  });
  root.appendChild(authBtn);

  const regBtn = document.createElement('button');
  regBtn.textContent = '📝 Register key';
  regBtn.style.cssText = btnStyle + ';background:#0d1117;color:#6a6;';
  regBtn.addEventListener('click', async () => {
    status.textContent = 'Registering credential…';
    try {
      const result = await webauthnRegister();
      if (result.verified) {
        status.textContent = 'Key registered ✓ — now authenticate';
        status.style.color = '#6a6';
      } else {
        status.textContent = 'Registration failed';
        status.style.color = '#f66';
      }
    } catch (e) {
      status.textContent = String(e.message || e).slice(0, 120);
      status.style.color = '#f66';
    }
  });
  root.appendChild(regBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText = btnStyle + ';display:block;margin:12px auto 0;color:#888;border-color:#333;';
  closeBtn.addEventListener('click', () => root.remove());
  root.appendChild(closeBtn);

  return root;
}

// ── public entry point ───────────────────────────────────────────────
// `figures` is the array of THREE.Object3D figure roots from the valley.
// Each must have userData.pouch set by buildFigure().
// opts.top: where the panel sits (the lab moves it under its own bar);
// opts.onChange(patch): told of every slider move; opts.onAuthed(): told
// once the gate is passed (or was already). `figures` may be refilled in
// place - the sliders act on whatever it holds at the time.
// opts.ink: { root, plate, dock, mount, top } adds the ink panel (the burin's
// pitch and thresholds on one plate at a time, every copy of it found
// under `root`); api.ink is its element, with choose(plate) and current().
// opts.targets: several panels at once (the lab's comparison) - each
// { key, label, figures, params, dock, accent, mount }; `mount` is an element
// to put the panel in (docked under the views) instead of the page.
// Returns { panels } through opts.onAuthed(panels).
export function initDevOverlay(figures, opts = {}) {
  const open = () => {
    const panels = [];
    const make = (T, o) => {
      const el = buildOverlayUI(figures, Object.assign({}, opts, o, { target: T }));
      (o.mount || document.body).appendChild(el); panels.push(el); return el;
    };
    if (opts.targets) opts.targets.forEach(T => make(T, { dock: T.dock, accent: T.accent, mount: T.mount, folded: T.folded }));
    else make(null, {});
    // (the ink panel beside them, when the host hands it the scene)
    let inkEl = null;
    if (opts.ink) { inkEl = buildInkPanel(opts.ink, opts); (opts.ink.mount || document.body).appendChild(inkEl); }
    // (the host can lay new panels out later - the lab switching to a comparison)
    const api = { panels, ink: inkEl, make: (T, o = {}) => make(T, o), clear() { panels.splice(0).forEach(el => el.remove()); } };
    if (opts.onAuthed) opts.onAuthed(api);
  };
  // already have a valid session?
  if (hasSession()) { open(); return; }

  // show the auth gate
  document.body.appendChild(buildAuthGate(open));
}
