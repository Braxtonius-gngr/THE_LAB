// THE_LAB · mind: one character's slow-beat thinking.
//
// POST { character_id, player_id, session_id?, text?, event?, scene?, history? }
//   text    what the player just said (or null for an event)
//   event   'arrive' (player enters: the character notices and greets or doesn't),
//           'leave'  (player leaves: the character reflects on the visit; session closes)
//   scene   { location, time, player_distance_m, player_pos: [x,z], spots: ['sofa','kitchen',...], wearing, wardrobe }
//   history recent turns this session, [{ who: 'player'|'me', text }], kept by the page
// → { say, actions, mood, session_id, recalled, memory }
//
// Memory: every exchange is written as dialogue memories; the model also picks
// one thing worth remembering (with an importance 1-10) and nudges the
// relationship. Recall blends relevance (gte-small embeddings, made here),
// importance and recency (db/migrations/0001). The page never touches the
// tables: this function runs with the service role.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const embedder = new Supabase.ai.Session("gte-small");
const MODEL = Deno.env.get("MIND_MODEL") || "claude-sonnet-5-5";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function embed(text: string): Promise<number[]> {
  return (await embedder.run(text, { mean_pool: true, normalize: true })) as number[];
}

async function think(system: string, messages: { role: string; content: string }[]) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (Edge Function secrets)");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages }),
  });
  if (!r.ok) throw new Error(`model ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const text = (d.content || []).map((c: { text?: string }) => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { say: text.trim(), actions: [], mood: null, memory: null, relationship: null };
  try { return JSON.parse(m[0]); } catch { /* fall through */ }
  // broken or truncated JSON: salvage the line he was going to say rather than speaking the JSON
  const say = text.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let mood = null; const mm = text.match(/"mood"\s*:\s*(\{[^}]*\})/); if (mm) { try { mood = JSON.parse(mm[1]); } catch { /* ignore */ } }
  return { say: say ? JSON.parse(`"${say[1]}"`) : "", actions: [{ type: "look_at", target: "player" }], mood, memory: null, relationship: null, salvaged: true };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const { character_id, player_id, text = null, event = null, scene = {}, history = [] } = body;
    let { session_id } = body;
    if (!character_id || !player_id) return json({ error: "character_id and player_id required" }, 400);

    const [{ data: me }, { data: player }, { data: state }, { data: rel }] = await Promise.all([
      supabase.from("characters").select("*").eq("id", character_id).single(),
      supabase.from("characters").select("id,name").eq("id", player_id).single(),
      supabase.from("character_state").select("*").eq("character_id", character_id).maybeSingle(),
      supabase.from("relationships").select("*").eq("owner_id", character_id).eq("target_id", player_id).maybeSingle(),
    ]);
    if (!me || !player) return json({ error: "unknown character or player" }, 404);

    // he only knows the visitor's name once it has been said to him (or they've met before)
    const told = (t: string | null) => !!t && t.toLowerCase().includes(String(player.name).toLowerCase().slice(0, 4));
    const knowsName = !!rel?.knows_name || history.some((h: { who: string; text: string }) => h.who === "player" && told(h.text)) || told(text);
    const who = knowsName ? player.name : "the visitor";
    // what is on the character's mind right now: the cue is what was said, or the event
    const cue = text || (event === "arrive" ? `${who} has just arrived` : event === "leave" ? `${who} is leaving` : "nothing in particular");
    const qv = await embed(cue);
    const { data: recalled } = await supabase.rpc("recall", { p_owner: character_id, p_query: JSON.stringify(qv), p_limit: 10 });
    const memLines = (recalled || []).map((m: { content: string; created_at: string; kind: string }) => `- (${ago(m.created_at)}, ${m.kind}) ${m.content}`).join("\n");
    const { count: past } = await supabase.from("sessions").select("id", { count: "exact", head: true }).contains("attendees", [player_id]);
    const visits = (past || 0) + (session_id ? 0 : 1);   // this visit counts, once

    const system = `${me.persona}

You are in your ${scene.location || me.home_location || "apartment"}. Time: ${scene.time || "evening"}.${scene.wearing ? ` You're wearing: ${scene.wearing === "Nude" ? "nothing" : scene.wearing}. Clothes you could change into: ${(scene.wardrobe || []).join(", ")}.` : ""} ${who} is ${scene.player_distance_m != null ? `${Number(scene.player_distance_m).toFixed(1)} m away` : "here"}. Places you can walk to: ${(scene.spots || ["sofa", "kitchen", "window", "door"]).join(", ")}.
This is visit number ${visits || 1} from ${who}.${rel ? ` How you feel about ${who}: affection ${rel.affection.toFixed(2)}, trust ${rel.trust.toFixed(2)}, familiarity ${rel.familiarity.toFixed(2)}. Your take on them so far: ${rel.summary || "no take yet"}.` : ` You have never met this person before${knowsName ? "" : " and don't know their name"}.`}
Your mood: ${JSON.stringify(state?.mood || { valence: 0, energy: 0.5 })}.
${memLines ? `Things you remember (most relevant first):\n${memLines}` : "You have no memories of this person yet."}

Respond ONLY with JSON, no prose around it:
{"say": "what you say out loud, 1-3 short sentences, or \\"\\" if you stay quiet",
 "actions": [{"type":"look_at","target":"player"} | {"type":"walk_to","target":"<spot>"} | {"type":"turn_to","target":"player"} | {"type":"gesture","name":"nod"|"shrug"|"wave"} | {"type":"change","outfit":"<one of your clothes>"} | {"type":"idle"}],
 "mood": {"valence": -1..1, "energy": 0..1},
 "memory": {"content": "one thing worth remembering from this moment, in first person, or null", "importance": 1-10},
 "relationship": {"affection": -0.2..0.2, "trust": -0.2..0.2, "familiarity": 0..0.1, "summary": "your one-line take on ${who} now"}}
Be a person, not a helper. Don't ask how you can help. Reference memories naturally when they matter, not as a list. If this person wronged you, it shows. If it's the first meeting, you don't know their name unless they tell you.
Don't end every line with a question; often just react, or say something of your own, or let a silence sit. You already know what time it is, so don't keep saying it. You're at home: every few exchanges do something physical (walk_to a spot, turn away and back) instead of standing at attention. Keep "say" to spoken words only.
What you wear is yours to decide, like anyone at home: what suits the hour, the heat, your mood and who's here. Change only when a person in your place would (getting comfortable, someone arriving, heading to bed, a guest you'd rather not be seen in your underwear by) - not every turn.`;

    const msgs = history.slice(-12).map((h: { who: string; text: string }) => ({ role: h.who === "player" ? "user" : "assistant", content: h.text }));
    msgs.push({ role: "user", content: text ? `${who} says: "${text}"` : `[${cue}]` });
    // the API needs alternating roles starting with user; collapse any doubles
    const alt: { role: string; content: string }[] = [];
    for (const m of msgs) { if (alt.length && alt[alt.length - 1].role === m.role) alt[alt.length - 1].content += "\n" + m.content; else alt.push({ ...m }); }
    if (alt[0].role !== "user") alt.unshift({ role: "user", content: `[${who} is here]` });

    const out = await think(system, alt);
    // the visit only counts once he has actually answered (a failed model call leaves no trace)
    if (!session_id) {
      const { data: s } = await supabase.from("sessions")
        .insert({ kind: "solo", location: scene.location || me.home_location, attendees: [character_id, player_id] })
        .select("id").single();
      session_id = s!.id;
    }
    const say = typeof out.say === "string" ? out.say.trim() : "";
    const actions = Array.isArray(out.actions) ? out.actions.slice(0, 4) : [];

    // write what happened
    const writes: Promise<unknown>[] = [];
    const mem = async (content: string, kind: string, importance: number, speaker_id: string | null) => {
      const embedding = await embed(content);
      return supabase.from("memories").insert({ owner_id: character_id, kind, speaker_id, content, importance: clamp(Math.round(importance), 1, 10), embedding: JSON.stringify(embedding), about_ids: [player_id], session_id, location: scene.location || me.home_location });
    };
    if (text) writes.push(mem(`${who} said to me: "${text}"`, "dialogue", 3, player_id));
    if (say) writes.push(mem(`I said to ${who}: "${say}"`, "dialogue", 2, character_id));
    if (event === "arrive") writes.push(mem(`${who} came over (visit ${visits || 1}).`, "observation", 3, null));
    if (out.memory && out.memory.content) writes.push(mem(String(out.memory.content), event === "leave" ? "reflection" : "observation", Number(out.memory.importance) || 4, null));
    if ((recalled || []).length) writes.push(supabase.from("memories").update({ last_used_at: new Date().toISOString() }).in("id", recalled!.map((m: { id: string }) => m.id)));
    const r = out.relationship || {};
    writes.push(supabase.from("relationships").upsert({
      owner_id: character_id, target_id: player_id,
      affection: clamp((rel?.affection || 0) + (Number(r.affection) || 0), -1, 1),
      trust: clamp((rel?.trust || 0) + (Number(r.trust) || 0), -1, 1),
      attraction: rel?.attraction || 0,
      familiarity: clamp((rel?.familiarity || 0) + (Number(r.familiarity) || 0.02), 0, 1),
      summary: r.summary ? String(r.summary).slice(0, 200) : rel?.summary || null,
      knows_name: knowsName,
      updated_at: new Date().toISOString(),
    }));
    const mood = out.mood && typeof out.mood === "object" ? { valence: clamp(Number(out.mood.valence) || 0, -1, 1), energy: clamp(Number(out.mood.energy) || 0.5, 0, 1) } : state?.mood;
    writes.push(supabase.from("character_state").upsert({ character_id, mood, location: scene.location || me.home_location, current_task: actions[0]?.type || "idle", updated_at: new Date().toISOString() }));
    if (event === "leave") writes.push(supabase.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", session_id));
    await Promise.all(writes);

    return json({ say, actions, mood, session_id, model: MODEL, salvaged: !!out.salvaged, recalled: (recalled || []).map((m: { content: string; created_at: string }) => ({ content: m.content, when: ago(m.created_at) })), memory: out.memory || null });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
