// THE_LAB · life: what the characters do while no one is watching.
//
// Called on a schedule (pg_cron, every 4 hours; see db/migrations/0006_life.sql). One model
// call lives the hours since the last tick for everyone at once: each man's own stretch of
// day (sleep, the shift, food, errands, moods), and - when it fits their lives - time
// between them: texts, a smoke break on the line, coming over after close. What happened is
// written as their memories (recalled later like any other), their needs and moods move,
// and their takes on each other shift. The tick is logged in life_ticks.
//
// Auth: the scheduler sends x-life-key, checked against private.life_key (never leaves the DB).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const embedder = new Supabase.ai.Session("gte-small");
const MODEL = Deno.env.get("MIND_MODEL") || "claude-sonnet-5-5";
const PLAYER = "00000000-0000-4000-8000-000000000001";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const embed = async (t: string) => JSON.stringify(await embedder.run(t, { mean_pool: true, normalize: true }));
const local = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "long", hour: "numeric", minute: "2-digit" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // GET: the latest off-screen stretches, for the apartment's "While you were away" panel
    if (req.method === "GET") {
      const { data } = await db.from("life_ticks").select("at,hours,story").order("at", { ascending: false }).limit(6);
      return json({ ticks: data || [] });
    }
    const key = req.headers.get("x-life-key");
    const { data: ok } = await db.rpc("life_key_ok", { k: key || "" });
    if (!ok) return json({ error: "no" }, 401);
    const body = await req.json().catch(() => ({}));

    const { data: chars } = await db.from("characters").select("id,name,persona,home_location").not("persona", "is", null);
    if (!chars || chars.length === 0) return json({ error: "no characters" }, 404);
    const ids = chars.map((c) => c.id);
    const [{ data: states }, { data: rels }, { data: last }] = await Promise.all([
      db.from("character_state").select("*").in("character_id", ids),
      db.from("relationships").select("*").in("owner_id", ids),
      db.from("life_ticks").select("at").order("at", { ascending: false }).limit(1),
    ]);
    const now = new Date(), from = new Date(last?.[0]?.at || now.getTime() - 4 * 3.6e6);
    const hours = clamp((now.getTime() - from.getTime()) / 3.6e6, 0.5, 12);
    const since = new Date(now.getTime() - hours * 3.6e6);

    // each one's recent past (their latest memories) and where they stand with everyone
    const lines: string[] = [];
    for (const c of chars) {
      const { data: mem } = await db.from("memories").select("content,created_at").eq("owner_id", c.id).order("created_at", { ascending: false }).limit(12);
      const st = states?.find((s) => s.character_id === c.id);
      const mine = (rels || []).filter((r) => r.owner_id === c.id).map((r) => `${r.target_id === PLAYER ? "the visitor (Brax)" : chars.find((x) => x.id === r.target_id)?.name || "someone"}: ${r.summary || "no take yet"} (affection ${(+r.affection).toFixed(2)}, trust ${(+r.trust).toFixed(2)})`);
      lines.push(`### ${c.name}
${c.persona}
Mood now: ${JSON.stringify(st?.mood || {})}. Needs now (0-1; energy high = rested, the others high = pressing): ${JSON.stringify(st?.needs || {})}. Last doing: ${st?.current_task || "unknown"}.
How ${c.name} sees people: ${mine.join("; ") || "-"}
${c.name}'s latest memories, newest first:
${(mem || []).map((m) => `- ${local(new Date(m.created_at))}: ${m.content}`).join("\n") || "- none"}`);
    }

    const system = `You are the off-screen life of a small, realistic world: a few people in San Antonio, Texas, whose lives go on when no one is visiting them. Live the stretch of time given, for each of them, truthfully to who they are, their jobs and hours, their moods and needs, and what has been happening to them. Ordinary days are mostly ordinary; now and then something small happens (a rough shift, a good meal, a bill, a call from family, a song stuck in his head). Don't invent big drama or new people with names unless it follows from their memories. Keep it grounded and specific.

When their lives cross in this stretch (they work at the same bar; they're friends), write what passes between them: texts, a few words on a break, one coming over after close. Not every stretch - only if it fits the hours and how they feel about each other. If they talk, their history, banter and any tension carry on from their memories. They may mention the visitor (Brax) if he's on their mind, but he isn't there.

Respond ONLY with JSON:
{"people": {"<name>": {"happened": [{"content": "first person, past tense, one thing that happened or that he did/felt, with when", "importance": 1-10}], "now": "what he's doing at the end of this stretch (asleep, at work, home on the sofa...)", "mood": {"valence": -1..1, "energy": 0..1}, "needs": {"energy": 0..1, "hunger": 0..1, "social": 0..1, "intimacy": 0..1}}},
 "together": null | {"how": "texts" | "in person", "where": "...", "when": "...", "exchange": [{"who": "<name>", "text": "..."}], "takes": {"<name>": {"affection": -0.15..0.15, "trust": -0.15..0.15, "summary": "his one-line take on the other now"}}}}
2-4 "happened" items per person. An exchange of 2-10 lines. Needs: where they end up after these hours, given sleep, food and company.`;
    const user = `Time now: ${local(now)}. Live the ${hours.toFixed(1)} hours since ${local(since)}.${body.note ? `\nAlso: ${body.note}` : ""}\n\n${lines.join("\n\n")}`;

    const k = Deno.env.get("ANTHROPIC_API_KEY"); if (!k) throw new Error("ANTHROPIC_API_KEY is not set");
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 2500, system, messages: [{ role: "user", content: user }] }) });
    if (!r.ok) throw new Error(`model ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const text = ((await r.json()).content || []).map((c: { text?: string }) => c.text || "").join("");
    const out = JSON.parse(text.match(/\{[\s\S]*\}/)![0]);

    const writes: Promise<unknown>[] = [];
    const mem = async (owner: string, content: string, kind: string, importance: number, about: string[], speaker: string | null = null) =>
      db.from("memories").insert({ owner_id: owner, kind, speaker_id: speaker, content, importance: clamp(Math.round(importance) || 3, 1, 10), embedding: await embed(content), about_ids: about, location: null });
    const byName = (n: string) => chars.find((c) => c.name.toLowerCase() === String(n).toLowerCase());
    for (const [name, P] of Object.entries(out.people || {}) as [string, any][]) {
      const c = byName(name); if (!c) continue;
      for (const h of (P.happened || []).slice(0, 5)) if (h?.content) writes.push(mem(c.id, String(h.content), "action", h.importance, []));
      const st = states?.find((s) => s.character_id === c.id);
      const needs = { ...(st?.needs || {}) }; for (const n of ["energy", "hunger", "social", "intimacy"]) if (typeof P.needs?.[n] === "number") needs[n] = clamp(P.needs[n], 0, 1);
      writes.push(db.from("character_state").upsert({ character_id: c.id, mood: P.mood || st?.mood, needs, needs_at: now.toISOString(), location: st?.location || c.home_location, current_task: String(P.now || "").slice(0, 120), updated_at: now.toISOString() }));
    }
    const T = out.together;
    if (T && Array.isArray(T.exchange) && T.exchange.length) {
      const who = [...new Set(T.exchange.map((l: { who: string }) => l.who))].map(byName).filter(Boolean) as typeof chars;
      const script = T.exchange.slice(0, 10).map((l: { who: string; text: string }) => `${l.who}: "${l.text}"`).join(" / ");
      for (const c of who) {
        const others = who.filter((o) => o.id !== c.id);
        writes.push(mem(c.id, `${T.how === "texts" ? "Texting with" : "Hung out with"} ${others.map((o) => o.name).join(", ")}${T.where ? ` (${T.where})` : ""}${T.when ? `, ${T.when}` : ""}: ${script}`, "dialogue", 4, others.map((o) => o.id)));
        const tk = T.takes?.[c.name];
        for (const o of others) {
          const rel = rels?.find((x) => x.owner_id === c.id && x.target_id === o.id);
          writes.push(db.from("relationships").upsert({ owner_id: c.id, target_id: o.id, affection: clamp((+rel?.affection || 0) + (+tk?.affection || 0), -1, 1), trust: clamp((+rel?.trust || 0) + (+tk?.trust || 0), -1, 1), attraction: rel?.attraction || 0, familiarity: clamp((+rel?.familiarity || 0) + 0.01, 0, 1), summary: tk?.summary ? String(tk.summary).slice(0, 200) : rel?.summary || null, knows_name: true, updated_at: now.toISOString() }));
        }
      }
    }
    writes.push(db.from("life_ticks").insert({ at: now.toISOString(), hours, story: out }));
    await Promise.all(writes);
    return json({ ok: true, hours, story: out });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
