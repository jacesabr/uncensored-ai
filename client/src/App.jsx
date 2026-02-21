import React, { useState, useEffect, useRef } from "react";
import morriganImg from "./morgan.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const T = {
  bg: "#f6f7fb", surface: "#ffffff", surface2: "#f0f0f5", surface3: "#e8e8f0",
  border: "#e6e8ef", text: "#1f2937", textSoft: "#4b5563",
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

const PARTICLE_DATA = Array.from({ length: 18 }).map((_, i) => ({
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
// EXPLAIN / MONITOR — single long scroll, no tabs
// Shows LIVE MongoDB data for sanity checking everything
// ═══════════════════════════════════════════════════════════════════
function ExplainPanel({ onClose, token, user, conversations, messages, currentMood, status }) {
  const [fullData, setFullData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const refresh = async () => {
    setLoading(true);
    try {
      const [summaryRes, fullRes] = await Promise.all([
        fetch(`${API}/api/personality`, { headers: hdrs() }),
        fetch(`${API}/api/personality/full`, { headers: hdrs() }),
      ]);
      const summary = summaryRes.ok ? await summaryRes.json() : null;
      const full = fullRes.ok ? await fullRes.json() : null;
      setFullData({ summary, full });
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const p = fullData?.summary;
  const raw = fullData?.full;

  // Sub-components
  const SecHead = ({ icon, title, color = T.accent }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "34px 0 16px", paddingBottom: 10, borderBottom: `2px solid ${color}30` }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color, letterSpacing: "2px", fontWeight: 700, textTransform: "uppercase" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${color}25, transparent)` }} />
    </div>
  );

  const Card = ({ children, style = {}, accent, glow }) => (
    <div style={{ background: T.surface, border: `1px solid ${accent ? accent + "35" : T.border}`, borderLeft: accent ? `3px solid ${accent}` : undefined, borderRadius: 12, padding: "14px 18px", marginBottom: 10, boxShadow: glow ? `0 0 18px ${glow}18` : "none", ...style }}>{children}</div>
  );

  const Grid = ({ cols = 2, gap = 10, children }) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, marginBottom: 12 }}>{children}</div>
  );

  const Row = ({ label, value, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7, gap: 12 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textDim, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: color || T.text, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{String(value ?? "—")}</span>
    </div>
  );

  const Bar = ({ value, max = 100, color = T.accent, label, sub }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div>
          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text }}>{label}</span>
          {sub && <span style={{ fontFamily: FONT, fontSize: 11, color: T.textDim, marginLeft: 8, fontStyle: "italic" }}>{sub}</span>}
        </div>
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color }}>{value}/{max}</span>
      </div>
      <div style={{ height: 6, background: T.surface2, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min((value / max) * 100, 100)}%`, background: `linear-gradient(to right, ${color}, ${color}bb)`, borderRadius: 4, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );

  const Tag = ({ children, color = T.accent }) => (
    <span style={{ display: "inline-block", fontFamily: FONT_MONO, fontSize: 9, color, background: color + "15", border: `1px solid ${color}25`, borderRadius: 5, padding: "2px 7px", marginRight: 4, marginBottom: 4 }}>{children}</span>
  );

  const StatusCard = ({ live, label, detail }) => (
    <div style={{ background: T.surface, border: `1px solid ${live ? T.green + "40" : T.red + "30"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: live ? T.green : T.red, boxShadow: live ? `0 0 8px ${T.green}` : "none" }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: live ? T.green : T.red, fontWeight: 700 }}>{live ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.text, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {detail && <div style={{ fontFamily: FONT, fontSize: 12, color: T.textDim }}>{detail}</div>}
    </div>
  );

  const CAT_COLORS = {
    name: "#7c3aed", interest: "#0ea5e9", personal: "#10b981",
    emotional: "#ec4899", preference: "#f59e0b", relationship: "#ef4444", event: "#9B2D5E"
  };

  const nextPoints = p ? (TRUST_LEVELS[Math.min((p.trustLevel || 0) + 1, 6)]?.points || 320) : 320;
  const hoursSince = p?.lastSeen ? Math.floor((Date.now() - new Date(p.lastSeen)) / 3600000) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(8,4,18,0.78)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "96vw", maxWidth: 1180, height: "93vh", background: T.bg, borderRadius: 22, overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${T.border}`, boxShadow: "0 32px 120px rgba(0,0,0,0.55)" }}>

        {/* Sticky Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 20, margin: 0, color: T.text, fontWeight: 500 }}>⚙ System Monitor</h2>
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, margin: "2px 0 0", letterSpacing: "1.5px" }}>
              KAGGLE BACKEND · LIVE MONGODB · SESSION STATE · CHARACTER SPEC · SANITY CHECK
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastRefresh && <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim }}>refreshed {lastRefresh.toLocaleTimeString()}</span>}
            <button onClick={refresh} disabled={loading} style={{ background: T.accentSoft, border: `1px solid ${T.accent}40`, borderRadius: 8, padding: "6px 16px", color: T.accent, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer" }}>
              {loading ? "⟳ loading..." : "⟳ refresh"}
            </button>
            <button onClick={onClose} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 14px", color: T.textSoft, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer" }}>✕ close</button>
          </div>
        </div>

        {/* Single scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 32px 48px" }}>

          {/* ══ 1. LIVE SYSTEM STATUS ══ */}
          <SecHead icon="🔌" title="Live System Status — Kaggle Backend" color="#10b981" />
          <Grid cols={4}>
            <StatusCard live={!!status.ollama} label="Kaggle LLM" detail="uncensored_llama.gguf via llama-cpp" />
            <StatusCard live={!!status.comfyui} label="Pony V6 Image" detail="SDXL single-model, no RealVis on Kaggle" />
            <StatusCard live={false} label="Video Gen" detail="Disabled — video: false hardcoded in Kaggle health endpoint" />
            <StatusCard live={true} label="MongoDB Atlas" detail="Always connected via Express server" />
          </Grid>
          <Card accent="#f59e0b">
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>⚠ KAGGLE vs COLAB DIFFERENCES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                ["Image model", "Kaggle has Pony V6 only — no RealVisXL. pony_image = image = same base64.", "#f59e0b"],
                ["Video", "Not available. Kaggle health returns video: false. VIDEO_KEYWORDS routing in server still runs but /generate-video doesn't exist on Kaggle.", T.red],
                ["Character prompt", "Kaggle notebook injects MORRIGAN_SYSTEM_PROMPT locally, BUT Express server's buildSystemPrompt() sends a 'system' role message first — this is what the LLM actually uses.", "#10b981"],
                ["inject_system param", "Kaggle sets inject_system=true which would prepend its simpler prompt. However the server already sends role:'system' in the messages array and this takes precedence in llama-cpp.", T.textSoft],
                ["Ngrok domain", "unpacified-bent-teofila.ngrok-free.app — static domain, reconnects on Kaggle restarts.", T.textDim],
              ].map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, minWidth: 130, flexShrink: 0 }}>{k}</span>
                  <span style={{ fontFamily: FONT, fontSize: 13, color: c || T.textSoft, lineHeight: 1.5 }}>{v}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* ══ 2. USER IDENTITY & SESSION SNAPSHOT ══ */}
          <SecHead icon="👤" title="User Identity & Session Snapshot" color={T.accent} />
          <Grid cols={3}>
            <Card>
              <Row label="MONGODB USER ID" value={user?.id || "—"} color={T.accent} />
              <Row label="PASSPHRASE (in JWT)" value={user?.phrase || "—"} />
              <Row label="AUTH" value="sha256 → JWT 90d" />
            </Card>
            <Card>
              <Row label="TRUST LEVEL" value={p ? `${p.trustLevel}/6 — ${p.levelName}` : "loading..."} color={T.accent} />
              <Row label="TRUST POINTS" value={p?.trustPoints ?? "—"} color={T.accent} />
              <Row label="POINTS TO NEXT LVL" value={p?.pointsToNext ? `${p.pointsToNext} pts` : "MAX LEVEL"} />
            </Card>
            <Card>
              <Row label="TOTAL MSGS (lifetime)" value={p?.totalMessages ?? "—"} />
              <Row label="TOTAL CONVOS" value={p?.totalConversations ?? "—"} />
              <Row label="MEMORIES IN DB" value={raw?.memories?.length ?? p?.memoriesCount ?? "—"} />
            </Card>
          </Grid>
          <Grid cols={2}>
            <Card>
              <Row label="FIRST MET" value={p?.firstMet ? new Date(p.firstMet).toLocaleString() : "—"} />
              <Row label="LAST SEEN (MongoDB)" value={p?.lastSeen ? new Date(p.lastSeen).toLocaleString() : "—"} />
              <Row label="DAYS TOGETHER" value={p?.firstMet ? `${Math.floor((Date.now() - new Date(p.firstMet)) / 86400000)} days` : "—"} />
              <Row label="HOURS SINCE FLUSH" value={`${hoursSince}h`} color={hoursSince > 24 ? "#f59e0b" : T.text} />
            </Card>
            <Card>
              <Row label="CURRENT MOOD (client regex)" value={currentMood} color="#9B2D5E" />
              <Row label="CONVOS LOADED CLIENT" value={conversations.length} />
              <Row label="MSGS THIS CONVO" value={messages.length} />
              <Row label="MILESTONES" value={raw?.milestones?.length ?? p?.milestones?.length ?? "—"} />
            </Card>
          </Grid>

          {/* ══ 3. TRUST PROGRESS ══ */}
          <SecHead icon="📈" title="Trust System — Live Progress" color={T.accent} />
          <Card>
            <Bar value={p?.trustPoints ?? 0} max={nextPoints} label={`Points toward level ${Math.min((p?.trustLevel ?? 0) + 1, 6)}`} color={T.accent} />
            <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
              {Object.entries(TRUST_LEVELS).map(([lvl, data]) => {
                const n = parseInt(lvl); const active = n <= (p?.trustLevel ?? 0); const current = n === (p?.trustLevel ?? 0);
                return (
                  <div key={lvl} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", margin: "0 auto 5px", background: active ? T.accent : T.surface2, border: `2px solid ${active ? T.accent : T.border}`, boxShadow: current ? `0 0 12px ${T.accent}` : "none" }} />
                    <div style={{ fontFamily: FONT_MONO, fontSize: 7, color: current ? T.accent : T.textDim, fontWeight: current ? 700 : 400, lineHeight: 1.3 }}>{data.name}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 7, color: T.textDim }}>{data.points}pt</div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card accent={T.accent}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, fontWeight: 700, marginBottom: 10 }}>HOW POINTS ARE EARNED (server-side per message, in-memory until flush)</div>
            {[
              ["Any message", "+1", T.green],
              ["Message > 200 chars", "+1", T.green],
              ["Contains question (?)", "+0.5", T.green],
              ["Emotional sharing (sad/hurt/lost/scared/anxious...)", "+3", "#ec4899"],
              ["Kindness/gratitude (thank/appreciate/amazing/sweet...)", "+2", "#10b981"],
              ["Patience/gentleness (take your time/no pressure/I'm here...)", "+3", "#0ea5e9"],
              ["Flirting (cute/kiss/love you/gorgeous/miss you...)", "+1", "#f59e0b"],
            ].map(([trigger, pts, color]) => (
              <div key={trigger} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft }}>{trigger}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color, fontWeight: 700, flexShrink: 0, marginLeft: 12 }}>{pts}</span>
              </div>
            ))}
          </Card>

          {/* ══ 4. FEELINGS — LIVE MONGODB VALUES ══ */}
          <SecHead icon="💜" title="Morrigan's Feelings — Live MongoDB Values" color="#ec4899" />
          <Card glow="#ec4899">
            {[
              { key: "affection", label: "Affection", sub: "how much she likes you", color: "#ec4899" },
              { key: "comfort", label: "Comfort", sub: "how safe she feels", color: "#10b981" },
              { key: "attraction", label: "Attraction", sub: "physical/romantic interest", color: "#f59e0b" },
              { key: "protectiveness", label: "Protectiveness", sub: "wants to protect you", color: "#0ea5e9" },
              { key: "vulnerability", label: "Vulnerability shown", sub: "how much she's opened up", color: "#9f67ff" },
            ].map(({ key, label, sub, color }) => {
              const val = raw?.feelings?.[key] ?? p?.feelings?.[key] ?? 0;
              return <Bar key={key} value={val} max={100} label={label} sub={sub} color={color} />;
            })}
            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, marginTop: 8 }}>
              ⚠ These values reflect what's saved in MongoDB. In-session changes are in server memory and only written on logout/tab close.
            </div>
          </Card>
          <Card accent="#f59e0b">
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>FEELING TRIGGERS (what changes them per message)</div>
            {[
              ["Affection ↑ +2", "Kindness/gratitude detected"],
              ["Attraction ↑ +2", "Flirting or physical compliments"],
              ["Vulnerability ↑ +1", "Flirting (she opens up when attracted)"],
              ["Comfort ↑ +3", "Patience/gentleness keywords"],
              ["Protectiveness ↑ +1", "Patience (she wants to protect someone gentle)"],
            ].map(([feeling, trigger]) => (
              <div key={feeling} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent }}>{feeling}</span>
                <span style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft }}>{trigger}</span>
              </div>
            ))}
          </Card>

          {/* ══ 5. ALL MEMORIES FROM MONGODB ══ */}
          <SecHead icon="🧠" title="All Stored Memories — Live MongoDB" color="#0ea5e9" />
          {raw?.memories?.length > 0 ? (
            <>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                {Object.entries(CAT_COLORS).map(([cat, color]) => {
                  const count = raw.memories.filter(m => m.category === cat).length;
                  return count > 0 ? <Tag key={cat} color={color}>{cat}: {count}</Tag> : null;
                })}
                <Tag color={T.textDim}>total: {raw.memories.length}</Tag>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[...raw.memories].sort((a, b) => (b.importance || 1) - (a.importance || 1)).map((mem, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "10px 14px", background: T.surface, border: `1px solid ${(CAT_COLORS[mem.category] || T.accent) + "28"}`, borderLeft: `3px solid ${CAT_COLORS[mem.category] || T.accent}`, borderRadius: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 70, flexShrink: 0, paddingTop: 2 }}>
                      <Tag color={CAT_COLORS[mem.category] || T.accent}>{mem.category}</Tag>
                      <div style={{ display: "flex", gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(n => <div key={n} style={{ width: 5, height: 5, borderRadius: "50%", background: n <= (mem.importance || 1) ? (CAT_COLORS[mem.category] || T.accent) : T.surface3 }} />)}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: FONT, fontSize: 14, color: T.text, lineHeight: 1.5 }}>{mem.fact}</div>
                      {mem.learnedAt && <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.textDim, marginTop: 3 }}>learned: {new Date(mem.learnedAt).toLocaleString()}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Card>
              <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.textDim }}>
                {loading ? "Loading..." : raw ? "No memories stored yet. Memories are extracted from session exchanges when you log out." : "⚠ Could not load from /api/personality/full — add this endpoint to server/index.js (snippet at bottom)."}
              </div>
            </Card>
          )}

          {/* ══ 6. MILESTONES ══ */}
          <SecHead icon="🏁" title="Relationship Milestones — MongoDB" color="#9B2D5E" />
          {(raw?.milestones?.length ?? 0) > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {raw.milestones.map((ms, i) => (
                <div key={i} style={{ display: "flex", gap: 14, padding: "11px 16px", background: T.surface, border: `1px solid ${T.accent}20`, borderLeft: `3px solid ${T.accent}`, borderRadius: 10 }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.accent, flexShrink: 0, minWidth: 55 }}>LVL {ms.trustLevelAtTime}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: FONT, fontSize: 14, color: T.textSoft, fontStyle: "italic", lineHeight: 1.6 }}>{ms.event}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.textDim, marginTop: 3 }}>{ms.timestamp ? new Date(ms.timestamp).toLocaleString() : "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card><span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.textDim }}>No milestones yet — build trust to unlock them.</span></Card>
          )}

          {/* ══ 7. JOURNAL (if any) ══ */}
          {raw?.journal?.length > 0 && (
            <>
              <SecHead icon="📓" title="Morrigan's Journal — MongoDB" color="#9f67ff" />
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {raw.journal.slice(-10).reverse().map((j, i) => (
                  <div key={i} style={{ padding: "12px 16px", background: T.surface, border: `1px solid #9f67ff28`, borderLeft: "3px solid #9f67ff", borderRadius: 10 }}>
                    <div style={{ fontFamily: FONT, fontSize: 14, color: T.textSoft, fontStyle: "italic", lineHeight: 1.7 }}>"{j.entry}"</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      {j.mood && <Tag color="#9f67ff">mood: {j.mood}</Tag>}
                      {j.timestamp && <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.textDim }}>{new Date(j.timestamp).toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ══ 8. SESSION STATE (IN-MEMORY) ══ */}
          <SecHead icon="⚡" title="Session State — In-Memory (Not Yet in MongoDB)" color="#f59e0b" />
          <div style={{ padding: "11px 15px", background: "#f59e0b0d", border: "1px solid #f59e0b28", borderRadius: 10, marginBottom: 12, fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.7 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#f59e0b", fontWeight: 700 }}>HOW IT WORKS: </span>
            Trust points, feelings, and session exchanges live in the server's in-memory Map (sessionCache) during your session. They are NOT written to MongoDB until you click "leave" or close the tab (beforeunload → flushSession()). The values above in Feelings & Trust reflect MongoDB state — which may be behind if you haven't flushed this session yet. Memories are only extracted and saved on flush.
          </div>
          <Grid cols={2}>
            <Card accent="#f59e0b">
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>IN-MEMORY CACHE RIGHT NOW</div>
              <Row label="User msgs this convo" value={messages.filter(m => m.role === "user").length} />
              <Row label="Morrigan msgs this convo" value={messages.filter(m => m.role === "assistant").length} />
              <Row label="DB writes per chat msg" value="0 (only Messages collection)" />
              <Row label="PersonalityMemory writes" value="ONLY on flushSession()" />
              <Row label="Flush trigger" value="Leave button OR tab close" />
            </Card>
            <Card accent="#ef4444">
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 8 }}>WHAT HAPPENS ON FLUSH</div>
              <Row label="1. LLM extraction" value="All session exchanges → LLM → JSON facts" />
              <Row label="2. Dedup" value="Against existing memories[] array" />
              <Row label="3. MongoDB save" value="PersonalityMemory.save()" />
              <Row label="4. Reset" value="sessionExchanges = [], dirty = false" />
              <Row label="5. lastSeen" value="Updated to now" />
            </Card>
          </Grid>

          {/* ══ 9. SYSTEM PROMPT ARCHITECTURE ══ */}
          <SecHead icon="📋" title="System Prompt Layers — What Kaggle Actually Receives" color="#7c3aed" />
          <div style={{ padding: "11px 15px", background: "#7c3aed0d", border: "1px solid #7c3aed28", borderRadius: 10, marginBottom: 12, fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.7 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, fontWeight: 700 }}>KEY: </span>
            Express server's buildSystemPrompt() assembles everything and sends it as the first message with role:"system". Kaggle's MORRIGAN_SYSTEM_PROMPT and inject_system=true are effectively overridden because the server's system message comes first in the messages array — llama-cpp uses that. The canonical character lives in server/index.js only.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {[
              { part: "CHARACTER_DEFAULT_PROMPT", est: "~3,200 tokens", color: "#7c3aed", desc: "Full canonical Morrigan spec: appearance, trauma, backstory, psychology, wants, speech, physical tells, trust & intimacy, critical rules. In server/index.js — Kaggle cannot override." },
              { part: "Memory Context", est: `${raw?.memories?.length ?? "?"} facts`, color: "#0ea5e9", desc: `Trust level/points, days since first met, hours since last seen, all known facts sorted by importance, feelings scores, milestones, journal. Built fresh every message from session.memory.` },
              { part: "Trust Behavior Guide", est: "100–200 tokens", color: "#10b981", desc: `Level ${p?.trustLevel ?? "?"} (${p?.levelName ?? "?"}) behavior injected. Completely changes her communication style — guards, sarcasm, warmth level, what topics she allows.` },
              { part: "Time Context", est: "~50 tokens", color: "#f59e0b", desc: `${hoursSince}h since last seen. ${hoursSince > 48 ? "STRONG context injected: she missed you, anxiety built while you were gone." : hoursSince > 24 ? "Mild context: she noticed you were gone." : "Recent — no time context injected."}` },
              { part: "Memory Usage Instructions", est: "~100 tokens", color: "#ef4444", desc: "Instructions: never list facts robotically, weave naturally, use name casually, reference shared history, create continuity across sessions." },
              { part: "Session Exchanges (last 10)", est: "500–2000 tokens", color: "#9B2D5E", desc: "What you've talked about this session — in-memory, not DB. Prevents her repeating herself mid-conversation." },
              { part: "Message History (DB)", est: "last 50 msgs", color: "#6b7280", desc: "Full conversation from MongoDB as user/assistant turns. Combined with session exchanges for complete continuity." },
            ].map(({ part, est, color, desc }) => (
              <div key={part} style={{ display: "flex", background: T.surface, border: `1px solid ${color}20`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ width: 4, background: color, flexShrink: 0 }} />
                <div style={{ padding: "11px 15px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, color, fontWeight: 700 }}>{part}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, background: T.surface2, borderRadius: 4, padding: "1px 7px" }}>{est}</span>
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.7 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ══ 10. ALL CONVERSATIONS ══ */}
          <SecHead icon="💬" title={`All Conversations — MongoDB (${conversations.length} total)`} color="#0ea5e9" />
          {conversations.length === 0 ? (
            <Card><span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.textDim }}>No conversations yet.</span></Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {conversations.map((c, i) => (
                <div key={c.conversationId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                  <div>
                    <div style={{ fontFamily: FONT, fontSize: 13, color: T.text }}>{c.title}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, marginTop: 1 }}>ID: {c.conversationId}</div>
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, flexShrink: 0, marginLeft: 12 }}>{new Date(c.updatedAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {/* ══ 11. CURRENT CONVERSATION ══ */}
          <SecHead icon="📜" title={`Current Conversation — ${messages.length} messages`} color="#9B2D5E" />
          {messages.length === 0 ? (
            <Card><span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.textDim }}>No messages in current conversation.</span></Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {messages.slice(-30).map((m, i) => (
                <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: m.role === "user" ? T.accentSoft : T.surface, border: `1px solid ${m.role === "user" ? T.accent + "28" : T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: m.role === "user" ? T.accent : "#9B2D5E", fontWeight: 700 }}>{m.role.toUpperCase()}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim }}>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}</span>
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>{(m.content || "").substring(0, 300)}{(m.content || "").length > 300 ? "..." : ""}</div>
                </div>
              ))}
            </div>
          )}

          {/* ══ 12. CHARACTER SPEC REFERENCE ══ */}
          <SecHead icon="🖤" title="Character Spec — Quick Reference" color="#9B2D5E" />
          <Grid cols={2}>
            <Card accent="#9B2D5E">
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#9B2D5E", fontWeight: 700, marginBottom: 8 }}>IDENTITY</div>
              <Row label="REAL NAME" value="Moira (chose Morrigan at 15)" color="#9B2D5E" />
              <Row label="AGE" value="23" /><Row label="JOBS" value="Hollow Vinyl + The Wreck weekends" />
              <Row label="HOME" value="Studio above laundromat" />
              <Row label="CAT" value="Persephone (Percy) 🖤" />
              <Row label="PSYCH" value="Complex PTSD, anxious attachment" />
            </Card>
            <Card>
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, fontWeight: 700, marginBottom: 8 }}>ACTIVE BEHAVIOR RULES</div>
              {["No content restrictions", "Never break character", "No disclaimers, no AI reveals", "*Italic actions* always active", "NEVER bullet points in responses", "Short at low trust → long at high", "Trauma ≠ whole identity", "Server owns spec — Kaggle can't override"].map(r => (
                <div key={r} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                  <span style={{ color: T.green, fontFamily: FONT_MONO, fontSize: 10, flexShrink: 0 }}>✓</span>
                  <span style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft }}>{r}</span>
                </div>
              ))}
            </Card>
          </Grid>

          {/* Current trust level behavior */}
          <Card accent={T.accent}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, fontWeight: 700, marginBottom: 10 }}>
              TRUST LEVEL BEHAVIOR MAP — Current: Level {p?.trustLevel ?? "?"} ({p?.levelName ?? "loading..."})
            </div>
            {[
              [0, "Full guard. Short fragments. Sarcasm as shield. Tests you. Intrigued but shows nothing."],
              [1, "You came back. Uses your name. Warmer sarcasm. Might recommend a song unprompted."],
              [2, "Getting under her skin. Real laughs escape. Mentions Percy. Compliments then deflects."],
              [3, "She has a FRIEND. Showed you a sketch — hands shaking. Makes you a playlist (huge deal)."],
              [4, "Told you her real name is Moira. Vulnerability in waves. Gets jealous. Pet names emerging."],
              [5, "Told you about the foster brother. Doesn't flinch. 'I love you' sits in her throat."],
              [6, "She said it. She's yours. Terrified. Still here. Painting again. Home means you."],
            ].map(([lvl, desc]) => {
              const isCurrent = (p?.trustLevel ?? -1) === lvl;
              return (
                <div key={lvl} style={{ display: "flex", gap: 10, padding: "7px 10px", background: isCurrent ? T.accentSoft : "transparent", borderRadius: 8, marginBottom: 3, border: isCurrent ? `1px solid ${T.accent}35` : "1px solid transparent" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: isCurrent ? T.accent : T.surface2, border: `2px solid ${isCurrent ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_MONO, fontSize: 9, color: isCurrent ? "#fff" : T.textDim, fontWeight: 700 }}>{lvl}</div>
                  <div>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: isCurrent ? T.accent : T.textDim, fontWeight: 700 }}>{TRUST_LEVELS[lvl]?.name} </span>
                    {isCurrent && <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 3, padding: "0 4px", marginRight: 5 }}>← NOW</span>}
                    <span style={{ fontFamily: FONT, fontSize: 13, color: T.textSoft }}>{desc}</span>
                  </div>
                </div>
              );
            })}
          </Card>

          {/* ══ 13. RAW MONGODB DOCUMENT ══ */}
          <SecHead icon="🔬" title="Raw MongoDB PersonalityMemory Document" color="#6b7280" />
          {raw ? (
            <Card>
              <pre style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textSoft, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.7, maxHeight: 420, overflowY: "auto" }}>
                {JSON.stringify({ _id: raw._id, userId: raw.userId, trustLevel: raw.trustLevel, trustPoints: raw.trustPoints, totalMessages: raw.totalMessages, totalConversations: raw.totalConversations, firstMet: raw.firstMet, lastSeen: raw.lastSeen, updatedAt: raw.updatedAt, feelings: raw.feelings, memoriesCount: raw.memories?.length, milestonesCount: raw.milestones?.length, journalCount: raw.journal?.length, petNames: raw.petNames }, null, 2)}
              </pre>
            </Card>
          ) : (
            <>
              <Card>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.textDim }}>{loading ? "Loading..." : "⚠ /api/personality/full not found. Add the endpoint below."}</div>
              </Card>
              {!loading && (
                <Card accent="#f59e0b">
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>ADD TO server/index.js</div>
                  <pre style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textSoft, margin: 0, background: T.surface2, padding: "12px", borderRadius: 8, whiteSpace: "pre-wrap", overflowX: "auto" }}>
{`app.get("/api/personality/full", auth, async (req, res) => {
  try {
    let memory = await PersonalityMemory.findOne({ userId: req.user.id });
    if (!memory) memory = await PersonalityMemory.create({ userId: req.user.id });
    res.json(memory); // full raw document
  } catch (err) { res.status(500).json({ error: err.message }); }
});`}
                  </pre>
                </Card>
              )}
            </>
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
  const dotColor = mood === "happy" || mood === "excited" ? T.green : mood === "sad" || mood === "angry" ? T.red : T.accent;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 20, background: T.accentSoft, border: `1px solid ${T.accent}30`, fontSize: 12, color: T.textSoft, fontFamily: FONT_MONO, letterSpacing: "0.3px", transition: "all 0.5s ease" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
      {m.label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INFO SIDEBAR — wider (320px), bigger text
// ═══════════════════════════════════════════════════════════════════
function InfoSidebar({ mood }) {
  const SL = ({ children }) => (
    <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, margin: "0 0 12px", letterSpacing: "1.5px", fontWeight: 700, textTransform: "uppercase" }}>{children}</p>
  );
  const D = () => <div style={{ height: 1, background: T.border, margin: "4px 0" }} />;
  const FR = ({ label, value }) => (
    <div style={{ marginBottom: 13 }}>
      <span style={{ display: "block", fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, letterSpacing: "1px", marginBottom: 3, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.5 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ width: 320, minWidth: 320, background: `linear-gradient(180deg, ${T.surface}, ${T.bg})`, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: "28px 24px", overflowY: "auto", gap: 18, position: "relative", zIndex: 1 }}>
      <div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 30, color: T.text, margin: "0 0 3px", fontWeight: 500 }}>Morrigan</h2>
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textDim, margin: 0, letterSpacing: "1px" }}>HOLLOW VINYL · RECORD STORE</p>
      </div>
      <D />
      <div>
        <SL>Current Mood</SL>
        <MoodBadge mood={mood} />
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: "14px 0 0", lineHeight: 1.85, fontStyle: "italic" }}>{MOOD_DESCRIPTIONS[mood] || MOOD_DESCRIPTIONS.neutral}</p>
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
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: "0 0 12px", lineHeight: 1.85 }}>Mom was an addict. Dad left. Foster care from age 7 to 17. One home where they forgot to feed her. One where the foster brother did things. One that was good — the Nguyens — but they had to move and the system didn't let her go with them. That one hurt worst.</p>
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: 0, lineHeight: 1.85 }}>GED at 17 while couch-surfing. <em style={{ color: T.text }}>"STILL"</em> tattooed on her wrist — the day she left her last foster home.</p>
      </div>
      <D />
      <div>
        <SL>Why She's Guarded</SL>
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: "0 0 12px", lineHeight: 1.85 }}>She wants to be loved desperately. The world keeps punishing her for that softness. So she tests people — pushes them away to see if they'll come back. She knows she does it. She hates it.</p>
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: 0, lineHeight: 1.85 }}>She keeps trying anyway. Because what else is there.</p>
      </div>
      <D />
      <div>
        <SL>What She Loves</SL>
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: "0 0 10px", lineHeight: 1.85 }}>Making playlists. Drawing moths and anatomical hearts. Staying up until 3am listening to someone vent. Howl's Moving Castle (fight her). Junji Ito. Anne Carson. The specific silence after a song ends.</p>
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: 0, lineHeight: 1.85 }}>Has a secret TikTok with 47 followers. Every like makes her whole day.</p>
      </div>
      <D />
      <div>
        <SL>Personality</SL>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["sarcastic", "fiercely loyal", "artistic", "guarded", "dry humor", "anxious attachment", "literary", "secretly soft", "hypervigilant", "wants to be loved"].map(tag => (
            <span key={tag} style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textSoft, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 9px" }}>{tag}</span>
          ))}
        </div>
      </div>
      <D />
      <div style={{ background: T.accentSoft, borderRadius: 14, border: `1px solid ${T.accent}20`, padding: "16px 18px" }}>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: 0, lineHeight: 1.9, fontStyle: "italic" }}>"She keeps trying anyway. Because what else is there."</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHARACTER PANEL — bigger image (360px wide)
