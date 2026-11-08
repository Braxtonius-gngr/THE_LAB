// THE_LAB · life: what the characters do while no one is watching.
//
// Called on a schedule (pg_cron, every 2 hours; 0006/0008 migrations). One model
// call lives the hours since the last tick for everyone at once: each man's own stretch of
// day (sleep, the shift, food, errands, moods), and - when it fits their lives - time
// between them: texts, a smoke break on the line, coming over after close. What happened is
// written as their memories (recalled later like any other), their needs and moods move,
// and their takes on each other shift. The tick is logged in life_ticks. One who has the
// visitor's number may text him during the stretch; that waits in `outbox` for the thread
// (world/text.html, GET mind) to pick up.
//
// { reflect: true } (nightly, 4:30 am): each one looks back on his day instead.
// Auth: the scheduler sends x-life-key, checked against private.life_key (never leaves the DB).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { pushPlayer } from "./webpush.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const embedder = new Supabase.ai.Session("gte-small");
const MODEL = Deno.env.get("MIND_MODEL") || "claude-opus-5-5";
const PLAYER = "00000000-0000-4000-8000-000000000001";
// the places that exist in the world: where a person can be at the end of a stretch
const WHERE = ["marco-apartment", "dante-apartment", "the-bar", "out"];
const whereWord: Record<string, string> = { "marco-apartment": "at Marco's apartment", "dante-apartment": "at Dante's apartment", "the-bar": "at the bar (work)", "out": "out somewhere else (the store, the river, family, errands)" };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const embed = async (t: string) => JSON.stringify(await embedder.run(t, { mean_pool: true, normalize: true }));
const local = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "long", hour: "numeric", minute: "2-digit" });

const logUse = (fn: string, d: { usage?: { input_tokens?: number; output_tokens?: number } }) =>
  db.from("api_usage").insert({ fn, model: MODEL, input_tokens: d.usage?.input_tokens || 0, output_tokens: d.usage?.output_tokens || 0 }).then(() => {});

