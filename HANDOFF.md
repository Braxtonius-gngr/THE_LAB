# HANDOFF — state of THE_LAB as of lab-v51 (2026-11-07, evening)

Written for the next Claude session (Claude Code). Read `CLAUDE.md` first for the rules; this is where things stand and what's next.

## What exists and works

**Two apartments, one page.** `world/apartment.html?place=marco` (default) or `?place=dante`. Each place is data in `world/places.mjs`: room size, props (floor-centre + yaw), standing spots, seats (where hips go to sit/lie), lights, host, guest hours. A third place is a new entry there, not a new page.

**Two residents.** Marco (bartender, downtown studio, `adult-base-01` body) and Dante (line cook at the same bar, West Side one-bedroom, `dante` body). Each has: body + anatomy (`world/attach-anatomy.mjs`, seeded per character), a wardrobe chosen by the hour (`garments.json` outfits), reflexes (`world/reflexes.mjs`), a mind (`world/mind.mjs` → Supabase `mind` function), memories, and a relationship with the player and with each other.

**Reflexes** (`world/reflexes.mjs`): idle breathing/sway, gaze, walk (around furniture via `world/nav.mjs` A* on a 10 cm grid), sit on sofa, lie on bed, stand, one-shot clips (drink / phone / stretch), hand-built holds (cross_arms, lean_counter, play_bass; numbers in `world/poses.json`, tuned on `lab/pose.html`), nod-on-beat while music plays. Two Meshy animation packs (`assets/anims/meshy-pack-01/02.glb`).

**Minds** (Supabase edge function `mind`, v14, model `claude-opus-5-5`): recall (pgvector, gte-small) → think → say/actions/mood/needs/memory/relationship. Actions include `go` (he leaves: walks out the door, location updated). Events: arrive, leave, overheard, song, someone_arrives, someone_leaves. Each one hears what the other says (`Mind.hear()`); you talk to whoever you face.

**Off-screen life** (edge function `life`, v12; `db/migrations/0006`, `0008`): pg_cron every 2 h lives the hours since the last tick for everyone in one call (between 2 and 8 am with everyone asleep it skips: no model call, no tick, the morning tick lives the night in one go; `{"force":true}` or a `note` runs it anyway) (own day + texts/time together), writes memories, needs, moods, relationship takes, **and where each man is** (`marco-apartment` / `dante-apartment` / `the-bar` / `out`). Nightly 4:30 am reflection. `GET life` → ticks + this month's Claude spend; `GET life?who=1` → everyone's location; `GET life?skill=bass` → Marco's bass skill from logged practice.