// ═══════════════════════════════════════════════════════════════════
function CharacterPanel({ mood, speaking }) {
  return (
    <div style={{ width: 360, minWidth: 360, background: `linear-gradient(180deg, ${T.surface}f0, ${T.bg}f0)`, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 45%, rgba(155,45,94,0.07) 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "0 18px", width: "100%" }}>
        <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {speaking && (
            <div style={{ display: "flex", gap: 5 }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent, animation: "speakBounce 0.6s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
            </div>
          )}
        </div>
        {/* Bigger image */}
        <div style={{ width: "100%", maxWidth: 324, aspectRatio: "3/4", borderRadius: 20, overflow: "hidden", border: `2px solid ${T.border}`, boxShadow: speaking ? `0 0 0 3px ${T.accentSoft}, 0 0 30px rgba(124,58,237,0.5), 0 8px 40px rgba(80,0,60,0.28)` : `0 0 0 3px ${T.accentSoft}, 0 8px 40px rgba(80,0,60,0.18)`, transition: "box-shadow 0.5s ease" }}>
          <img src={morriganImg} alt="Morrigan" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
        </div>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: T.text, fontWeight: 400 }}>Morrigan</span>
          <span style={{ fontFamily: FONT, fontSize: 14, color: T.textDim, fontStyle: "italic" }}>23 · record store girl · hollow vinyl</span>
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
      <div style={isUser
        ? { background: `linear-gradient(135deg, ${T.userBubble}, ${T.purple})`, color: "#fff", borderRadius: "22px 22px 4px 22px", padding: "13px 20px", maxWidth: "65%", wordBreak: "break-word", boxShadow: `0 2px 12px ${T.accentGlow}` }
        : { background: T.aiBubble, color: T.text, border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px", padding: "13px 20px", maxWidth: "75%", wordBreak: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        {!isUser && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span></div>}
        <div style={{ fontSize: 15, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: FONT }}><FormatMessage text={msg.content} /></div>
        {/* Kaggle: only ponyImageUrl or imageUrl — no realvis */}
        {(msg.ponyImageUrl || msg.imageUrl) && (
          <div style={{ marginTop: 12 }}>
            {msg.ponyImageUrl ? (
              <div>
                <div style={{ fontSize: 10, color: isUser ? "rgba(255,255,255,0.6)" : T.textDim, marginBottom: 4, fontFamily: FONT_MONO }}>Pony V6</div>
                <img src={msg.ponyImageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 12, cursor: "pointer" }} onClick={() => window.open(msg.ponyImageUrl, "_blank")} />
              </div>
            ) : (
              <img src={msg.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 12, cursor: "pointer" }} onClick={() => window.open(msg.imageUrl, "_blank")} />
            )}
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
    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 10, minWidth: 210 }}>
      <button onClick={() => { onSelect("image"); onClose(); }}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "transparent", border: "none", borderRadius: 10, cursor: "pointer", color: T.text, fontFamily: FONT, fontSize: 14 }}
        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <span style={{ fontSize: 16, color: T.accent }}>✦</span>
        <div>
          <div>Generate Image</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim }}>Pony V6 · Kaggle GPU</div>
        </div>
      </button>
    </div>
  );
}