// once a night: each one looks back over his last day - what mattered, what he makes of the
// people in it (the visitor too) - and keeps that as reflections, which recall weighs highly.
// This is how a person's memory works: the day's details fade, what they meant stays.
async function reflect() {
  const { data: chars } = await db.from("characters").select("id,name,persona").not("persona", "is", null);
  const k = Deno.env.get("ANTHROPIC_API_KEY"); if (!k) throw new Error("ANTHROPIC_API_KEY is not set");
  const since = new Date(Date.now() - 26 * 3.6e6).toISOString(), out: Record<string, unknown> = {};
  for (const c of chars || []) {
    const { data: mem } = await db.from("memories").select("content,created_at,kind,importance").eq("owner_id", c.id).gte("created_at", since).order("created_at");
    if (!mem || mem.length < 3) continue;
    const { data: rels } = await db.from("relationships").select("target_id,summary").eq("owner_id", c.id);
    const names = Object.fromEntries((chars || []).map((x) => [x.id, x.name])); names[PLAYER] = "Brax (the visitor)";
    const system = `${c.persona}\n\nIt's late; the day is done. Look back over it as yourself, privately, the way a person does before sleep. Respond ONLY with JSON:\n{"reflections": [{"content": "first person: what something meant to you, what you've realised about someone (the visitor included, if he came), what you want or worry about now - not a recap", "importance": 4-9}], "takes": {"<name>": "your one-line take on them now, if it changed"}}\n1-3 reflections. Only what genuinely stayed with you.`;
    const user = `Your day (oldest first):\n${mem.map((m) => `- ${local(new Date(m.created_at))}: ${m.content}`).join("\n")}\n\nHow you saw people this morning: ${(rels || []).map((r) => `${names[r.target_id] || "someone"}: ${r.summary || "-"}`).join("; ")}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages: [{ role: "user", content: user }] }) });
    if (!r.ok) { out[c.name] = `error ${r.status}`; continue; }
    const rd = await r.json(); logUse("reflect", rd);
    const o = JSON.parse(((rd.content || []).map((x: { text?: string }) => x.text || "").join("")).match(/\{[\s\S]*\}/)![0]);
    for (const f of (o.reflections || []).slice(0, 3)) if (f?.content) await db.from("memories").insert({ owner_id: c.id, kind: "reflection", content: String(f.content), importance: clamp(Math.round(f.importance) || 6, 1, 10), embedding: await embed(String(f.content)), about_ids: [] });
    for (const [n, t] of Object.entries(o.takes || {})) { const id = Object.keys(names).find((i) => names[i].toLowerCase().startsWith(n.toLowerCase())); if (id && t) await db.from("relationships").update({ summary: String(t).slice(0, 200) }).eq("owner_id", c.id).eq("target_id", id); }
    out[c.name] = o;
  }
  return { ok: true, reflected: out };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // GET: the latest off-screen stretches, for the apartment's "While you were away" panel
    if (req.method === "GET") {
      // ?skill=bass: how clean Marco plays, from how much his life has logged him practising lately
      if (new URL(req.url).searchParams.get("skill") === "bass") {
        const since = new Date(Date.now() - 21 * 86400e3).toISOString();
        const { count } = await db.from("memories").select("id", { count: "exact", head: true }).eq("owner_id", "00000000-0000-4000-8000-000000000101").gte("created_at", since).or("content.ilike.%bass%,content.ilike.%bridge%");
        // 0 sessions -> 0.3 (fumbling), ~20 in three weeks -> 0.85 (clean, still human)
        return json({ skill: +Math.min(0.85, 0.3 + 0.0275 * (count || 0)).toFixed(3), sessions: count || 0 });
      }
      // ?who=1: where everyone is right now, for the page to spawn only the people actually there
      if (new URL(req.url).searchParams.get("who")) {
        const [{ data: cs }, { data: ss }] = await Promise.all([db.from("characters").select("id,name,home_location").not("persona", "is", null), db.from("character_state").select("character_id,location,current_task,updated_at")]);
        return json({ people: (cs || []).map((c) => { const st = (ss || []).find((x) => x.character_id === c.id); return { id: c.id, name: c.name, home: c.home_location, where: st?.location || c.home_location, doing: st?.current_task || null, since: st?.updated_at || null }; }) });
      }
      const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
      const [{ data }, { data: use }] = await Promise.all([
        db.from("life_ticks").select("at,hours,story").order("at", { ascending: false }).limit(6),
        db.from("api_usage").select("model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens").gte("at", month.toISOString()),
      ]);
      // this month's Claude spend, estimated from tokens (Opus 5.5 $4 / $20 per million in / out, cache reads 0.05x,
      // cache writes 1.25x; Sonnet $3 / $15, reads 0.1x)
      let usd = 0; for (const u of use || []) { const opus = /opus/.test(u.model), [i, o] = opus ? [4, 20] : [3, 15]; usd += (u.input_tokens * i + u.output_tokens * o + (u.cache_read_tokens || 0) * i * (opus ? 0.05 : 0.1) + (u.cache_write_tokens || 0) * i * 1.25) / 1e6; }
      return json({ ticks: data || [], usage: { month_usd: +usd.toFixed(2), calls: (use || []).length } });
    }
    const key = req.headers.get("x-life-key");
    const { data: ok } = await db.rpc("life_key_ok", { k: key || "" });
    if (!ok) return json({ error: "no" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.reflect) return json(await reflect());

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

    // who has the visitor's number: the ones who know his name
    const hasNumber = chars.filter((c) => (rels || []).some((r) => r.owner_id === c.id && r.target_id === PLAYER && r.knows_name)).map((c) => c.name);
    // each one's recent past (their latest memories) and where they stand with everyone
    const lines: string[] = [];
    for (const c of chars) {
      const { data: mem } = await db.from("memories").select("content,created_at").eq("owner_id", c.id).order("created_at", { ascending: false }).limit(12);
      const st = states?.find((s) => s.character_id === c.id);
      const mine = (rels || []).filter((r) => r.owner_id === c.id).map((r) => `${r.target_id === PLAYER ? "the visitor (Brax)" : chars.find((x) => x.id === r.target_id)?.name || "someone"}: ${r.summary || "no take yet"} (affection ${(+r.affection).toFixed(2)}, trust ${(+r.trust).toFixed(2)})`);
      lines.push(`### ${c.name}
${c.persona}
Where now: ${whereWord[st?.location || c.home_location] || st?.location}. Mood now: ${JSON.stringify(st?.mood || {})}. Needs now (0-1; energy high = rested, the others high = pressing): ${JSON.stringify(st?.needs || {})}. Last doing: ${st?.current_task || "unknown"}.
How ${c.name} sees people: ${mine.join("; ") || "-"}
${c.name}'s latest memories, newest first:
${(mem || []).map((m) => `- ${local(new Date(m.created_at))}: ${m.content}`).join("\n") || "- none"}`);
    }

    const system = `You are the off-screen life of a small, realistic world: a few people in San Antonio, Texas, whose lives go on when no one is visiting them. Live the stretch of time given, for each of them, truthfully to who they are, their jobs and hours, their moods and needs, and what has been happening to them. Ordinary days are mostly ordinary; now and then something small happens (a rough shift, a good meal, a bill, a call from family, a song stuck in his head). Don't invent big drama or new people with names unless it follows from their memories. Keep it grounded and specific.

When their lives cross in this stretch (they work at the same bar; they're friends), write what passes between them: texts, a few words on a break, one coming over after close. Not every stretch - only if it fits the hours and how they feel about each other. If they talk, their history, banter and any tension carry on from their memories. They may mention the visitor (Brax) if he's on their mind, but he isn't there.${hasNumber.length ? ` ${hasNumber.join(" and ")} ${hasNumber.length > 1 ? "have" : "has"} Brax's number: one of them may text him during this stretch, in his own texting voice, if something in these hours would make him reach out or Brax has been on his mind (how they feel about him matters). Most stretches nobody does.` : ""}

Respond ONLY with JSON:
{"people": {"<name>": {"happened": [{"content": "first person, past tense, one thing that happened or that he did/felt, with when", "importance": 1-10}], "now": "what he's doing at the end of this stretch (asleep, at work, home on the sofa...)", "where": one of ${JSON.stringify(WHERE)} - where he physically is at the end of it (home means his own apartment; at the other's place only if he's actually there; the-bar during a shift), "mood": {"valence": -1..1, "energy": 0..1}, "needs": {"energy": 0..1, "hunger": 0..1, "social": 0..1, "intimacy": 0..1}}},
 "together": null | {"how": "texts" | "in person", "where": "...", "when": "...", "exchange": [{"who": "<name>", "text": "..."}], "takes": {"<name>": {"affection": -0.15..0.15, "trust": -0.15..0.15, "summary": "his one-line take on the other now"}}},
 "texts_to_brax": {"<name>": "the one text he sends Brax, short, or null"} - usually all null}
2-4 "happened" items per person. An exchange of 2-10 lines. Needs: where they end up after these hours, given sleep, food and company.`;
    const user = `Time now: ${local(now)}. Live the ${hours.toFixed(1)} hours since ${local(since)}.${body.note ? `\nAlso: ${body.note}` : ""}\n\n${lines.join("\n\n")}`;

    const k = Deno.env.get("ANTHROPIC_API_KEY"); if (!k) throw new Error("ANTHROPIC_API_KEY is not set");
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 2500, system, messages: [{ role: "user", content: user }] }) });
    if (!r.ok) throw new Error(`model ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const rd = await r.json(); logUse("life", rd);
    const text = (rd.content || []).map((c: { text?: string }) => c.text || "").join("");
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
      writes.push(db.from("character_state").upsert({ character_id: c.id, mood: P.mood || st?.mood, needs, needs_at: now.toISOString(), location: WHERE.includes(P.where) ? P.where : (st?.location || c.home_location), current_task: String(P.now || "").slice(0, 120), updated_at: now.toISOString() }));
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
    // a text to the visitor: it waits in his inbox, he remembers sending it, and the phone buzzes
    let texted = 0;
    for (const [name, t] of Object.entries(out.texts_to_brax || {}) as [string, unknown][]) {
      const c = byName(name); if (!c || !hasNumber.includes(c.name) || typeof t !== "string" || !t.trim()) continue;
      const msg = t.trim().slice(0, 400); texted++;
      writes.push(db.from("outbox").insert({ from_id: c.id, to_id: PLAYER, text: msg }));
      writes.push(mem(c.id, `I texted Brax: "${msg}"`, "dialogue", 3, [PLAYER], c.id));
    }
    writes.push(db.from("life_ticks").insert({ at: now.toISOString(), hours, story: out }));
    await Promise.all(writes);
    if (texted) await pushPlayer(db, PLAYER, { subject: Deno.env.get("VAPID_SUBJECT") || "mailto:the-lab@localhost" }).catch(() => {});
    return json({ ok: true, hours, story: out });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
