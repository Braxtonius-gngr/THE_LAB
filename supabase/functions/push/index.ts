// THE_LAB · push: the phone buzzes when one of them texts first (world/text.html, world/sw.js).
//
// GET  ?pub=1                      → { publicKey }  the VAPID public key the page subscribes with
// GET  ?inbox=1&player_id=…        → { texts: [{ id, who, name, text, created_at }] }  unseen texts, NOT marked seen
//                                     (the service worker shows these; the thread marks them seen when opened)
// POST { action: 'subscribe', player_id, subscription: { endpoint, keys: { p256dh, auth } }, ua? }
// POST { action: 'unsubscribe', endpoint }
// POST { action: 'test', player_id }  → one buzz to every phone the player has subscribed
// The sending itself (life → outbox → push) lives in webpush.ts, shared with the life function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { vapidKeys, pushPlayer } from "./webpush.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:the-lab@localhost";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") {
      const u = new URL(req.url);
      if (u.searchParams.get("pub")) return json({ publicKey: (await vapidKeys(db)).publicKey });
      if (u.searchParams.get("inbox")) {
        const pid = u.searchParams.get("player_id"); if (!pid) return json({ error: "player_id required" }, 400);
        const { data } = await db.from("outbox").select("id,text,created_at,from_id").eq("to_id", pid).is("seen_at", null).order("created_at", { ascending: false }).limit(10);
        const ids = [...new Set((data || []).map((r) => r.from_id))];
        const { data: cs } = ids.length ? await db.from("characters").select("id,name").in("id", ids) : { data: [] };
        const name = (id: string) => cs?.find((c) => c.id === id)?.name || "Someone";
        return json({ texts: (data || []).map((r) => ({ id: r.id, name: name(r.from_id), who: name(r.from_id).toLowerCase(), text: r.text, created_at: r.created_at })) });
      }
      return json({ error: "pub=1 or inbox=1" }, 400);
    }
    const body = await req.json();
    if (body.action === "subscribe") {
      const s = body.subscription; if (!body.player_id || !s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return json({ error: "player_id and a push subscription required" }, 400);
      await db.from("push_subscriptions").upsert({ endpoint: s.endpoint, player_id: body.player_id, p256dh: s.keys.p256dh, auth: s.keys.auth, ua: String(body.ua || "").slice(0, 200) });
      return json({ ok: true });
    }
    if (body.action === "unsubscribe") { if (body.endpoint) await db.from("push_subscriptions").delete().eq("endpoint", body.endpoint); return json({ ok: true }); }
    if (body.action === "test") { if (!body.player_id) return json({ error: "player_id required" }, 400); return json(await pushPlayer(db, body.player_id, { subject: SUBJECT })); }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