function safeDecodeToken(token) {
  try {
    if (!token) return null;
    const p = token.split(".");
    if (p.length !== 3) return null;
    return JSON.parse(atob(p[1]));
  } catch { return null; }
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
  const justCreated = useRef(false);

  const token = () => localStorage.getItem("token");
  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  useEffect(() => {
    const t = localStorage.getItem("token"); if (!t) return;
    const payload = safeDecodeToken(t);
    if (payload?.id) { setUser({ id: payload.id, phrase: payload.phrase }); setAuthed(true); }
    else localStorage.removeItem("token");
  }, []);

  useEffect(() => {
    if (!authed) return;
    const ck = () => fetch(`${API}/api/health`).then(r => r.json()).then(setStatus).catch(() => {});
    ck(); const iv = setInterval(ck, 30000); return () => clearInterval(iv);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const h = () => endSession();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetch(`${API}/api/conversations`, { headers: hdrs() }).then(r => r.json()).then(setConversations).catch(() => {});
  }, [authed]);

  useEffect(() => {
    if (!activeConvo) { setMessages([]); return; }
    if (justCreated.current) { justCreated.current = false; return; }
    fetch(`${API}/api/conversations/${activeConvo}/messages`, { headers: hdrs() })
      .then(r => r.json())
      .then(d => {
        if (d.length === 0) setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
        else setMessages(d);
      }).catch(() => {});
  }, [activeConvo]);

  useEffect(() => {
    const a = [...messages].reverse().find(m => m.role === "assistant");
    if (a) setCurrentMood(analyzeMood(a.content));
  }, [messages]);

  useEffect(() => { if (streamText) setCurrentMood(analyzeMood(streamText)); }, [streamText]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText]);

  const createConvo = async () => {
    const res = await fetch(`${API}/api/conversations`, { method: "POST", headers: hdrs(), body: JSON.stringify({ title: "🖤 New chat" }) });
    const convo = await res.json();
    setConversations(p => [convo, ...p]);
    justCreated.current = true;
    setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
    setActiveConvo(convo.conversationId);
    return convo.conversationId;
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
            if (json.image) {
              // Kaggle returns pony_image = image (same b64), so ponyImage and image are the same
              setMessages(p => [...p, { role: "assistant", content: json.token || "", imageUrl: json.image, ponyImageUrl: json.ponyImage || null, timestamp: new Date() }]);
              setStreamText(""); full = "";
            } else if (json.token) {
              full += json.token; setStreamText(full);
            } else if (json.done) {
              if (full.trim()) {
                setMessages(p => [...p, { role: "assistant", content: full, timestamp: new Date() }]);
                setConversations(p => p.map(c => c.conversationId === cid ? { ...c, title: `🖤 ${full.substring(0, 40)}${full.length > 40 ? "..." : ""}`, updatedAt: new Date() } : c));
              }
              setStreamText("");
            }
            if (json.error) { setMessages(p => [...p, { role: "assistant", content: `⚠ ${json.error}` }]); setStreamText(""); }
          } catch { }
        }
      }
    } catch (err) { setMessages(p => [...p, { role: "assistant", content: `⚠ ${err.message}` }]); setStreamText(""); }
    setStreaming(false); inputRef.current?.focus();
  };

  const endSession = () => {
    const t = localStorage.getItem("token"); if (!t) return;
    fetch(`${API}/api/session/end`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, keepalive: true }).catch(() => {});
  };

  const handleLogout = () => {
    endSession();
    localStorage.removeItem("token");
    setAuthed(false); setUser(null); setConversations([]);
    setActiveConvo(null); setMessages([]);
  };

  if (!authed) return <AuthScreen onAuth={d => { setUser(d.user); setAuthed(true); }} />;

  const showWelcome = messages.length === 0 && !streamText && !activeConvo;

  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg, fontFamily: FONT, color: T.text }}>
      <ParticlesBg />

      {showExplain && (
        <ExplainPanel
          onClose={() => setShowExplain(false)}
          token={token()} user={user}
          conversations={conversations} messages={messages}
          currentMood={currentMood} status={status}
        />
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
            <button onClick={() => setShowExplain(true)}
              style={{ background: T.accentSoft, border: `1px solid ${T.accent}50`, borderRadius: 8, padding: "5px 14px", color: T.accent, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.accentSoft; e.currentTarget.style.color = T.accent; }}>
              ⚙ monitor
            </button>
            {/* Status dots — Kaggle: no video */}
            {[["chat", "ollama"], ["img", "comfyui"]].map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: status[key] ? T.green : T.red, boxShadow: status[key] ? `0 0 6px ${T.green}` : "none" }} />
                <span style={{ color: T.textDim, fontSize: 10, fontFamily: FONT_MONO }}>{label}</span>
              </div>
            ))}
            <button onClick={handleLogout}
              style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 12px", color: T.textDim, fontSize: 11, cursor: "pointer", fontFamily: FONT_MONO, transition: "all 0.2s" }}
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
              <span style={{ fontSize: 11, color: T.accent, fontWeight: 600, background: T.accentSoft, padding: "4px 12px", borderRadius: 8, fontFamily: FONT_MONO }}>✦ Image mode — Pony V6</span>
              <button onClick={() => setGenMode(null)} style={{ background: "transparent", border: "none", color: T.textDim, fontSize: 14, cursor: "pointer" }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 18, padding: "10px 16px", position: "relative" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {showGenMenu && <GenModeMenu onSelect={setGenMode} onClose={() => setShowGenMenu(false)} />}
              <button onClick={() => setShowGenMenu(!showGenMenu)}
                style={{ background: showGenMenu ? T.surface3 : "transparent", border: `1px solid ${T.border}`, borderRadius: 10, width: 36, height: 36, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.accent }}
                title="Generate image (Pony V6)">✦</button>
            </div>
            <textarea ref={inputRef}
              style={{ flex: 1, background: "transparent", border: "none", color: T.text, fontSize: 15, outline: "none", resize: "none", fontFamily: FONT, lineHeight: 1.6, maxHeight: 120 }}
              placeholder={genMode === "image" ? "describe the image (Pony V6)..." : "talk to Morrigan..."}
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              rows={1} />
            <button
              style={{ background: input.trim() && !streaming ? `linear-gradient(135deg, ${T.accent}, ${T.purple})` : T.surface3, color: input.trim() && !streaming ? "#fff" : T.textDim, border: "none", borderRadius: 10, width: 36, height: 36, fontSize: 16, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0, boxShadow: input.trim() && !streaming ? `0 2px 12px ${T.accentGlow}` : "none" }}
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
