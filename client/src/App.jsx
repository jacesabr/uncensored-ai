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
  { id: "status",   label: "System Status",   icon: "◉" },
  { id: "dataflow", label: "Data Flow",        icon: "⇄" },
  { id: "session",  label: "Session & Memory", icon: "◈" },
  { id: "phase5",   label: "Phase 5",          icon: "∞" },
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
  const endpoint = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const checks = [
    {
      key: "express", label: "Express Server",
      live: liveHealth?.express ?? null,
      description: "Node.js backend — JWT auth, MongoDB, session cache, prompt assembly, LLM proxy.",
      route: "GET /health",
      detail: endpoint.replace("https://", "").replace("http://", ""),
    },
    {
      key: "ollama", label: "LLM — llama-cpp via Kaggle",
      live: status.ollama,
      description: "Streaming chat completions. Running uncensored_llama.gguf on T4×2 GPU. inject_system: false keeps Express in control of the full prompt.",
      route: "POST /v1/chat/completions → Kaggle",
      detail: liveHealth?.vram_gb != null ? `${liveHealth.vram_gb} GB VRAM in use` : "uncensored_llama.gguf",
    },
    {
      key: "embeddings", label: "Embeddings — llama_cpp embedding mode",
      live: status.embeddings,
      description: "Second Llama instance with embedding=True and n_ctx=512. Converts memory atoms to vectors for cosine similarity retrieval.",
      route: "POST /v1/embeddings → Kaggle",
      detail: "same GGUF, separate instance · T4×2 VRAM",
    },
    {
      key: "mongo", label: "MongoDB Atlas",
      live: liveHealth?.mongo ?? true,
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
          <MRow label="LLM BACKEND" value="Kaggle T4×2 GPU" />
          <MRow label="TUNNEL"      value="ngrok" />
        </MCard>
      </div>
    </div>
  );
}

// ── Tab 2: Data Flow ──────────────────────────────────────────────

