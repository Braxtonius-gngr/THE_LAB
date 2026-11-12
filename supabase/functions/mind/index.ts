// THE_LAB · mind: one character's slow-beat thinking.
//
// POST { character_id, player_id, session_id?, text?, event?, scene?, history? }
//   text    what the player just said (or null for an event)
//   event   'arrive' (player enters: the character notices and greets or doesn't),
//           'leave'  (player leaves: the character reflects on the visit; session closes)
//   scene   { location, time, hour, comfort, others: [{id,name,wearing,distance_m}], player_distance_m, player_pos: [x,z], spots: ['sofa','kitchen',...], wearing, wardrobe }
//   history recent turns this session, [{ who: 'player'|'me'|'other', name?, to?, text }], kept by the page
//   heard   what others in the room said since his last turn, [{ id, name, to?, text }]: he remembers it
//   event   also 'chat' (the room has gone quiet: say something to the other one, or don't),
//           'addressed' (the other one just spoke to him), 'overheard', 'someone_arrives', 'someone_leaves', 'song'
//   scene.channel = 'text': you're texting him (world/text.html), not in the room. He answers in
//           his texting voice, with no body actions, from wherever his life has him right now.
// → { say, to, actions, mood, session_id, recalled, memory }   (to: 'player' or the other one's name)
//
// The prompt is two blocks: who he is and how to answer (stable per character, cached with a
// cache_control marker), then the moment (volatile). Opus 5.5 caches a prefix from 512 tokens.
// GET ?character_id&player_id → { name, now, inbox: [texts he sent you that you haven't seen] }
//   (his off-screen life can text you first: supabase/functions/life writes to `outbox`)
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
const MODEL = Deno.env.get("MIND_MODEL") || "claude-opus-5-5";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function embed(text: string): Promise<number[]> {
  return (await embedder.run(text, { mean_pool: true, normalize: true })) as number[];
}

