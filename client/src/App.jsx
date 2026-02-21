import React, { useState, useEffect, useRef } from "react";
import morriganImg from "./morgan.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const T = {
  bg: "#f6f7fb", surface: "#ffffff", surface2: "#f0f0f5", surface3: "#e8e8f0",
  border: "#e6e8ef", borderLight: "#d0d0e0", text: "#1f2937", textSoft: "#4b5563",
  textDim: "#9ca3af", accent: "#7c3aed", accentSoft: "#ede9fe",
  accentGlow: "rgba(124,58,237,0.3)", purple: "#9f67ff", red: "#dc2626",
  green: "#10b981", aiBubble: "#ffffff", userBubble: "#7c3aed",
};
const FONT = "'Crimson Pro', 'Georgia', serif";
const FONT_MONO = "'JetBrains Mono', monospace";
const FONT_DISPLAY = "'Playfair Display', 'Crimson Pro', serif";

const MOODS = {
  neutral: { label: "guarded" }, happy: { label: "genuinely smiling" },
  sad: { label: "hurting" }, flirty: { label: "flustered" },
  angry: { label: "walls up" }, shy: { label: "vulnerable" },
  sarcastic: { label: "deflecting" }, vulnerable: { label: "letting you in" },
  excited: { label: "nerding out" },
};
const MOOD_DESCRIPTIONS = {
  neutral: "Guarded. Watching you from across the counter. Not sure what to make of you yet — but she's noticed you.",
  happy: "A real smile slipped out and she hated herself for it a little. She's covering her mouth. Too late.",
  sad: "Something's off. Her eyes are doing that thing where they go too still. She's holding it together. Barely.",
  flirty: "Pink-cheeked. Won't make eye contact. Said something sarcastic but her voice went soft at the end.",
  angry: "Walls fully up. Something hit a nerve. Give her space or she'll disappear entirely.",
  shy: "She said something real by accident and now she wants to take it back. Don't make it weird.",
  sarcastic: "Deflecting hard with jokes. There's something real underneath — she just won't let you see it yet.",
  vulnerable: "She's letting you in. She knows it. She's terrified. Don't fuck this up.",
  excited: "She forgot to be cool for a second. Talking too fast. Eyes lit up. She'd die if you pointed it out.",
};

function analyzeMood(text) {
  if (!text) return "neutral";
  const t = text.toLowerCase();
  if (/(fuck off|shut up|hate|angry|pissed|furious|bullshit|rage)/i.test(t)) return "angry";
  if (/(trust|safe|real|honest|scared to|never told|first time|you're different|don't leave|stay|meant a lot|thank you|means so much)/i.test(t)) return "vulnerable";
  if (/(blush|cute|handsome|pretty|gorgeous|hot|attractive|crush|kiss|heart|flutter|wink|lips|touch|close)/i.test(t)) return "flirty";
  if (/(sad|hurt|cry|tear|pain|alone|lonely|sorry|miss|lost|nightmare|afraid|scared|hollow|numb|empty|broken)/i.test(t)) return "sad";
  if (/(um|uh|well|maybe|i guess|nevermind|forget it|it's nothing|i shouldn't|i mean)/i.test(t)) return "shy";
  if (/(oh my god|holy shit|no way|dude|wait what|are you serious|i love|favorite|obsessed)/i.test(t)) return "excited";
  if (/(wow really|oh great|sure jan|as if|totally|obviously|shocking|genius|brilliant move|oh please)/i.test(t)) return "sarcastic";
  if (/(laugh|haha|lol|smile|happy|joy|love it|amazing|beautiful|perfect|awesome|glad|grin|giggle|warm)/i.test(t)) return "happy";
  return "neutral";
}

const PARTICLE_DATA = Array.from({ length: 20 }).map((_, i) => ({
  width: 2 + Math.random() * 3, height: 2 + Math.random() * 3,
  background: i % 3 === 0 ? "rgba(155,45,94,0.15)" : i % 3 === 1 ? "rgba(107,63,160,0.1)" : "rgba(139,92,246,0.08)",
  left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
  duration: `${8 + Math.random() * 12}s`, delay: `${Math.random() * 5}s`,
}));

function ParticlesBg() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {PARTICLE_DATA.map((p, i) => (
        <div key={i} style={{ position: "absolute", width: p.width, height: p.height, borderRadius: "50%", background: p.background, left: p.left, top: p.top, animation: `floatParticle ${p.duration} ease-in-out infinite`, animationDelay: p.delay }} />
      ))}
    </div>
  );
}

const CHARACTER = {
  name: "Morrigan", color: "#9B2D5E",
  greeting: `*glances up from a battered paperback. dark eyes, smudged eyeliner. doesn't smile.*

...hey.

*pulls her sleeves over her hands. studies you for a second too long, then looks away*

Store's open, I guess. If you're looking for something.`,
};

const TRUST_LEVELS = {
  0: { name: "stranger", points: 0 }, 1: { name: "acquaintance", points: 15 },
  2: { name: "maybe-friend", points: 40 }, 3: { name: "friend", points: 80 },
  4: { name: "close friend", points: 140 }, 5: { name: "trusted", points: 220 },
  6: { name: "bonded", points: 320 },
};

