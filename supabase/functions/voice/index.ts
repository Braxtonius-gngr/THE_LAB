// THE_LAB · voice: real voices and real ears, through ElevenLabs.
//
// POST JSON { action: 'speak', character_id, text }       -> audio/mpeg (his voice saying it)
// POST JSON { action: 'voices' }                           -> the account's voices, for choosing
// POST JSON { action: 'set_voice', character_id, voice_id } -> pin a voice to a character
// POST form-data { action: 'hear', audio }                 -> { text } (what you said, from the mic)
// POST form-data { action: 'lyrics', audio }               -> { text } (the words sung in a song)
//
// Each character keeps one voice (characters.voice_id). The first time he speaks, one is picked
// from the account's library to fit him (a man's voice, conversational, American; a different
// one for each character) and saved, so he always sounds like himself. The key lives in the
// ELEVENLABS_API_KEY secret. Any failure answers with an error, and the page falls back to the
// browser's own voice, so a spent month of credits never leaves anyone mute.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const XI = "https://api.elevenlabs.io/v1";
const TTS_MODEL = Deno.env.get("XI_TTS_MODEL") || "eleven_multilingual_v2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const key = () => { const k = Deno.env.get("ELEVENLABS_API_KEY"); if (!k) throw new Error("ELEVENLABS_API_KEY is not set"); return k; };

// how each one should sound, for picking from the library (and his delivery settings)
const FIT: Record<string, { want: RegExp; settings: Record<string, number> }> = {
  Marco: { want: /casual|conversational|warm|calm|relaxed|friendly|smooth/i, settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, speed: 0.97 } },
  Dante: { want: /casual|confident|deep|gritty|husky|energetic|conversational/i, settings: { stability: 0.38, similarity_boost: 0.8, style: 0.4, speed: 1.04 } },
};

async function voices() {
  const r = await fetch(`${XI}/voices`, { headers: { "xi-api-key": key() } });
  if (!r.ok) throw new Error(`voices ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()).voices || []) as { voice_id: string; name: string; labels?: Record<string, string>; description?: string; category?: string }[];
}

async function voiceFor(c: { id: string; name: string; voice_id?: string | null }) {
  if (c.voice_id) return c.voice_id;
  const all = await voices(), { data: taken } = await db.from("characters").select("voice_id").not("voice_id", "is", null);
  const used = new Set((taken || []).map((t) => t.voice_id)), fit = FIT[c.name] || FIT.Marco;
  const score = (v: (typeof all)[number]) => {
    const L = v.labels || {}, txt = `${Object.values(L).join(" ")} ${v.description || ""} ${v.name}`;
    return (/male/i.test(L.gender || "") && !/female/i.test(L.gender || "") ? 10 : -20) + (/american/i.test(L.accent || "") ? 3 : 0)
      + (/young|middle/i.test(L.age || "") ? 2 : 0) + (fit.want.test(txt) ? 3 : 0) + (/conversational|social|narrative/i.test(L.use_case || L["use case"] || "") ? 1 : 0)
      - (used.has(v.voice_id) ? 30 : 0);
  };
  const pick = all.sort((a, b) => score(b) - score(a))[0]; if (!pick) throw new Error("no voices on the account");
  await db.from("characters").update({ voice_id: pick.voice_id, voice_name: pick.name }).eq("id", c.id);
  return pick.voice_id;
}

async function transcribe(audio: File, music = false) {
  const f = new FormData(); f.append("model_id", "scribe_v1"); f.append("file", audio, audio.name || "audio.webm");
  f.append("tag_audio_events", music ? "false" : "true"); if (!music) f.append("language_code", "en");
  const r = await fetch(`${XI}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key() }, body: f });
  if (!r.ok) throw new Error(`hear ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return String(d.text || "").replace(/\((?:[^)]*)\)/g, "").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // the mic and songs come as form-data
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData(), action = String(form.get("action") || "hear"), audio = form.get("audio");
      if (!(audio instanceof File)) return json({ error: "no audio" }, 400);
      if (audio.size > 25 * 1024 * 1024) return json({ error: "too big (25 MB max)" }, 413);
      return json({ text: await transcribe(audio, action === "lyrics") });
    }
    const b = await req.json();
    if (b.action === "voices") return json({ voices: (await voices()).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels, description: v.description })) });
    if (!b.character_id) return json({ error: "character_id required" }, 400);
    const { data: c } = await db.from("characters").select("id,name,voice_id").eq("id", b.character_id).single();
    if (!c) return json({ error: "unknown character" }, 404);
    if (b.action === "set_voice") { await db.from("characters").update({ voice_id: b.voice_id || null }).eq("id", c.id); return json({ ok: true }); }
    // speak
    const text = String(b.text || "").slice(0, 600).trim(); if (!text) return json({ error: "nothing to say" }, 400);
    const vid = await voiceFor(c), fit = FIT[c.name] || FIT.Marco;
    const r = await fetch(`${XI}/text-to-speech/${vid}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: fit.settings }) });
    if (!r.ok) return json({ error: `speak ${r.status}: ${(await r.text()).slice(0, 200)}` }, r.status === 401 || r.status === 429 ? 402 : 502);
    return new Response(r.body, { headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
