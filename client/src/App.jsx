import React, { useState, useEffect, useRef } from "react";
import morriganImg from "./morgan.png";

const API = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "http://localhost:5000")
  : "";

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
// Minimal fallbacks — only used before first LLM mood reflection arrives.
// These are intentionally vague. Real mood descriptions are generated dynamically
// by the server via MOOD_REFLECTION_PROMPT after each exchange.
const MOOD_DESCRIPTIONS = {
  neutral: "", happy: "", sad: "", flirty: "",
  angry: "", shy: "", sarcastic: "", vulnerable: "", excited: "",
};

// Lightweight heuristic for mood badge during streaming — overridden by
// server's LLM-generated moodReflection once the response completes.
// This is intentionally rough; the real mood comes from MOOD_REFLECTION_PROMPT.
function analyzeMood(text) {
  if (!text) return "neutral";
  const t = text.toLowerCase();
  if (/(fuck off|shut up|hate|angry|pissed|furious|rage)/i.test(t)) return "angry";
  if (/(trust|safe|scared to|never told|don't leave|meant a lot)/i.test(t)) return "vulnerable";
  if (/(blush|cute|handsome|gorgeous|crush|kiss|flutter)/i.test(t)) return "flirty";
  if (/(sad|hurt|cry|pain|alone|lonely|afraid|numb|broken)/i.test(t)) return "sad";
  if (/(um|uh|i guess|nevermind|forget it|i shouldn't)/i.test(t)) return "shy";
  if (/(oh my god|holy shit|no way|dude|wait what)/i.test(t)) return "excited";
  if (/(wow really|sure jan|as if|obviously|oh please)/i.test(t)) return "sarcastic";
  if (/(laugh|haha|lol|smile|happy|joy|amazing|warm)/i.test(t)) return "happy";
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
// MONITOR PANEL
// ═══════════════════════════════════════════════════════════════════

const MON = {
  bg: "#f6f7fb", surface: "#ffffff", surface2: "#f0f0f5", surface3: "#e8e8f0",
  border: "#e6e8ef", text: "#1f2937", textSoft: "#4b5563", textDim: "#9ca3af",
  accent: "#7c3aed", accentSoft: "#ede9fe", purple: "#9f67ff",
  red: "#dc2626", green: "#10b981", amber: "#f59e0b", blue: "#0ea5e9", pink: "#9B2D5E",
};
const MMONO    = "'JetBrains Mono', 'Fira Code', monospace";
const MSERIF   = "'Crimson Pro', Georgia, serif";
const MDISPLAY = "'Playfair Display', 'Crimson Pro', serif";

const MONITOR_TABS = [
  { id: "status",  label: "System",       icon: "◉" },
  { id: "session", label: "Session",      icon: "◈" },
  { id: "phase5",  label: "Intelligence", icon: "∞" },
  { id: "phase6",  label: "Health",       icon: "♡" },
];

function MLabel({ children, color = MON.accent }) {
  return <div style={{ fontFamily: MMONO, fontSize: 11, color, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", marginBottom: 12 }}>{children}</div>;
}
function MCard({ children, accent, style = {} }) {
  return (
    <div style={{ background: MON.surface, border: `1px solid ${accent ? accent + "30" : MON.border}`, borderLeft: accent ? `4px solid ${accent}` : `1px solid ${MON.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 12, ...style }}>
      {children}
    </div>
  );
}
function MSecHead({ icon, title, color = MON.accent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "36px 0 16px", paddingBottom: 12, borderBottom: `1px solid ${color}25` }}>
      <span style={{ fontSize: 16, color }}>{icon}</span>
      <span style={{ fontFamily: MMONO, fontSize: 12, color, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${color}20, transparent)` }} />
    </div>
  );
}
function MRow({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9, gap: 16 }}>
      <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: MMONO, fontSize: 13, color: valueColor || MON.text, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{String(value ?? "—")}</span>
    </div>
  );
}
function MPill({ children, color = MON.accent }) {
  return <span style={{ fontFamily: MMONO, fontSize: 10, fontWeight: 700, color, background: color + "12", border: `1px solid ${color}25`, borderRadius: 5, padding: "3px 9px", marginRight: 5, marginBottom: 5, display: "inline-block" }}>{children}</span>;
}
function MStatusDot({ live }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 9, height: 9, borderRadius: "50%", background: live ? MON.green : MON.red, boxShadow: live ? `0 0 8px ${MON.green}80` : "none", flexShrink: 0 }} />
      <span style={{ fontFamily: MMONO, fontSize: 11, color: live ? MON.green : MON.red, fontWeight: 700 }}>{live ? "ONLINE" : "OFFLINE"}</span>
    </div>
  );
}
function MBar({ value, max = 100, color = MON.accent, label, sub }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div>
          <span style={{ fontFamily: MMONO, fontSize: 13, color: MON.text }}>{label}</span>
          {sub && <span style={{ fontFamily: MSERIF, fontSize: 13, color: MON.textDim, marginLeft: 10, fontStyle: "italic" }}>{sub}</span>}
        </div>
        <span style={{ fontFamily: MMONO, fontSize: 12, color }}>{value}/{max}</span>
      </div>
      <div style={{ height: 6, background: MON.surface2, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(to right, ${color}, ${color}99)`, borderRadius: 4, transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

// ── Tab 1: System Status ──────────────────────────────────────────

function StatusTab({ status, user, conversations, messages, liveHealth }) {
  const endpoint = API;
  const checks = [
    {
      key: "express", label: "Express Server",
      live: liveHealth?.express ?? null,
      description: "Node.js backend — JWT auth, MongoDB, session cache, prompt assembly, LLM proxy.",
      route: "GET /health",
      detail: endpoint.replace("https://", "").replace("http://", ""),
    },
    {
      key: "ollama", label: "Chat — OpenRouter",
      live: status.ollama,
      description: "Streaming chat completions via OpenRouter. inject_system: false keeps Express in control of the full prompt.",
      route: "POST /v1/chat/completions → OpenRouter",
      detail: status.model || "chat model",
    },
    {
      key: "embeddings", label: "Embeddings — OpenRouter",
      live: status.embeddings,
      description: "Converts memory atoms to vectors for cosine similarity retrieval.",
      route: "POST /v1/embeddings → OpenRouter",
      detail: status.embedModel || "embed model",
    },
    {
      key: "mongo", label: "MongoDB Atlas",
      live: liveHealth?.mongo ?? (liveHealth ? true : null),
      description: "Permanent storage for PersonalityMemory (trust, feelings, memories, self-reflection), Conversations, and Messages.",
      route: "mongoose ODM · auto-reconnect",
      detail: "PersonalityMemory · Conversations · Messages · SelfAtoms",
    },
  ];

  return (
    <div>
      <MSecHead icon="◉" title="Live System Checks" color={MON.green} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {checks.map(c => (
          <div key={c.key} style={{ background: MON.surface, border: `1px solid ${c.live === null ? MON.border : c.live ? MON.green + "35" : MON.red + "30"}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              {c.live === null ? <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim, fontWeight: 700 }}>PENDING</span> : <MStatusDot live={!!c.live} />}
              <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, textAlign: "right", maxWidth: 240 }}>{c.route}</span>
            </div>
            <div style={{ fontFamily: MMONO, fontSize: 13, color: MON.text, fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.65, marginBottom: 10 }}>{c.description}</div>
            <span style={{ fontFamily: MMONO, fontSize: 11, color: c.live ? MON.green : MON.textDim }}>{c.detail}</span>
          </div>
        ))}
      </div>
      <MSecHead icon="👤" title="Current Session" color={MON.accent} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <MCard><MLabel>Identity</MLabel>
          <MRow label="USER ID"  value={user?.id ? `…${user.id.slice(-10)}` : "—"} valueColor={MON.accent} />
          <MRow label="TOKEN"    value="JWT · 90d expiry" />
          <MRow label="AUTH"     value="sha256 phrase hash" />
        </MCard>
        <MCard><MLabel>Conversations</MLabel>
          <MRow label="TOTAL IN DB"     value={conversations.length} valueColor={MON.accent} />
          <MRow label="MSGS THIS CONVO" value={messages.length} />
          <MRow label="USER MSGS"       value={messages.filter(m => m.role === "user").length} />
          <MRow label="AI MSGS"         value={messages.filter(m => m.role === "assistant").length} />
        </MCard>
        <MCard><MLabel>Environment</MLabel>
          <MRow label="API BASE"    value={endpoint.replace("https://", "").replace("http://", "")} valueColor={MON.blue} />
          <MRow label="LLM BACKEND" value="OpenRouter" valueColor={MON.green} />
          <MRow label="CHAT MODEL"  value={status.model || "—"} />
          <MRow label="EMBED MODEL" value={status.embedModel || "—"} />
        </MCard>
      </div>
    </div>
  );
}

// ── Tab 2: Session & Memory ───────────────────────────────────────