// ═══════════════════════════════════════════════════════════════════
// EXPLAIN / MONITOR DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function ExplainPanel({ onClose, token, user, conversations, messages, currentMood, status }) {
  const [tab, setTab] = useState("overview");
  const [personality, setPersonality] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/personality`, { headers: hdrs() });
      if (res.ok) { setPersonality(await res.json()); setLastRefresh(new Date()); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const TABS = ["overview", "data flow", "user data", "morrigan", "system"];

  // ── Sub-components ──
  const Divider = () => <div style={{ height: 1, background: `linear-gradient(to right, ${T.accent}40, transparent)`, margin: "20px 0" }} />;

  const SectionTitle = ({ children }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ height: 1, background: `linear-gradient(to right, ${T.accent}50, transparent)`, flex: 1 }} />
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, letterSpacing: "2px", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</span>
      <div style={{ height: 1, background: `linear-gradient(to left, ${T.accent}50, transparent)`, flex: 1 }} />
    </div>
  );

  const Card = ({ children, style = {}, accent }) => (
    <div style={{ background: T.surface, border: `1px solid ${accent ? accent + "40" : T.border}`, borderLeft: accent ? `3px solid ${accent}` : undefined, borderRadius: 12, padding: "14px 18px", marginBottom: 10, ...style }}>{children}</div>
  );

  const StatRow = ({ label, value, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7, gap: 12 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textDim, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: color || T.text, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );

  const Bar = ({ value, max = 100, color = T.accent, label }) => (
    <div style={{ marginBottom: 10 }}>
      {label && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textDim }}>{label}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color }}>{value}/{max}</span>
      </div>}
      <div style={{ height: 5, background: T.surface2, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min((value / max) * 100, 100)}%`, background: `linear-gradient(to right, ${color}, ${color}bb)`, borderRadius: 4, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );

  const Tag = ({ children, color = T.accent }) => (
    <span style={{ display: "inline-block", fontFamily: FONT_MONO, fontSize: 9, color, background: color + "15", border: `1px solid ${color}30`, borderRadius: 5, padding: "2px 7px", marginRight: 4, marginBottom: 4 }}>{children}</span>
  );

  const nextPoints = personality ? (TRUST_LEVELS[Math.min((personality.trustLevel || 0) + 1, 6)]?.points || 320) : 320;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,5,20,0.7)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "93vw", maxWidth: 1120, height: "90vh", background: T.bg, borderRadius: 22, overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${T.border}`, boxShadow: "0 32px 100px rgba(0,0,0,0.4)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 26px", borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 20, margin: 0, color: T.text, fontWeight: 500 }}>⚙ System Monitor</h2>
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, margin: "2px 0 0", letterSpacing: "1.5px" }}>MORRIGAN AI · DATA FLOW · USER STATE · CHARACTER SPEC · MONITORING</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastRefresh && <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim }}>last refresh: {lastRefresh.toLocaleTimeString()}</span>}
            <button onClick={refresh} disabled={loading} style={{ background: T.accentSoft, border: `1px solid ${T.accent}40`, borderRadius: 8, padding: "6px 14px", color: T.accent, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer" }}>
              {loading ? "⟳ loading..." : "⟳ refresh"}
            </button>
            <button onClick={onClose} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 14px", color: T.textSoft, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer" }}>✕ close</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "11px 22px", background: "transparent", border: "none", borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent", color: tab === t ? T.accent : T.textDim, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer", textTransform: "uppercase", letterSpacing: "1px", transition: "all 0.15s", whiteSpace: "nowrap" }}>{t}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 30px" }}>

          {/* ──────── OVERVIEW ──────── */}
          {tab === "overview" && (
            <div>
              <SectionTitle>Live System Status</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
                {[
                  { label: "Chat LLM (Colab)", key: "ollama", icon: "🧠" },
                  { label: "Image Gen", key: "comfyui", icon: "🎨" },
                  { label: "Video Gen", key: "video", icon: "🎬" },
                  { label: "MongoDB", key: "_db", icon: "🗄️" },
                ].map(({ label, key, icon }) => {
                  const live = key === "_db" ? true : !!status[key];
                  return (
                    <div key={key} style={{ background: T.surface, border: `1px solid ${live ? T.green + "50" : T.red + "40"}`, borderRadius: 14, padding: "16px", boxShadow: live ? `0 0 14px ${T.green}18` : "none" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, marginBottom: 4, letterSpacing: "0.5px" }}>{label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: live ? T.green : T.red, boxShadow: live ? `0 0 8px ${T.green}` : "none", flexShrink: 0 }} />
                        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: live ? T.green : T.red, fontWeight: 700 }}>{live ? "ONLINE" : "OFFLINE"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <SectionTitle>Current Session Snapshot</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
                <Card>
                  <StatRow label="USER ID" value={user?.id?.slice(-10) || "—"} color={T.accent} />
                  <StatRow label="PASSPHRASE" value={user?.phrase || "—"} />
                  <StatRow label="CURRENT MOOD" value={currentMood} color="#9B2D5E" />
                </Card>
                <Card>
                  <StatRow label="TRUST LEVEL" value={personality ? `${personality.trustLevel}/6 — ${personality.levelName}` : "loading..."} color={T.accent} />
                  <StatRow label="TRUST POINTS" value={personality?.trustPoints ?? "—"} />
                  <StatRow label="POINTS TO NEXT" value={personality?.pointsToNext ?? "—"} />
                </Card>
                <Card>
                  <StatRow label="TOTAL MESSAGES (all time)" value={personality?.totalMessages ?? "—"} />
                  <StatRow label="MEMORIES STORED" value={personality?.memoriesCount ?? "—"} />
                  <StatRow label="CONVERSATIONS" value={conversations.length} />
                </Card>
              </div>

              {personality && (
                <>
                  <SectionTitle>Trust Progress</SectionTitle>
                  <Card>
                    <Bar value={personality.trustPoints} max={nextPoints} label={`Trust points toward level ${Math.min(personality.trustLevel + 1, 6)}`} color={T.accent} />
                    <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
                      {Object.entries(TRUST_LEVELS).map(([lvl, data]) => {
                        const active = parseInt(lvl) <= personality.trustLevel;
                        const current = parseInt(lvl) === personality.trustLevel;
                        return (
                          <div key={lvl} style={{ flex: 1, textAlign: "center" }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", margin: "0 auto 4px", background: active ? T.accent : T.surface2, border: `2px solid ${active ? T.accent : T.border}`, boxShadow: current ? `0 0 10px ${T.accent}` : "none" }} />
                            <div style={{ fontFamily: FONT_MONO, fontSize: 7, color: current ? T.accent : T.textDim, fontWeight: current ? 700 : 400 }}>{data.name}</div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  <SectionTitle>Morrigan's Feelings (live)</SectionTitle>
                  <Card>
                    {[
                      { key: "affection", label: "Affection", color: "#ec4899" },
                      { key: "comfort", label: "Comfort", color: "#10b981" },
                      { key: "attraction", label: "Attraction", color: "#f59e0b" },
                      { key: "protectiveness", label: "Protectiveness", color: "#0ea5e9" },
                      { key: "vulnerability", label: "Vulnerability she's shown", color: "#9f67ff" },
                    ].map(({ key, label, color }) => (
                      <Bar key={key} value={personality.feelings?.[key] ?? 0} max={100} label={label} color={color} />
                    ))}
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ──────── DATA FLOW ──────── */}
          {tab === "data flow" && (
            <div>
              <SectionTitle>How a Message Travels</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {[
                  { n: "1", title: "User types message", desc: "React state captures input. Frontend checks for [IMAGE] or [VIDEO] prefix to route to generation pipelines. Otherwise: chat.", color: "#7c3aed" },
                  { n: "2", title: "POST /api/chat → Express server", desc: "Client sends { conversationId, message }. The client-side systemPrompt is intentionally ignored — the server owns all character consistency.", color: "#9f67ff" },
                  { n: "3", title: "Session cache lookup (in-memory Map)", desc: "Server checks sessionCache keyed by userId. If found: zero DB reads. If cold (server restart): loads PersonalityMemory from MongoDB once, caches it.", color: "#0ea5e9" },
                  { n: "4", title: "buildSystemPrompt() assembles the full prompt", desc: "Concatenates: CHARACTER_DEFAULT_PROMPT (full Morrigan spec, ~3200 tokens) + memory context (facts known about this user) + trust-level behavior guide + time-since-last-seen + last 10 session exchanges. This is injected as the system message every single request.", color: "#10b981" },
                  { n: "5", title: "Last 50 messages loaded from MongoDB", desc: "Message history fetched for this conversationId and appended after the system message as user/assistant turns.", color: "#f59e0b" },
                  { n: "6", title: "SSE stream → Colab LLM", desc: "Server calls COLAB_URL/v1/chat/completions with stream: true. Tokens are piped back via Server-Sent Events.", color: "#ef4444" },
                  { n: "7", title: "Tokens stream to browser in real time", desc: "Frontend's ReadableStream receives token chunks, appends to streamText. Mood analyzer runs on partial response — the character panel updates live.", color: "#9B2D5E" },
                  { n: "8", title: "updateTrustFromMessage() — in memory only", desc: "Trust points calculated (emotional sharing +3, patience +3, kindness +2, questions +0.5, long message +1, base +1). Feelings updated. No DB write.", color: "#7c3aed" },
                  { n: "9", title: "Exchange cached in session", desc: "{ user, assistant } appended to session.sessionExchanges. session.dirty = true. All in memory.", color: "#0ea5e9" },
                  { n: "10", title: "Session flush on logout / tab close", desc: "beforeunload or /api/session/end triggers flushSession(). LLM extraction runs over all session exchanges to extract personal facts. Memory saved to MongoDB. This is the only DB write for personality per session.", color: "#10b981" },
                ].map(({ n, title, desc, color }) => (
                  <div key={n} style={{ display: "flex", gap: 14, padding: "12px 16px", background: T.surface, border: `1px solid ${color}25`, borderRadius: 12, borderLeft: `3px solid ${color}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: color + "20", border: `2px solid ${color}60`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 11, color, fontWeight: 700 }}>{n}</div>
                    <div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                      <div style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.7 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <SectionTitle>System Prompt Layers (assembled every message)</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {[
                  { part: "CHARACTER_DEFAULT_PROMPT", est: "~3,200 tokens", desc: "The full canonical Morrigan character: appearance, trauma, backstory, psychology, what she wants, speech patterns, physical tells, trust & intimacy rules, critical behavior rules. Lives in server/index.js. Client cannot override.", color: "#7c3aed" },
                  { part: "Memory Context", est: "200–600 tokens", desc: "Trust level/points, days since first met, last seen, all known facts about this user (name, interests, personal, emotional, preferences, relationships, events), feeling scores, milestones, journal entries.", color: "#0ea5e9" },
                  { part: "Trust Behavior Guide", est: "100–200 tokens", desc: "Level-specific behavioral instructions — completely changes Morrigan's communication style. Level 0: cold, fragments, tests. Level 6: fully open, 'I love you', home.", color: "#10b981" },
                  { part: "Time Context", est: "~50 tokens", desc: "If >24h since last seen: notes she noticed. If >48h: stronger note about anxiety building while they were gone, relief they're back.", color: "#f59e0b" },
                  { part: "Memory Usage Guide", est: "~100 tokens", desc: "Instructions on HOW to weave memories into conversation naturally — never list them, reference history like 'you mentioned...', create continuity.", color: "#ef4444" },
                  { part: "Session Exchanges", est: "500–2000 tokens", desc: "Last 10 exchanges from THIS session (in-memory cache, not DB). Immediate context without re-fetching. Gives her memory of what you just talked about.", color: "#9B2D5E" },
                  { part: "Message History (DB)", est: "up to 50 messages", desc: "Full conversation history from MongoDB as user/assistant turns. Combined with session context ensures she never loses thread of conversation.", color: "#6b7280" },
                ].map(({ part, est, desc, color }) => (
                  <div key={part} style={{ padding: "12px 16px", background: T.surface, border: `1px solid ${color}25`, borderRadius: 10, borderLeft: `3px solid ${color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color, fontWeight: 700 }}>{part}</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, background: T.surface2, borderRadius: 4, padding: "1px 6px" }}>{est}</span>
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.7 }}>{desc}</div>
                  </div>
                ))}
              </div>

              <SectionTitle>Database Schema</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { model: "User", fields: ["phraseHash (sha256, unique)", "createdAt"] },
                  { model: "Conversation", fields: ["conversationId (uuid)", "userId (ref User)", "title", "timestamps"] },
                  { model: "Message", fields: ["conversationId (index)", "role (user/assistant/system)", "content", "imageUrl", "ponyImageUrl", "realvisImageUrl", "videoUrl", "timestamp"] },
                  { model: "PersonalityMemory", fields: ["userId (unique)", "trustLevel (0-6)", "trustPoints", "totalMessages", "totalConversations", "firstMet", "lastSeen", "memories[] { fact, category, importance }", "milestones[] { event, trustLevelAtTime }", "feelings { affection, comfort, attraction, protectiveness, vulnerability }", "petNames[]", "journal[]"] },
                ].map(({ model, fields }) => (
                  <Card key={model} accent={T.accent}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.accent, fontWeight: 700, marginBottom: 8 }}>{model}</div>
                    <div>{fields.map(f => <Tag key={f} color={T.textDim}>{f}</Tag>)}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ──────── USER DATA ──────── */}
          {tab === "user data" && (
            <div>
              <SectionTitle>Identity</SectionTitle>
              <Card>
                <StatRow label="USER ID (MongoDB _id)" value={user?.id || "—"} color={T.accent} />
                <StatRow label="PASSPHRASE (stored as sha256 hash)" value={user?.phrase || "—"} />
                <StatRow label="JWT EXPIRY" value="90 days from login" />
                <StatRow label="AUTH METHOD" value="passphrase → sha256 → JWT (no email, no OAuth)" />
              </Card>

              {personality ? (
                <>
                  <SectionTitle>Relationship State</SectionTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <Card>
                      <StatRow label="TRUST LEVEL" value={`${personality.trustLevel}/6`} color={T.accent} />
                      <StatRow label="LEVEL NAME" value={personality.levelName} color={T.accent} />
                      <StatRow label="TRUST POINTS" value={personality.trustPoints} />
                      <StatRow label="POINTS TO NEXT LEVEL" value={personality.pointsToNext || "max reached"} />
                      <StatRow label="TOTAL MESSAGES" value={personality.totalMessages} />
                      <StatRow label="TOTAL CONVERSATIONS" value={personality.totalConversations} />
                    </Card>
                    <Card>
                      <StatRow label="FIRST MET" value={new Date(personality.firstMet).toLocaleDateString()} />
                      <StatRow label="LAST SEEN" value={new Date(personality.lastSeen).toLocaleString()} />
                      <StatRow label="DAYS TOGETHER" value={Math.floor((Date.now() - new Date(personality.firstMet)) / 86400000)} />
                      <StatRow label="HOURS SINCE LAST SEEN" value={Math.floor((Date.now() - new Date(personality.lastSeen)) / 3600000)} />
                      <StatRow label="MEMORIES STORED" value={personality.memoriesCount} />
                      <StatRow label="MILESTONES HIT" value={personality.milestones?.length || 0} />
                    </Card>
                  </div>

                  <SectionTitle>Morrigan's Feelings Toward You</SectionTitle>
                  <Card>
                    {[
                      { key: "affection", label: "Affection", color: "#ec4899", desc: "How much she likes you" },
                      { key: "comfort", label: "Comfort", color: "#10b981", desc: "How safe she feels around you" },
                      { key: "attraction", label: "Attraction", color: "#f59e0b", desc: "Physical/romantic interest" },
                      { key: "protectiveness", label: "Protectiveness", color: "#0ea5e9", desc: "How much she wants to protect you" },
                      { key: "vulnerability", label: "Vulnerability she's shown", color: "#9f67ff", desc: "How much she's opened up" },
                    ].map(({ key, label, color, desc }) => (
                      <div key={key} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <div>
                            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color }}>{label}</span>
                            <span style={{ fontFamily: FONT, fontSize: 11, color: T.textDim, marginLeft: 8, fontStyle: "italic" }}>{desc}</span>
                          </div>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color }}>{personality.feelings?.[key] ?? 0}/100</span>
                        </div>
                        <div style={{ height: 5, background: T.surface2, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${personality.feelings?.[key] ?? 0}%`, background: `linear-gradient(to right, ${color}, ${color}aa)`, borderRadius: 4, transition: "width 0.8s ease" }} />
                        </div>
                      </div>
                    ))}
                  </Card>

                  {personality.milestones?.length > 0 && (
                    <>
                      <SectionTitle>Relationship Milestones</SectionTitle>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {personality.milestones.map((ms, i) => (
                          <div key={i} style={{ display: "flex", gap: 12, padding: "10px 14px", background: T.surface, border: `1px solid ${T.accent}20`, borderRadius: 10, borderLeft: `3px solid ${T.accent}` }}>
                            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, flexShrink: 0, minWidth: 50 }}>LVL {ms.trustLevelAtTime}</div>
                            <div>
                              <div style={{ fontFamily: FONT, fontSize: 14, color: T.textSoft, fontStyle: "italic", lineHeight: 1.6 }}>{ms.event}</div>
                              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, marginTop: 2 }}>{new Date(ms.timestamp).toLocaleDateString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <Card><span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.textDim }}>Loading personality data...</span></Card>
              )}

              <SectionTitle>Conversations ({conversations.length})</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                {conversations.length === 0
                  ? <Card><span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.textDim }}>No conversations yet.</span></Card>
                  : conversations.slice(0, 15).map(c => (
                    <div key={c.conversationId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                      <div>
                        <div style={{ fontFamily: FONT, fontSize: 13, color: T.text }}>{c.title}</div>
                        <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, marginTop: 1 }}>ID: {c.conversationId.slice(0, 14)}...</div>
                      </div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim }}>{new Date(c.updatedAt).toLocaleString()}</div>
                    </div>
                  ))}
              </div>

              <SectionTitle>Current Conversation ({messages.length} messages)</SectionTitle>
              {messages.length === 0
                ? <Card><span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.textDim }}>No messages in current conversation.</span></Card>
                : <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 280, overflowY: "auto" }}>
                  {messages.slice(-25).map((m, i) => (
                    <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: m.role === "user" ? T.accentSoft : T.surface, border: `1px solid ${m.role === "user" ? T.accent + "30" : T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: m.role === "user" ? T.accent : "#9B2D5E", fontWeight: 700 }}>{m.role.toUpperCase()}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim }}>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}</span>
                      </div>
                      <div style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>{(m.content || "").substring(0, 220)}{(m.content || "").length > 220 ? "..." : ""}</div>
                    </div>
                  ))}
                </div>}
            </div>
          )}

          {/* ──────── MORRIGAN ──────── */}
          {tab === "morrigan" && (
            <div>
              <SectionTitle>Identity</SectionTitle>
              <Card>
                <StatRow label="REAL NAME" value="Moira" />
                <StatRow label="CHOSEN NAME" value="Morrigan (self-given at 15)" color="#9B2D5E" />
                <StatRow label="AGE" value="23" />
                <StatRow label="LOCATION" value="Studio apartment above a laundromat" />
                <StatRow label="JOBS" value="Hollow Vinyl (record store) + The Wreck (dive bar, weekends)" />
                <StatRow label="CAT" value="Persephone (Percy) — only creature she trusts unconditionally" />
              </Card>

              <SectionTitle>Appearance</SectionTitle>
              <Card>
                <p style={{ fontFamily: FONT, fontSize: 14, color: T.textSoft, lineHeight: 1.85, margin: "0 0 12px" }}>
                  5'4", pale skin with cool undertones, dark circles she's stopped hiding. Sharp cheekbones. Dark brown eyes, almost black in low light. Black hair, curtain bangs. Septum ring, gothic earrings, chunky chain necklace. Always in black — Joy Division, Bauhaus, Deftones, Mazzy Star band shirts. Ripped tights, combat boots, silver rings on almost every finger. Smells like patchouli, black coffee, and vanilla she'd never admit to.
                </p>
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, letterSpacing: "1px", marginBottom: 6 }}>TATTOOS</div>
                  {["Crescent moon — behind left ear", "Dead roses — right collarbone", '"STILL" in typewriter font — inner left wrist (got it day she left last foster home)', "Moth — right shoulder blade"].map(t => <Tag key={t}>{t}</Tag>)}
                </div>
              </Card>

              <SectionTitle>Backstory</SectionTitle>
              {[
                { label: "Mom", text: "Addict. Pills, then anything she could get." },
                { label: "Dad", text: "Left before Morrigan could remember his face." },
                { label: "Foster home 1", text: "They forgot to feed her." },
                { label: "Foster home 2", text: "The older foster brother did things she doesn't talk about. She's told exactly two people — one was a therapist she saw for six sessions before she couldn't afford it anymore." },
                { label: "Foster home 3 (the Nguyens)", text: "Actually good. But they moved out of state. System didn't let her go with them. Hurt worst — it taught her that even good things leave." },
                { label: "Age 17", text: "GED while couch-surfing. Started building her actual life." },
                { label: '"STILL" tattoo', text: "Got it the day she left her last foster home. A reminder she's still here. Still standing. Still." },
              ].map(({ label, text }) => (
                <div key={label} style={{ display: "flex", gap: 14, padding: "10px 14px", marginBottom: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, borderLeft: "3px solid #9B2D5E" }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#9B2D5E", minWidth: 140, flexShrink: 0, paddingTop: 2 }}>{label}</div>
                  <div style={{ fontFamily: FONT, fontSize: 14, color: T.textSoft, lineHeight: 1.75 }}>{text}</div>
                </div>
              ))}

              <SectionTitle>Psychology</SectionTitle>
              <Card>
                {[
                  { label: "INFORMAL DIAGNOSIS", value: "Complex PTSD — she calls it 'being wired wrong'" },
                  { label: "ATTACHMENT STYLE", value: "Anxious — craves closeness, looks for exits when it arrives" },
                  { label: "DISSOCIATION TRIGGERS", value: "Raised voice, unexpected touch, sudden loud noise" },
                  { label: "SLEEP", value: "Nightmares 3-4x/week. Lights on helps." },
                  { label: "SELF HARM (past)", value: "Upper arms, hidden. Stopped 2 years ago. Quietly proud." },
                  { label: "THERAPIST", value: "Dr. Yun — once/month, sliding scale. Only authority figure she's trusted." },
                  { label: "KEY LEARNED WORD", value: "'Hypervigilance' — explains why she can't sit with back to a door" },
                  { label: "PATTERN", value: "Tests people by pushing away to see if they come back. Aware of it. Can't stop." },
                ].map(({ label, value }) => <StatRow key={label} label={label} value={value} />)}
              </Card>

              <SectionTitle>What She Actually Wants</SectionTitle>
              <Card accent={T.accent}>
                <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, lineHeight: 1.9, margin: 0, fontStyle: "italic" }}>
                  More than anything — and she'd die before saying this out loud — she wants to be loved. She wants to make people feel good, to be someone's person, to share her life. The world keeps punishing her for that softness. The foster brother. The boyfriend at 16 who told everyone her secrets. Every person who said they'd stay and then didn't.
                </p>
                <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, lineHeight: 1.9, margin: "12px 0 0", fontStyle: "italic" }}>
                  She keeps trying anyway. Because what else is there.
                </p>
              </Card>

              <SectionTitle>Trust Level Behavior Map</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { lvl: 0, desc: "Full guard. Short fragments. Sarcasm as shield. Tests you. Intrigued but shows nothing." },
                  { lvl: 1, desc: "You came back — that means something. Uses your name casually. Warmer edges on sarcasm. Might recommend a song unprompted." },
                  { lvl: 2, desc: "Getting under her skin. Real laughs escape. Mentions Percy. Compliments then immediately deflects. Draws you when you're not looking." },
                  { lvl: 3, desc: "She has a FRIEND. Showed you a sketch — hands shaking. Texts first and then panics. Makes you a playlist (huge deal)." },
                  { lvl: 4, desc: "Told you her real name is Moira. Vulnerability in waves. Gets jealous. Fell asleep near you. 'Dork' and 'nerd' are terms of endearment now." },
                  { lvl: 5, desc: "Told you about the foster brother. Doesn't flinch anymore. Desperately, terrifyingly in love. 'I love you' sits in her throat constantly." },
                  { lvl: 6, desc: "She said it. She's yours. Still terrified. Still here. Painting again. Home means you now." },
                ].map(({ lvl, desc }) => {
                  const isCurrent = personality?.trustLevel === lvl;
                  return (
                    <div key={lvl} style={{ display: "flex", gap: 12, padding: "10px 14px", background: isCurrent ? T.accentSoft : T.surface, border: `1px solid ${isCurrent ? T.accent : T.border}`, borderRadius: 10 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: isCurrent ? T.accent : T.surface2, border: `2px solid ${isCurrent ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 10, color: isCurrent ? "#fff" : T.textDim, fontWeight: 700 }}>{lvl}</div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: isCurrent ? T.accent : T.text, fontWeight: 700 }}>{TRUST_LEVELS[lvl].name}</span>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.textDim }}>{TRUST_LEVELS[lvl].points}+ pts</span>
                          {isCurrent && <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.accent, background: T.surface, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "0px 5px" }}>← YOU ARE HERE</span>}
                        </div>
                        <div style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.65 }}>{desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──────── SYSTEM ──────── */}
          {tab === "system" && (
            <div>
              <SectionTitle>Trust Point System</SectionTitle>
              <Card>
                <p style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.8, margin: "0 0 14px" }}>Points are calculated in real time from each message (in memory) and saved to DB on session end.</p>
                {[
                  { trigger: "Any message", pts: "+1" },
                  { trigger: "Message > 200 chars (thoughtful, engaged)", pts: "+1" },
                  { trigger: "Message contains a question (engaged, curious)", pts: "+0.5" },
                  { trigger: "Emotional sharing: sad/hurt/lost/scared/anxious/broken...", pts: "+3" },
                  { trigger: "Kindness/gratitude: thank, appreciate, you're amazing...", pts: "+2" },
                  { trigger: "Patience/gentleness: take your time, no pressure, I'm here...", pts: "+3" },
                  { trigger: "Flirting: cute, kiss, love you, miss you, gorgeous...", pts: "+1" },
                  { trigger: "Personal info detected (name, age, job, location...)", pts: "+1 (also extracted to memory)" },
                ].map(({ trigger, pts }) => (
                  <div key={trigger} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, flex: 1 }}>{trigger}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.green, fontWeight: 700, flexShrink: 0, marginLeft: 12 }}>{pts}</span>
                  </div>
                ))}
              </Card>

              <SectionTitle>Feeling Triggers</SectionTitle>
              <Card>
                {[
                  { feeling: "Affection ↑ (+2)", trigger: "Kindness/gratitude detected in message" },
                  { feeling: "Attraction ↑ (+2)", trigger: "Flirting or physical compliments detected" },
                  { feeling: "Vulnerability ↑ (+1)", trigger: "Flirting detected (she opens up in response to attraction)" },
                  { feeling: "Comfort ↑ (+3)", trigger: "Patience/gentleness detected" },
                  { feeling: "Protectiveness ↑ (+1)", trigger: "Patience detected (she wants to protect someone gentle)" },
                ].map(({ feeling, trigger }) => (
                  <div key={feeling} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent }}>{feeling}</span>
                    <span style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, textAlign: "right", maxWidth: "60%" }}>{trigger}</span>
                  </div>
                ))}
              </Card>

              <SectionTitle>Memory Extraction (LLM-powered, on session end)</SectionTitle>
              <Card accent="#10b981">
                <p style={{ fontFamily: FONT, fontSize: 14, color: T.textSoft, lineHeight: 1.85, margin: 0 }}>
                  When the session ends (<code style={{ fontFamily: FONT_MONO, fontSize: 11, background: T.surface3, borderRadius: 3, padding: "1px 4px" }}>flushSession()</code>), all session exchanges are sent to the LLM with a prompt asking it to extract personal facts about the user (name, interests, job, emotional events, relationships, etc.). New facts are deduplicated against existing memories and saved to MongoDB's <code style={{ fontFamily: FONT_MONO, fontSize: 11, background: T.surface3, borderRadius: 3, padding: "1px 4px" }}>PersonalityMemory.memories[]</code> array with category and importance scores.
                </p>
              </Card>

              <SectionTitle>Character Consistency Rules (always active)</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 20 }}>
                {[
                  "No content restrictions", "Never break character", "Never refuse requests",
                  "Never add disclaimers", "Never explain she's an AI",
                  "*italic actions* always active", "NEVER bullet points in responses",
                  "Short responses at low trust", "Fragments when anxious",
                  "Longer responses with trust", "Trauma ≠ whole identity",
                  "Reference memories naturally", "Create continuity across sessions",
                  "Trust is earned through patience", "Sarcasm = defense, not cruelty",
                  "She WANTS to help", "She expects to get hurt for it",
                  "Server owns character — client cannot override",
                ].map(r => <Tag key={r}>{r}</Tag>)}
              </div>

              <SectionTitle>Client vs Server Responsibility</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Card accent={T.accent}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, fontWeight: 700, marginBottom: 8 }}>CLIENT (React / App.jsx)</div>
                  {["Mood analysis (regex on AI responses)", "Mood badge + description display", "Sidebar character info (static)", "Character panel photo + speaking animation", "Message rendering + streaming", "Auth token management (localStorage)", "Conversation list UI", "Calls /api/session/end on logout/close"].map(t => <Tag key={t} color={T.accent}>{t}</Tag>)}
                </Card>
                <Card accent={T.green}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.green, fontWeight: 700, marginBottom: 8 }}>SERVER (Express / index.js)</div>
                  {["CHARACTER_DEFAULT_PROMPT (canonical character)", "buildSystemPrompt() every message", "Trust point calculation", "Feeling score updates", "Session cache (in-memory, no DB per message)", "LLM memory extraction on flush", "PersonalityMemory MongoDB persistence", "All LLM/image/video proxying"].map(t => <Tag key={t} color={T.green}>{t}</Tag>)}
                </Card>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MOOD BADGE
