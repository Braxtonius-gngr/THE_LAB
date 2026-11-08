# world/

The agent and world layer: the places, the people in them, and the ways to reach them.

| File | What it is |
|---|---|
| `apartment.html` | The scene. `?place=marco` (default) or `?place=dante`: first-person, you walk, talk (typed or by mic), play him a song; the host lives there and the other one comes over at his hours (or `?dante=1` / `?marco=1`). |
| `text.html` | Your phone. `?who=marco` or `?who=dante`: a text thread with him, no 3D. Same mind and memory as the room, so each side remembers the other. He can text first (his off-screen life, below); the page picks it up on open and every minute, and can buzz the phone while it's open. |
| `places.mjs` | Each place as data: room size, Meshy props by floor point and yaw, standing spots, seats, lights, host, guest hours. |
| `props.mjs` | Loads baked props (`assets/props/<id>/{desktop,mobile}.glb`, see `tools/props`). |
| `mind.mjs` | Client for the `mind` edge function: `send({ text, event, scene })`, `hear()` what another mind said, `Mind.inbox()` for texts he sent first. `channel: 'text'` for the phone. |
| `reflexes.mjs` | Local, every frame: idle breathing and weight shifts, gaze, walking (through `nav.mjs`), turning, gestures, sitting, lying, one-off clips, hand-built holds (`poses.json`, tuned on `lab/pose.html`). |
| `nav.mjs` | Pathfinding around the furniture. |
| `garments.mjs` | Dresses a body in fitted Meshy garments (`assets/garments`), inner to outer. |
| `attach-anatomy.mjs`, `retarget.mjs` | The body engine on a rigged model; animation clips carried onto any rig. |
| `voice.mjs`, `listen.mjs` | ElevenLabs voices and ears (browser fallback); the turntable's ear for a song you play. |

Server side (`supabase/functions`): `mind` thinks one turn (recall → Claude → say, actions, mood, memory, relationship), `life` lives the hours between visits every 2 h and reflects nightly, `voice` speaks. Schema in `db/migrations`.
