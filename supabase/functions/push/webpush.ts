// Web Push without a library: VAPID (RFC 8292) signed with WebCrypto, empty-payload pushes
// (RFC 8030) - the service worker fetches what's new itself, so nothing needs encrypting.
// The key pair is made on first use and kept in private.vapid (migration 0011).
// (This file is copied into every function that sends: supabase/functions/{push,life}.)
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export type Vapid = { jwk: JsonWebKey; publicKey: string };

// the signing key: from the database, or made now and kept there
export async function vapidKeys(db: SupabaseClient): Promise<Vapid> {
  const { data } = await db.rpc("vapid_get");
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.jwk && row?.public_key) return { jwk: row.jwk as JsonWebKey, publicKey: row.public_key as string };
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const raw = new Uint8Array(65); raw[0] = 4; raw.set(b64uToBytes(pub.x!), 1); raw.set(b64uToBytes(pub.y!), 33);
  const publicKey = b64u(raw);
  await db.rpc("vapid_set", { p_jwk: jwk, p_public_key: publicKey });
  const { data: again } = await db.rpc("vapid_get");   // (someone else may have won the race)
  const r2 = Array.isArray(again) ? again[0] : again;
  return r2?.jwk ? { jwk: r2.jwk as JsonWebKey, publicKey: r2.public_key as string } : { jwk, publicKey };
}

// a VAPID JWT for one push service origin, good for 12 hours
async function vapidJwt(v: Vapid, aud: string, subject: string) {
  const key = await crypto.subtle.importKey("jwk", v.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));   // raw r||s, as JWS wants
  return `${head}.${body}.${b64u(sig)}`;
}

export type Sub = { endpoint: string; p256dh?: string; auth?: string };
// one empty push to one subscription; 'gone' when the service says the subscription is dead
export async function sendPush(sub: Sub, v: Vapid, { subject = "mailto:lab@example.com", ttl = 86400, urgency = "normal" } = {}): Promise<"ok" | "gone" | string> {
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(v, aud, subject);
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: `vapid t=${jwt}, k=${v.publicKey}`, TTL: String(ttl), Urgency: urgency, "Content-Length": "0" } });
  if (r.status === 201 || r.status === 200) return "ok";
  if (r.status === 404 || r.status === 410) return "gone";
  return `${r.status} ${(await r.text()).slice(0, 120)}`;
}

// buzz every phone a player has subscribed; dead subscriptions are dropped
export async function pushPlayer(db: SupabaseClient, playerId: string, opts: { subject?: string } = {}) {
  const { data: subs } = await db.from("push_subscriptions").select("endpoint,p256dh,auth").eq("player_id", playerId);
  if (!subs?.length) return { sent: 0, gone: 0, failed: [] as string[] };
  const v = await vapidKeys(db);
  const out = { sent: 0, gone: 0, failed: [] as string[] };
  for (const s of subs) {
    const res = await sendPush(s, v, opts).catch((e) => String(e?.message || e));
    if (res === "ok") { out.sent++; await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("endpoint", s.endpoint); }
    else if (res === "gone") { out.gone++; await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint); }
    else out.failed.push(res);
  }
  return out;
}