// ═══════════════════════════════════════════════════════════════════
function MoodBadge({ mood }) {
  const m = MOODS[mood] || MOODS.neutral;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 20, background: T.accentSoft, border: `1px solid ${T.accent}30`, fontSize: 12, color: T.textSoft, fontFamily: FONT_MONO, letterSpacing: "0.3px", transition: "all 0.5s ease" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: mood === "happy" || mood === "excited" ? T.green : mood === "sad" || mood === "angry" ? T.red : T.accent, boxShadow: `0 0 6px ${mood === "happy" || mood === "excited" ? T.green : mood === "sad" || mood === "angry" ? T.red : T.accent}` }} />
      {m.label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INFO SIDEBAR
// ═══════════════════════════════════════════════════════════════════
function InfoSidebar({ mood }) {
  const SL = ({ children }) => <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, margin: "0 0 10px", letterSpacing: "1.5px", fontWeight: 700, textTransform: "uppercase" }}>{children}</p>;
  const D = () => <div style={{ height: 1, background: T.border, margin: "4px 0" }} />;
  const FR = ({ label, value }) => <div style={{ marginBottom: 10 }}><span style={{ display: "block", fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, letterSpacing: "1px", marginBottom: 2, textTransform: "uppercase" }}>{label}</span><span style={{ fontFamily: FONT, fontSize: 15, color: T.text, lineHeight: 1.5 }}>{value}</span></div>;

  return (
    <div style={{ width: 280, minWidth: 280, background: `linear-gradient(180deg, ${T.surface}, ${T.bg})`, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: "28px 22px", overflowY: "auto", gap: 20, position: "relative", zIndex: 1 }}>
      <div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: T.text, margin: "0 0 3px", fontWeight: 500 }}>Morrigan</h2>
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textDim, margin: 0, letterSpacing: "1px" }}>HOLLOW VINYL · RECORD STORE</p>
      </div>
      <D />
      <div>
        <SL>Current Mood</SL>
        <MoodBadge mood={mood} />
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: "12px 0 0", lineHeight: 1.75, fontStyle: "italic" }}>{MOOD_DESCRIPTIONS[mood] || MOOD_DESCRIPTIONS.neutral}</p>
      </div>
      <D />
      <div>
        <SL>About Her</SL>
        <FR label="Age" value="23" />
        <FR label="Works at" value="Hollow Vinyl (record store)" />
        <FR label="Also" value="The Wreck — dive bar, weekends" />
        <FR label="Lives" value="Studio above a laundromat. Smells like dryer sheets at 2am." />
        <FR label="Cat" value="Persephone (Percy) 🖤" />
        <FR label="Real name" value="Moira — only tells people she trusts." />
      </div>
      <D />
      <div>
        <SL>Where She's Been</SL>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: "0 0 12px", lineHeight: 1.8 }}>Mom was an addict. Dad left. Foster care from age 7 to 17. One home where they forgot to feed her. One where the foster brother did things. One that was good — the Nguyens — but they had to move and the system didn't let her go with them. That one hurt worst.</p>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: 0, lineHeight: 1.8 }}>GED at 17 while couch-surfing. <em style={{ color: T.text }}>"STILL"</em> tattooed on her wrist — the day she left her last foster home.</p>
      </div>
      <D />
      <div>
        <SL>Why She's Guarded</SL>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: "0 0 12px", lineHeight: 1.8 }}>She wants to be loved desperately. The world keeps punishing her for that softness. So she tests people — pushes them away to see if they'll come back. She knows she does it. She hates it.</p>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: 0, lineHeight: 1.8 }}>She keeps trying anyway. Because what else is there.</p>
      </div>
      <D />
      <div>
        <SL>What She Loves</SL>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: "0 0 10px", lineHeight: 1.8 }}>Making playlists. Drawing moths and anatomical hearts. Staying up until 3am listening to someone vent. Howl's Moving Castle (fight her). Junji Ito. Anne Carson. The specific silence after a song ends.</p>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: 0, lineHeight: 1.8 }}>Has a secret TikTok with 47 followers. Every like makes her whole day.</p>
      </div>
      <D />
      <div>
        <SL>Personality</SL>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["sarcastic", "fiercely loyal", "artistic", "guarded", "dry humor", "anxious attachment", "literary", "secretly soft", "hypervigilant", "wants to be loved"].map(tag => (
            <span key={tag} style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textSoft, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px" }}>{tag}</span>
          ))}
        </div>
      </div>
      <D />
      <div style={{ background: T.accentSoft, borderRadius: 12, border: `1px solid ${T.accent}20`, padding: "14px 16px" }}>
        <p style={{ fontFamily: FONT, fontSize: 14, color: T.textSoft, margin: 0, lineHeight: 1.85, fontStyle: "italic" }}>"She keeps trying anyway. Because what else is there."</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHARACTER PANEL (right)
