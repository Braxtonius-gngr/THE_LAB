# THE_LAB

Photorealistic human-character development and agentic life-simulation platform.
Split out of `social-casino-bliss` (Daily Roll Over) with full history on 2026-10-31.
THE_LAB is now the **source of truth** for the body engine; DRO keeps a pinned snapshot.

## Vision
- An open, authentic (more realistic than The Sims) world populated by **agentic AI characters**, not scripted NPCs.
- Interactions are mostly 1-on-1 or 1-on-2. Bigger groups (house parties) load a separate scene.
- Characters **remember the player across sessions** (memory, relationships, grudges).
- Must work on **mobile** (phone as thin client) and on the dev PC (MSI). Not locked to Three.js long-term; finished characters should also live in Unreal.
- Characters and anatomy first, world second.

## Layout
| Path | What it is |
|---|---|
| `assets/intro3d/` | Body engine: `figure` (bodies/rig), `flesh` (soft tissue), `cloth` + `universal-cloth-material` (garments), `dev-overlay` (tuning panel), `rodin-body` (Rodin mesh skinning). Also `valley`, `table`, `intro`, `burin`, `finish`, `physics`, which the lab pages still use as their stage. |
| `assets/vendor/three/` | Vendored Three.js (no bundler). |
| `lab/` | Tuning pages: `anatomy.html`, `cloth.html`, `rodin.html`, `wish.html`, `pose.html`, `face.html` (face: mood, blink, speech timing, landmarks). |
| `world/` | Agent/world layer: `apartment.html` (any place by `?place=`, first-person, chat/voice), `places.mjs` (each place as data), `mind.mjs` (client for the mind function), `reflexes.mjs` (idle, gaze, walk, sit/lie, clips, holds), `face.mjs` (mood, blinks, glances, visemes; ARKit shapes or the skin path on the fused head), `nav.mjs` (floor grid + A*), `voice.mjs`, `listen.mjs` (songs played to them), `bass.mjs` (Marco's bass, synthesised), `text.html` + `sw.js` + `manifest.webmanifest` (a phone text thread with him, no 3D; push when he texts first), `seats.mjs` (seats derived from the furniture), `poses.json`, `attach-anatomy.mjs`, `retarget.mjs`. |
| `db/migrations/` | Supabase SQL (project `the-lab`, qyphdwcjzhgobsfpeonh). `0001` schema + `recall()`; `0002` seeds Brax + Marco; `0003` knows_name; `0004` needs; `0005` seeds Dante; `0006` life (pg_cron, life_ticks, private key); `0007` voice ids; `0008` life every 2 h, reflect, api_usage; `0009` texts (outbox, session kind `text`); `0010` cache tokens in api_usage; `0011` push subscriptions + VAPID key. |
| `supabase/functions/` | `mind` (recall → Claude → say/actions/mood → memories + relationship), `life` (off-screen life every 2 h, nightly reflection, presence, usage), `voice` (ElevenLabs speak/hear/lyrics), `push` (web push subscriptions, VAPID, inbox for the service worker). Secrets: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`; `MIND_MODEL` optional (default claude-opus-5-5). |

Paths were kept identical to DRO on purpose so nothing broke in the split. Moving the engine to `/engine` is a later, separate change that must update every import.

## Agent architecture (Marco is the first: world/apartment.html)
1. **Body** - existing engine, with phone/MSI quality tiers.
2. **Reflexes** - local, every frame: pathfinding, idle, gaze, personal space, touch reactions.
3. **Mind** - cloud LLM on a slow, event-driven beat; emits dialogue + actions (`walk_to`, `sit_beside`).
4. **Memory** - Supabase; importance-scored, embedded, recalled by relevance+importance+recency.
Party mode: full minds only for the 2-3 "spotlight" characters; everyone else on reflexes + mood, with one end-of-night memory summary each.

## Rules
- No bundler, vanilla ES modules (`.mjs`). Keep it that way unless the owner approves.
- Realism bar: "fun/loose" motion is fine; physically or perspectively wrong is not. Slower, nicer animation beats rushed.
- Male characters in realistic settings get realistic anatomy under clothing, true to size and responding to gravity and pose. Realistic, not suggestive.
- No installs, restructuring, or destructive changes without the owner's explicit approval. Audit and recommend first.
- Dev PC: MSI GE72 (GTX 970M 3 GB, 16 GB RAM) - keep the lab runnable there and on a phone.

## Where things stand
Read `HANDOFF.md` first: current state (lab-v51), credentials/infra notes, the owner's standing constraints, open rough edges, and the agreed next steps. Keep it updated at the end of a session.

## Running
Serve the repo root with any static server (`npx serve .` or `python -m http.server`) and open `/lab/anatomy.html`.