function SessionTab({ messages, livePersonality }) {
  const p   = livePersonality?.summary;
  const raw = livePersonality?.full;
  const trustLevel = p?.trustLevel ?? 0;
  const nextLevel  = Math.min(trustLevel + 1, 6);
  const nextPoints = TRUST_LEVELS[nextLevel]?.points ?? 320;
  const hoursSince = p?.lastSeen ? Math.floor((Date.now() - new Date(p.lastSeen)) / 3600000) : 0;

  const CAT_COLORS = {
    name: "#7c3aed", interest: "#0ea5e9", personal: "#10b981",
    emotional: "#ec4899", preference: "#f59e0b", relationship: "#ef4444", event: "#9B2D5E",
  };

  return (
    <div>
      <MSecHead icon="📈" title="Trust System" color={MON.accent} />
      <MCard>
        <MBar value={p?.trustPoints ?? 0} max={nextPoints} label={`Points toward level ${nextLevel}`} color={MON.accent} />
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {Object.entries(TRUST_LEVELS).map(([lvl, data]) => {
            const n = parseInt(lvl); const active = n <= trustLevel; const current = n === trustLevel;
            return (
              <div key={lvl} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ width: 13, height: 13, borderRadius: "50%", margin: "0 auto 6px", background: active ? MON.accent : MON.surface2, border: `2px solid ${active ? MON.accent : MON.border}`, boxShadow: current ? `0 0 12px ${MON.accent}` : "none" }} />
                <span style={{ display: "block", fontFamily: MMONO, fontSize: 9, color: current ? MON.accent : MON.textDim, lineHeight: 1.4, fontWeight: current ? 700 : 400 }}>{data.name}</span>
                <span style={{ display: "block", fontFamily: MMONO, fontSize: 9, color: MON.textDim }}>{data.points}pt</span>
              </div>
            );
          })}
        </div>
      </MCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <MCard>
          <MRow label="TRUST LEVEL"   value={`${trustLevel}/6 — ${TRUST_LEVELS[trustLevel]?.name}`} valueColor={MON.accent} />
          <MRow label="TRUST POINTS"  value={p?.trustPoints ?? "—"} valueColor={MON.accent} />
          <MRow label="TO NEXT LEVEL" value={p?.pointsToNext ? `${p.pointsToNext} pts` : "MAX"} />
        </MCard>
        <MCard>
          <MRow label="TOTAL MSGS"    value={p?.totalMessages ?? "—"} />
          <MRow label="TOTAL CONVOS"  value={p?.totalConversations ?? "—"} />
          <MRow label="MEMORIES"      value={raw?.memories?.length ?? p?.memoriesCount ?? "—"} />
          <MRow label="MOLECULES"     value={raw?.molecules?.length ?? p?.moleculesCount ?? "—"} valueColor={MON.blue} />
        </MCard>
        <MCard>
          <MRow label="FIRST MET"         value={p?.firstMet ? new Date(p.firstMet).toLocaleDateString() : "—"} />
          <MRow label="DAYS TOGETHER"     value={p?.firstMet ? `${Math.floor((Date.now() - new Date(p.firstMet)) / 86400000)}d` : "—"} />
          <MRow label="HOURS SINCE FLUSH" value={`${hoursSince}h`} valueColor={hoursSince > 24 ? MON.amber : MON.text} />
          <MRow label="SPT DEPTH"         value={`${p?.sptDepth ?? 1}/4`} valueColor={MON.purple} />
          <MRow label="CALLBACKS PENDING" value={p?.callbacksPending ?? "—"} valueColor={p?.callbacksPending > 0 ? MON.pink : MON.textDim} />
        </MCard>
      </div>

      {raw?.selfReflectionState && (
        <>
          <MSecHead icon="🪞" title="Self-Reflection State — what Morrigan is sitting with" color={MON.pink} />
          <MCard accent={MON.pink}>
            <div style={{ fontFamily: MSERIF, fontSize: 16, color: MON.text, lineHeight: 1.85, fontStyle: "italic" }}>{raw.selfReflectionState}</div>
            <div style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 8 }}>regenerated each session · about Morrigan, not the user</div>
          </MCard>
        </>
      )}

      {raw?.looseThread && (
        <>
          <MSecHead icon="∞" title="Loose Thread — Phase 5 presence signal" color={MON.accent} />
          <MCard accent={MON.accent}>
            <div style={{ fontFamily: MSERIF, fontSize: 16, color: MON.text, lineHeight: 1.85, fontStyle: "italic" }}>"{raw.looseThread}"</div>
            <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
              <div style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim }}>injected at position 10 · distinct from callbacks · felt quality not task</div>
              {raw.looseThreadCreatedAt && <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim }}>generated {new Date(raw.looseThreadCreatedAt).toLocaleString()}</span>}
            </div>
          </MCard>
        </>
      )}

      <MSecHead icon="💜" title="Morrigan's Feelings" color="#ec4899" />
      <MCard>
        {[
          { key: "affection",      label: "Affection",           sub: "how much she likes you",       color: "#ec4899" },
          { key: "comfort",        label: "Comfort",             sub: "how safe she feels",            color: MON.green },
          { key: "attraction",     label: "Attraction",          sub: "romantic interest",             color: MON.amber },
          { key: "protectiveness", label: "Protectiveness",      sub: "wants to protect you",          color: MON.blue  },
          { key: "vulnerability",  label: "Vulnerability shown", sub: "how much she's opened up",      color: MON.purple},
        ].map(({ key, label, sub, color }) => (
          <MBar key={key} value={raw?.feelings?.[key] ?? p?.feelings?.[key] ?? 0} max={100} label={label} sub={sub} color={color} />
        ))}
        <div style={{ fontFamily: MSERIF, fontSize: 13, color: MON.textDim, marginTop: 4, fontStyle: "italic" }}>In-session changes live in server RAM — reflected here after logout/login.</div>
      </MCard>

      <MSecHead icon="🧠" title="Stored Memories" color={MON.blue} />
      {raw?.memories?.length > 0 ? (
        <>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.entries(CAT_COLORS).map(([cat, color]) => {
              const count = raw.memories.filter(m => m.category === cat).length;
              if (!count) return null;
              return <MPill key={cat} color={color}>{cat} × {count}</MPill>;
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[...raw.memories].sort((a, b) => (b.importance || 1) - (a.importance || 1)).map((mem, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "13px 18px", background: MON.surface, border: `1px solid ${CAT_COLORS[mem.category] || MON.accent}22`, borderLeft: `4px solid ${CAT_COLORS[mem.category] || MON.accent}`, borderRadius: 10 }}>
                <div style={{ flexShrink: 0, paddingTop: 3 }}>
                  <MPill color={CAT_COLORS[mem.category] || MON.accent}>{mem.category}</MPill>
                  <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
                    {[1,2,3,4,5].map(n => <div key={n} style={{ width: 5, height: 5, borderRadius: "50%", background: n <= (mem.importance || 1) ? (CAT_COLORS[mem.category] || MON.accent) : MON.surface3 }} />)}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.text, lineHeight: 1.6 }}>{mem.fact}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {mem.valence?.emotion && mem.valence.emotion !== "neutral" && (
                      <span style={{ fontFamily: MMONO, fontSize: 9, color: MON.pink, background: MON.pink + "12", border: `1px solid ${MON.pink}25`, borderRadius: 4, padding: "2px 7px" }}>
                        {mem.valence.charge > 0 ? "+" : mem.valence.charge < 0 ? "−" : "·"} {mem.valence.emotion}
                      </span>
                    )}
                    {mem.temporal?.period && <span style={{ fontFamily: MMONO, fontSize: 9, color: MON.blue, background: MON.blue + "12", border: `1px solid ${MON.blue}25`, borderRadius: 4, padding: "2px 7px" }}>{mem.temporal.period}</span>}
                    {mem.temporal?.isOngoing && mem.temporal.isOngoing !== "unclear" && (
                      <span style={{ fontFamily: MMONO, fontSize: 9, color: mem.temporal.isOngoing === "yes" ? MON.green : MON.textDim, borderRadius: 4, padding: "2px 7px" }}>
                        {mem.temporal.isOngoing === "yes" ? "ongoing" : mem.temporal.isOngoing === "no" ? "past" : mem.temporal.isOngoing}
                      </span>
                    )}
                    {mem.embedding?.length > 0 && <span style={{ fontFamily: MMONO, fontSize: 9, color: MON.green, background: MON.green + "10", borderRadius: 4, padding: "2px 7px" }}>⬡ embedded</span>}
                    {mem.contradicts?.length > 0 && (() => {
                      const ambCount = mem.contradicts.filter(c => c && c.type === "ambivalence").length;
                      const contraCount = mem.contradicts.length - ambCount;
                      return <>
                        {ambCount > 0 && <span style={{ fontFamily: MMONO, fontSize: 9, color: MON.purple, background: MON.purple + "12", border: `1px solid ${MON.purple}25`, borderRadius: 4, padding: "2px 7px" }}>~ {ambCount} ambivalence{ambCount > 1 ? "s" : ""}</span>}
                        {contraCount > 0 && <span style={{ fontFamily: MMONO, fontSize: 9, color: MON.amber, background: MON.amber + "12", border: `1px solid ${MON.amber}25`, borderRadius: 4, padding: "2px 7px" }}>⚡ {contraCount} tension{contraCount > 1 ? "s" : ""}</span>}
                      </>;
                    })()}
                  </div>
                  {mem.learnedAt && <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 4, display: "block" }}>learned {new Date(mem.learnedAt).toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <MCard><div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textDim }}>No memories yet — extracted at session end.</div></MCard>
      )}

      {(raw?.molecules?.length ?? 0) > 0 && (
        <>
          <MSecHead icon="⬡" title="Molecules — synthesised clusters" color={MON.blue} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {raw.molecules.map((mol, i) => (
              <div key={i} style={{ padding: "14px 18px", background: MON.surface, border: `1px solid ${MON.blue}22`, borderLeft: `4px solid ${MON.blue}`, borderRadius: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  {mol.emotion && <MPill color={MON.pink}>{mol.emotion}</MPill>}
                  {mol.period && <MPill color={MON.blue}>{mol.period}</MPill>}
                  <MPill color={MON.textDim}>{mol.atomIds?.length ?? 0} atoms</MPill>
                  {mol.embedding?.length > 0 && <MPill color={MON.green}>⬡ embedded</MPill>}
                </div>
                <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.75, fontStyle: "italic" }}>{mol.summary}</div>
                {mol.createdAt && <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 6, display: "block" }}>synthesised {new Date(mol.createdAt).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {(raw?.milestones?.length ?? 0) > 0 && (
        <>
          <MSecHead icon="🏁" title="Milestones" color={MON.pink} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {raw.milestones.map((ms, i) => {
              const m = typeof ms === "string" ? { event: ms } : ms;
              return (
                <div key={i} style={{ display: "flex", gap: 16, padding: "13px 18px", background: MON.surface, border: `1px solid ${MON.accent}20`, borderLeft: `4px solid ${MON.pink}`, borderRadius: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, minWidth: 50 }}>
                    {m.trustLevelAtTime != null && <span style={{ fontFamily: MMONO, fontSize: 12, color: MON.accent, paddingTop: 2 }}>LVL {m.trustLevelAtTime}</span>}
                    {m.category && <span style={{ fontFamily: MMONO, fontSize: 9, color: MON.textDim, marginTop: 2 }}>{m.category}</span>}
                    {m.source && m.source !== "organic" && <span style={{ fontFamily: MMONO, fontSize: 8, color: MON.amber, marginTop: 2 }}>{m.source.replace(/_/g, " ")}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, fontStyle: "italic", lineHeight: 1.65 }}>{m.event}</div>
                    {m.exchangeContext && <div style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 4, lineHeight: 1.4 }}>{m.exchangeContext}</div>}
                    {m.timestamp && <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 4, display: "block" }}>{new Date(m.timestamp).toLocaleString()}</span>}
                  </div>
                  {m.significance && <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.accent, flexShrink: 0, opacity: 0.7 }}>{m.significance}/10</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab 4: Phase 5 — Continuation Signal & Tuning ────────────────

function Phase5Tab({ token }) {
  const [status,   setStatus]   = useState(null);
  const [tuning,   setTuning]   = useState(null);
  const [dataset,  setDataset]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [building, setBuilding] = useState(false);
  const endpoint = API;
  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${typeof token === "function" ? token() : token}` });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, t] = await Promise.allSettled([
          fetch(`${endpoint}/api/phase5/status`, { headers: hdrs() }).then(r => r.json()),
          fetch(`${endpoint}/api/phase5/tuning`,  { headers: hdrs() }).then(r => r.json()),
        ]);
        if (s.status === "fulfilled") setStatus(s.value);
        if (t.status === "fulfilled") setTuning(t.value);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const buildDataset = async () => {
    setBuilding(true);
    try {
      const r = await fetch(`${endpoint}/api/phase5/build-dataset`, {
        method: "POST", headers: hdrs(),
        body: JSON.stringify({ includeData: false }),
      });
      setDataset(await r.json());
    } catch {}
    setBuilding(false);
  };

  if (loading) return <div style={{ fontFamily: MMONO, fontSize: 13, color: MON.textDim, padding: 40, textAlign: "center" }}>loading phase 5 data…</div>;

  const THRESHOLD_RULES = [
    { metric: "innerThoughtFit avg", target: "> 7.0 (primary)",  note: "Primary metric. Best signal of Phase 3 + Phase 5 working together.", color: MON.accent,  value: tuning?.metrics?.avgInnerThoughtFit },
    { metric: "noiseRate",           target: "< 30%",             note: "If > 30%: lower valence weight 0.10 → 0.07.",                       color: MON.amber,   value: tuning?.metrics?.noiseRate },
    { metric: "callbackConsumed",    target: "> 50%",             note: "If < 50%: check prospectiveNote injection at position 6.",           color: MON.green,   value: tuning?.metrics?.callbackConsumedRate },
    { metric: "injection rate",      target: "< 40%",             note: "If > 40%: increase cadence damping to messagesSinceLastThought >= 4.",color: MON.blue,   value: tuning?.metrics?.injectionRate },
    { metric: "missRate",            target: "< 20%",             note: "If > 20%: raise importance weight 0.25 → 0.30, lower recency 0.10 → 0.07.", color: MON.purple, value: tuning?.metrics?.missRate },
  ];

  const TUNING_CYCLES = [
    { cycle: "Session-level spot check",       when: "Every 50–100 sessions",   action: "Read EvaluationRecords manually. Look for patterns." },
    { cycle: "Threshold + weight adjustment",  when: "Every 200–300 sessions",  action: "Aggregate metrics → adjust motivation threshold, cadence damping, retrieval weights." },
    { cycle: "Composition call tuning",        when: "Every 300–500 sessions",  action: "Refine inner thoughts weaving prompt based on innerThoughtFit scores." },
    { cycle: "Learned re-ranking",             when: "~500–700 sessions",       action: "Train reranker on EvaluationRecords. Keep cadence damping as hard gate." },
  ];

  return (
    <div>
      <MSecHead icon="∞" title="Part A — Continuation Signal" color={MON.accent} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <MCard accent={MON.green}>
          <MLabel color={MON.green}>Standing Instruction (position 10 — verbatim)</MLabel>
          <MRow label="STATUS"   value="ACTIVE" valueColor={MON.green} />
          <MRow label="WIRED AS" value="getContinuationBlock(memory)" />
          <div style={{ fontFamily: MSERIF, fontSize: 14, color: MON.textSoft, lineHeight: 1.7, marginTop: 10 }}>
            Verbatim from spec. Presence without demand. Returns base CONTINUATION_SIGNAL alone, or with looseThread appended under [What she is still holding] when present.
          </div>
        </MCard>
        <MCard accent={status?.looseThread ? MON.pink : MON.border}>
          <MLabel color={MON.pink}>Loose Thread — Step 2 (looseThread)</MLabel>
          <MRow label="GENERATED" value={status?.looseThread ? "YES" : "NOT YET"} valueColor={status?.looseThread ? MON.green : MON.textDim} />
          <MRow label="FIELD"     value="PersonalityMemory.looseThread" />
          <MRow label="STEP"      value="6b — generated after callback queue" />
          {status?.looseThread
            ? <div style={{ marginTop: 12, padding: "10px 14px", background: MON.pink + "10", border: `1px solid ${MON.pink}25`, borderRadius: 8 }}>
                <div style={{ fontFamily: MMONO, fontSize: 10, color: MON.pink, marginBottom: 6 }}>CURRENT THREAD</div>
                <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.text, lineHeight: 1.75, fontStyle: "italic" }}>"{status.looseThread}"</div>
              </div>
            : <div style={{ fontFamily: MSERIF, fontSize: 14, color: MON.textDim, marginTop: 10, lineHeight: 1.6 }}>Distinct from callbacks — a felt quality, not a task. Generated at session end.</div>
          }
        </MCard>
      </div>
      {status?.prospectiveNote && (
        <MCard accent={MON.blue}>
          <MLabel color={MON.blue}>Prospective Note (position 6)</MLabel>
          <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.text, lineHeight: 1.75, fontStyle: "italic" }}>"{status.prospectiveNote}"</div>
          <div style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 8 }}>{status.callbacksPending ?? 0} callback(s) pending · injected at session start only</div>
        </MCard>
      )}

      <MSecHead icon="⟳" title="Part B — Tuning Dashboard (Step 6)" color={MON.purple} />
      {tuning?.alerts?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {tuning.alerts.map((alert, i) => (
            <div key={i} style={{ padding: "10px 16px", background: MON.red + "12", border: `1px solid ${MON.red}30`, borderRadius: 8, marginBottom: 6, display: "flex", gap: 10 }}>
              <span style={{ color: MON.red }}>⚠</span>
              <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.red }}>{alert}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <MCard>
          <MLabel>Aggregate Metrics ({tuning?.sessionsAnalysed ?? 0} sessions)</MLabel>
          <MRow label="AVG innerThoughtFit"    value={tuning?.metrics?.avgInnerThoughtFit != null ? tuning.metrics.avgInnerThoughtFit.toFixed(2) : "—"} valueColor={tuning?.metrics?.avgInnerThoughtFit >= 7 ? MON.green : MON.amber} />
          <MRow label="NOISE RATE"             value={tuning?.metrics?.noiseRate != null ? `${(tuning.metrics.noiseRate*100).toFixed(1)}%` : "—"} valueColor={tuning?.metrics?.noiseRate > 0.30 ? MON.red : MON.green} />
          <MRow label="MISS RATE"              value={tuning?.metrics?.missRate != null ? `${(tuning.metrics.missRate*100).toFixed(1)}%` : "—"} valueColor={tuning?.metrics?.missRate > 0.20 ? MON.red : MON.green} />
          <MRow label="INJECTION RATE"         value={tuning?.metrics?.injectionRate != null ? `${(tuning.metrics.injectionRate*100).toFixed(1)}%` : "—"} valueColor={tuning?.metrics?.injectionRate > 0.40 ? MON.red : MON.green} />
          <MRow label="CALLBACK CONSUMED RATE" value={tuning?.metrics?.callbackConsumedRate != null ? `${(tuning.metrics.callbackConsumedRate*100).toFixed(1)}%` : "—"} valueColor={tuning?.metrics?.callbackConsumedRate < 0.50 ? MON.amber : MON.green} />
          <MRow label="SPT ACCURACY"           value={tuning?.metrics?.sptAccuracy != null ? tuning.metrics.sptAccuracy.toFixed(2) : "—"} />
        </MCard>
        <MCard>
          <MLabel>Trend — Recent 50 vs Prior 50</MLabel>
          <MRow label="RECENT AVG (innerThoughtFit)" value={tuning?.trend?.recentAvg ?? "—"} valueColor={MON.accent} />
          <MRow label="PRIOR AVG"                    value={tuning?.trend?.priorAvg ?? "—"} />
          <MRow label="DELTA"                        value={tuning?.trend?.innerThoughtFit != null ? (tuning.trend.innerThoughtFit > 0 ? `+${tuning.trend.innerThoughtFit}` : String(tuning.trend.innerThoughtFit)) : "—"} valueColor={tuning?.trend?.innerThoughtFit > 0 ? MON.green : tuning?.trend?.innerThoughtFit < 0 ? MON.red : MON.textDim} />
          <div style={{ marginTop: 14, borderTop: `1px solid ${MON.border}`, paddingTop: 12 }}>
            <MLabel>Live Session</MLabel>
            <MRow label="MESSAGES"   value={tuning?.liveSession?.messagesThisSession ?? "—"} />
            <MRow label="RESERVOIR"  value={tuning?.liveSession?.thoughtsInReservoir ?? 0} valueColor={MON.purple} />
            <MRow label="COOLDOWN"   value={tuning?.liveSession?.thoughtCooldown !== null ? `${tuning.liveSession.thoughtCooldown} msgs` : "—"} />
          </div>
        </MCard>
      </div>
      <MCard>
        <MLabel>Active Thresholds + Weights</MLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <MRow label="MOTIVATION THRESHOLD" value="4.0 / 10 (at-risk: 3.5)"     valueColor={MON.accent} />
            <MRow label="CADENCE DAMPING"       value="≥ 3 messages" valueColor={MON.accent} />
          </div>
          <div>
            <MRow label="SIMILARITY weight" value="0.55" />
            <MRow label="IMPORTANCE weight" value="0.25" />
            <MRow label="RECENCY weight"    value="0.10" />
            <MRow label="VALENCE weight"    value="0.10" />
          </div>
        </div>
        <div style={{ fontFamily: MMONO, fontSize: 10, color: MON.amber, marginTop: 8, padding: "6px 10px", background: MON.amber+"10", borderRadius: 6 }}>
          ⚠ One variable at a time. 100-session wait between changes. Log every adjustment: date · trigger metric · old value · new value.
        </div>
      </MCard>

      <MSecHead icon="◎" title="Metric Targets + Alert Conditions" color={MON.blue} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {THRESHOLD_RULES.map(({ metric, target, note, color, value }) => (
          <div key={metric} style={{ display: "flex", gap: 16, padding: "14px 18px", background: MON.surface, border: `1px solid ${color}20`, borderLeft: `4px solid ${color}`, borderRadius: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: MMONO, fontSize: 13, color, fontWeight: 700 }}>{metric}</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim }}>target: {target}</span>
                  {value != null && <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.text }}>now: {typeof value === "number" ? value.toFixed(2) : value}</span>}
                </div>
              </div>
              <div style={{ fontFamily: MSERIF, fontSize: 14, color: MON.textSoft, lineHeight: 1.6 }}>{note}</div>
            </div>
          </div>
        ))}
      </div>

      <MSecHead icon="🧬" title="Step 5 — Dual-Reasoning" color={MON.purple} />
      <MCard accent={MON.purple}>
        <MLabel color={MON.purple}>reasonsFor / reasonsAgainst before scoring</MLabel>
        <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.75 }}>
          Score happens AFTER listing reasons for and against. Prevents inflation (+0.5–1.0 pts without it). Both fields stored on MessageEval as <strong style={{ color: MON.text }}>innerThoughtReasoning</strong>. Primary tuning signal: if timing appears consistently in reasonsAgainst, increase cadence damping.
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <MPill color={MON.green}>reasonsFor: relevance · info gap · timing · reciprocity</MPill>
          <MPill color={MON.red}>reasonsAgainst: derailing · too soon · low relevance · wrong moment</MPill>
        </div>
      </MCard>

      <MSecHead icon="🎼" title="Step 8 — Composition Call" color={MON.blue} />
      <MCard accent={MON.blue}>
        <MLabel color={MON.blue}>composeWithInnerThought() + COMPOSITION_CONSTRAINTS</MLabel>
        <MRow label="STATUS"    value="ACTIVE — fires when winner is selected" valueColor={MON.green} />
        <MRow label="FUNCTION"  value="composeWithInnerThought(mainResponse, thought, type)" />
        <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.75, marginTop: 10 }}>
          Separate LLM call. Weaves inner thought naturally — not appended. Constraints: no last-sentence placement, no transitional phrases (by the way / also / I wanted to mention / on another note / speaking of which), user words acknowledged before any self-disclosure.
        </div>
      </MCard>

      <MSecHead icon="📊" title="Step 9 — Training Dataset Builder" color={MON.accent} />
      <MCard>
        <MLabel>POST /api/phase5/build-dataset</MLabel>
        <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.75, marginBottom: 14 }}>
          Reads EvaluationRecords, outputs JSONL for preference training. label = "positive" if innerThoughtScore ≥ 7.5. Target: 500+ examples, 60/40 split. Do not train if class imbalance exceeds 75/25.
        </div>
        <button onClick={buildDataset} disabled={building}
          style={{ background: building ? MON.surface2 : MON.accentSoft, border: `1px solid ${MON.accent}40`, borderRadius: 8, padding: "8px 20px", color: MON.accent, fontFamily: MMONO, fontSize: 12, cursor: building ? "default" : "pointer" }}>
          {building ? "building…" : "⟳ run dataset check"}
        </button>
        {dataset && (
          <div style={{ marginTop: 14 }}>
            <MRow label="TOTAL EXAMPLES"  value={dataset.examples} valueColor={dataset.examples >= 500 ? MON.green : MON.amber} />
            <MRow label="POSITIVE"        value={dataset.positive} valueColor={MON.green} />
            <MRow label="NEGATIVE"        value={dataset.negative} valueColor={MON.red} />
            <MRow label="READY TO TRAIN"  value={dataset.readyForTraining ? "YES" : "NOT YET"} valueColor={dataset.readyForTraining ? MON.green : MON.amber} />
            {dataset.imbalanceWarning && <div style={{ marginTop: 8, padding: "8px 12px", background: MON.amber+"12", border: `1px solid ${MON.amber}30`, borderRadius: 6 }}><span style={{ fontFamily: MMONO, fontSize: 11, color: MON.amber }}>⚠ {dataset.imbalanceWarning}</span></div>}
            {dataset.note && <div style={{ fontFamily: MSERIF, fontSize: 14, color: MON.textDim, marginTop: 6 }}>{dataset.note}</div>}
          </div>
        )}
      </MCard>

      <MSecHead icon="↻" title="Tuning Cycle Schedule" color={MON.textSoft} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
        {TUNING_CYCLES.map(({ cycle, when, action }) => (
          <div key={cycle} style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, padding: "13px 18px", background: MON.surface, border: `1px solid ${MON.border}`, borderRadius: 10 }}>
            <div>
              <div style={{ fontFamily: MMONO, fontSize: 12, color: MON.accent, fontWeight: 700, marginBottom: 3 }}>{cycle}</div>
              <div style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim }}>{when}</div>
            </div>
            <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.6 }}>{action}</div>
          </div>
        ))}
      </div>

      <MSecHead icon="⚠" title="Critical Rules (Part D — all 7)" color={MON.red} />
      <MCard>
        {[
          ["Continuation Signal at position 10, not earlier", "If buried earlier, ignored at generation time. Forced questions return."],
          ["looseThread ≠ callback", "looseThread must not duplicate callbackQueue items. Generation prompts explicitly distinct."],
          ["One variable at a time in tuning", "Adjusting threshold + cadence simultaneously makes causality impossible. Isolate. 100-session wait."],
          ["No automated feedback loops", "Never pipe self-evaluation scores back into weights automatically. Every change is manual and logged."],
          ["Dual-reasoning before scoring", "Without reasonsFor/reasonsAgainst, motivation scores drift high. Threshold calibration becomes meaningless."],
          ["Re-ranker does not replace cadence damping", "Cadence damping is a hard gate. Even a high re-ranker score does not override it, except for callbacks."],
          ["Proactive outreach: high-priority callbacks only", "Generic outreach from low-priority callbacks feels like spam. Trigger must be high-priority and unconsumed."],
        ].map(([rule, consequence], i, arr) => (
          <div key={i} style={{ display: "flex", gap: 16, marginBottom: i < arr.length - 1 ? 12 : 0, paddingBottom: i < arr.length - 1 ? 12 : 0, borderBottom: i < arr.length - 1 ? `1px solid ${MON.border}` : "none" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: MON.red, flexShrink: 0, marginTop: 7 }} />
            <div>
              <div style={{ fontFamily: MMONO, fontSize: 12, color: MON.red, fontWeight: 700, marginBottom: 3 }}>{rule}</div>
              <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.6 }}>{consequence}</div>
            </div>
          </div>
        ))}
      </MCard>
    </div>
  );
}

// ── Tab 5: Phase 6 — Relationship Health & Voice Consistency ─────

function Phase6Tab({ token }) {
  const [health, setHealth] = useState(null);
  const [presence, setPresence] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [tom, setTom] = useState(null);
  const [ios, setIos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const endpoint = API;
  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${typeof token === "function" ? token() : token}` });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [h, p, a, t, i] = await Promise.allSettled([
          fetch(`${endpoint}/api/phase6/health`, { headers: hdrs() }).then(r => r.json()),
          fetch(`${endpoint}/api/phase6/presence`, { headers: hdrs() }).then(r => r.json()),
          fetch(`${endpoint}/api/phase6/attachment`, { headers: hdrs() }).then(r => r.json()).catch(() => null),
          fetch(`${endpoint}/api/phase6/tom`, { headers: hdrs() }).then(r => r.json()).catch(() => null),
          fetch(`${endpoint}/api/phase6/ios`, { headers: hdrs() }).then(r => r.json()).catch(() => null),
        ]);
        if (h.status === "fulfilled") setHealth(h.value);
        if (p.status === "fulfilled") setPresence(p.value);
        if (a.status === "fulfilled") setAttachment(a.value);
        if (t.status === "fulfilled") setTom(t.value);
        if (i.status === "fulfilled") setIos(i.value);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const runVoiceAudit = async () => {
    setAuditing(true);
    try {
      await fetch(`${endpoint}/api/phase6/voice-audit`, { method: "POST", headers: hdrs() }).then(r => r.json());
      const h = await fetch(`${endpoint}/api/phase6/health`, { headers: hdrs() }).then(r => r.json());
      setHealth(h);
    } catch {}
    setAuditing(false);
  };

  if (loading) return <div style={{ fontFamily: MMONO, fontSize: 13, color: MON.textDim, padding: 40, textAlign: "center" }}>loading phase 6 data…</div>;

  const h = health?.health || health || {};
  const signals = h.decliningSignals || [];

  return (
    <div>
      <MSecHead icon="♡" title="Relationship Health — 5-Signal Model" color={MON.pink} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <MCard accent={h.atRisk ? MON.red : MON.green}>
          <MLabel color={h.atRisk ? MON.red : MON.green}>Status</MLabel>
          <MRow label="AT-RISK" value={h.atRisk ? "YES" : "NO"} valueColor={h.atRisk ? MON.red : MON.green} />
          {h.atRiskSince && <MRow label="SINCE" value={new Date(h.atRiskSince).toLocaleDateString()} valueColor={MON.red} />}
          <MRow label="CONSECUTIVE DECLINE WINDOWS" value={h.consecutiveDeclineWindows ?? 0} />
          {signals.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontFamily: MMONO, fontSize: 10, color: MON.red, marginBottom: 4 }}>DECLINING:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {signals.map(s => <MPill key={s} color={MON.red}>{s}</MPill>)}
              </div>
            </div>
          )}
        </MCard>
        <MCard>
          <MLabel>Current Signals</MLabel>
          <MRow label="SESSION FREQ" value={h.sessionFrequency != null ? `${h.sessionFrequency.toFixed(1)}/wk` : "—"} />
          <MRow label="AVG MSG LENGTH" value={h.avgMessageLength != null ? h.avgMessageLength.toFixed(0) : "—"} />
          <MRow label="SPT VELOCITY" value={h.sptVelocity != null ? h.sptVelocity.toFixed(2) : "—"} />
          <MRow label="CALLBACK RATE" value={h.callbackConsumptionRate != null ? `${(h.callbackConsumptionRate * 100).toFixed(0)}%` : "—"} />
          <MRow label="ELABORATION" value={h.unsolicitedElaboration != null ? `${(h.unsolicitedElaboration * 100).toFixed(0)}%` : "—"} />
          <MRow label="AVG CPS" value={h.avgCPS != null ? h.avgCPS.toFixed(1) : "—"} valueColor={MON.accent} />
          {h.cpsTrajectory && <MRow label="CPS TRAJECTORY" value={h.cpsTrajectory} valueColor={h.cpsTrajectory === "rising" ? MON.green : h.cpsTrajectory === "declining" ? MON.red : MON.textDim} />}
        </MCard>
      </div>

      {/* Voice Audit */}
      <MSecHead icon="🎤" title="Voice Consistency Audit [P64]" color={MON.purple} />
      <MCard accent={MON.purple}>
        <MRow label="LAST AUDIT" value={h.lastVoiceAuditDate ? new Date(h.lastVoiceAuditDate).toLocaleDateString() : "never"} />
        <MRow label="AVG SCORE" value={h.lastVoiceAuditAvg != null ? h.lastVoiceAuditAvg.toFixed(2) : "—"} valueColor={h.lastVoiceAuditAvg < 7 ? MON.red : MON.green} />
        <button onClick={runVoiceAudit} disabled={auditing}
          style={{ marginTop: 8, background: auditing ? MON.surface2 : MON.accentSoft, border: `1px solid ${MON.accent}40`, borderRadius: 8, padding: "8px 20px", color: MON.accent, fontFamily: MMONO, fontSize: 12, cursor: auditing ? "default" : "pointer" }}>
          {auditing ? "auditing…" : "run voice audit"}
        </button>
      </MCard>

      {/* Attachment Style */}
      {attachment && attachment.style !== "error" && (
        <>
          <MSecHead icon="🔗" title="Attachment Style Detection [P62, P63]" color={MON.blue} />
          <MCard accent={MON.blue}>
            <MRow label="DETECTED STYLE" value={attachment.style} valueColor={attachment.style === "anxious" ? MON.amber : attachment.style === "avoidant" ? MON.blue : MON.green} />
            <MRow label="CONFIDENCE" value={attachment.confidence != null ? `${(attachment.confidence * 100).toFixed(0)}%` : "—"} />
            {attachment.signals && (
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                <MRow label="anxious score" value={attachment.signals.anxiousScore} />
                <MRow label="avoidant score" value={attachment.signals.avoidantScore} />
                <MRow label="return rate" value={attachment.signals.returnRate?.toFixed(2)} />
                <MRow label="avg msg len" value={attachment.signals.avgLen?.toFixed(0)} />
              </div>
            )}
          </MCard>
        </>
      )}

      {/* Functional ToM */}
      {tom && tom.trajectoryNarrative && (
        <>
          <MSecHead icon="🧠" title="Functional Theory of Mind [P59]" color={MON.accent} />
          <MCard accent={MON.accent}>
            <MRow label="PHASE" value={tom.currentPhase || "—"} valueColor={MON.accent} />
            <MRow label="PREFERRED STYLE" value={tom.preferredResponseStyle || "—"} />
            <MRow label="SNAPSHOTS" value={tom.tomHistory?.length || 0} />
            <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.text, lineHeight: 1.75, marginTop: 8, fontStyle: "italic" }}>
              "{tom.trajectoryNarrative}"
            </div>
          </MCard>
        </>
      )}

      {/* Presence Signals Summary */}
      {presence && (
        <>
          <MSecHead icon="📊" title="Presence Signals Summary" color={MON.green} />
          <MCard>
            <MRow label="COMPOSITE SCORE" value={presence.compositeScore != null ? presence.compositeScore.toFixed(2) : "—"} valueColor={MON.green} />
            <MRow label="SESSIONS ANALYZED" value={presence.sessionsAnalyzed || presence.signals?.length || "—"} />
            <MRow label="RETURN WITHIN 48H" value={presence.returnRate != null ? `${(presence.returnRate * 100).toFixed(0)}%` : "—"} />
          </MCard>
        </>
      )}

      {/* IOS History */}
      {ios?.history?.length > 0 && (
        <>
          <MSecHead icon="⊕" title="IOS Scale — Closeness Trend [P57]" color={MON.amber} />
          <MCard>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ios.history.map((entry, i) => (
                <div key={i} style={{ textAlign: "center", padding: "6px 10px", background: MON.surface2, borderRadius: 8, border: `1px solid ${MON.border}` }}>
                  <div style={{ fontFamily: MMONO, fontSize: 16, color: MON.accent, fontWeight: 700 }}>{entry.score}</div>
                  <div style={{ fontFamily: MMONO, fontSize: 9, color: MON.textDim }}>{new Date(entry.timestamp).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </MCard>
        </>
      )}
    </div>
  );
}

// ── ExplainPanel ──────────────────────────────────────────────────

function ExplainPanel({ onClose, token, user, conversations, messages, status }) {
  const [activeTab,       setActiveTab]       = useState("status");
  const [livePersonality, setLivePersonality] = useState(null);
  const [liveHealth,      setLiveHealth]      = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [lastRefresh,     setLastRefresh]     = useState(null);

  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  const refresh = async () => {
    setLoading(true);
    try {
      const [healthRes, summaryRes, fullRes] = await Promise.allSettled([
        fetch(`${API}/api/status`),
        fetch(`${API}/api/personality`,      { headers: hdrs() }),
        fetch(`${API}/api/personality/full`, { headers: hdrs() }),
      ]);
      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        const h = await healthRes.value.json();
        setLiveHealth({ ...h, express: true });
      } else {
        setLiveHealth({ express: false });
      }
      const summary = summaryRes.status === "fulfilled" && summaryRes.value.ok ? await summaryRes.value.json() : null;
      const full    = fullRes.status === "fulfilled" && fullRes.value.ok ? await fullRes.value.json() : null;
      setLivePersonality({ summary, full });
      setLastRefresh(new Date());
    } catch (e) { console.error("[ExplainPanel]", e); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(8,4,18,0.80)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "14px" }}>
      <div style={{ width: "100%", height: "100%", background: MON.bg, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${MON.border}`, boxShadow: "0 40px 140px rgba(0,0,0,0.55)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", borderBottom: `1px solid ${MON.border}`, background: MON.surface, flexShrink: 0, height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <span style={{ fontFamily: MDISPLAY, fontSize: 17, color: MON.text, fontWeight: 500 }}>System Monitor</span>
            <div style={{ display: "flex", gap: 4 }}>
              {MONITOR_TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  style={{ background: activeTab === t.id ? MON.accentSoft : "transparent", border: "none", borderRadius: 8, padding: "7px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: MMONO, fontSize: 14, color: activeTab === t.id ? MON.accent : MON.textDim }}>{t.icon}</span>
                  <span style={{ fontFamily: MMONO, fontSize: 12, color: activeTab === t.id ? MON.accent : MON.textDim, fontWeight: activeTab === t.id ? 700 : 400 }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {lastRefresh && <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim }}>refreshed {lastRefresh.toLocaleTimeString()}</span>}
            <button onClick={refresh} disabled={loading} style={{ background: MON.accentSoft, border: `1px solid ${MON.accent}40`, borderRadius: 8, padding: "7px 18px", color: MON.accent, fontFamily: MMONO, fontSize: 12, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "⟳ loading…" : "⟳ refresh"}
            </button>
            <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${MON.border}`, borderRadius: 8, padding: "7px 16px", color: MON.textDim, fontFamily: MMONO, fontSize: 12, cursor: "pointer" }}>✕ close</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 36px 60px" }}>
          {activeTab === "status"  && <StatusTab  status={status} user={user} conversations={conversations} messages={messages} liveHealth={liveHealth} />}
          {activeTab === "session" && <SessionTab messages={messages} livePersonality={livePersonality} />}
          {activeTab === "phase5"  && <Phase5Tab  token={token} />}
          {activeTab === "phase6"  && <Phase6Tab  token={token} />}
        </div>
      </div>
      <style>{`button:focus{outline:none}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${MON.border};border-radius:3px}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MOOD BADGE
// ═══════════════════════════════════════════════════════════════════

function MoodBadge({ mood, dynamicLabel }) {
  const m = MOODS[mood] || MOODS.neutral;
  const label = dynamicLabel || m.label;
  const dotColor = mood === "happy" || mood === "excited" ? T.green : mood === "sad" || mood === "angry" ? T.red : T.accent;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 20, background: T.accentSoft, border: `1px solid ${T.accent}30`, fontSize: 12, color: T.textSoft, fontFamily: FONT_MONO, letterSpacing: "0.3px", transition: "all 0.5s ease" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
      {label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INFO SIDEBAR
// ═══════════════════════════════════════════════════════════════════

// Depth-based sidebar categories — maps SPT depth to human-readable sections
const DISCLOSURE_SECTIONS = [
  { depth: 1, label: "Her World", locked: "you're still a stranger.", color: "#10b981" },
  { depth: 2, label: "What She Carries", locked: "she's not ready to show you.", color: "#0ea5e9" },
  { depth: 3, label: "Where She's Been", locked: "this takes real trust.", color: "#9f67ff" },
  { depth: 4, label: "Her Depths", locked: "she may never share this.", color: "#dc2626" },
];

function InfoSidebar({ mood, moodReflection, latestMeta, disclosedAtoms }) {
  // Group disclosed atoms by depth for section display
  const atomsByDepth = {};
  for (const atom of (disclosedAtoms || [])) {
    if (!atomsByDepth[atom.depth]) atomsByDepth[atom.depth] = [];
    atomsByDepth[atom.depth].push(atom);
  }
  const totalDisclosed = (disclosedAtoms || []).length;

  const SL = ({ children, color }) => <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: color || T.accent, margin: "0 0 12px", letterSpacing: "1.5px", fontWeight: 700, textTransform: "uppercase" }}>{children}</p>;
  const D  = () => <div style={{ height: 1, background: T.border, margin: "4px 0" }} />;

  return (
    <div style={{ width: 380, minWidth: 380, background: `linear-gradient(180deg, ${T.surface}, ${T.bg})`, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: "32px 30px", overflowY: "auto", gap: 20, position: "relative", zIndex: 1 }}>
      <div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 30, color: T.text, margin: "0 0 3px", fontWeight: 500 }}>Morrigan</h2>
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textDim, margin: 0, letterSpacing: "1px" }}>HOLLOW VINYL · RECORD STORE</p>
      </div>
      <D />
      {/* Mood — always visible, dynamic from LLM reflection */}
      <div>
        <SL>Current Mood</SL>
        <MoodBadge mood={mood} dynamicLabel={moodReflection?.moodLabel} />
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.text, margin: "14px 0 0", lineHeight: 1.85 }}>{moodReflection?.reflection || MOOD_DESCRIPTIONS[mood] || MOOD_DESCRIPTIONS.neutral}</p>
      </div>
      <D />

      {/* Disclosure sections — populated ONLY from what Morrigan has actually shared */}
      {totalDisclosed === 0 ? (
        <div style={{ padding: "16px 0" }}>
          <SL>What You Know About Her</SL>
          <p style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.textDim, margin: 0, lineHeight: 1.6, opacity: 0.5 }}>nothing yet. keep talking.</p>
        </div>
      ) : (
        DISCLOSURE_SECTIONS.map(sec => {
          const atoms = atomsByDepth[sec.depth] || [];
          if (atoms.length === 0) return null; // Don't show empty sections — no spoilers
          return (
            <div key={sec.depth}>
              <SL color={sec.color}>{sec.label}</SL>
              {atoms.map((atom, i) => (
                <p key={atom.id || i} style={{ fontFamily: FONT, fontSize: 15, color: T.text, margin: i < atoms.length - 1 ? "0 0 14px" : 0, lineHeight: 1.85, paddingLeft: 12, borderLeft: `2px solid ${sec.color}30` }}>
                  {atom.content}
                </p>
              ))}
              <D />
            </div>
          );
        })
      )}

      {/* Personality tags — derived from disclosed atoms' topics */}
      <div>
        <SL>What You've Gathered</SL>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {totalDisclosed === 0 ? (
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.textDim, opacity: 0.5 }}>nothing yet</span>
          ) : (
            // Extract unique topics from disclosed atoms as personality tags
            [...new Set((disclosedAtoms || []).flatMap(a => a.topics || []))].slice(0, 12).map(tag => (
              <span key={tag} style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 9px" }}>{tag}</span>
            ))
          )}
        </div>
      </div>
      <D />

      {/* Dynamic quote — relationship narrative from LLM, or nothing */}
      {latestMeta?.memorySummary?.relationshipNarrative && (
        <div style={{ background: T.accentSoft, borderRadius: 14, border: `1px solid ${T.accent}20`, padding: "16px 18px" }}>
          <p style={{ fontFamily: FONT, fontSize: 15, color: T.text, margin: 0, lineHeight: 1.9, fontStyle: "italic" }}>
            "{latestMeta.memorySummary.relationshipNarrative.substring(0, 200)}"
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHARACTER PANEL
// ═══════════════════════════════════════════════════════════════════

function CharacterPanel({ mood, speaking, latestMeta, moodReflection }) {
  return (
    <div style={{ width: 300, minWidth: 300, background: `linear-gradient(180deg, ${T.surface}f0, ${T.bg}f0)`, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", overflowY: "auto" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 20%, rgba(155,45,94,0.07) 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "14px 12px", width: "100%" }}>
        {/* Speaking indicator */}
        <div style={{ height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {speaking && (
            <div style={{ display: "flex", gap: 4 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, animation: "speakBounce 0.6s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
            </div>
          )}
        </div>
        {/* Character image — smaller */}
        <div style={{ width: "100%", maxWidth: 180, aspectRatio: "3/4", borderRadius: 16, overflow: "hidden", border: `2px solid ${T.border}`, boxShadow: speaking ? `0 0 0 3px ${T.accentSoft}, 0 0 20px rgba(124,58,237,0.4), 0 6px 28px rgba(80,0,60,0.22)` : `0 0 0 3px ${T.accentSoft}, 0 6px 28px rgba(80,0,60,0.14)`, transition: "box-shadow 0.5s ease" }}>
          <img src={morriganImg} alt="Morrigan" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", display: "block" }} />
        </div>
        {/* Name — compact */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 17, color: T.text, fontWeight: 400 }}>Morrigan</span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: T.textDim, fontStyle: "italic" }}>23 · hollow vinyl</span>
          <MoodBadge mood={mood} dynamicLabel={moodReflection?.moodLabel} />
        </div>
        {/* Divider */}
        <div style={{ width: "90%", height: 1, background: T.border, margin: "2px 0" }} />
        {/* Brain panel */}
        {latestMeta ? (
          <div style={{ width: "100%" }}>
            <ProcessingMeta meta={latestMeta} />
          </div>
        ) : (
          <div style={{ padding: "20px 8px", textAlign: "center", color: T.textDim, fontSize: 11, fontFamily: FONT_MONO, lineHeight: 1.6 }}>
            send a message to see her thoughts
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function FormatMessage({ text, bold }) {
  if (!text) return null;
  const wrapStyle = bold ? { fontWeight: 600 } : {};
  return (
    <span style={wrapStyle}>
      {text.split(/(\*[^*]+\*)/g).map((part, i) =>
        part.startsWith("*") && part.endsWith("*")
          ? <em key={i} style={{ color: T.textSoft, fontStyle: "italic", opacity: 0.85, fontWeight: bold ? 500 : "normal" }}>{part.slice(1,-1)}</em>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

function ProcessingMeta({ meta }) {
  const [open, setOpen] = useState(false);
  const [sec, setSec] = useState({ reservoir: false, atoms: true, disclosed: false, knowledge: true, molecules: true, state: true, callbacks: true, history: false });
  if (!meta) return null;
  const m = meta.memorySummary || {};
  const tog = k => setSec(s => ({ ...s, [k]: !s[k] }));

  const DEPTH_CLR = { 1: "#10b981", 2: "#0ea5e9", 3: "#9f67ff", 4: "#dc2626" };
  const DEPTH_LBL = { 1: "surface", 2: "exploratory", 3: "affective", 4: "core" };

  const hasKnowledge = m.userName || m.memories?.interests?.length || m.memories?.emotional?.length
    || m.memories?.personal?.length || m.memories?.relationships?.length
    || m.memories?.events?.length   || m.memories?.preferences?.length;
  const hasState = m.relationshipNarrative || m.prospectiveNote || m.looseThread;

  const Pill = ({ label, value, on }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: on ? T.accentSoft : T.surface2, border: `1px solid ${on ? T.accent + "40" : T.border}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, marginRight: 5, marginBottom: 4 }}>
      <span style={{ color: T.textDim }}>{label}</span>
      <span style={{ color: on ? T.accent : T.text, fontWeight: on ? 600 : 400 }}>{value}</span>
    </span>
  );

  const SecBtn = ({ label, count, sk, alwaysShow }) => (
    <div onClick={() => tog(sk)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: T.accent, marginTop: 14, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid ${T.border}`, cursor: "pointer", userSelect: "none" }}>
      <span>{label}{count != null ? <span style={{ color: T.textDim, fontWeight: 400, fontSize: 10, marginLeft: 5 }}>({count})</span> : ""}</span>
      <span style={{ color: T.textDim, fontSize: 11 }}>{sec[sk] ? "▲" : "▼"}</span>
    </div>
  );

  const KV = ({ label, value, italic, accent }) => value != null && String(value).trim() ? (
    <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
      <span style={{ color: T.textDim, fontSize: 11, minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ color: accent ? T.accent : T.textSoft, fontSize: 12, flex: 1, fontStyle: italic ? "italic" : "normal", lineHeight: 1.55 }}>{String(value)}</span>
    </div>
  ) : null;

  const MemRow = ({ label, arr }) => arr?.length ? (
    <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
      <span style={{ color: T.textDim, fontSize: 11, minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.textSoft, fontSize: 12, flex: 1, lineHeight: 1.55 }}>
        {arr.map((x, i) => <React.Fragment key={i}>
          {x.isPast && <span style={{ color: T.textDim, fontSize: 10 }}>[past] </span>}
          {x.fact}{i < arr.length - 1 && <span style={{ color: T.textDim }}> · </span>}
        </React.Fragment>)}
      </span>
    </div>
  ) : null;

  const Bar = ({ label, value, color }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
      <span style={{ color: T.textDim, fontSize: 11, minWidth: 108, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: T.surface3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value || 0}%`, background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ color: T.text, fontSize: 11, minWidth: 22, textAlign: "right", fontFamily: FONT_MONO }}>{value ?? 0}</span>
    </div>
  );

  // Compact summary line always shown in header
  const summaryParts = [
    `spt ${meta.sptDepth}/4`,
    meta.goalState && meta.goalState !== "neutral" ? `${meta.goalState}` : null,
    meta.disclosureDepth ? `L${meta.disclosureDepth.level}` : null,
    meta.somaticMarker ? meta.somaticMarker.emotionalRegister : null,
    meta.triggerFired ? "triggered" : null,
    meta.compositionApplied ? "composed" : null,
    meta.crisisDetection?.safeHavenActive ? "CRISIS" : null,
    meta.atRisk ? "at-risk" : null,
  ].filter(Boolean).join("  ·  ");

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 10, fontFamily: FONT_MONO, fontSize: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

      {/* ── Clickable header ── */}
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: T.surface2, borderBottom: open ? `1px solid ${T.border}` : "none", cursor: "pointer", userSelect: "none", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: T.accent, fontWeight: 700, fontSize: 10.5, letterSpacing: "1px" }}>PROCESSING</span>
            <span style={{ color: T.textDim, fontSize: 10.5 }}>msg #{meta.msgCount}</span>
            {summaryParts && <span style={{ color: T.textSoft, fontSize: 10.5 }}>· {summaryParts}</span>}
          </div>
          {meta.innerThought && !open && (
            <div style={{ marginTop: 3, color: T.textSoft, fontSize: 11.5, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              "{meta.innerThought.content}"
            </div>
          )}
        </div>
        <span style={{ color: T.textDim, fontSize: 11, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div style={{ padding: "14px 16px" }}>

          {/* ── Stat pills row ── */}
          <div style={{ display: "flex", flexWrap: "wrap", marginBottom: 10 }}>
            <Pill label="spt depth" value={`${meta.sptDepth} / 4`} />
            <Pill label="msg" value={`#${meta.msgCount}`} />
            {meta.memorySummary?.totalMessages > 0 && <Pill label="total msgs" value={meta.memorySummary.totalMessages} />}
            {meta.memorySummary?.totalConversations > 0 && <Pill label="convos" value={meta.memorySummary.totalConversations} />}
            {meta.goalState && <Pill label="goal" value={meta.goalState} on={meta.goalState !== "neutral"} />}
            <Pill label="reservoir" value={`${meta.reservoirSize} thoughts`} />
            <Pill label="cooldown" value={`${meta.thoughtCooldown}/3`} on={meta.thoughtCooldown >= 3} />
            <Pill label="threshold" value={meta.motivationThreshold} />
            <Pill label="trigger" value={meta.triggerFired ? "fired" : "—"} on={meta.triggerFired} />
            <Pill label="composition" value={meta.compositionApplied ? "applied" : "—"} on={meta.compositionApplied} />
            {meta.callbackQueue?.length > 0 && <Pill label="callbacks" value={meta.callbackQueue.length} on />}
            {meta.alreadyDisclosedAtoms?.length > 0 && <Pill label="disclosed" value={`${meta.alreadyDisclosedAtoms.length} atoms`} />}
            {meta.atRisk && <Pill label="status" value="at-risk" on />}
            {!meta.innerThought && meta.atomHintUsed && <Pill label="phase 2" value="hint active" />}
            {meta.disclosureDepth && <Pill label="disclosure" value={`L${meta.disclosureDepth.level} ${meta.disclosureDepth.label}`} on={meta.disclosureDepth.level >= 2} />}
            {meta.linguisticSignals && <Pill label="authenticity" value={`${(meta.linguisticSignals.authenticity * 100).toFixed(0)}%`} on={meta.linguisticSignals.authenticity >= 0.3} />}
            {meta.linguisticSignals && meta.linguisticSignals.emotionalTone > 0 && <Pill label="emotion" value={`${(meta.linguisticSignals.emotionalTone * 100).toFixed(0)}%`} on={meta.linguisticSignals.emotionalTone >= 0.1} />}
            {meta.somaticMarker && <Pill label="somatic" value={meta.somaticMarker.emotionalRegister} on />}
            {meta.crisisDetection?.safeHavenActive && <Pill label="crisis" value="SAFE HAVEN" on />}
            {meta.atRiskInterventions?.active && <Pill label="at-risk" value="interventions on" on />}
          </div>

          {/* ── Theory of Mind ── */}
          {meta.theoryOfMind && (
            <div style={{ background: "#fdf6e3", border: `1px solid #f59e0b40`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ color: "#b45309", fontSize: 10, fontWeight: 700, letterSpacing: "1px", marginBottom: 5 }}>THEORY OF MIND — HER READ ON YOU</div>
              <div style={{ color: T.textSoft, lineHeight: 1.6, fontSize: 12, fontStyle: "italic" }}>{meta.theoryOfMind}</div>
            </div>
          )}

          {/* ── Crisis Detection [P62/P63] ── */}
          {meta.crisisDetection?.safeHavenActive && (
            <div style={{ background: "#fef2f2", border: "2px solid #dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ color: "#dc2626", fontSize: 10, fontWeight: 700, letterSpacing: "1px", marginBottom: 5 }}>CRISIS DETECTED — SAFE HAVEN MODE ACTIVE</div>
              <div style={{ color: "#991b1b", fontSize: 11, lineHeight: 1.6 }}>
                Level: <strong>{meta.crisisDetection.level}</strong> · Signals: {meta.crisisDetection.signals?.join(", ") || "none"}
              </div>
              <div style={{ color: "#7f1d1d", fontSize: 10.5, marginTop: 4, fontStyle: "italic" }}>Inner thoughts suppressed. Threads suppressed. Full presence mode.</div>
            </div>
          )}

          {/* ── Somatic Marker [P14 Damasio] ── */}
          {meta.somaticMarker && (
            <div style={{ background: "#f0fdf4", border: "1px solid #10b98140", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ color: "#059669", fontSize: 10, fontWeight: 700, letterSpacing: "1px" }}>SOMATIC MARKER — GUT FEELING</span>
                <span style={{ color: T.textDim, fontSize: 10 }}>{meta.somaticMarker.emotionalRegister} · intensity {(meta.somaticMarker.intensity || 0).toFixed(1)}</span>
              </div>
              <div style={{ color: T.textSoft, lineHeight: 1.6, fontSize: 12, fontStyle: "italic" }}>"{meta.somaticMarker.gutFeeling}"</div>
            </div>
          )}

          {/* ── Linguistic Depth + Disclosure Depth [P69 LIWC-22, P56 Aron] ── */}
          {meta.linguisticSignals && (
            <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: T.accent, fontSize: 10, fontWeight: 700, letterSpacing: "1px" }}>LINGUISTIC DEPTH SIGNALS</span>
                {meta.disclosureDepth && (
                  <span style={{ color: meta.disclosureDepth.level >= 3 ? "#9f67ff" : meta.disclosureDepth.level >= 2 ? "#0ea5e9" : T.textDim, fontSize: 10, fontWeight: 700 }}>
                    DISCLOSURE L{meta.disclosureDepth.level} — {meta.disclosureDepth.label?.toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 14px" }}>
                <Bar label="authenticity" value={Math.round(meta.linguisticSignals.authenticity * 100)} color="#10b981" />
                <Bar label="emotion" value={Math.round(meta.linguisticSignals.emotionalTone * 100)} color="#f59e0b" />
                <Bar label="self-focus" value={Math.round(meta.linguisticSignals.selfFocus * 100)} color="#0ea5e9" />
                <Bar label="cognitive" value={Math.round(meta.linguisticSignals.cognitiveProcessing * 100)} color="#8b5cf6" />
                <Bar label="narrative" value={Math.round(meta.linguisticSignals.narrativeDepth * 100)} color="#ec4899" />
                <div style={{ fontSize: 10.5, color: T.textDim, display: "flex", alignItems: "center" }}>{meta.linguisticSignals.wordCount} words</div>
              </div>
              {meta.disclosureDepth?.signals?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 10.5, color: T.textDim }}>
                  signals: {meta.disclosureDepth.signals.join(", ")}
                </div>
              )}
              {meta.disclosureDepth?.receptionDirectiveApplied && (
                <div style={{ marginTop: 4, fontSize: 10.5, color: "#0ea5e9", fontStyle: "italic" }}>reception directive injected</div>
              )}
            </div>
          )}

          {/* ── At-Risk Interventions [P20, P23, P39] ── */}
          {meta.atRiskInterventions?.active && (
            <div style={{ background: "#fffbeb", border: "2px solid #f59e0b", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ color: "#b45309", fontSize: 10, fontWeight: 700, letterSpacing: "1px", marginBottom: 5 }}>AT-RISK INTERVENTIONS ACTIVE</div>
              <div style={{ color: "#92400e", fontSize: 11, lineHeight: 1.6 }}>
                {meta.atRiskInterventions.callbackBoostApplied && <div>+ Callback score boost (+1.5)</div>}
                {meta.atRiskInterventions.thresholdLowered && <div>+ Thought threshold lowered to 3.5</div>}
                {meta.atRiskInterventions.urgencySignalInjected && <div>+ Presence urgency signal in continuation block</div>}
              </div>
            </div>
          )}

          {/* ── Inner thought expressed (highlighted) ── */}
          {meta.innerThought && (
            <div style={{ background: T.accentSoft, border: `1px solid ${T.accent}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: T.accent, fontSize: 10, fontWeight: 700, letterSpacing: "1px" }}>INNER THOUGHT EXPRESSED</span>
                <span style={{ color: T.textDim, fontSize: 10 }}>{meta.innerThought.type} · score {meta.innerThought.score}</span>
              </div>
              <div style={{ color: T.text, fontStyle: "italic", lineHeight: 1.65, fontSize: 13 }}>
                "{meta.innerThought.content}"
              </div>
              {meta.innerThought.participationDirective && (
                <div style={{ color: T.textDim, fontSize: 11, marginTop: 6, borderTop: `1px solid ${T.accent}20`, paddingTop: 6 }}>
                  directive: <span style={{ fontStyle: "italic" }}>{meta.innerThought.participationDirective}</span>
                </div>
              )}
              {(meta.innerThought.reasonsFor?.length > 0 || meta.innerThought.reasonsAgainst?.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  {meta.innerThought.reasonsFor?.length > 0 && (
                    <div>
                      <div style={{ color: "#10b981", fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", marginBottom: 4 }}>FOR</div>
                      {meta.innerThought.reasonsFor.map((r, i) => <div key={i} style={{ color: T.textSoft, fontSize: 11, lineHeight: 1.5, marginBottom: 2 }}>+ {r}</div>)}
                    </div>
                  )}
                  {meta.innerThought.reasonsAgainst?.length > 0 && (
                    <div>
                      <div style={{ color: "#dc2626", fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", marginBottom: 4 }}>AGAINST</div>
                      {meta.innerThought.reasonsAgainst.map((r, i) => <div key={i} style={{ color: T.textSoft, fontSize: 11, lineHeight: 1.5, marginBottom: 2 }}>− {r}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Thought reservoir ── */}
          {meta.reservoirContents?.length > 0 && (
            <>
              <SecBtn label="Thought Reservoir" count={meta.reservoirContents.length} sk="reservoir" />
              {sec.reservoir && (
                <div style={{ marginBottom: 4 }}>
                  {meta.reservoirContents.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
                      <span style={{ color: T.textDim, fontSize: 10.5, minWidth: 80, flexShrink: 0, paddingTop: 1 }}>{t.type}</span>
                      <span style={{ color: T.accent, fontSize: 10.5, minWidth: 28, flexShrink: 0, fontFamily: FONT_MONO, paddingTop: 1 }}>{t.score}</span>
                      <span style={{ color: T.textSoft, lineHeight: 1.5, fontSize: 12 }}>{t.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Self-atoms (Morrigan's own disclosures, depth-gated) ── */}
          {meta.topSelfAtoms?.length > 0 && (
            <>
              <SecBtn label="Self-Atoms Retrieved" count={meta.topSelfAtoms.length} sk="atoms" />
              {sec.atoms && (
                <div style={{ marginBottom: 4 }}>
                  {meta.topSelfAtoms.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
                      <span style={{ color: DEPTH_CLR[a.depth] || T.textDim, fontSize: 10.5, fontWeight: 700, minWidth: 58, flexShrink: 0, paddingTop: 1 }}>
                        d{a.depth} <span style={{ fontWeight: 400, fontSize: 9.5 }}>{DEPTH_LBL[a.depth]}</span>
                      </span>
                      <span style={{ color: T.textSoft, lineHeight: 1.5, fontSize: 12 }}>{a.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Callback queue (threads she's tracking to raise) ── */}
          {meta.callbackQueue?.length > 0 && (
            <>
              <SecBtn label="Callback Queue — Threads She's Tracking" count={meta.callbackQueue.length} sk="callbacks" />
              {sec.callbacks && (
                <div style={{ marginBottom: 4 }}>
                  {meta.callbackQueue.map((cb, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
                      <span style={{ color: cb.priority === "high" ? "#dc2626" : cb.priority === "medium" ? "#f59e0b" : T.textDim, fontSize: 10.5, minWidth: 44, flexShrink: 0, fontWeight: 700, paddingTop: 1 }}>{cb.priority}</span>
                      <span style={{ color: T.textSoft, lineHeight: 1.5, fontSize: 12 }}>{cb.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Already-disclosed atoms (what she's shared about herself) ── */}
          {meta.alreadyDisclosedAtoms?.length > 0 && (
            <>
              <SecBtn label="Already Disclosed About Herself" count={meta.alreadyDisclosedAtoms.length} sk="disclosed" />
              {sec.disclosed && (
                <div style={{ marginBottom: 4 }}>
                  {meta.alreadyDisclosedAtoms.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "flex-start" }}>
                      <span style={{ color: DEPTH_CLR[a.depth] || T.textDim, fontSize: 10.5, fontWeight: 700, minWidth: 58, flexShrink: 0, paddingTop: 1 }}>
                        d{a.depth} <span style={{ fontWeight: 400, fontSize: 9.5 }}>{DEPTH_LBL[a.depth]}</span>
                      </span>
                      <span style={{ color: T.textSoft, lineHeight: 1.5, fontSize: 12, textDecoration: "line-through", opacity: 0.6 }}>{a.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── SPT Breadth map ── */}
          {meta.sptBreadth && Object.keys(meta.sptBreadth).length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: T.accent, marginTop: 14, marginBottom: 8, paddingBottom: 5, borderBottom: `1px solid ${T.border}` }}>
                SPT Breadth — Topic Depth Progress
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {Object.entries(meta.sptBreadth).map(([topic, depth]) => (
                  <span key={topic} style={{ background: T.surface2, border: `1px solid ${DEPTH_CLR[depth] || T.border}40`, borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>
                    <span style={{ color: T.textDim }}>{topic}</span>
                    <span style={{ color: DEPTH_CLR[depth] || T.textDim, fontWeight: 700, marginLeft: 5 }}>d{depth}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── What she knows about you ── */}
          {hasKnowledge && (
            <>
              <SecBtn label="What She Knows About You" sk="knowledge" />
              {sec.knowledge && (
                <div style={{ marginBottom: 4 }}>
                  {/* Identity */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px", marginBottom: 8 }}>
                    {m.userName && <KV label="name" value={m.userName} accent />}
                    <KV label="trust level" value={`${m.trustLevelName || ""} (${m.trustLevel}/6)`} />
                    <KV label="trust pts" value={m.trustPoints} />
                    <KV label="first met" value={`${m.daysSinceFirstMet}d ago`} />
                    <KV label="last seen" value={`${m.hoursSinceLastSeen}h ago`} />
                    {m.totalMessages > 0 && <KV label="total msgs" value={m.totalMessages} />}
                    {m.totalConversations > 0 && <KV label="convos" value={m.totalConversations} />}
                  </div>
                  {/* Trust track */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 2 }}>
                      {["stranger","acquaintance","maybe-friend","friend","close friend","trusted","bonded"].map((lv, i) => (
                        <div key={i} style={{ flex: 1, height: 4, background: i <= m.trustLevel ? T.accent : T.border, borderRadius: i === 0 ? "3px 0 0 3px" : i === 6 ? "0 3px 3px 0" : 0, marginRight: 1, transition: "background 0.3s" }} />
                      ))}
                    </div>
                    <div style={{ color: T.textDim, fontSize: 9.5, marginTop: 2 }}>
                      {["stranger","acquaintance","maybe-friend","friend","close friend","trusted","bonded"].map((lv, i) => (
                        <span key={i} style={{ display: "inline-block", width: "14.2%", textAlign: "center", color: i === m.trustLevel ? T.accent : T.textDim, fontWeight: i === m.trustLevel ? 700 : 400 }}>{lv}</span>
                      ))}
                    </div>
                  </div>
                  {/* Feeling bars */}
                  {m.feelings && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: T.textDim, fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>Her Feelings</div>
                      <Bar label="affection"      value={m.feelings.affection}      color="#9B2D5E" />
                      <Bar label="comfort"        value={m.feelings.comfort}        color="#10b981" />
                      <Bar label="attraction"     value={m.feelings.attraction}     color="#9f67ff" />
                      <Bar label="protectiveness" value={m.feelings.protectiveness} color="#0ea5e9" />
                      <Bar label="vulnerability"  value={m.feelings.vulnerability}  color="#f59e0b" />
                    </div>
                  )}
                  {/* Memory categories */}
                  <MemRow label="interests"     arr={m.memories?.interests} />
                  <MemRow label="preferences"   arr={m.memories?.preferences} />
                  <MemRow label="personal"      arr={m.memories?.personal} />
                  <MemRow label="relationships" arr={m.memories?.relationships} />
                  <MemRow label="events"        arr={m.memories?.events} />
                  <MemRow label="emotional"     arr={m.memories?.emotional} />
                </div>
              )}
            </>
          )}

          {/* ── Synthesised impressions (molecules) ── */}
          {m?.molecules?.length > 0 && (
            <>
              <SecBtn label="Synthesised Impressions" count={m.molecules.length} sk="molecules" />
              {sec.molecules && (
                <div style={{ marginBottom: 4 }}>
                  {m.molecules.map((mol, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 7, paddingLeft: 8, borderLeft: `2px solid ${T.accent}50`, alignItems: "flex-start" }}>
                      {mol.period && <span style={{ color: T.accent, fontSize: 10, minWidth: 64, flexShrink: 0, paddingTop: 2 }}>[{mol.period}]</span>}
                      <span style={{ color: T.textSoft, lineHeight: 1.55, fontSize: 12 }}>{mol.summary}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Milestones ── */}
          {m?.milestones?.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: T.accent, marginTop: 14, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid ${T.border}` }}>
                Milestones <span style={{ color: T.textDim, fontWeight: 400 }}>({m.milestones.length})</span>
              </div>
              {m.milestones.map((ms, i) => {
                const ev = typeof ms === "string" ? ms : ms.event;
                const cat = typeof ms === "object" ? ms.category : null;
                return (
                  <div key={i} style={{ color: T.textSoft, fontSize: 12, paddingLeft: 8, marginBottom: 4, borderLeft: `2px solid ${T.border}`, lineHeight: 1.5 }}>
                    — {ev}{cat && <span style={{ color: T.textDim, fontSize: 10, marginLeft: 6 }}>[{cat}]</span>}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Her inner state ── */}
          {hasState && (
            <>
              <SecBtn label="Her Inner State" sk="state" />
              {sec.state && (
                <div style={{ marginBottom: 4 }}>
                  {m.relationshipNarrative && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: T.textDim, fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>How She Sees You</div>
                      <div style={{ color: T.textSoft, fontStyle: "italic", lineHeight: 1.65, fontSize: 12, paddingLeft: 8, borderLeft: `2px solid ${T.border}` }}>{m.relationshipNarrative}</div>
                    </div>
                  )}
                  {m.prospectiveNote && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: T.textDim, fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>Sitting With</div>
                      <div style={{ color: T.textSoft, lineHeight: 1.65, fontSize: 12, paddingLeft: 8, borderLeft: `2px solid #f59e0b80` }}>{m.prospectiveNote}</div>
                    </div>
                  )}
                  {m.looseThread && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: T.textDim, fontSize: 9.5, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 5 }}>Loose Thread</div>
                      <div style={{ color: T.textSoft, lineHeight: 1.65, fontSize: 12, paddingLeft: 8, borderLeft: `2px solid #0ea5e980` }}>{m.looseThread}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Session history ── */}
          {m?.sessionContextUsed?.length > 0 && (
            <>
              <SecBtn label="Session History Used" count={m.sessionContextUsed.length} sk="history" />
              {sec.history && (
                <div style={{ marginBottom: 4 }}>
                  {m.sessionContextUsed.map((ex, i) => (
                    <div key={i} style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${T.border}` }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 3, alignItems: "flex-start" }}>
                        <span style={{ color: T.textDim, fontSize: 10.5, minWidth: 24, flexShrink: 0, paddingTop: 1 }}>you</span>
                        <span style={{ color: T.textSoft, fontSize: 12, lineHeight: 1.5 }}>{ex.user}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: T.accent, fontSize: 10.5, minWidth: 24, flexShrink: 0, paddingTop: 1 }}>her</span>
                        <span style={{ color: T.textSoft, fontSize: 12, lineHeight: 1.5 }}>{ex.assistant}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      )}
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [phrase,  setPhrase]  = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [entered, setEntered] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res  = await fetch(`${API}/api/auth/phrase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phrase: phrase.trim().toLowerCase() }) });
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

function MessageBubble({ msg, onMetaClick }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", marginBottom: 22, alignItems: "flex-start", justifyContent: isUser ? "flex-end" : "flex-start", animation: "fadeSlideIn 0.3s ease forwards" }}>
      <div style={isUser
        ? { background: `linear-gradient(135deg, ${T.userBubble}, ${T.purple})`, color: "#fff", borderRadius: "22px 22px 4px 22px", padding: "13px 20px", maxWidth: "65%", wordBreak: "break-word", boxShadow: `0 2px 12px ${T.accentGlow}` }
        : { background: T.aiBubble, color: T.text, border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px", padding: "13px 20px", maxWidth: "75%", wordBreak: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        {!isUser && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span>
            {msg.meta && onMetaClick && (
              <span onClick={() => onMetaClick(msg.meta)}
                style={{ color: T.accent, fontSize: 10, fontFamily: FONT_MONO, cursor: "pointer", opacity: 0.5, transition: "opacity 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                title="View brain state">
                ◈ brain
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 15, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: FONT }}><FormatMessage text={msg.content} bold={!isUser} /></div>
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

function safeDecodeToken(token) {
  try {
    if (!token) return null;
    const p = token.split(".");
    if (p.length !== 3) return null;
    const payload = JSON.parse(atob(p[1]));
    // Reject expired tokens immediately on the client side
    if (payload?.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  const [authed, setAuthed] = useState(() => {
    const t = localStorage.getItem("token");
    if (!t) return false;
    const p = safeDecodeToken(t);
    return !!(p?.id);
  });
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const p = safeDecodeToken(t);
    return p?.id ? { id: p.id, phrase: p.phrase } : null;
  });
  const [conversations, setConversations] = useState([]);
  const [activeConvo,   setActiveConvo]   = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState("");
  const [streaming,     setStreaming]     = useState(false);
  const [streamText,    setStreamText]    = useState("");
  const [status,        setStatus]        = useState({ ollama: false, embeddings: false });
  const [usage,         setUsage]         = useState({ used: 0, limit: 100, remaining: 100, resetAt: null });
  const [currentMood,   setCurrentMood]   = useState("neutral");
  const [showExplain,   setShowExplain]   = useState(false);
  const [latestMeta,    setLatestMeta]    = useState(null);
  const [moodReflection, setMoodReflection] = useState(null);
  const [morriganPresent, setMorriganPresent] = useState(false);
  const [proactiveTyping, setProactiveTyping] = useState(false);
  const [disclosedAtoms, setDisclosedAtoms] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const justCreated    = useRef(false);

  const token = () => localStorage.getItem("token");
  const hdrs  = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) { setAuthed(false); setUser(null); return; }
    const payload = safeDecodeToken(t);
    // safeDecodeToken returns null if token is expired or malformed
    if (!payload?.id) {
      localStorage.removeItem("token");
      setAuthed(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    const ck = () => fetch(`${API}/api/status`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(setStatus).catch(() => {});
    ck(); const iv = setInterval(ck, 30000); return () => clearInterval(iv);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetch(`${API}/api/usage`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(setUsage).catch(() => {});
  }, [authed]);

  // ── Persistent SSE channel for proactive messages ──────────────
  useEffect(() => {
    if (!authed) return;
    const t = token();
    if (!t) return;
    const es = new EventSource(`${API}/api/session/stream?token=${encodeURIComponent(t)}`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "typing_start") {
          setProactiveTyping(true);
        } else if (data.type === "typing_stop") {
          setProactiveTyping(false);
        } else if (data.type === "proactive_message") {
          setProactiveTyping(false);
          setMessages(prev => [...prev, { role: "assistant", content: data.content, timestamp: new Date(data.timestamp), proactive: true }]);
          if (data.mood) setCurrentMood(data.mood);
        }
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => { setProactiveTyping(false); };
    return () => es.close();
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const h = () => endSession();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetch(`${API}/api/conversations`, { headers: hdrs() }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(setConversations).catch(() => {});
  }, [authed]);

  // Load disclosed self-atoms on auth — populates sidebar from actual disclosures
  useEffect(() => {
    if (!authed) return;
    fetch(`${API}/api/personality`, { headers: hdrs() })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => { if (data.disclosedAtoms?.length) setDisclosedAtoms(data.disclosedAtoms); })
      .catch(() => {});
  }, [authed]);

  useEffect(() => {
    if (!activeConvo) { setMessages([]); setMoodReflection(null); setLatestMeta(null); setMorriganPresent(false); return; }
    if (justCreated.current) { justCreated.current = false; return; }
    setMessages([]); setMoodReflection(null); setLatestMeta(null); setMorriganPresent(false); // clear immediately so stale data don't show while fetching
    fetch(`${API}/api/conversations/${activeConvo}/messages`, { headers: hdrs() })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(async d => {
        if (d.length === 0) {
          // Empty conversation opened from sidebar — fetch arrival decision
          try {
            const arrRes = await fetch(`${API}/api/session/greeting?conversationId=${activeConvo}`, { headers: hdrs() });
            if (arrRes.ok) {
              const data = await arrRes.json();
              const arrival = data.arrival;
              if (arrival && arrival.action !== "silence" && arrival.content) {
                setMessages([{ role: "assistant", content: arrival.content, timestamp: new Date(), isArrival: true }]);
                if (arrival.arrivalMood) setCurrentMood(arrival.arrivalMood);
                setMorriganPresent(false);
              } else if (arrival && arrival.action === "silence") {
                setMessages([]);
                setMorriganPresent(true);
              } else {
                // Null arrival or parse failure — fallback
                setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
              }
            } else {
              setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
            }
          } catch {
            setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
          }
        } else {
          setMessages(d);
        }
      }).catch(() => {});
  }, [activeConvo]);

  useEffect(() => {
    const a = [...messages].reverse().find(m => m.role === "assistant");
    if (a) setCurrentMood(analyzeMood(a.content));
  }, [messages]);

  useEffect(() => { if (streamText) setCurrentMood(analyzeMood(streamText)); }, [streamText]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText, streaming]);

  const createConvo = async () => {
    const res = await fetch(`${API}/api/conversations`, { method: "POST", headers: hdrs(), body: JSON.stringify({ title: "🖤 New chat" }) });
    if (!res.ok) throw new Error(`Failed to create conversation (${res.status})`);
    const convo = await res.json();
    if (!convo?.conversationId) throw new Error("Server did not return a valid conversation.");
    setConversations(p => [convo, ...p]);
    justCreated.current = true;
    setMoodReflection(null); setLatestMeta(null); setMorriganPresent(false);

    // Fetch arrival decision — Morrigan decides: speak, presence, or silence
    try {
      const arrRes = await fetch(`${API}/api/session/greeting?conversationId=${convo.conversationId}`, { headers: hdrs() });
      if (arrRes.ok) {
        const data = await arrRes.json();
        const arrival = data.arrival;
        if (arrival && arrival.action !== "silence" && arrival.content) {
          setMessages([{ role: "assistant", content: arrival.content, timestamp: new Date(), isArrival: true }]);
          if (arrival.arrivalMood) setCurrentMood(arrival.arrivalMood);
        } else if (arrival && arrival.action === "silence") {
          setMessages([]);
          setMorriganPresent(true);
        } else {
          setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
        }
      } else {
        setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
      }
    } catch {
      setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
    }

    setActiveConvo(convo.conversationId);
    return convo.conversationId;
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    setMorriganPresent(false); // clear silence presence on first send
    let cid = activeConvo;
    if (!cid) {
      try { cid = await createConvo(); } catch (e) {
        setMessages(p => [...p, { role: "assistant", content: `⚠ Could not start conversation. Please try again.` }]);
        return;
      }
    }
    setMessages(p => [...p, { role: "user", content: input.trim(), timestamp: new Date() }]);
    setInput(""); setStreaming(true); setStreamText("");

    try {
      const res = await fetch(`${API}/api/chat`, { method: "POST", headers: hdrs(), body: JSON.stringify({ conversationId: cid, message: input.trim() }) });
      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try { const j = await res.json(); errMsg = j.error || errMsg; } catch { }
        setMessages(p => [...p, { role: "assistant", content: `⚠ ${errMsg}` }]);
        setStreaming(false); inputRef.current?.focus(); return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "", buffer = "", doneSeen = false;

      outer: while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n"); buffer = parts.pop() || "";
        for (const line of parts.filter(l => l.startsWith("data: "))) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.token) { full += json.token; setStreamText(full); }
            if (json.done) {
              doneSeen = true;
              const finalText = json.finalResponse || full;
              if (finalText.trim()) {
                setMessages(p => [...p, { role: "assistant", content: finalText, timestamp: new Date(), meta: json.processingMeta || null }]);
                setConversations(p => p.map(c => c.conversationId === cid ? { ...c, title: `🖤 ${finalText.substring(0, 40)}${finalText.length > 40 ? "..." : ""}`, updatedAt: new Date() } : c));
              }
              if (json.processingMeta) {
                setLatestMeta(json.processingMeta);
                setMoodReflection(json.processingMeta.moodReflection || null);
                // Merge newly disclosed atoms into sidebar state
                if (json.processingMeta.alreadyDisclosedAtoms?.length) {
                  setDisclosedAtoms(prev => {
                    const ids = new Set(prev.map(a => a.id));
                    const merged = [...prev];
                    for (const a of json.processingMeta.alreadyDisclosedAtoms) {
                      if (!ids.has(a.id)) merged.push(a);
                    }
                    return merged.length !== prev.length ? merged : prev;
                  });
                }
              }
              if (json.usage) setUsage(json.usage);
              setStreamText("");
              setStreaming(false);
              break outer; // exit immediately — prevents dots flash and stray reads
            }
            if (json.error) { setMessages(p => [...p, { role: "assistant", content: `⚠ ${json.error}` }]); setStreamText(""); }
          } catch { }
        }
      }
      // Stream closed without a done event — rescue partial content so it isn't lost
      if (!doneSeen && full.trim()) {
        setMessages(p => [...p, { role: "assistant", content: full, timestamp: new Date() }]);
        setStreamText("");
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
        <ExplainPanel onClose={() => setShowExplain(false)} token={token()} user={user} conversations={conversations} messages={messages} status={status} />
      )}

      <InfoSidebar mood={currentMood} moodReflection={moodReflection} latestMeta={latestMeta} disclosedAtoms={disclosedAtoms} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: `${T.surface}e0`, backdropFilter: "blur(10px)" }}>
          <div style={{ width: 10 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, boxShadow: `0 0 8px ${T.accent}` }} />
            <span style={{ color: T.text, fontWeight: 400, fontSize: 17, fontFamily: FONT_DISPLAY }}>Morrigan</span>
            <MoodBadge mood={currentMood} dynamicLabel={moodReflection?.moodLabel} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setShowExplain(true)}
              style={{ background: T.accentSoft, border: `1px solid ${T.accent}50`, borderRadius: 8, padding: "5px 14px", color: T.accent, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
              onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.accentSoft; e.currentTarget.style.color = T.accent; }}>
              ⚙ monitor
            </button>
            <button onClick={handleLogout}
              style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 12px", color: T.textDim, fontSize: 11, cursor: "pointer", fontFamily: FONT_MONO }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim; }}>
              leave
            </button>
          </div>
        </div>

        {/* Daily usage bar */}
        {(() => {
          const pct = usage.limit > 0 ? (usage.used / usage.limit) * 100 : 0;
          const barColor = pct >= 90 ? T.red : pct >= 60 ? "#f59e0b" : T.green;
          const resetTime = usage.resetAt ? new Date(usage.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
          return (
            <div style={{ height: 28, borderBottom: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "center", gap: 10, padding: "0 24px", flexShrink: 0 }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.textDim, letterSpacing: "0.8px", flexShrink: 0 }}>DAILY</span>
              <div style={{ flex: 1, height: 4, background: T.surface3, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 0.5s ease" }} />
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: pct >= 90 ? T.red : T.textDim, flexShrink: 0 }}>
                {usage.used} / {usage.limit}
                {pct >= 90 && resetTime ? ` — resets ${resetTime}` : ""}
              </span>
            </div>
          );
        })()}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          {showWelcome ? <WelcomeScreen onStart={createConvo} /> : (
            <>
              {/* Presence indicator — Morrigan chose silence on arrival */}
              {morriganPresent && messages.length === 0 && !streaming && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 0", animation: "fadeSlideIn 0.5s ease forwards" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, opacity: 0.6, animation: "speakBounce 3s ease-in-out infinite" }} />
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: T.textDim, fontStyle: "italic" }}>Morrigan is here.</span>
                </div>
              )}
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} onMetaClick={setLatestMeta} />)}
              {streaming && (
                <div style={{ display: "flex", marginBottom: 22, alignItems: "flex-start", animation: "fadeSlideIn 0.3s ease forwards" }}>
                  <div style={{ background: T.aiBubble, border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px", padding: "13px 20px", maxWidth: "75%", wordBreak: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: streamText ? 8 : 5 }}>
                      <span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span>
                      {!streamText && <span style={{ color: T.textDim, fontSize: 10, fontFamily: FONT_MONO, letterSpacing: "0.5px" }}>processing</span>}
                    </div>
                    {streamText ? (
                      <div style={{ fontSize: 15, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: FONT }}>
                        <FormatMessage text={streamText} bold={true} />
                        <span style={{ color: T.accent, animation: "blink 1s infinite", marginLeft: 2 }}>▎</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 0" }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, opacity: 0.6, animation: "speakBounce 1.2s ease-in-out infinite", animationDelay: `${i * 0.22}s` }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Proactive typing indicator — Morrigan is forming an unprompted thought */}
              {proactiveTyping && !streaming && (
                <div style={{ display: "flex", marginBottom: 22, alignItems: "flex-start", animation: "fadeSlideIn 0.3s ease forwards" }}>
                  <div style={{ background: T.aiBubble, border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px", padding: "13px 20px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span>
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 0" }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#9B2D5E", opacity: 0.4, animation: "speakBounce 1.2s ease-in-out infinite", animationDelay: `${i * 0.22}s` }} />
                      ))}
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
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 18, padding: "10px 16px" }}>
            <textarea ref={inputRef}
              style={{ flex: 1, background: "transparent", border: "none", color: T.text, fontSize: 15, outline: "none", resize: "none", fontFamily: FONT, lineHeight: 1.6, maxHeight: 120 }}
              placeholder="talk to Morrigan..."
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              rows={1} />
            <button
              style={{ background: input.trim() && !streaming ? `linear-gradient(135deg, ${T.accent}, ${T.purple})` : T.surface3, color: input.trim() && !streaming ? "#fff" : T.textDim, border: "none", borderRadius: 10, width: 36, height: 36, fontSize: 16, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0, boxShadow: input.trim() && !streaming ? `0 2px 12px ${T.accentGlow}` : "none" }}
              onClick={sendMessage} disabled={!input.trim() || streaming}>↑</button>
          </div>
        </div>
      </div>

      <CharacterPanel mood={currentMood} speaking={!!streamText} latestMeta={latestMeta} moodReflection={moodReflection} />

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