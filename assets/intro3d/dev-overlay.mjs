// Dev-overlay for live anatomy parameter tuning.
// Gated behind WebAuthn biometric 2FA — the owner registers a credential
// from their biometric-locked phone, then authenticates each session.
//
// Usage: import and call `initDevOverlay(scene)` from the valley module
// when `?lab` is in the URL.  The overlay floats over the WebGL canvas.

import { getAnatomy, rebuildAnatomy } from './figure.mjs';

// ── Supabase constants (same as index.html) ──────────────────────────
const SB_URL = 'https://ewfvyrhlsanzkmozrmhs.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3ZnZ5cmhsc2Fuemttb3pybWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjkxODksImV4cCI6MjEwNDc0NTE4OX0.kxDXQnueexwstqLeZNJdlITffqTHulaV6z-Rdb0ZJQE';

const SESSION_KEY = 'dev_overlay_session_v1';

// ── helpers ──────────────────────────────────────────────────────────
function sbHeaders() {
  const h = { 'Content-Type': 'application/json', apikey: SB_ANON };
  try {
    const ref = new URL(SB_URL).hostname.split('.')[0];
    const tok = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) || '{}');
    if (tok.access_token) h.authorization = `Bearer ${tok.access_token}`;
  } catch (_) { /* no session */ }
  return h;
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
const PARAMS = [
  { key: 'size',      label: 'Size',        min: 0.5,  max: 4,   step: 0.05 },
  { key: 'length',    label: 'Length',       min: 0.5,  max: 4,   step: 0.05 },
  { key: 'girth',     label: 'Girth',       min: 0.5,  max: 4,   step: 0.05 },
  { key: 'depth',     label: 'Depth',       min: 0.3,  max: 3,   step: 0.05 },
  { key: 'fullnessL', label: 'Fullness L',  min: 0,    max: 100, step: 1 },
  { key: 'fullnessR', label: 'Fullness R',  min: 0,    max: 100, step: 1 },
  { key: 'hangL',     label: 'Hang L',      min: 0,    max: 100, step: 1 },
  { key: 'hangR',     label: 'Hang R',      min: 0,    max: 100, step: 1 },
  { key: 'gorge',     label: 'Gorge',       min: 0,    max: 100, step: 1 },
  { key: 'sway',      label: 'Sway',        min: 0,    max: 3,   step: 0.1 },
];

// ── overlay DOM ──────────────────────────────────────────────────────
function buildOverlayUI(figures) {
  const root = document.createElement('div');
  root.id = 'dev-anatomy-overlay';
  root.style.cssText = [
    'position:fixed', 'top:8px', 'right:8px', 'z-index:99999',
    'width:260px', 'max-height:90vh', 'overflow-y:auto',
    'background:rgba(0,0,0,0.88)', 'color:#e0e0e0',
    'font:11px/1.4 monospace', 'border-radius:8px',
    'padding:10px', 'pointer-events:auto', 'user-select:none',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '🔧 Anatomy Dev';
  title.style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:8px;color:#fff;';
  root.appendChild(title);

  const current = getAnatomy();

  PARAMS.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:6px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;';
    const span = document.createElement('span');
    span.textContent = p.label;
    const val = document.createElement('span');
    val.textContent = String(current[p.key]);
    val.style.color = '#8cf';
    lbl.appendChild(span);
    lbl.appendChild(val);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = p.min;
    slider.max = p.max;
    slider.step = p.step;
    slider.value = current[p.key];
    slider.style.cssText = 'width:100%;accent-color:#4af;';

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      val.textContent = p.step >= 1 ? String(v) : v.toFixed(2);
      const patch = {};
      patch[p.key] = v;
      // rebuild every figure in the scene
      figures.forEach(fig => rebuildAnatomy(fig, patch));
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    root.appendChild(row);
  });

  // reset button
  const reset = document.createElement('button');
  reset.textContent = 'Reset defaults';
  reset.style.cssText = [
    'margin-top:8px', 'width:100%', 'padding:6px', 'border:1px solid #555',
    'background:#222', 'color:#ccc', 'border-radius:4px', 'cursor:pointer',
    'font:11px monospace',
  ].join(';');
  reset.addEventListener('click', () => {
    const defaults = getAnatomy();
    root.querySelectorAll('input[type=range]').forEach((sl, i) => {
      const p = PARAMS[i];
      sl.value = defaults[p.key];
      sl.previousElementSibling
        ? sl.parentElement.querySelector('span:last-child').textContent =
            p.step >= 1 ? String(defaults[p.key]) : defaults[p.key].toFixed(2)
        : null;
    });
    figures.forEach(fig => rebuildAnatomy(fig, defaults));
  });
  root.appendChild(reset);

  // copy-params button
  const copy = document.createElement('button');
  copy.textContent = 'Copy params';
  copy.style.cssText = reset.style.cssText;
  copy.addEventListener('click', () => {
    const vals = {};
    PARAMS.forEach((p, i) => {
      vals[p.key] = parseFloat(root.querySelectorAll('input[type=range]')[i].value);
    });
    navigator.clipboard.writeText(JSON.stringify(vals, null, 2))
      .then(() => { copy.textContent = 'Copied ✓'; setTimeout(() => copy.textContent = 'Copy params', 1200); });
  });
  root.appendChild(copy);

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
export function initDevOverlay(figures) {
  // already have a valid session?
  if (hasSession()) {
    document.body.appendChild(buildOverlayUI(figures));
    return;
  }

  // show the auth gate
  document.body.appendChild(buildAuthGate(() => {
    document.body.appendChild(buildOverlayUI(figures));
  }));
}
