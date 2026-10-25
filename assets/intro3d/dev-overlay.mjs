// Dev-overlay for live anatomy parameter tuning.
// Gated behind WebAuthn biometric 2FA — the owner registers a credential
// from their biometric-locked phone, then authenticates each session.
//
// Usage: import and call `initDevOverlay(scene)` from the valley module
// when `?lab` is in the URL.  The overlay floats over the WebGL canvas.

import { getAnatomy, setAnatomy, rebuildAnatomy, migrateAnatomy } from './figure.mjs';

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
function sbHeaders() {
  const h = { 'Content-Type': 'application/json', apikey: SB_ANON };
  try {
    const ref = new URL(SB_URL).hostname.split('.')[0];
    const tok = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || '{}');
    if (tok.access_token) h.authorization = `Bearer ${tok.access_token}`;
  } catch (_) { /* no session */ }
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
function signedIn() { return !!sbHeaders().authorization; }

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
  ] },
  { id: 'lobes', label: 'Lobes', params: [
    { key: 'sizeLobe',  label: 'Size lobe',  min: 0.5, max: 3,   step: 0.05 },
    { key: 'fullnessL', label: 'Fullness L', min: 0,   max: 100, step: 1 },
    { key: 'fullnessR', label: 'Fullness R', min: 0,   max: 100, step: 1 },
    { key: 'hangL',     label: 'Hang L',     min: 0,   max: 100, step: 1 },
    { key: 'hangR',     label: 'Hang R',     min: 0,   max: 100, step: 1 },
  ] },
];
const PARAMS = PARTS.flatMap(p => p.params);

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
  const apply = patch => {
    if (own) Object.assign(T.params, patch); else setAnatomy(patch);
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
      slider.addEventListener('input', () => { const v = parseFloat(slider.value); val.textContent = fmt(p, v); apply({ [p.key]: v }); });
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
    // (the host can lay new panels out later - the lab switching to a comparison)
    const api = { panels, make: (T, o = {}) => make(T, o), clear() { panels.splice(0).forEach(el => el.remove()); } };
    if (opts.onAuthed) opts.onAuthed(api);
  };
  // already have a valid session?
  if (hasSession()) { open(); return; }

  // show the auth gate
  document.body.appendChild(buildAuthGate(open));
}
