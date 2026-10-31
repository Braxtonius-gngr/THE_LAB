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
| `lab/` | Tuning pages: `anatomy.html`, `cloth.html`, `rodin.html`, `wish.html`. |
| `world/` | Agent/world layer (not started). |
| `db/migrations/` | Supabase SQL. `0001_agent_memory.sql` = characters, memories (pgvector), relationships, character_state, sessions, `recall()`. |

Paths were kept identical to DRO on purpose so nothing broke in the split. Moving the engine to `/engine` is a later, separate change that must update every import.

## Agent architecture (planned)
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

## Running
Serve the repo root with any static server (`npx serve .` or `python -m http.server`) and open `/lab/anatomy.html`.
