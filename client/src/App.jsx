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
// EXPLAIN / MONITOR — tabbed, full-screen, readable
// ═══════════════════════════════════════════════════════════════════

const MON = {
  bg:         "#f6f7fb",
  surface:    "#ffffff",
  surface2:   "#f0f0f5",
  surface3:   "#e8e8f0",
  border:     "#e6e8ef",
  text:       "#1f2937",
  textSoft:   "#4b5563",
  textDim:    "#9ca3af",
  accent:     "#7c3aed",
  accentSoft: "#ede9fe",
  purple:     "#9f67ff",
  red:        "#dc2626",
  green:      "#10b981",
  amber:      "#f59e0b",
  blue:       "#0ea5e9",
  pink:       "#9B2D5E",
};
const MMONO    = "'JetBrains Mono', 'Fira Code', monospace";
const MSERIF   = "'Crimson Pro', Georgia, serif";
const MDISPLAY = "'Playfair Display', 'Crimson Pro', serif";

const MONITOR_TABS = [
  { id: "status",   label: "System Status",   icon: "◉" },
  { id: "dataflow", label: "Data Flow",        icon: "⇄" },
  { id: "session",  label: "Session & Memory", icon: "◈" },
];

function MLabel({ children, color = MON.accent }) {
  return (
    <div style={{ fontFamily: MMONO, fontSize: 11, color, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function MCard({ children, accent, style = {} }) {
  return (
    <div style={{
      background:   MON.surface,
      border:       `1px solid ${accent ? accent + "30" : MON.border}`,
      borderLeft:   accent ? `4px solid ${accent}` : `1px solid ${MON.border}`,
      borderRadius: 12,
      padding:      "18px 22px",
      marginBottom: 12,
      ...style,
    }}>
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
      <span style={{ fontFamily: MMONO, fontSize: 13, color: valueColor || MON.text, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>
        {String(value ?? "—")}
      </span>
    </div>
  );
}

function MPill({ children, color = MON.accent }) {
  return (
    <span style={{ fontFamily: MMONO, fontSize: 10, fontWeight: 700, color, background: color + "12", border: `1px solid ${color}25`, borderRadius: 5, padding: "3px 9px", marginRight: 5, marginBottom: 5, display: "inline-block" }}>
      {children}
    </span>
  );
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

// ── Tab 1: System Status ──────────────────────────────────────────────────────

function StatusTab({ status, user, conversations, messages, liveHealth }) {
  const endpoint = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const checks = [
    {
      key: "express", label: "Express Server",
      live: liveHealth?.express ?? null,
      description: "Node.js backend — JWT auth, MongoDB, session cache, prompt assembly, LLM proxy. The frontend talks only to this; it never hits Kaggle directly.",
      route: "GET /health",
      detail: endpoint.replace("https://", "").replace("http://", ""),
    },
    {
      key: "ollama", label: "LLM — llama-cpp via Kaggle",
      live: status.ollama,
      description: "Streaming chat completions. Express proxies every request. Running uncensored_llama.gguf with n_ctx 8192 on T4×2 GPU.",
      route: "POST /v1/chat/completions → Kaggle",
      detail: liveHealth?.vram_gb != null ? `${liveHealth.vram_gb} GB VRAM in use` : "uncensored_llama.gguf",
    },
    {
      key: "comfyui", label: "Image Gen — Pony V6 SDXL",
      live: status.comfyui,
      description: "Loads the safetensors pipeline into VRAM on demand, generates, then unloads to free space for the LLM. Mutex-locked — one generation at a time.",
      route: "POST /generate-image → Kaggle /generate",
      detail: "single-file safetensors · loaded per request",
    },
    {
      key: "mongo", label: "MongoDB Atlas",
      live: liveHealth?.mongo ?? true,
      description: "Permanent storage for PersonalityMemory (trust, feelings, memories, milestones), Conversations, and Messages. Session state lives in server RAM until flush.",
      route: "mongoose ODM · auto-reconnect",
      detail: "PersonalityMemory · Conversations · Messages",
    },
  ];

  return (
    <div>
      <MSecHead icon="◉" title="Live System Checks" color={MON.green} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {checks.map(c => (
          <div key={c.key} style={{ background: MON.surface, border: `1px solid ${c.live === null ? MON.border : c.live ? MON.green + "35" : MON.red + "30"}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              {c.live === null
                ? <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim, fontWeight: 700 }}>PENDING</span>
                : <MStatusDot live={!!c.live} />
              }
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
        <MCard>
          <MLabel>Identity</MLabel>
          <MRow label="USER ID"  value={user?.id ? `…${user.id.slice(-10)}` : "—"} valueColor={MON.accent} />
          <MRow label="TOKEN"    value="JWT · 90d expiry" />
          <MRow label="AUTH"     value="sha256 → bcrypt" />
        </MCard>
        <MCard>
          <MLabel>Conversations</MLabel>
          <MRow label="TOTAL IN DB"      value={conversations.length} valueColor={MON.accent} />
          <MRow label="MSGS THIS CONVO"  value={messages.length} />
          <MRow label="USER MSGS"        value={messages.filter(m => m.role === "user").length} />
          <MRow label="AI MSGS"          value={messages.filter(m => m.role === "assistant").length} />
        </MCard>
        <MCard>
          <MLabel>Environment</MLabel>
          <MRow label="API BASE"    value={endpoint.replace("https://", "").replace("http://", "")} valueColor={MON.blue} />
          <MRow label="LLM BACKEND" value="Kaggle T4×2 GPU" />
          <MRow label="TUNNEL"      value="ngrok static domain" />
          <MRow label="VIDEO GEN"   value="disabled" valueColor={MON.textDim} />
        </MCard>
      </div>
    </div>
  );
}

// ── Tab 2: Data Flow ──────────────────────────────────────────────────────────

function DataFlowTab({ livePersonality }) {
  const p   = livePersonality?.summary;
  const raw = livePersonality?.full;

  const hoursSince    = p?.lastSeen ? Math.floor((Date.now() - new Date(p.lastSeen)) / 3600000) : 0;
  const memoriesCount = raw?.memories?.length ?? p?.memoriesCount ?? 0;
  const trustLevel    = p?.trustLevel ?? 0;

  const lifecycle = [
    { step: "1", label: "User sends message",           color: MON.accent,
      detail: "Client → POST /api/chat with JWT in Authorization header. Message held in local React state." },
    { step: "2", label: "Express: auth + session load", color: MON.blue,
      detail: "Verifies JWT. Calls loadOrCreateSession(userId) — checks sessionCache first, otherwise fetches PersonalityMemory from MongoDB and warms the cache." },
    { step: "3", label: "buildSystemPrompt()",          color: MON.purple,
      detail: "Assembles all context layers (see below) into a single role:'system' message. Kaggle's own notebook prompt is bypassed via inject_system: false — Express owns the spec." },
    { step: "4", label: "Score user message",           color: MON.amber,
      detail: "Keyword detection runs on the user's text. Matches update trustPoints and feelings (affection, comfort, etc.) inside sessionCache. No DB write yet." },
    { step: "5", label: "Proxy to Kaggle LLM",          color: MON.green,
      detail: "POST to Kaggle ngrok tunnel → /v1/chat/completions · stream: true · inject_system: false. Full message history + system block sent every time — LLMs are stateless." },
    { step: "6", label: "Stream response to client",    color: MON.green,
      detail: "SSE chunks from Kaggle forwarded to the browser as they arrive. Client appends each chunk to streamText state, producing the typing effect." },
    { step: "7", label: "Save messages to MongoDB",     color: MON.textSoft,
      detail: "Both the user message and AI response written to the Messages collection. conversation.updatedAt bumped. Only DB write per exchange." },
    { step: "8", label: "Flush on logout / tab close",  color: MON.pink,
      detail: "flushSession(): all session exchanges sent to LLM for memory extraction → JSON facts deduped against existing memories[] → PersonalityMemory.save(). Cache cleared." },
  ];

  const layers = [
    {
      id: "char", color: MON.accent,
      label: "Character Spec", tokens: "~3,200 tokens",
      source: "server/index.js · CHARACTER_DEFAULT_PROMPT",
      description: "The canonical Morrigan: appearance, trauma, backstory, psychology, speech patterns, physical tells, trust/intimacy rules. Source of truth — not the Kaggle notebook.",
      active: true,
    },
    {
      id: "memory", color: MON.blue,
      label: "Memory Context", tokens: `${memoriesCount} facts + feelings + milestones`,
      source: "MongoDB → session.memory",
      description: `Trust level (${trustLevel}/6), days since first met, all known facts sorted by importance, feelings scores, milestones. Rebuilt fresh on every single message.`,
      active: true,
    },
    {
      id: "trust", color: MON.green,
      label: "Trust Behavior Guide", tokens: "~150 tokens",
      source: "TRUST_LEVELS[level].description",
      description: `Level ${trustLevel} (${TRUST_LEVELS[trustLevel]?.name ?? "?"}) behavior injected. Controls guard level, sarcasm intensity, warmth, response length, what topics she allows.`,
      active: true,
    },
    {
      id: "time", color: MON.amber,
      label: "Time Absence Context", tokens: "~50 tokens",
      source: "Date.now() − memory.lastSeen",
      description: hoursSince > 48
        ? `${hoursSince}h since last seen — STRONG context active: she missed you, anxiety built up.`
        : hoursSince > 24
          ? `${hoursSince}h since last seen — mild context: she noticed the gap.`
          : `${hoursSince}h since last seen — recent. Not injected.`,
      active: hoursSince > 24,
      conditional: true,
    },
    {
      id: "exchanges", color: MON.pink,
      label: "Session Exchanges", tokens: "last 10 turns · 500–2,000 tokens",
      source: "sessionCache.sessionExchanges (server RAM)",
      description: "What you've said this session — in server RAM, not DB. Prevents Morrigan repeating herself mid-conversation. Cleared on flush.",
      active: true,
    },
    {
      id: "history", color: MON.textSoft,
      label: "Message History", tokens: "last 50 messages from DB",
      source: "MongoDB Messages collection",
      description: "Full conversation loaded from MongoDB as user/assistant turns. Appended after the system block.",
      active: true,
    },
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

      <MSecHead icon="📋" title="System Prompt Layers — what Kaggle receives each message" color={MON.purple} />
      <MCard style={{ background: MON.accentSoft + "25", border: `1px solid ${MON.accent}18`, marginBottom: 16 }}>
        <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.8 }}>
          Every request sends a fresh <code style={{ fontFamily: MMONO, fontSize: 13, color: MON.accent }}>role: "system"</code> block assembled by{" "}
          <code style={{ fontFamily: MMONO, fontSize: 13, color: MON.accent }}>buildSystemPrompt()</code> in <code style={{ fontFamily: MMONO, fontSize: 13 }}>server/index.js</code>.{" "}
          Kaggle's notebook prompt is skipped — <code style={{ fontFamily: MMONO, fontSize: 13, color: MON.accent }}>inject_system: false</code> is always sent from Express. Kaggle is just the GPU.
        </div>
      </MCard>
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
                    {active ? "ACTIVE" : "INACTIVE — threshold not met"}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.65, marginBottom: 6 }}>{description}</div>
              <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim }}>source: {source}</span>
            </div>
          </div>
        ))}
      </div>

      <MSecHead icon="🧠" title="Memory Extraction — fires on flush" color={MON.pink} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <MCard accent={MON.pink}>
          <MLabel color={MON.pink}>What triggers it</MLabel>
          <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.8 }}>
            Fires on <code style={{ fontFamily: MMONO, fontSize: 13, color: MON.pink }}>POST /api/session/end</code> (the "leave" button) or the browser's{" "}
            <code style={{ fontFamily: MMONO, fontSize: 13 }}>beforeunload</code> event (tab close / refresh). Nothing is extracted mid-session.
          </div>
        </MCard>
        <MCard accent={MON.blue}>
          <MLabel color={MON.blue}>How it works</MLabel>
          <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.8 }}>
            All session exchanges → LLM at <code style={{ fontFamily: MMONO, fontSize: 13, color: MON.blue }}>temperature: 0.1</code> → JSON fact array → deduped against existing memories[] → saved to MongoDB.
            Categories: name · interest · personal · emotional · preference · relationship · event.
          </div>
        </MCard>
      </div>
    </div>
  );
}

// ── Tab 3: Session & Memory ───────────────────────────────────────────────────

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
          <MRow label="TOTAL MSGS (lifetime)" value={p?.totalMessages ?? "—"} />
          <MRow label="TOTAL CONVOS"          value={p?.totalConversations ?? "—"} />
          <MRow label="MEMORIES IN DB"        value={raw?.memories?.length ?? p?.memoriesCount ?? "—"} />
        </MCard>
        <MCard>
          <MRow label="FIRST MET"         value={p?.firstMet ? new Date(p.firstMet).toLocaleDateString() : "—"} />
          <MRow label="DAYS TOGETHER"     value={p?.firstMet ? `${Math.floor((Date.now() - new Date(p.firstMet)) / 86400000)}d` : "—"} />
          <MRow label="HOURS SINCE FLUSH" value={`${hoursSince}h`} valueColor={hoursSince > 24 ? MON.amber : MON.text} />
        </MCard>
      </div>

      <MSecHead icon="💜" title="Morrigan's Feelings — last MongoDB flush" color="#ec4899" />
      <MCard>
        {[
          { key: "affection",      label: "Affection",           sub: "how much she likes you",       color: "#ec4899" },
          { key: "comfort",        label: "Comfort",             sub: "how safe she feels",            color: MON.green },
          { key: "attraction",     label: "Attraction",          sub: "physical / romantic interest",  color: MON.amber },
          { key: "protectiveness", label: "Protectiveness",      sub: "wants to protect you",          color: MON.blue  },
          { key: "vulnerability",  label: "Vulnerability shown", sub: "how much she's opened up",      color: MON.purple},
        ].map(({ key, label, sub, color }) => (
          <MBar key={key} value={raw?.feelings?.[key] ?? p?.feelings?.[key] ?? 0} max={100} label={label} sub={sub} color={color} />
        ))}
        <div style={{ fontFamily: MSERIF, fontSize: 13, color: MON.textDim, marginTop: 4, fontStyle: "italic" }}>
          In-session changes live in server RAM — only reflected here after you log out and back in.
        </div>
      </MCard>

      <MSecHead icon="🧠" title="Stored Memories — MongoDB" color={MON.blue} />
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
                    {[1, 2, 3, 4, 5].map(n => (
                      <div key={n} style={{ width: 5, height: 5, borderRadius: "50%", background: n <= (mem.importance || 1) ? (CAT_COLORS[mem.category] || MON.accent) : MON.surface3 }} />
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.text, lineHeight: 1.6 }}>{mem.fact}</div>
                  {mem.learnedAt && (
                    <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 4, display: "block" }}>
                      learned {new Date(mem.learnedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <MCard>
          <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textDim }}>
            No memories yet — extracted from session exchanges when you log out.
          </div>
        </MCard>
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
                  {ms.timestamp && (
                    <span style={{ fontFamily: MMONO, fontSize: 10, color: MON.textDim, marginTop: 4, display: "block" }}>
                      {new Date(ms.timestamp).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <MSecHead icon="⚡" title="Session Cache — in-memory, not yet saved" color={MON.amber} />
      <MCard accent={MON.amber} style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: MSERIF, fontSize: 15, color: MON.textSoft, lineHeight: 1.8 }}>
          Trust points, feelings, and session exchanges live in <code style={{ fontFamily: MMONO, fontSize: 13, color: MON.amber }}>sessionCache</code> (server RAM).
          Nothing is written to MongoDB until <code style={{ fontFamily: MMONO, fontSize: 13, color: MON.amber }}>flushSession()</code> fires on the{" "}
          <code style={{ fontFamily: MMONO, fontSize: 13 }}>leave</code> button or tab close. The values above reflect the last saved state.
        </div>
      </MCard>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <MCard>
          <MLabel color={MON.amber}>In-memory right now</MLabel>
          <MRow label="USER MSGS THIS CONVO"  value={messages.filter(m => m.role === "user").length} />
          <MRow label="AI MSGS THIS CONVO"    value={messages.filter(m => m.role === "assistant").length} />
          <MRow label="DB WRITES PER MESSAGE" value="0 (Messages only, sync)" />
          <MRow label="PERSONALITY WRITES"    value="only on flushSession()" />
          <MRow label="FLUSH TRIGGER"         value="leave button OR tab close" />
        </MCard>
        <MCard>
          <MLabel color={MON.red}>What flush does</MLabel>
          <MRow label="1. LLM EXTRACTION" value="session exchanges → JSON facts" />
          <MRow label="2. DEDUP"          value="against existing memories[]" />
          <MRow label="3. MONGODB SAVE"   value="PersonalityMemory.save()" />
          <MRow label="4. RESET"          value="sessionExchanges = [], dirty = false" />
          <MRow label="5. lastSeen"       value="updated to Date.now()" />
        </MCard>
      </div>
    </div>
  );
}

// ── Main ExplainPanel ─────────────────────────────────────────────────────────

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
        fetch(`${API}/health`),
        fetch(`${API}/api/personality`,      { headers: hdrs() }),
        fetch(`${API}/api/personality/full`, { headers: hdrs() }),
      ]);

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        const h = await healthRes.value.json();
        setLiveHealth({ ...h, express: true });
      } else {
        setLiveHealth({ express: false });
      }

      const summary = summaryRes.status === "fulfilled" && summaryRes.value.ok
        ? await summaryRes.value.json() : null;
      const full = fullRes.status === "fulfilled" && fullRes.value.ok
        ? await fullRes.value.json() : null;

      setLivePersonality({ summary, full });
      setLastRefresh(new Date());
    } catch (e) { console.error("[ExplainPanel]", e); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleBackdrop = e => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div onClick={handleBackdrop} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(8,4,18,0.80)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "14px" }}>
      <div style={{ width: "100%", height: "100%", background: MON.bg, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", border: `1px solid ${MON.border}`, boxShadow: "0 40px 140px rgba(0,0,0,0.55)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", borderBottom: `1px solid ${MON.border}`, background: MON.surface, flexShrink: 0, height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <span style={{ fontFamily: MDISPLAY, fontSize: 17, color: MON.text, fontWeight: 500, whiteSpace: "nowrap" }}>System Monitor</span>
            <div style={{ display: "flex", gap: 4 }}>
              {MONITOR_TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  style={{ background: activeTab === t.id ? MON.accentSoft : "transparent", border: "none", borderRadius: 8, padding: "7px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background 0.15s" }}>
                  <span style={{ fontFamily: MMONO, fontSize: 14, color: activeTab === t.id ? MON.accent : MON.textDim }}>{t.icon}</span>
                  <span style={{ fontFamily: MMONO, fontSize: 12, color: activeTab === t.id ? MON.accent : MON.textDim, fontWeight: activeTab === t.id ? 700 : 400 }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {lastRefresh && <span style={{ fontFamily: MMONO, fontSize: 11, color: MON.textDim }}>refreshed {lastRefresh.toLocaleTimeString()}</span>}
            <button onClick={refresh} disabled={loading}
              style={{ background: MON.accentSoft, border: `1px solid ${MON.accent}40`, borderRadius: 8, padding: "7px 18px", color: MON.accent, fontFamily: MMONO, fontSize: 12, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "⟳ loading…" : "⟳ refresh"}
            </button>
            <button onClick={onClose}
              style={{ background: "transparent", border: `1px solid ${MON.border}`, borderRadius: 8, padding: "7px 16px", color: MON.textDim, fontFamily: MMONO, fontSize: 12, cursor: "pointer" }}>
              ✕ close
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 36px 60px" }}>
          {activeTab === "status"   && <StatusTab   status={status} user={user} conversations={conversations} messages={messages} liveHealth={liveHealth} />}
          {activeTab === "dataflow" && <DataFlowTab livePersonality={livePersonality} />}
          {activeTab === "session"  && <SessionTab  messages={messages} livePersonality={livePersonality} />}
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
          status={status}
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