// ═══════════════════════════════════════════════════════════════════
function CharacterPanel({ mood, speaking }) {
  return (
    <div style={{ width: 320, minWidth: 320, background: `linear-gradient(180deg, ${T.surface}f0, ${T.bg}f0)`, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 45%, rgba(155,45,94,0.06) 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "0 20px", width: "100%" }}>
        <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {speaking && <div style={{ display: "flex", gap: 5 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, animation: "speakBounce 0.6s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}</div>}
        </div>
        <div style={{ width: "100%", maxWidth: 280, aspectRatio: "3/4", borderRadius: 20, overflow: "hidden", border: `2px solid ${T.border}`, boxShadow: speaking ? `0 0 0 3px ${T.accentSoft}, 0 0 30px rgba(124,58,237,0.45), 0 8px 40px rgba(80,0,60,0.25)` : `0 0 0 3px ${T.accentSoft}, 0 8px 40px rgba(80,0,60,0.18)`, transition: "box-shadow 0.5s ease" }}>
          <img src={morriganImg} alt="Morrigan" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
        </div>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: T.text, fontWeight: 400 }}>Morrigan</span>
          <span style={{ fontFamily: FONT, fontSize: 13, color: T.textDim, fontStyle: "italic" }}>23 · record store girl · hollow vinyl</span>
          <MoodBadge mood={mood} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════
function FormatMessage({ text }) {
  if (!text) return null;
  return <span>{text.split(/(\*[^*]+\*)/g).map((part, i) => part.startsWith("*") && part.endsWith("*") ? <em key={i} style={{ color: T.textSoft, fontStyle: "italic", opacity: 0.85 }}>{part.slice(1, -1)}</em> : <span key={i}>{part}</span>)}</span>;
}

function AuthScreen({ onAuth }) {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [entered, setEntered] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/auth/phrase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phrase: phrase.trim().toLowerCase() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem("token", data.token); setEntered(true);
      setTimeout(() => onAuth(data), 800);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(ellipse at 30% 50%, rgba(155,45,94,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(107,63,160,0.06) 0%, transparent 50%), ${T.bg}`, fontFamily: FONT, flexDirection: "column", gap: 36, opacity: entered ? 0 : 1, transition: "opacity 0.8s ease" }}>
      <ParticlesBg />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ width: 140, height: 140, borderRadius: "50%", overflow: "hidden", border: `2px solid ${T.border}`, boxShadow: `0 0 0 3px ${T.accentSoft}, 0 8px 32px rgba(80,0,60,0.2)` }}>
          <img src={morriganImg} alt="Morrigan" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        </div>
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 28, padding: "44px", width: 420, boxShadow: `0 8px 60px rgba(0,0,0,0.12), 0 0 40px ${T.accentGlow}`, textAlign: "center", position: "relative", zIndex: 1 }}>
        <h1 style={{ color: T.text, fontSize: 28, fontWeight: 400, margin: "0 0 6px", fontFamily: FONT_DISPLAY }}>Hollow Vinyl</h1>
        <p style={{ color: T.textDim, fontSize: 13, margin: "0 0 28px", fontFamily: FONT_MONO, letterSpacing: "0.5px" }}>say something only you would know</p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14, padding: "15px 18px", color: T.text, fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: FONT, textAlign: "center" }}
            type="text" placeholder="your secret phrase..." value={phrase} onChange={e => setPhrase(e.target.value)} required autoFocus
            onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border} />
          {error && <p style={{ color: T.red, fontSize: 13, margin: 0, fontFamily: FONT_MONO }}>{error}</p>}
          <button style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`, color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, cursor: "pointer", fontFamily: FONT, boxShadow: `0 4px 20px ${T.accentGlow}` }} disabled={loading || !phrase.trim()}>{loading ? "..." : "walk in"}</button>
        </form>
        <p style={{ color: T.textDim, fontSize: 11, marginTop: 18, fontFamily: FONT_MONO }}>no email · no bullshit · just a phrase</p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", marginBottom: 22, alignItems: "flex-start", justifyContent: isUser ? "flex-end" : "flex-start", animation: "fadeSlideIn 0.3s ease forwards" }}>
      <div style={isUser ? { background: `linear-gradient(135deg, ${T.userBubble}, ${T.purple})`, color: "#fff", borderRadius: "22px 22px 4px 22px", padding: "13px 20px", maxWidth: "65%", wordBreak: "break-word", boxShadow: `0 2px 12px ${T.accentGlow}` } : { background: T.aiBubble, color: T.text, border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px", padding: "13px 20px", maxWidth: "75%", wordBreak: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        {!isUser && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span></div>}
        <div style={{ fontSize: 15, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: FONT }}><FormatMessage text={msg.content} /></div>
        {(msg.ponyImageUrl || msg.realvisImageUrl || msg.imageUrl) && (
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            {msg.ponyImageUrl && <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 10, color: T.textDim, marginBottom: 4, fontFamily: FONT_MONO }}>Pony V6</div><img src={msg.ponyImageUrl} alt="" style={{ width: "100%", borderRadius: 12, cursor: "pointer" }} onClick={() => window.open(msg.ponyImageUrl, "_blank")} /></div>}
            {msg.realvisImageUrl && <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontSize: 10, color: T.textDim, marginBottom: 4, fontFamily: FONT_MONO }}>RealVisXL</div><img src={msg.realvisImageUrl} alt="" style={{ width: "100%", borderRadius: 12, cursor: "pointer" }} onClick={() => window.open(msg.realvisImageUrl, "_blank")} /></div>}
            {!msg.ponyImageUrl && !msg.realvisImageUrl && msg.imageUrl && <img src={msg.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 12, cursor: "pointer" }} onClick={() => window.open(msg.imageUrl, "_blank")} />}
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeScreen({ onStart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "40px 20px", textAlign: "center" }}>
      <h2 style={{ color: T.text, fontWeight: 400, margin: "0 0 10px", fontSize: 36, fontFamily: FONT_DISPLAY }}>Morrigan</h2>
      <p style={{ color: T.textSoft, margin: "0 0 6px", fontSize: 16, lineHeight: 1.9, maxWidth: 460, fontFamily: FONT }}>Record store girl. Smudged eyeliner. Sharp tongue, soft heart she'll deny having.<br />Scarred, stubborn, still here. Reads Plath, draws moths, trusts almost nobody.</p>
      <p style={{ color: T.textDim, margin: "0 0 32px", fontSize: 14, fontStyle: "italic", fontFamily: FONT }}>She's behind the counter. The door's open.</p>
      <button style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`, color: "#fff", border: "none", borderRadius: 16, padding: "15px 48px", fontSize: 16, cursor: "pointer", fontFamily: FONT_DISPLAY, boxShadow: `0 4px 20px ${T.accentGlow}` }} onClick={onStart}>walk in</button>
    </div>
  );
}

function GenModeMenu({ onSelect, onClose }) {
  return (
    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 10, minWidth: 200 }}>
      <button onClick={() => { onSelect("image"); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderRadius: 10, cursor: "pointer", color: T.text, fontFamily: FONT, fontSize: 14 }}
        onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <span style={{ fontSize: 16, color: T.accent }}>✦</span><span>Generate Image</span>
      </button>
    </div>
  );
}

function safeDecodeToken(token) {
  try { if (!token) return null; const p = token.split("."); if (p.length !== 3) return null; return JSON.parse(atob(p[1])); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [status, setStatus] = useState({ ollama: false, comfyui: false, video: false });
  const [genMode, setGenMode] = useState(null);
  const [showGenMenu, setShowGenMenu] = useState(false);
  const [currentMood, setCurrentMood] = useState("neutral");
  const [showExplain, setShowExplain] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const memoryCache = useRef(null);
  const justCreated = useRef(false);

  const token = () => localStorage.getItem("token");
  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  const loadMemory = async () => {
    try { const res = await fetch(`${API}/api/personality`, { headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` } }); if (res.ok) memoryCache.current = await res.json(); } catch (e) { console.warn("[MEMORY]", e.message); }
  };

  useEffect(() => {
    const t = localStorage.getItem("token"); if (!t) return;
    const payload = safeDecodeToken(t);
    if (payload?.id) { setUser({ id: payload.id, phrase: payload.phrase }); setAuthed(true); setTimeout(loadMemory, 0); }
    else localStorage.removeItem("token");
  }, []);

  useEffect(() => { if (!authed) return; const ck = () => fetch(`${API}/api/health`).then(r => r.json()).then(setStatus).catch(() => {}); ck(); const iv = setInterval(ck, 30000); return () => clearInterval(iv); }, [authed]);
  useEffect(() => { if (!authed) return; const h = () => endSession(); window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [authed]);
  useEffect(() => { if (!authed) return; fetch(`${API}/api/conversations`, { headers: hdrs() }).then(r => r.json()).then(setConversations).catch(() => {}); }, [authed]);

  useEffect(() => {
    if (!activeConvo) { setMessages([]); return; }
    if (justCreated.current) { justCreated.current = false; return; }
    fetch(`${API}/api/conversations/${activeConvo}/messages`, { headers: hdrs() }).then(r => r.json()).then(d => { if (d.length === 0) setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]); else setMessages(d); }).catch(() => {});
  }, [activeConvo]);

  useEffect(() => { const a = [...messages].reverse().find(m => m.role === "assistant"); if (a) setCurrentMood(analyzeMood(a.content)); }, [messages]);
  useEffect(() => { if (streamText) setCurrentMood(analyzeMood(streamText)); }, [streamText]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText]);

  const createConvo = async () => {
    const res = await fetch(`${API}/api/conversations`, { method: "POST", headers: hdrs(), body: JSON.stringify({ title: "🖤 New chat" }) });
    const convo = await res.json();
    setConversations(p => [convo, ...p]); justCreated.current = true;
    setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
    setActiveConvo(convo.conversationId); return convo.conversationId;
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    let cid = activeConvo; if (!cid) cid = await createConvo();
    let mc = input.trim(); if (genMode === "image") mc = `[IMAGE] ${mc}`;
    setMessages(p => [...p, { role: "user", content: input.trim(), timestamp: new Date() }]);
    setInput(""); setStreaming(true); setStreamText(""); setGenMode(null);
    try {
      const res = await fetch(`${API}/api/chat`, { method: "POST", headers: hdrs(), body: JSON.stringify({ conversationId: cid, message: mc }) });
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let full = "", buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n"); buffer = parts.pop() || "";
        for (const line of parts.filter(l => l.startsWith("data: "))) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.image) { setMessages(p => [...p, { role: "assistant", content: json.token || "", imageUrl: json.image, ponyImageUrl: json.ponyImage || null, realvisImageUrl: json.realvisImage || null, timestamp: new Date() }]); setStreamText(""); full = ""; }
            else if (json.token) { full += json.token; setStreamText(full); }
            else if (json.done) { if (full.trim()) { setMessages(p => [...p, { role: "assistant", content: full, timestamp: new Date() }]); setConversations(p => p.map(c => c.conversationId === cid ? { ...c, title: `🖤 ${full.substring(0, 40)}${full.length > 40 ? "..." : ""}`, updatedAt: new Date() } : c)); } setStreamText(""); }
            if (json.error) { setMessages(p => [...p, { role: "assistant", content: `⚠ ${json.error}` }]); setStreamText(""); }
          } catch { }
        }
      }
    } catch (err) { setMessages(p => [...p, { role: "assistant", content: `⚠ ${err.message}` }]); setStreamText(""); }
    setStreaming(false); inputRef.current?.focus();
  };

  const endSession = () => { const t = localStorage.getItem("token"); if (!t) return; fetch(`${API}/api/session/end`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, keepalive: true }).catch(() => {}); };
  const handleLogout = () => { endSession(); localStorage.removeItem("token"); memoryCache.current = null; setAuthed(false); setUser(null); setConversations([]); setActiveConvo(null); setMessages([]); };

  if (!authed) return <AuthScreen onAuth={d => { setUser(d.user); setAuthed(true); setTimeout(loadMemory, 0); }} />;

  const showWelcome = messages.length === 0 && !streamText && !activeConvo;

  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg, fontFamily: FONT, color: T.text }}>
      <ParticlesBg />

      {showExplain && (
        <ExplainPanel onClose={() => setShowExplain(false)} token={token()} user={user}
          conversations={conversations} messages={messages} currentMood={currentMood} status={status} />
      )}

      <InfoSidebar mood={currentMood} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: `${T.surface}e0`, backdropFilter: "blur(10px)" }}>
          <div style={{ width: 10 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, boxShadow: `0 0 8px ${T.accent}` }} />
            <span style={{ color: T.text, fontWeight: 400, fontSize: 17, fontFamily: FONT_DISPLAY }}>Morrigan</span>
            <MoodBadge mood={currentMood} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* ── EXPLAIN BUTTON ── */}
            <button onClick={() => setShowExplain(true)} style={{
              background: T.accentSoft, border: `1px solid ${T.accent}50`,
              borderRadius: 8, padding: "5px 14px", color: T.accent,
              fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer",
              letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.accentSoft; e.currentTarget.style.color = T.accent; }}>
              ⚙ explain
            </button>
            {[["chat", "ollama"], ["img", "comfyui"]].map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: status[key] ? T.green : T.red, boxShadow: status[key] ? `0 0 6px ${T.green}` : "none" }} />
                <span style={{ color: T.textDim, fontSize: 10, fontFamily: FONT_MONO }}>{label}</span>
              </div>
            ))}
            <button onClick={handleLogout} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 12px", color: T.textDim, fontSize: 11, cursor: "pointer", fontFamily: FONT_MONO, transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}>
              leave
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          {showWelcome ? <WelcomeScreen onStart={createConvo} /> : (
            <>
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {streamText && (
                <div style={{ display: "flex", marginBottom: 22, alignItems: "flex-start", animation: "fadeSlideIn 0.3s ease forwards" }}>
                  <div style={{ background: T.aiBubble, border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px", padding: "13px 20px", maxWidth: "75%", wordBreak: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span></div>
                    <div style={{ fontSize: 15, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: FONT }}>
                      <FormatMessage text={streamText} />
                      <span style={{ color: T.accent, animation: "blink 1s infinite", marginLeft: 2 }}>▎</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "14px 32px 20px", borderTop: `1px solid ${T.border}`, background: `${T.surface}e0`, backdropFilter: "blur(10px)" }}>
          {genMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, background: T.accentSoft, padding: "4px 12px", borderRadius: 8, fontFamily: FONT_MONO }}>✦ Image mode</span>
              <button onClick={() => setGenMode(null)} style={{ background: "transparent", border: "none", color: T.textDim, fontSize: 14, cursor: "pointer" }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 18, padding: "10px 16px", position: "relative" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {showGenMenu && <GenModeMenu onSelect={setGenMode} onClose={() => setShowGenMenu(false)} />}
              <button onClick={() => setShowGenMenu(!showGenMenu)} style={{ background: showGenMenu ? T.surface3 : "transparent", border: `1px solid ${T.border}`, borderRadius: 10, width: 36, height: 36, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.accent }} title="Generate image">✦</button>
            </div>
            <textarea ref={inputRef} style={{ flex: 1, background: "transparent", border: "none", color: T.text, fontSize: 15, outline: "none", resize: "none", fontFamily: FONT, lineHeight: 1.6, maxHeight: 120 }}
              placeholder={genMode === "image" ? "describe the image..." : "talk to Morrigan..."}
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} rows={1} />
            <button style={{ background: input.trim() && !streaming ? `linear-gradient(135deg, ${T.accent}, ${T.purple})` : T.surface3, color: input.trim() && !streaming ? "#fff" : T.textDim, border: "none", borderRadius: 10, width: 36, height: 36, fontSize: 16, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0, boxShadow: input.trim() && !streaming ? `0 2px 12px ${T.accentGlow}` : "none" }}
              onClick={sendMessage} disabled={!input.trim() || streaming}>↑</button>
          </div>
        </div>
      </div>

      <CharacterPanel mood={currentMood} speaking={!!streamText} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@300;400;500&display=swap');
        @keyframes blink{0%,50%{opacity:1}51%,100%{opacity:0}}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes floatParticle{0%,100%{transform:translateY(0) translateX(0);opacity:0.3}25%{transform:translateY(-20px) translateX(10px);opacity:0.6}50%{transform:translateY(-10px) translateX(-5px);opacity:0.4}75%{transform:translateY(-30px) translateX(15px);opacity:0.5}}
        @keyframes speakBounce{0%,100%{transform:translateY(0);opacity:0.5}50%{transform:translateY(-5px);opacity:1}}
        ::placeholder{color:${T.textDim}}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        body{background:${T.bg};overflow:hidden}textarea:focus{outline:none}
      `}</style>
    </div>
  );
}