function DataFlowTab({ livePersonality }) {
  const p   = livePersonality?.summary;
  const raw = livePersonality?.full;
  const hoursSince    = p?.lastSeen ? Math.floor((Date.now() - new Date(p.lastSeen)) / 3600000) : 0;
  const memoriesCount = raw?.memories?.length ?? p?.memoriesCount ?? 0;
  const trustLevel    = p?.trustLevel ?? 0;

  const lifecycle = [
    { step: "1", label: "User sends message",           color: MON.accent,    detail: "Client → POST /api/chat with JWT. Message appended to local state immediately." },
    { step: "2", label: "Express: auth + session load", color: MON.blue,      detail: "JWT verified. sessionCache checked — warm hit = zero DB reads. Cold miss = fetch PersonalityMemory from MongoDB." },
    { step: "3", label: "buildSystemPrompt()",          color: MON.purple,    detail: "10-layer prompt assembled: relationship narrative + self-reflection → character → trust guide → SPT note → prospective note → time context → memory → usage guide → session → continuation signal." },
    { step: "4", label: "Self-atom hint injected",      color: MON.pink,      detail: "Top-2 depth-eligible SelfAtoms appended at position 4.5 — things Morrigan could share if the moment is right." },
    { step: "5", label: "Proxy to Kaggle LLM",          color: MON.green,     detail: "POST to Kaggle ngrok → /v1/chat/completions · stream: true · inject_system: false. Full history sent — LLMs are stateless." },
    { step: "6", label: "Stream response to client",    color: MON.green,     detail: "SSE chunks forwarded as they arrive. Client appends each token to streamText, producing the typing effect." },
    { step: "7", label: "Save + trust update",          color: MON.textSoft,  detail: "Both messages written to MongoDB. Keyword scan updates trustPoints and feelings in session RAM." },
    { step: "8", label: "Flush on session end",         color: MON.pink,      detail: "flushSession(): extract atoms → embed → link → contradict → molecules → SPT depth → SPT breadth → relationship narrative → self-reflection → callbacks → prospective note." },
  ];

  const layers = [
    { id: "narrative", color: MON.pink,     label: "① Relationship Narrative + Self-Reflection", tokens: "~200 tokens · rewritten each session",  source: "PersonalityMemory.relationshipNarrative + selfReflectionState", description: "[Who he is to me] + [What I am sitting with]. Both blocks set the emotional frame before anything else. Self-reflection is about Morrigan — her patterns, hesitations, what she's carrying.", active: !!(raw?.relationshipNarrative || raw?.selfReflectionState), conditional: true },
    { id: "char",      color: MON.accent,   label: "② Character Spec",                           tokens: "~3,200 tokens",                          source: "CHARACTER_DEFAULT_PROMPT", description: "Full Morrigan: appearance, trauma history, psychology, speech patterns, CPTSD, Dr. Yun, Percy the cat. Always injected.", active: true },
    { id: "trust",     color: MON.green,    label: "③ Trust Behavior Guide",                     tokens: "~150 tokens",                            source: "TRUST_LEVELS[level]", description: `Level ${trustLevel} (${TRUST_LEVELS[trustLevel]?.name ?? "?"}) — controls guard level, sarcasm, warmth, response length.`, active: true },
    { id: "spt",       color: MON.purple,   label: "④ SPT Note",                                 tokens: "~50 tokens",                             source: "buildSPTNote(memory.sptDepth)", description: `Depth ${raw?.sptDepth ?? 1}/4. Hard-gates how vulnerable Morrigan can be. Includes validation-before-disclosure constraint — she responds to him before sharing anything about herself.`, active: true },
    { id: "atoms",     color: MON.pink,     label: "④.5 Self-Atom Hint",                         tokens: "~80 tokens",                             source: "SelfAtom collection · depth-gated", description: "Top-2 eligible self-atoms Morrigan could share if the moment is right. Depth-gated — depth-4 atoms never appear until sptDepth=4.", active: true },
    { id: "prospective", color: MON.pink,   label: "⑥ Prospective Note",                        tokens: "~50 tokens · session start only",         source: "memory.prospectiveNote", description: "What Morrigan has been sitting with since last session. Injected at session start only.", active: hoursSince > 2, conditional: true },
    { id: "time",      color: MON.amber,    label: "⑦ Time Absence Context",                     tokens: "~50 tokens",                             source: "Date.now() − memory.lastSeen", description: hoursSince > 48 ? `${hoursSince}h — strong context: she missed you.` : hoursSince > 24 ? `${hoursSince}h — mild: she noticed.` : `${hoursSince}h — recent, not injected.`, active: hoursSince > 24, conditional: true },
    { id: "memory",    color: MON.blue,     label: "⑧ Memory + Molecules + Tensions",            tokens: `${memoriesCount} atoms`,                 source: "PersonalityMemory.memories + molecules", description: "All known facts sorted by importance, molecule paragraphs, contradiction pairs with temporal markers.", active: true },
    { id: "reference", color: MON.blue,     label: "⑨ Memory Usage Guide",                       tokens: "~80 tokens",                             source: "static", description: "Weave naturally, respect temporal markers, hold contradictions, never list facts robotically.", active: true },
    { id: "continuation", color: MON.accent,label: "⑩ Continuation Signal",                     tokens: "~80 tokens",                             source: "static", description: "She is not a chatbot waiting to be addressed. She has things she wants to say. Prevents mechanical question-ending.", active: true },
  ];

  return (
    <div>
      <MSecHead icon="⇄" title="Request Lifecycle" color={MON.accent} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
        {lifecycle.map(({ step, label, detail, color }) => (
          <div key={step} style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "14px 18px", background: MON.surface, border: `1px solid ${color}20`, borderLeft: `4px solid ${color}`, borderRadius: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, marginTop: 2, background: color + "15", border: `1.5px solid ${color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MMONO, fontSize: 11, color, fontWeight: 700 }}>{step}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: MMONO, fontSize: 13, color, fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.65 }}>{detail}</div>
            </div>
          </div>
        ))}
      </div>

      <MSecHead icon="📋" title="System Prompt Layers" color={MON.purple} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {layers.map(({ id, color, label, tokens, source, description, active, conditional }) => (
          <div key={id} style={{ display: "flex", background: MON.surface, border: `1px solid ${color}${active ? "25" : "10"}`, borderRadius: 12, overflow: "hidden", opacity: active ? 1 : 0.45 }}>
            <div style={{ width: 5, background: color, flexShrink: 0 }} />
            <div style={{ padding: "14px 20px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MMONO, fontSize: 13, color, fontWeight: 700 }}>{label}</span>
                <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim, background: MON.surface2, borderRadius: 4, padding: "2px 8px" }}>{tokens}</span>
                {conditional && (
                  <span style={{ fontFamily: MMONO, fontSize: 10, color: active ? MON.green : MON.amber, background: (active ? MON.green : MON.amber) + "12", borderRadius: 4, padding: "2px 8px", border: `1px solid ${(active ? MON.green : MON.amber)}25` }}>
                    {active ? "ACTIVE" : "INACTIVE"}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.65, marginBottom: 6 }}>{description}</div>
              <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim }}>source: {source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab 3: Session & Memory ───────────────────────────────────────

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
                    {mem.contradicts?.length > 0 && <span style={{ fontFamily: MMONO, fontSize: 9, color: MON.amber, background: MON.amber + "12", border: `1px solid ${MON.amber}25`, borderRadius: 4, padding: "2px 7px" }}>⚡ {mem.contradicts.length} tension{mem.contradicts.length > 1 ? "s" : ""}</span>}
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
            {raw.milestones.map((ms, i) => (
              <div key={i} style={{ display: "flex", gap: 16, padding: "13px 18px", background: MON.surface, border: `1px solid ${MON.accent}20`, borderLeft: `4px solid ${MON.pink}`, borderRadius: 10 }}>
                <span style={{ fontFamily: MMONO, fontSize: 12, color: MON.accent, flexShrink: 0, minWidth: 50, paddingTop: 2 }}>LVL {ms.trustLevelAtTime}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, fontStyle: "italic", lineHeight: 1.65 }}>{ms.event}</div>
                  {ms.timestamp && <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 4, display: "block" }}>{new Date(ms.timestamp).toLocaleString()}</span>}
                </div>
              </div>
            ))}
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
  const endpoint = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

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
            <MRow label="MOTIVATION THRESHOLD" value="7.0 / 10"     valueColor={MON.accent} />
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
        fetch(`${API}/api/health`),
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
          {activeTab === "status"   && <StatusTab   status={status} user={user} conversations={conversations} messages={messages} liveHealth={liveHealth} />}
          {activeTab === "dataflow" && <DataFlowTab livePersonality={livePersonality} />}
          {activeTab === "session"  && <SessionTab  messages={messages} livePersonality={livePersonality} />}
          {activeTab === "phase5"   && <Phase5Tab   token={token()} />}
        </div>
      </div>
      <style>{`button:focus{outline:none}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${MON.border};border-radius:3px}`}</style>
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
// INFO SIDEBAR
// ═══════════════════════════════════════════════════════════════════

function InfoSidebar({ mood }) {
  const SL = ({ children }) => <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.accent, margin: "0 0 12px", letterSpacing: "1.5px", fontWeight: 700, textTransform: "uppercase" }}>{children}</p>;
  const D  = () => <div style={{ height: 1, background: T.border, margin: "4px 0" }} />;
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
        <p style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, margin: "0 0 10px", lineHeight: 1.85 }}>Making playlists. Drawing moths and anatomical hearts. Staying up until 3am listening to someone vent. Howl's Moving Castle. Junji Ito. Anne Carson. The specific silence after a song ends.</p>
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
// CHARACTER PANEL
// ═══════════════════════════════════════════════════════════════════

function CharacterPanel({ mood, speaking }) {
  return (
    <div style={{ width: 360, minWidth: 360, background: `linear-gradient(180deg, ${T.surface}f0, ${T.bg}f0)`, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 45%, rgba(155,45,94,0.07) 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "0 18px", width: "100%" }}>
        <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {speaking && (
            <div style={{ display: "flex", gap: 5 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent, animation: "speakBounce 0.6s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />)}
            </div>
          )}
        </div>
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
  return <span>{text.split(/(\*[^*]+\*)/g).map((part, i) => part.startsWith("*") && part.endsWith("*") ? <em key={i} style={{ color: T.textSoft, fontStyle: "italic", opacity: 0.85 }}>{part.slice(1,-1)}</em> : <span key={i}>{part}</span>)}</span>;
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

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", marginBottom: 22, alignItems: "flex-start", justifyContent: isUser ? "flex-end" : "flex-start", animation: "fadeSlideIn 0.3s ease forwards" }}>
      <div style={isUser
        ? { background: `linear-gradient(135deg, ${T.userBubble}, ${T.purple})`, color: "#fff", borderRadius: "22px 22px 4px 22px", padding: "13px 20px", maxWidth: "65%", wordBreak: "break-word", boxShadow: `0 2px 12px ${T.accentGlow}` }
        : { background: T.aiBubble, color: T.text, border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px", padding: "13px 20px", maxWidth: "75%", wordBreak: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        {!isUser && <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span></div>}
        <div style={{ fontSize: 15, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: FONT }}><FormatMessage text={msg.content} /></div>
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
    return JSON.parse(atob(p[1]));
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  const [authed,        setAuthed]        = useState(false);
  const [user,          setUser]          = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConvo,   setActiveConvo]   = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState("");
  const [streaming,     setStreaming]     = useState(false);
  const [streamText,    setStreamText]    = useState("");
  const [status,        setStatus]        = useState({ ollama: false, embeddings: false });
  const [currentMood,   setCurrentMood]   = useState("neutral");
  const [showExplain,   setShowExplain]   = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const justCreated    = useRef(false);

  const token = () => localStorage.getItem("token");
  const hdrs  = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

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
      .then(async d => {
        if (d.length === 0) {
          // Empty conversation opened from sidebar — fetch dynamic greeting
          let greetingContent = CHARACTER.greeting;
          try {
            const greetRes = await fetch(`${API}/api/session/greeting?conversationId=${activeConvo}`, { headers: hdrs() });
            if (greetRes.ok) {
              const { greeting } = await greetRes.json();
              if (greeting) greetingContent = greeting;
            }
          } catch { /* non-fatal — use static fallback */ }
          setMessages([{ role: "assistant", content: greetingContent, timestamp: new Date() }]);
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
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText]);

  const createConvo = async () => {
    const res  = await fetch(`${API}/api/conversations`, { method: "POST", headers: hdrs(), body: JSON.stringify({ title: "🖤 New chat" }) });
    const convo = await res.json();
    setConversations(p => [convo, ...p]);
    justCreated.current = true;

    // Fetch dynamic greeting — falls back to static CHARACTER.greeting if unavailable
    let greetingContent = CHARACTER.greeting;
    try {
      const greetRes = await fetch(`${API}/api/session/greeting?conversationId=${convo.conversationId}`, { headers: hdrs() });
      if (greetRes.ok) {
        const { greeting } = await greetRes.json();
        if (greeting) greetingContent = greeting;
      }
    } catch { /* non-fatal — use static fallback */ }

    setMessages([{ role: "assistant", content: greetingContent, timestamp: new Date() }]);
    setActiveConvo(convo.conversationId);
    return convo.conversationId;
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    let cid = activeConvo; if (!cid) cid = await createConvo();
    setMessages(p => [...p, { role: "user", content: input.trim(), timestamp: new Date() }]);
    setInput(""); setStreaming(true); setStreamText("");

    try {
      const res    = await fetch(`${API}/api/chat`, { method: "POST", headers: hdrs(), body: JSON.stringify({ conversationId: cid, message: input.trim() }) });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "", buffer = "";

      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n"); buffer = parts.pop() || "";
        for (const line of parts.filter(l => l.startsWith("data: "))) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.token) { full += json.token; setStreamText(full); }
            if (json.done) {
              const finalText = json.finalResponse || full;
              if (finalText.trim()) {
                setMessages(p => [...p, { role: "assistant", content: finalText, timestamp: new Date() }]);
                setConversations(p => p.map(c => c.conversationId === cid ? { ...c, title: `🖤 ${finalText.substring(0, 40)}${finalText.length > 40 ? "..." : ""}`, updatedAt: new Date() } : c));
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
        <ExplainPanel onClose={() => setShowExplain(false)} token={token()} user={user} conversations={conversations} messages={messages} status={status} />
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
              style={{ background: T.accentSoft, border: `1px solid ${T.accent}50`, borderRadius: 8, padding: "5px 14px", color: T.accent, fontFamily: FONT_MONO, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
              onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = T.accentSoft; e.currentTarget.style.color = T.accent; }}>
              ⚙ monitor
            </button>
            {[["chat", "ollama"], ["embed", "embeddings"]].map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: status[key] ? T.green : T.red, boxShadow: status[key] ? `0 0 6px ${T.green}` : "none" }} />
                <span style={{ color: T.textDim, fontSize: 10, fontFamily: FONT_MONO }}>{label}</span>
              </div>
            ))}
            <button onClick={handleLogout}
              style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 12px", color: T.textDim, fontSize: 11, cursor: "pointer", fontFamily: FONT_MONO }}
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