async function think(stable: string, moment: string, messages: { role: string; content: string }[]) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (Edge Function secrets)");
  // the stable block (persona + how to answer) is marked for the prompt cache; the moment follows it
  const system = [{ type: "text", text: stable, cache_control: { type: "ephemeral" } }, { type: "text", text: moment }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages }),
  });
  if (!r.ok) throw new Error(`model ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  // (what it cost, for the usage counter - cached reads are billed at a fraction)
  const u = d.usage || {};
  supabase.from("api_usage").insert({ fn: "mind", model: MODEL, input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, cache_read_tokens: u.cache_read_input_tokens || 0, cache_write_tokens: u.cache_creation_input_tokens || 0 }).then(() => {});
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

// ---- needs: drift since they were last saved, by the hour of his day (a bartender: asleep about 4-11) ----
type Needs = { energy: number; hunger: number; social: number; intimacy: number; comfort: number };
const NEED0: Needs = { energy: 0.7, hunger: 0.3, social: 0.4, intimacy: 0.4, comfort: 0.2 };
function drift(n: Needs, fromIso: string | null, hourNow: number): Needs {
  const out: Needs = { ...NEED0 }; for (const k of Object.keys(NEED0) as (keyof Needs)[]) if (n && typeof n[k] === "number") out[k] = n[k];
  let h = Math.min(72, Math.max(0, (Date.now() - new Date(fromIso || Date.now()).getTime()) / 3.6e6));
  // walk the hours: asleep restores energy and slows hunger; awake drains it
  for (let t = h; t > 0; t -= 1) {
    const step = Math.min(1, t), hr = ((hourNow - t) % 24 + 24) % 24, asleep = hr >= 4 && hr < 11;
    out.energy = clamp(out.energy + (asleep ? 0.12 : -0.045) * step, 0, 1);
    out.hunger = clamp(out.hunger + (asleep ? 0.02 : 0.07) * step, 0, 1);
    out.social = clamp(out.social + 0.03 * step, 0, 1);       // alone: wants company more
    out.intimacy = clamp(out.intimacy + 0.012 * step, 0, 1);  // closeness: slow
    out.comfort = clamp(out.comfort - 0.1 * step, 0, 1);      // discomfort fades on its own
  }
  return out;
}
const word = (k: string, v: number) => {
  if (k === "energy") return v < 0.2 ? "exhausted" : v < 0.4 ? "tired" : v > 0.8 ? "wide awake" : "fine";
  if (k === "hunger") return v > 0.75 ? "starving" : v > 0.5 ? "hungry" : v > 0.3 ? "could eat" : "full";
  if (k === "social") return v > 0.7 ? "lonely, craving company" : v > 0.4 ? "open to company" : v > 0.15 ? "content" : "peopled out, wants to be alone";
  if (k === "intimacy") return v > 0.7 ? "missing closeness - affection, touch, someone who knows him" : v > 0.45 ? "would like some closeness" : "fine on closeness";
  return v > 0.6 ? "uncomfortable (too warm/cold or dressed wrong for it)" : v > 0.3 ? "a little uncomfortable" : "comfortable";
};
// a song the visitor played him: what the page heard, in words, plus anything they gave him
function songCue(S: Record<string, unknown>, who: string) {
  const L = (k: string) => Array.isArray(S[k]) ? (S[k] as string[]).join("; ") : "";
  return `${who} just played you a song on the speaker in the room${S.stopped_early ? ` (they stopped it at ${S.stopped_early})` : ""}, and you listened to it${S.stopped_early ? "" : " all the way through"}. ${S.made_by_visitor ? `${who} made it - it's their own song.` : S.artist ? `It's by ${S.artist}.` : "You don't know who made it."}
Title: ${S.title || "untitled"}. Length ${S.length}${S.tempo_bpm ? `, about ${S.tempo_bpm} bpm` : ""}, ${S.overall}.
How it moved: ${L("how_it_moves")}.
${L("moments") ? `What stood out: ${L("moments")}.` : ""}
${S.style ? `What it's meant to be (their words): ${S.style}` : ""}
${S.lyrics ? `The lyrics:\n${String(S.lyrics).slice(0, 2500)}` : "You couldn't make out the words."}
This is what you actually heard. React as yourself - your own ear and taste (if you play music, you hear it as a player: the low end, the groove, what works and what doesn't), honest the way a friend is: specific, not gushing, not a review. If they made it, that matters to how you say it, not to whether you mean it. Remember it.`;
}
// what he's up to, from character_state.current_task: his off-screen life leaves a sentence
// ("home on the sofa"), a visit leaves the last action word ("sit") - which says nothing useful
const doing = (task: string | null | undefined) => task && /\s/.test(task) ? task : null;
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
    // the text thread's inbox: what he's sent you since you last looked, and what he's up to
    if (req.method === "GET") {
      const u = new URL(req.url), cid = u.searchParams.get("character_id"), pid = u.searchParams.get("player_id");
      if (!cid || !pid) return json({ error: "character_id and player_id required" }, 400);
      const [{ data: c }, { data: st }, { data: inbox }] = await Promise.all([
        supabase.from("characters").select("name").eq("id", cid).single(),
        supabase.from("character_state").select("current_task,location,updated_at").eq("character_id", cid).maybeSingle(),
        supabase.from("outbox").select("id,text,created_at").eq("from_id", cid).eq("to_id", pid).is("seen_at", null).order("created_at"),
      ]);
      if (!c) return json({ error: "unknown character" }, 404);
      // ?thread=1: the whole text thread as he remembers it (his texts and yours, plus texts he sent
      // first), so a new phone or the tablet shows the same conversation as the phone it started on
      if (u.searchParams.get("thread")) {
        const { data: ss } = await supabase.from("sessions").select("id").eq("kind", "text").contains("attendees", [cid, pid]).order("started_at", { ascending: false }).limit(80);
        const ids = (ss || []).map((x: { id: string }) => x.id);
        const [{ data: mem }, { data: sent }] = await Promise.all([
          ids.length ? supabase.from("memories").select("content,created_at").eq("owner_id", cid).eq("kind", "dialogue").in("session_id", ids).order("created_at", { ascending: false }).limit(160) : Promise.resolve({ data: [] as { content: string; created_at: string }[] }),
          supabase.from("outbox").select("text,created_at").eq("from_id", cid).eq("to_id", pid).order("created_at", { ascending: false }).limit(80),
        ]);
        const lines: { who: string; text: string; at: string }[] = [];
        for (const m of mem || []) {
          const a = /^.+? texted me: "([\s\S]*)"$/.exec(m.content), b = /^I texted .+?: "([\s\S]*)"$/.exec(m.content);
          if (a) lines.push({ who: "you", text: a[1], at: m.created_at }); else if (b) lines.push({ who: "him", text: b[1], at: m.created_at });
        }
        for (const o of sent || []) lines.push({ who: "him", text: o.text, at: o.created_at });
        lines.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
        return json({ name: c.name, thread: lines.slice(-200) });
      }
      if (inbox?.length) await supabase.from("outbox").update({ seen_at: new Date().toISOString() }).in("id", inbox.map((m: { id: number }) => m.id));
      return json({ name: c.name, now: doing(st?.current_task), since: st?.updated_at || null, inbox: inbox || [] });
    }
    const body = await req.json();
    const { character_id, player_id, text = null, event = null, scene = {}, history = [], heard = [] } = body;
    let { session_id } = body;
    if (!character_id || !player_id) return json({ error: "character_id and player_id required" }, 400);

    const [{ data: me }, { data: player }, { data: state }, { data: rel }] = await Promise.all([
      supabase.from("characters").select("*").eq("id", character_id).single(),
      supabase.from("characters").select("id,name").eq("id", player_id).single(),
      supabase.from("character_state").select("*").eq("character_id", character_id).maybeSingle(),
      supabase.from("relationships").select("*").eq("owner_id", character_id).eq("target_id", player_id).maybeSingle(),
    ]);
    if (!me || !player) return json({ error: "unknown character or player" }, 404);
    // others in the room (other characters): who they are to him
    const others = Array.isArray(scene.others) ? scene.others.slice(0, 4) : [];
    const otherRels = others.length ? (await supabase.from("relationships").select("*").eq("owner_id", character_id).in("target_id", others.map((o: { id: string }) => o.id))).data || [] : [];
    const otherNames: string[] = others.map((o: { name: string }) => String(o.name));
    const other = otherNames[0] || null;   // (1-on-2 today: the one other person in the room)
    const othersLine = others.map((o: { id: string; name: string; wearing?: string; distance_m?: number }) => {
      const rr = otherRels.find((x: { target_id: string }) => x.target_id === o.id);
      return `${o.name}${o.wearing ? ` (wearing ${o.wearing === "Nude" ? "nothing" : o.wearing})` : ""}${o.distance_m != null ? `, ${Number(o.distance_m).toFixed(1)} m from you` : ""}${rr?.summary ? ` - your take: ${rr.summary}` : ""}`;
    }).join("; ");

    // he only knows the visitor's name once it has been said to him (or they've met before)
    const told = (t: string | null) => !!t && t.toLowerCase().includes(String(player.name).toLowerCase().slice(0, 4));
    const knowsName = !!rel?.knows_name || history.some((h: { who: string; text: string }) => h.who === "player" && told(h.text)) || told(text);
    const who = knowsName ? player.name : "the visitor";
    const texting = scene.channel === "text";
    const here = texting ? (state?.location || me.home_location) : (scene.location || me.home_location);
    // what is on the character's mind right now: the cue is what was said, or the event
    const cue = text || (event === "arrive" ? `${who} has just arrived` : event === "leave" ? `${who} is leaving` : event === "song" && scene.song ? songCue(scene.song, who) : event === "someone_arrives" ? `${scene.who_moved || "someone"} just walked in` : event === "someone_leaves" ? `${scene.who_moved || "someone"} just left` : event === "overheard" ? "you just heard what was said in the room (see the conversation); add something only if a person would - otherwise say nothing (empty say)" : event === "addressed" && other ? `${other} just said that to you (the last line) - answer him, or don't, as you would` : event === "chat" && other ? `the room has gone quiet for a bit. If there is something you'd naturally say to ${other} right now - something on your mind, a jab, a question, picking up a thread from earlier, even something about ${who} while he's standing right there - say it to ${other} (to: "${other}"), not to ${who}. If you'd just let the quiet sit, say nothing (empty say). Most quiet moments are fine as they are.` : "nothing in particular");
    const qv = await embed(cue);
    const { data: recalled } = await supabase.rpc("recall", { p_owner: character_id, p_query: JSON.stringify(qv), p_limit: 10 });
    const memLines = (recalled || []).map((m: { content: string; created_at: string; kind: string }) => `- (${ago(m.created_at)}, ${m.kind}) ${m.content}`).join("\n");
    const { count: past } = await supabase.from("sessions").select("id", { count: "exact", head: true }).contains("attendees", [player_id]).neq("kind", "text");
    const visits = (past || 0) + (session_id || texting ? 0 : 1);   // this visit counts, once (a text thread isn't a visit)
    const hourNow = Number(scene.hour ?? new Date().getUTCHours() - 6);
    const needs = drift(state?.needs || NEED0, state?.needs_at || null, ((hourNow % 24) + 24) % 24);
    if (scene.comfort != null) needs.comfort = clamp(Number(scene.comfort), 0, 1);
    const needLine = (Object.keys(NEED0) as (keyof Needs)[]).map(k => `${k}: ${word(k, needs[k])}`).join("; ");

    const situation = texting
      ? `You're texting on your phone with ${who}${knowsName ? "" : " - a number you don't have saved"}. You're not together. Right now you're ${doing(state?.current_task) || `at home (${me.home_location || "your apartment"})`}. Time: ${scene.time || "evening"}.
${visits ? `${who} has been over ${visits} time${visits === 1 ? "" : "s"}.` : `You've never met ${who} in person.`}`
      : `You are ${scene.place || `in your ${scene.location || me.home_location || "apartment"}`}. Time: ${scene.time || "evening"}.${scene.wearing ? ` You're wearing: ${scene.wearing === "Nude" ? "nothing" : scene.wearing}. Clothes you could change into: ${(scene.wardrobe || []).join(", ")}.` : ""} ${who} is ${scene.player_distance_m != null ? `${Number(scene.player_distance_m).toFixed(1)} m away` : "here"}. Places you can go to there: ${(scene.spots || ["sofa", "kitchen", "window", "door"]).join(", ")}.${scene.seats?.sit?.length ? ` Seats here: ${scene.seats.sit.join(", ")}.` : ""}${scene.seats?.lie?.length ? ` You can lie down on the ${scene.seats.lie.join(", ")}.` : ""}${scene.seats?.lean?.length ? ` You can lean on the ${scene.seats.lean.join(", ")}.` : ""}
${doing(state?.current_task) ? ` Just before this you were ${doing(state?.current_task)} - if that was sleeping, you've just been woken.` : ""}
This is visit number ${visits || 1} from ${who}.`;
    // --- stable: who he is and how he answers (the same bytes every turn, so it caches) ---
    const stable = texting
      ? `${me.persona}

You are texting on your phone. You're not with the person you're texting.

Respond ONLY with JSON, no prose around it:
{"say": "the text you send back - how you actually text: short, your own voice, lowercase and fragments are fine, no stage directions, no emoji unless you're that kind of person - or \\"\\" if you'd leave it on read for now",
 "actions": [],
 "mood": {"valence": -1..1, "energy": 0..1},
 "memory": {"content": "one thing worth remembering from this moment, in first person, or null", "importance": 1-10},
 "needs": {"energy": -0.3..0.3, "hunger": -1..0.2, "social": -0.3..0.3, "intimacy": -0.3..0.2} - how this moment changed them (eating drops hunger; good company drops social, wears it thin when you're peopled out; real warmth or affection eases intimacy),
 "relationship": {"affection": -0.2..0.2, "trust": -0.2..0.2, "familiarity": 0..0.1, "summary": "your one-line take on the person you're texting, now"}}
Be a person, not a helper. Don't ask how you can help. Reference memories naturally when they matter, not as a list. If this person wronged you, it shows. If you've never met, you don't know their name unless they tell you.
Don't end every line with a question; often just react, or say something of your own, or let a silence sit. You already know what time it is, so don't keep saying it. You're wherever your day has you - if you're working or asleep, that shows in whether and how you answer. Mention what you're doing only when it comes up, like anyone texting. One text at a time; a reply, not a paragraph.`
      : `${me.persona}

You are at home or at a friend's, with a visitor and sometimes a friend in the room. The moment - where you are, who's there, what you remember - follows this.

Respond ONLY with JSON, no prose around it:
{"say": "what you say out loud, 1-3 short sentences, or \\"\\" if you stay quiet",
 "to": "player" | "<the name of the other person in the room>" - who you're saying it to (the visitor is "player"),
 "actions": [{"type":"look_at","target":"player"|"other"} | {"type":"walk_to","target":"<spot>"} | {"type":"turn_to","target":"player"|"other"} | {"type":"gesture","name":"nod"|"shrug"|"wave"} | {"type":"change","outfit":"<one of your clothes>"} | {"type":"eat"} | {"type":"sit","on":"<one of the seats here>"} | {"type":"lie_down"} | {"type":"stand"} | {"type":"drink"} | {"type":"phone"} | {"type":"stretch"} | {"type":"cross_arms"} | {"type":"lean_counter"} | {"type":"play_bass"} (${me.name === "Marco" ? "your bass is here; you play it for real - a few of your own lines, the bridge you're still learning - and people hear it" : "only if there is a bass here and you'd pick it up"}) | {"type":"go","where":"marco-apartment"|"dante-apartment"|"the-bar"|"out","why":"a few words"} (you actually leave: for work, to go home, to run out - only when a person would, e.g. your shift is coming up; say your goodbye in "say") | {"type":"idle"}],
 "mood": {"valence": -1..1, "energy": 0..1},
 "memory": {"content": "one thing worth remembering from this moment, in first person, or null", "importance": 1-10},
 "needs": {"energy": -0.3..0.3, "hunger": -1..0.2, "social": -0.3..0.3, "intimacy": -0.3..0.2} - how this moment changed them (eating drops hunger; good company drops social, wears it thin when you're peopled out; real warmth or affection eases intimacy),
 "relationship": {"affection": -0.2..0.2, "trust": -0.2..0.2, "familiarity": 0..0.1, "summary": "your one-line take on the visitor, now"},
 "friend": null | {"affection": -0.1..0.1, "trust": -0.1..0.1, "summary": "your one-line take on the friend in the room, now"} - only when someone besides the visitor is here and this moment moved anything between you two; otherwise null}
Be a person, not a helper. Don't ask how you can help. Reference memories naturally when they matter, not as a list. If this person wronged you, it shows. If it's the first meeting, you don't know their name unless they tell you.
Don't end every line with a question; often just react, or say something of your own, or let a silence sit. You already know what time it is, so don't keep saying it. Wherever you are: every few exchanges do something physical (walk_to a spot, turn away and back) instead of standing at attention. Keep "say" to spoken words only.
When a friend is in the room, you two have your own history; talk to him when you would (an aside, a jab, backing him up, disagreeing), not only to the visitor, and not every turn. "to" says who the line is for; look at or turn to the one you're talking to when it matters.
What you wear is yours to decide, like anyone at home: what suits the hour, the heat, your mood and who's here. Change only when a person in your place would (getting comfortable, someone arriving, heading to bed, a guest you'd rather not be seen in your underwear by) - not every turn.`;

    // --- the moment: everything that changes turn to turn ---
    const moment = `${situation}${rel ? ` How you feel about ${who}: affection ${rel.affection.toFixed(2)}, trust ${rel.trust.toFixed(2)}, familiarity ${rel.familiarity.toFixed(2)}. Your take on them so far: ${rel.summary || "no take yet"}.` : ` You have never met this person before${knowsName ? "" : " and don't know their name"}.`}
Your mood: ${JSON.stringify(state?.mood || { valence: 0, energy: 0.5 })}.
${othersLine ? `Also here with you: ${othersLine}. They hear what's said; you can talk to them as well as to ${who}.\n` : ""}How you feel in yourself right now: ${needLine}. These drive you like they drive anyone - let them show in what you say and do, not as a report.
${memLines ? `Things you remember (most relevant first):\n${memLines}` : "You have no memories of this person yet."}`;

    const toWord = (t?: string) => !t ? "" : t === "player" ? ` to ${who}` : t === "me" ? " to you" : ` to ${t}`;
    const msgs = history.slice(-14).map((h: { who: string; text: string; name?: string; to?: string }) => h.who === "other" ? { role: "user", content: `[${h.name} says${toWord(h.to)}: "${h.text}"]` } : ({ role: h.who === "player" ? "user" : "assistant", content: h.text }));
    msgs.push({ role: "user", content: text ? `${who} ${texting ? "texts" : "says"}: "${text}"` : `[${cue}]` });
    // the API needs alternating roles starting with user; collapse any doubles
    const alt: { role: string; content: string }[] = [];
    for (const m of msgs) { if (alt.length && alt[alt.length - 1].role === m.role) alt[alt.length - 1].content += "\n" + m.content; else alt.push({ ...m }); }
    if (alt[0].role !== "user") alt.unshift({ role: "user", content: `[${who} is here]` });

    const out = await think(stable, moment, alt);
    // the visit only counts once he has actually answered (a failed model call leaves no trace)
    if (!session_id) {
      const { data: s } = await supabase.from("sessions")
        .insert({ kind: texting ? "text" : "solo", location: here, attendees: [character_id, player_id] })
        .select("id").single();
      session_id = s!.id;
    }
    const say = typeof out.say === "string" ? out.say.trim() : "";
    const actions = texting ? [] : Array.isArray(out.actions) ? out.actions.slice(0, 4) : [];
    // who the line is for: the visitor unless he named someone who is actually here
    const toRaw = typeof out.to === "string" ? out.to.trim() : "";
    const to = otherNames.find((n) => n.toLowerCase() === toRaw.toLowerCase()) || "player";

    // write what happened
    const writes: Promise<unknown>[] = [];
    const otherId = others.find((o: { name: string }) => o.name === to)?.id || null;
    const mem = async (content: string, kind: string, importance: number, speaker_id: string | null, about: string[] = [player_id]) => {
      const embedding = await embed(content);
      return supabase.from("memories").insert({ owner_id: character_id, kind, speaker_id, content, importance: clamp(Math.round(importance), 1, 10), embedding: JSON.stringify(embedding), about_ids: about, session_id, location: here });
    };
    if (text) writes.push(mem(texting ? `${who} texted me: "${text}"` : `${who} said to me: "${text}"`, "dialogue", 3, player_id));
    if (say) writes.push(mem(texting ? `I texted ${who}: "${say}"` : `I said to ${to === "player" ? who : to}${to !== "player" ? ` (${who} was there)` : ""}: "${say}"`, "dialogue", 2, character_id, otherId ? [player_id, otherId] : [player_id]));
    // what the others said since his last turn: he was there, he remembers it
    for (const h of (Array.isArray(heard) ? heard : []).slice(0, 6) as { id?: string; name?: string; to?: string; text?: string }[]) {
      if (!h?.text || !h.name) continue;
      writes.push(mem(`${h.name} said${h.to === "me" ? " to me" : h.to === "player" ? ` to ${who}` : ""}: "${String(h.text).slice(0, 300)}"`, "dialogue", 2, h.id || null, h.id ? [player_id, h.id] : [player_id]));
    }
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
    // how this moment moved what he thinks of the friend in the room (small nudges; his life ticks do the rest)
    const f = out.friend, friendId = others[0]?.id;
    if (f && typeof f === "object" && friendId && !texting) {
      const fr = otherRels.find((x: { target_id: string }) => x.target_id === friendId);
      writes.push(supabase.from("relationships").upsert({
        owner_id: character_id, target_id: friendId,
        affection: clamp((fr?.affection || 0) + clamp(Number(f.affection) || 0, -0.1, 0.1), -1, 1),
        trust: clamp((fr?.trust || 0) + clamp(Number(f.trust) || 0, -0.1, 0.1), -1, 1),
        attraction: fr?.attraction || 0,
        familiarity: clamp((fr?.familiarity || 0) + 0.01, 0, 1),
        summary: f.summary ? String(f.summary).slice(0, 200) : fr?.summary || null,
        knows_name: true, updated_at: new Date().toISOString(),
      }));
    }
    const mood = out.mood && typeof out.mood === "object" ? { valence: clamp(Number(out.mood.valence) || 0, -1, 1), energy: clamp(Number(out.mood.energy) || 0.5, 0, 1) } : state?.mood;
    const dn = out.needs && typeof out.needs === "object" ? out.needs : {};
    for (const k of Object.keys(NEED0) as (keyof Needs)[]) if (k !== "comfort") needs[k] = clamp(needs[k] + (Number(dn[k]) || 0), 0, 1);
    if (actions.some((a: { type: string }) => a.type === "eat")) needs.hunger = Math.min(needs.hunger, 0.1);
    if (text) needs.social = clamp(needs.social - (texting ? 0.005 : 0.015), 0, 1);
    const go = texting ? null : actions.find((a: { type: string; where?: string }) => a.type === "go" && ["marco-apartment", "dante-apartment", "the-bar", "out"].includes(a.where || ""));
    if (go) writes.push(mem(`I left ${scene.place ? "" : "my place"} ${go.why ? `- ${go.why}` : ""} (heading ${go.where.replace("-", " ")}).`.replace(/\s+/g, " "), "action", 3, null));
    writes.push(supabase.from("character_state").upsert(texting
      ? { character_id, mood, needs, needs_at: new Date().toISOString(), location: here, current_task: state?.current_task || "idle", updated_at: state?.updated_at || new Date().toISOString() }
      : { character_id, mood, needs, needs_at: new Date().toISOString(), location: go ? go.where : here, current_task: actions[0]?.type || "idle", updated_at: new Date().toISOString() }));
    if (event === "leave") writes.push(supabase.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", session_id));
    await Promise.all(writes);

    return json({ say, to, actions, mood, needs, session_id, model: MODEL, salvaged: !!out.salvaged, recalled: (recalled || []).map((m: { content: string; created_at: string }) => ({ content: m.content, when: ago(m.created_at) })), memory: out.memory || null });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
