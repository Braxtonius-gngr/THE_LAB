// Client for the `mind` edge function (supabase/functions/mind).
// The page sends what happened; the function recalls, thinks, remembers, and
// answers with words and actions. Keys here are the project's public anon key:
// the function runs with the service role server-side, the tables have RLS,
// and the lab itself sits behind Cloudflare Access.
export const SUPABASE_URL = 'https://qyphdwcjzhgobsfpeonh.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5cGhkd2Nqemhnb2JzZnBlb25oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1OTUxMzksImV4cCI6MjEwOTE3MTEzOX0.amjwhpx3GG4GSenJ2F0KErfAvZXw7636YAltYfhGlWs';
export const PLAYER_ID = '00000000-0000-4000-8000-000000000001';   // Brax
export const CHARACTERS = { marco: '00000000-0000-4000-8000-000000000101', dante: '00000000-0000-4000-8000-000000000102' };

export class Mind {
  // channel 'text': you're texting him from your phone (world/text.html), not in the room; the
  // function then takes his whereabouts from his own life rather than from the page
  constructor(characterId, { playerId = PLAYER_ID, location = 'marco-apartment', channel = null } = {}) {
    this.characterId = characterId; this.playerId = playerId; this.location = channel === 'text' ? null : location; this.channel = channel;
    this.sessionId = null; this.history = []; this.busy = false;
  }
  // texts he sent you that you haven't seen (his off-screen life can reach out first), and what he's up to
  static async inbox(characterId, playerId = PLAYER_ID) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/mind?character_id=${characterId}&player_id=${playerId}`, { headers: { 'Authorization': `Bearer ${SUPABASE_ANON}`, 'apikey': SUPABASE_ANON } });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || `mind ${r.status}`);
    return d;   // { name, now, since, inbox: [{ id, text, created_at }] }
  }
  // text: what the player said; event: 'arrive' | 'leave'; scene: { time, player_distance_m, spots }
  async send({ text = null, event = null, scene = {} } = {}) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/mind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}`, 'apikey': SUPABASE_ANON },
        body: JSON.stringify({ character_id: this.characterId, player_id: this.playerId, session_id: this.sessionId, text, event,
          scene: { location: this.location, ...(this.channel ? { channel: this.channel } : {}), ...scene }, history: this.history.slice(-12) }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `mind ${r.status}`);
      this.sessionId = d.session_id;
      if (text) this.history.push({ who: 'player', text });
      if (d.say) this.history.push({ who: 'me', text: d.say });
      return d;
    } finally { this.busy = false; }
  }
  // what someone else in the room said, so this mind hears it next turn
  hear(name, text) { if (text) this.history.push({ who: 'other', name, text }); }
}

export const timeOfDay = (d = new Date()) => {
  const h = d.getHours();
  const part = h < 5 ? 'late night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return `${part}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};