**Two minds in a room** (PR #2). Every `mind` reply says who it's for (`to`: `player` or the other one's name); the page makes him look at that person, and a line said to the other one gets answered (two turns between them at most, then it's yours again). After ~35 s of quiet with both present one of them may start something (`event: 'chat'`), twice, then they wait on you. What the others said since his last turn goes up as `heard` and becomes his memories. The prompt is two system blocks: stable (persona + how to answer, `cache_control`) then the moment; `api_usage` logs cache reads/writes (migration `0010`), priced in the counter. Mind v16, life v9. PR #3: a reply may carry `friend` (how the moment moved his take on the friend in the room, ±0.1, applied to their relationship row), and a standing character gives a half-step back when someone is closer than ~0.55 m (`reflexes._crowded`, `nav.freeAt`). Mind v17.

**Push** (PR #3). The bell on `world/text.html` subscribes the phone to web push; `supabase/functions/push` keeps subscriptions (`push_subscriptions`, migration `0011`) and the VAPID key pair, which it makes on first use and stores in `private.vapid` (read through `vapid_get`/`vapid_set`, service role only - nothing secret in the repo or in chat). Pushes carry no payload: `world/sw.js` fetches `push?inbox=1` (unseen texts, not marked seen) and shows one notification per text; tapping opens that thread. `life` buzzes after writing a text to the outbox. iPhone: web push only from a Home Screen install (`world/manifest.webmanifest`, icons in `assets/icons`). `webpush.ts` is copied into both `push` and `life` (edge functions can't share files through the MCP deploy).

**Presence.** The page spawns only who is actually there (`?who=1`), and where his life left him: asleep → in bed (the host) or out on the couch (a guest), "on the couch" → sitting there, kitchen words → the kitchen spot; otherwise the usual spawn. His first turn knows what he was doing ("just before this you were asleep in bed"). `?doing_marco=asleep%20in%20bed` tries it without the live world. Empty place says where the host is. Polls every 2 min for comings/goings. `?marco=1` / `?dante=1` force presence, `?alone=1` forces host alone.

**Voice** (`world/voice.mjs` + edge function `voice`): ElevenLabs `eleven_v4_turbo`; Marco = voice "Will" (bIHbv24MWmeRgasZH58o), Dante = "Liam" (TX3LPaxmHKxFdv7VOQHJ), pinned in `characters.voice_id`. Mic → Scribe (tap to start, tap to send). Falls back to browser speech if the API fails. Secret `ELEVENLABS_API_KEY` is set. Account is Starter (40k credits/mo).

**Music.** `world/listen.mjs`: play a file from the device on the room's speaker; the page analyses the audio (tempo, drops, loudness curve), characters nod on the beat, and at the end the addressed mind gets the whole picture (+ lyrics: pasted, or transcribed by Scribe) and reacts once. `world/bass.mjs`: Marco's bass is synthesised (Karplus-Strong + bass-amp voicing), three original riffs with verse/bridge, learner timing scaled by skill.

**Props.** `assets/props/<id>/{desktop,mobile}.glb`, catalog `props.json`. Dante's set is prefixed `d-`. `tools/props/bake.mjs` now has triangle budgets (`DESK_TRIS`/`MOB_TRIS`, default 40k/12k) because the latest Meshy exports were 0.2–7.8 M tris.

**Usage counter.** `api_usage` table; Memories panel shows "Claude this month: ~$X of $95".

**Texts** (`world/text.html?who=marco|dante`; PR #1, branch `claude/trusting-bell-6v138o`). A phone text thread with either of them, no 3D, same mind and memory as the room. `scene.channel = 'text'` in the `mind` function: he answers in his texting voice from wherever his life has him, no body actions, his location/task untouched; the thread is a session of kind `text` (not a visit). `GET mind?character_id&player_id` → what he's up to + texts he sent first (`outbox`, migration `0009`): the `life` tick may have one who knows Brax's name text him (`texts_to_brax`). On open (and when it comes back to the front) the page merges the thread as he remembers it (`GET mind?...&thread=1`: his and your texts from the text sessions' memories plus `outbox`), so a new phone, the tablet and the PC all show the same conversation. The page polls every minute while open and can buzz the phone (Notification API, page open only; real push is a later item). Live: `mind` v15, `life` v8 carry both this and the `go`/presence work.

## Credentials / infra
- Supabase project `qyphdwcjzhgobsfpeonh`. Secrets set in dashboard: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`. Never take keys through chat.
- Deploy edge functions by pasting full file content (MCP) or `supabase functions deploy`. `verify_jwt`: mind/voice true, life false (own key in `private.life_key`).
- Git: author `Claude <noreply@anthropic.com>`; commit trailer `Co-Authored-By` + `Claude-Session` lines; push to `main`; bump `VERSION`. Repo moved to `Braxtonius-gngr/THE_LAB` (push still redirects).
- Destructive DB deletes: give the owner SQL to run; the MCP client auto-cancels them.
- **Two sessions deploying the same functions clobber each other** (happened 2026-11-08: a deploy from one branch dropped the text channel for 20 min). Before deploying `mind` or `life`, fetch the live version (`get_edge_function`) and make sure what you deploy is a superset of it; deploy from a branch that has `main` merged in.

## Owner's standing constraints (hold these)
- Anatomy only on characters who unmistakably read as adults. No sexual interaction systems, no arousal simulation, no "debauchery" need (declined twice). Intimacy = closeness/affection only.
- Realism bar: loose/fun motion fine; perspectively wrong is not. Slower and nicer beats rushed.
- No bundler, vanilla ES modules. No installs/restructuring without approval.
- Gorge/State arousal slider: do not debug or extend. Owner's `flesh.mjs` arousalScale left as written.

## Open items / known rough edges
- **Hand-built poses** (cross_arms, play_bass) still look off; owner tunes on `lab/pose.html` and pastes numbers → commit to `world/poses.json`.
- **Dante's olive graphic tee** has dark texture patches (Meshy). Regen prompt was given.
- **Three heavy props** resist simplification (shard meshes): `d-turntablecrate` (80k tris), `d-herbpots` (55k), `d-boxfan` (60k). Regen prompts given (low-poly).
- **Missing Dante props:** gym bag, mail stack, burn-scarred towel. Prompts given.
- **The bar** (third place) needs a Meshy props batch; no prompt list written yet.
- **Workers Builds for pull requests** run `wrangler preview`, which needs the `previews: {}` block in `wrangler.jsonc` (added in PR #1). Production deploys from `main` never needed it.
- Headless renders: use `tools/lab-fit/render.cjs` + `tools/props/view.html`; run at most ~4 browsers in parallel (12 crashed the box). Playwright is at `/home/claude/.npm-global/lib/node_modules/playwright` in this container; locally just `require('playwright')`.
- Both men are at `the-bar` Saturday evenings; apartments are empty then until the bar exists. Use `?marco=1` etc. to force.

- **There is no party scene yet.** The "party mode" in CLAUDE.md (spotlight minds + reflex crowd, a separate scene) is architecture, not code; what exists is two men in one room (host + guest) with the `chat`/`addressed`/`overheard` turns. A party page needs the bar or a bigger room first.

## Agreed next steps (owner's order)
1. ~~Furniture-aware reactions~~ done in PR #3: `world/seats.mjs` derives seats from the prop list + catalog sizes (sofa ends, armchair, chairs, beanbag, bed with a side, counter lean spot); a place's hand `seats` still override; `?derived=1` to compare. Checked by eye in headless renders of both places. The `RULES` table in that file is where a new prop kind gets its seat.
2. **The bar on the river** — third place; needs props brief + build; then presence works for evenings.
3. **Faces** — assessed 2026-11-08 (bodies: one fused mesh each, no face bones, no morph targets, eyes painted; the head gets ~740 px of the 4K body map on desktop, ~420 on the phone). Chosen: route 1, ARKit blendshapes made in Blender with Faceit on a split-off head mesh (owner's time: ~2 h for the first head). The code side is in: `world/face.mjs` (mood → shapes, blinks, glances, visemes from ElevenLabs timing via `voice` `timing: true`, head motion for bodies without shapes), `lab/face.html` (tuning page), `tools/face/check.mjs` + `tools/face/README.md` (the Blender steps and what the code expects). Route 2 (the bridge) is in too: the skin path in `world/face.mjs` does lids (blinks, heavy lids), brows and iris glances on the fused head through a patch on the body's material, from eye/brow anchors in `bodies.json` `face` (picked for Marco and Dante; re-pick on `lab/face.html` → Landmarks; same anchors work on the phone mesh), plus a mouth stopgap (jaw drop on the vowels, lip line opening dark, corners with the mood; small on purpose; `lab.face.mouth` = 0 turns it off). The real mouth waits for Faceit shapes (owner buys it after 2026-11-14). Route 3 (rebuild on MetaHuman/Character Creator; Mesh to MetaHuman carries the likeness; MetaHumans may be used outside Unreal since June 2025) is the Unreal-era plan, not now: the wardrobe and anatomy fits are tied to the current meshes.
4. When props arrive: bake Dante's missing three + regen heavy three; regen tee; place them (`world/places.mjs` dante entry).

## Quick test recipes
```
python3 -m http.server 8765     # repo root
# Marco home, Dante over:   /world/apartment.html?marco=1&dante=1
# Dante's, Marco over:      /world/apartment.html?place=dante&dante=1&marco=1
# quiet (no arrive call):   add &quiet=1
# poses:                    /lab/pose.html
# window.__world exposes RES, arrive(key), depart(R), bassSound, listener, voice, nav
```
