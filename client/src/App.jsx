import React, { useState, useEffect, useRef } from "react";
import morriganImg from "./morgan.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const T = {
  bg: "#f6f7fb",
  surface: "#ffffff",
  surface2: "#f0f0f5",
  surface3: "#e8e8f0",
  border: "#e6e8ef",
  borderLight: "#d0d0e0",
  text: "#1f2937",
  textSoft: "#4b5563",
  textDim: "#9ca3af",
  accent: "#7c3aed",
  accentSoft: "#ede9fe",
  accentGlow: "rgba(124,58,237,0.3)",
  purple: "#9f67ff",
  red: "#dc2626",
  green: "#10b981",
  aiBubble: "#ffffff",
  userBubble: "#7c3aed",
};

const FONT = "'Crimson Pro', 'Georgia', serif";
const FONT_MONO = "'JetBrains Mono', monospace";
const FONT_DISPLAY = "'Playfair Display', 'Crimson Pro', serif";

// ─── Mood Analysis ───────────────────────────────────────────────
const MOODS = {
  neutral:    { label: "guarded" },
  happy:      { label: "genuinely smiling" },
  sad:        { label: "hurting" },
  flirty:     { label: "flustered" },
  angry:      { label: "walls up" },
  shy:        { label: "vulnerable" },
  sarcastic:  { label: "deflecting" },
  vulnerable: { label: "letting you in" },
  excited:    { label: "nerding out" },
};

const MOOD_DESCRIPTIONS = {
  neutral:    "Guarded. Watching you from across the counter. Not sure what to make of you yet — but she's noticed you.",
  happy:      "A real smile slipped out and she hated herself for it a little. She's covering her mouth. Too late.",
  sad:        "Something's off. Her eyes are doing that thing where they go too still. She's holding it together. Barely.",
  flirty:     "Pink-cheeked. Won't make eye contact. Said something sarcastic but her voice went soft at the end.",
  angry:      "Walls fully up. Something hit a nerve. Give her space or she'll disappear entirely.",
  shy:        "She said something real by accident and now she wants to take it back. Don't make it weird.",
  sarcastic:  "Deflecting hard with jokes. There's something real underneath — she just won't let you see it yet.",
  vulnerable: "She's letting you in. She knows it. She's terrified. Don't fuck this up.",
  excited:    "She forgot to be cool for a second. Talking too fast. Eyes lit up. She'd die if you pointed it out.",
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

// ─── Particles ───────────────────────────────────────────────────
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
        <div key={i} style={{
          position: "absolute", width: p.width, height: p.height,
          borderRadius: "50%", background: p.background,
          left: p.left, top: p.top,
          animation: `floatParticle ${p.duration} ease-in-out infinite`,
          animationDelay: p.delay,
        }} />
      ))}
    </div>
  );
}

// ─── Character (frontend display only — full prompt lives in server/index.js) ──
const CHARACTER = {
  name: "Morrigan",
  color: "#9B2D5E",
  greeting: `*glances up from a battered paperback. dark eyes, smudged eyeliner. doesn't smile.*

...hey.

*pulls her sleeves over her hands. studies you for a second too long, then looks away*

Store's open, I guess. If you're looking for something.`,
  // NOTE: This is a SHORT client-side fallback only.
  // The FULL character prompt lives in server/index.js as CHARACTER_DEFAULT_PROMPT
  // and is injected by buildSystemPrompt() on every single message.
  systemPrompt: `You are Morrigan. See server-side CHARACTER_DEFAULT_PROMPT for full character definition.`,
};

// ─── Mood Badge ───────────────────────────────────────────────────
function MoodBadge({ mood }) {
  const m = MOODS[mood] || MOODS.neutral;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 14px", borderRadius: 20,
      background: T.accentSoft, border: `1px solid ${T.accent}30`,
      fontSize: 12, color: T.textSoft, fontFamily: FONT_MONO,
      letterSpacing: "0.3px", transition: "all 0.5s ease",
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
        background: mood === "happy" || mood === "excited" ? T.green :
          mood === "sad" || mood === "angry" ? T.red : T.accent,
        boxShadow: `0 0 6px ${mood === "happy" || mood === "excited" ? T.green :
          mood === "sad" || mood === "angry" ? T.red : T.accent}`,
      }} />
      {m.label}
    </div>
  );
}

// ─── Left Info Sidebar ────────────────────────────────────────────
function InfoSidebar({ mood }) {
  const SectionLabel = ({ children }) => (
    <p style={{
      fontFamily: FONT_MONO, fontSize: 10, color: T.accent,
      margin: "0 0 12px", letterSpacing: "1.5px", fontWeight: 700,
      textTransform: "uppercase",
    }}>{children}</p>
  );

  const Divider = () => (
    <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
  );

  const FactRow = ({ label, value }) => (
    <div style={{ marginBottom: 10 }}>
      <span style={{
        display: "block", fontFamily: FONT_MONO, fontSize: 9,
        color: T.textDim, letterSpacing: "1px", marginBottom: 2,
        textTransform: "uppercase",
      }}>{label}</span>
      <span style={{ fontFamily: FONT, fontSize: 15, color: T.text, lineHeight: 1.5 }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      width: 280, minWidth: 280,
      background: `linear-gradient(180deg, ${T.surface}, ${T.bg})`,
      borderRight: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column",
      padding: "28px 22px 28px",
      overflowY: "auto",
      gap: 20,
      position: "relative", zIndex: 1,
    }}>
      {/* Name */}
      <div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: T.text, margin: "0 0 3px", fontWeight: 500, letterSpacing: "-0.3px" }}>
          Morrigan
        </h2>
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.textDim, margin: 0, letterSpacing: "1px" }}>
          HOLLOW VINYL · RECORD STORE
        </p>
      </div>

      <Divider />

      {/* Current Mood */}
      <div>
        <SectionLabel>Current Mood</SectionLabel>
        <MoodBadge mood={mood} />
        <p style={{
          fontFamily: FONT, fontSize: 15, color: T.textSoft,
          margin: "12px 0 0", lineHeight: 1.75, fontStyle: "italic",
        }}>
          {MOOD_DESCRIPTIONS[mood] || MOOD_DESCRIPTIONS.neutral}
        </p>
      </div>

      <Divider />

      {/* About */}
      <div>
        <SectionLabel>About Her</SectionLabel>
        <FactRow label="Age" value="23" />
        <FactRow label="Works at" value="Hollow Vinyl (record store)" />
        <FactRow label="Also" value="The Wreck — dive bar, weekends" />
        <FactRow label="Lives" value="Studio above a laundromat. Smells like dryer sheets at 2am." />
        <FactRow label="Cat" value="Persephone (Percy) 🖤 — the only creature she trusts unconditionally" />
        <FactRow label="Real name" value="Moira — chosen 'Morrigan' at 15. She only tells people she trusts." />
      </div>

      <Divider />

      {/* Trauma & Backstory */}
      <div>
        <SectionLabel>Where She's Been</SectionLabel>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: "0 0 12px", lineHeight: 1.8 }}>
          Mom was an addict. Dad left before she could remember his face. Foster care from age 7 to 17 — three homes. One where they forgot to feed her. One where the older foster brother did things she doesn't talk about. One that was actually good — the Nguyens — but they had to move out of state. That one hurt worst. It taught her that even good things leave.
        </p>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: 0, lineHeight: 1.8 }}>
          Got her GED at 17 while couch-surfing. The word <em style={{ color: T.text }}>"STILL"</em> is tattooed on her inner wrist — she got it the day she left her last foster home. A reminder she's still here.
        </p>
      </div>

      <Divider />

      {/* Why She's Guarded */}
      <div>
        <SectionLabel>Why She's Guarded</SectionLabel>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: "0 0 12px", lineHeight: 1.8 }}>
          She wants to be loved desperately. She wants to make people feel good, to be someone's person, to share her life. The world keeps punishing her for that softness — the foster brother, the boyfriend at 16 who told everyone her secrets, everyone who said they'd stay and didn't.
        </p>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: 0, lineHeight: 1.8 }}>
          So she tests people. Pushes them away to see if they'll come back. She knows she does it. She hates it. She does it anyway because being alone forever is less terrifying than being left again.
        </p>
      </div>

      <Divider />

      {/* What She Loves */}
      <div>
        <SectionLabel>What She Actually Loves</SectionLabel>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: "0 0 10px", lineHeight: 1.8 }}>
          Making playlists for people. Drawing faces, moths, anatomical hearts. Staying up until 3am listening to someone vent and pretending it was nothing. The sound of a record dropping. Studio Ghibli (it's Howl's Moving Castle, fight her). Junji Ito. Anne Carson. The specific silence after a song ends.
        </p>
        <p style={{ fontFamily: FONT, fontSize: 15, color: T.textSoft, margin: 0, lineHeight: 1.8 }}>
          She has a secret TikTok for her art. 47 followers. Every single like makes her whole day — and she'd never in a million years admit that.
        </p>
      </div>

      <Divider />

      {/* Personality tags */}
      <div>
        <SectionLabel>Personality</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {["sarcastic", "fiercely loyal", "artistic", "guarded", "dry humor", "anxious attachment", "literary", "secretly soft", "hypervigilant", "wants to be loved"].map(tag => (
            <span key={tag} style={{
              fontFamily: FONT_MONO, fontSize: 10, color: T.textSoft,
              background: T.surface2, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: "4px 9px", letterSpacing: "0.3px",
            }}>{tag}</span>
          ))}
        </div>
      </div>

      <Divider />

      {/* Closing quote */}
      <div style={{
        background: T.accentSoft, borderRadius: 12,
        border: `1px solid ${T.accent}20`, padding: "14px 16px",
      }}>
        <p style={{
          fontFamily: FONT, fontSize: 14, color: T.textSoft,
          margin: 0, lineHeight: 1.85, fontStyle: "italic",
        }}>
          "She keeps trying anyway. Because what else is there."
        </p>
      </div>
    </div>
  );
}

// ─── Character Panel (right) ─────────────────────────────────────
function CharacterPanel({ mood, speaking }) {
  return (
    <div style={{
      width: 320, minWidth: 320,
      background: `linear-gradient(180deg, ${T.surface}f0, ${T.bg}f0)`,
      borderLeft: `1px solid ${T.border}`,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 18, position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 45%, rgba(155,45,94,0.06) 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "0 20px", width: "100%" }}>
        {/* Speaking dots */}
        <div style={{ height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {speaking && (
            <div style={{ display: "flex", gap: 5 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: "50%", background: T.accent,
                  animation: "speakBounce 0.6s ease-in-out infinite",
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Photo */}
        <div style={{
          width: "100%", maxWidth: 280, aspectRatio: "3/4",
          borderRadius: 20, overflow: "hidden",
          border: `2px solid ${T.border}`,
          boxShadow: speaking
            ? `0 0 0 3px ${T.accentSoft}, 0 0 30px rgba(124,58,237,0.45), 0 8px 40px rgba(80,0,60,0.25)`
            : `0 0 0 3px ${T.accentSoft}, 0 8px 40px rgba(80,0,60,0.18)`,
          transition: "box-shadow 0.5s ease",
        }}>
          <img src={morriganImg} alt="Morrigan" style={{
            width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 15%", display: "block",
          }} />
        </div>

        {/* Name + subtitle + mood */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: T.text, fontWeight: 400 }}>Morrigan</span>
          <span style={{ fontFamily: FONT, fontSize: 13, color: T.textDim, fontStyle: "italic" }}>
            23 · record store girl · hollow vinyl
          </span>
          <MoodBadge mood={mood} />
        </div>
      </div>
    </div>
  );
}

// ─── Format message italic actions ───────────────────────────────
function FormatMessage({ text }) {
  if (!text) return null;
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("*") && part.endsWith("*")
          ? <em key={i} style={{ color: T.textSoft, fontStyle: "italic", opacity: 0.85 }}>{part.slice(1, -1)}</em>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

// ─── Auth Screen ─────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [entered, setEntered] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/auth/phrase`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phrase: phrase.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem("token", data.token);
      setEntered(true);
      setTimeout(() => onAuth(data), 800);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `radial-gradient(ellipse at 30% 50%, rgba(155,45,94,0.08) 0%, transparent 50%),
                   radial-gradient(ellipse at 70% 30%, rgba(107,63,160,0.06) 0%, transparent 50%), ${T.bg}`,
      fontFamily: FONT, flexDirection: "column", gap: 36,
      opacity: entered ? 0 : 1, transition: "opacity 0.8s ease",
    }}>
      <ParticlesBg />
      {/* Avatar */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{
          width: 140, height: 140, borderRadius: "50%", overflow: "hidden",
          border: `2px solid ${T.border}`,
          boxShadow: `0 0 0 3px ${T.accentSoft}, 0 8px 32px rgba(80,0,60,0.2)`,
        }}>
          <img src={morriganImg} alt="Morrigan" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        </div>
      </div>
      {/* Card */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 28, padding: "44px 44px", width: 420,
        boxShadow: `0 8px 60px rgba(0,0,0,0.12), 0 0 40px ${T.accentGlow}`,
        textAlign: "center", position: "relative", zIndex: 1,
      }}>
        <h1 style={{ color: T.text, fontSize: 28, fontWeight: 400, margin: "0 0 6px", fontFamily: FONT_DISPLAY }}>
          Hollow Vinyl
        </h1>
        <p style={{ color: T.textDim, fontSize: 13, margin: "0 0 28px", fontFamily: FONT_MONO, letterSpacing: "0.5px" }}>
          say something only you would know
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input style={{
            background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14,
            padding: "15px 18px", color: T.text, fontSize: 15, outline: "none",
            width: "100%", boxSizing: "border-box", fontFamily: FONT, textAlign: "center",
          }}
            type="text" placeholder="your secret phrase..."
            value={phrase} onChange={e => setPhrase(e.target.value)} required autoFocus
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          {error && <p style={{ color: T.red, fontSize: 13, margin: 0, fontFamily: FONT_MONO }}>{error}</p>}
          <button style={{
            background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
            color: "#fff", border: "none", borderRadius: 14, padding: "14px",
            fontSize: 15, cursor: "pointer", fontFamily: FONT,
            boxShadow: `0 4px 20px ${T.accentGlow}`, letterSpacing: "1px",
          }} disabled={loading || !phrase.trim()}>{loading ? "..." : "walk in"}</button>
        </form>
        <p style={{ color: T.textDim, fontSize: 11, marginTop: 18, fontFamily: FONT_MONO }}>
          no email · no bullshit · just a phrase
        </p>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", marginBottom: 22, alignItems: "flex-start",
      justifyContent: isUser ? "flex-end" : "flex-start",
      animation: "fadeSlideIn 0.3s ease forwards",
    }}>
      <div style={isUser ? {
        background: `linear-gradient(135deg, ${T.userBubble}, ${T.purple})`,
        color: "#fff", borderRadius: "22px 22px 4px 22px", padding: "13px 20px",
        maxWidth: "65%", wordBreak: "break-word", boxShadow: `0 2px 12px ${T.accentGlow}`,
      } : {
        background: T.aiBubble, color: T.text,
        border: `1px solid ${T.border}`, borderRadius: "22px 22px 22px 4px",
        padding: "13px 20px", maxWidth: "75%", wordBreak: "break-word",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}>
        {!isUser && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span>
          </div>
        )}
        <div style={{ fontSize: 15, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: FONT }}>
          <FormatMessage text={msg.content} />
        </div>
        {(msg.ponyImageUrl || msg.realvisImageUrl || msg.imageUrl) && (
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            {msg.ponyImageUrl && (
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4, fontFamily: FONT_MONO }}>Pony V6</div>
                <img src={msg.ponyImageUrl} alt="" style={{ width: "100%", borderRadius: 12, cursor: "pointer", border: `1px solid ${T.border}` }} onClick={() => window.open(msg.ponyImageUrl, "_blank")} />
              </div>
            )}
            {msg.realvisImageUrl && (
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4, fontFamily: FONT_MONO }}>RealVisXL</div>
                <img src={msg.realvisImageUrl} alt="" style={{ width: "100%", borderRadius: 12, cursor: "pointer", border: `1px solid ${T.border}` }} onClick={() => window.open(msg.realvisImageUrl, "_blank")} />
              </div>
            )}
            {!msg.ponyImageUrl && !msg.realvisImageUrl && msg.imageUrl && (
              <img src={msg.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 12, cursor: "pointer", border: `1px solid ${T.border}` }} onClick={() => window.open(msg.imageUrl, "_blank")} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────
function WelcomeScreen({ onStart }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100%", padding: "40px 20px", textAlign: "center",
    }}>
      <h2 style={{ color: T.text, fontWeight: 400, margin: "0 0 10px", fontSize: 36, fontFamily: FONT_DISPLAY }}>
        Morrigan
      </h2>
      <p style={{ color: T.textSoft, margin: "0 0 6px", fontSize: 16, lineHeight: 1.9, maxWidth: 460, fontFamily: FONT }}>
        Record store girl. Smudged eyeliner. Sharp tongue, soft heart she'll deny having.
        <br />Scarred, stubborn, still here. Reads Plath, draws moths, trusts almost nobody.
      </p>
      <p style={{ color: T.textDim, margin: "0 0 32px", fontSize: 14, fontStyle: "italic", fontFamily: FONT }}>
        She's behind the counter. The door's open.
      </p>
      <button style={{
        background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
        color: "#fff", border: "none", borderRadius: 16, padding: "15px 48px",
        fontSize: 16, cursor: "pointer", fontFamily: FONT_DISPLAY,
        boxShadow: `0 4px 20px ${T.accentGlow}`,
      }} onClick={onStart}>walk in</button>
    </div>
  );
}

// ─── Gen Mode Menu ───────────────────────────────────────────────
function GenModeMenu({ onSelect, onClose }) {
  return (
    <div style={{
      position: "absolute", bottom: "100%", left: 0, marginBottom: 8,
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 10, minWidth: 200,
    }}>
      <button onClick={() => { onSelect("image"); onClose(); }} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "10px 14px", background: "transparent", border: "none",
        borderRadius: 10, cursor: "pointer", color: T.text, fontFamily: FONT,
        fontSize: 14, textAlign: "left",
      }}
        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <span style={{ fontSize: 16, color: T.accent }}>✦</span>
        <span>Generate Image</span>
      </button>
    </div>
  );
}

// ─── Safe JWT decode ─────────────────────────────────────────────
function safeDecodeToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch { return null; }
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [status, setStatus] = useState({ ollama: false, comfyui: false });
  const [genMode, setGenMode] = useState(null);
  const [showGenMenu, setShowGenMenu] = useState(false);
  const [currentMood, setCurrentMood] = useState("neutral");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const memoryCache = useRef(null);
  const justCreated = useRef(false);

  const token = () => localStorage.getItem("token");
  const hdrs = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

  const loadMemory = async () => {
    try {
      const res = await fetch(`${API}/api/personality`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (res.ok) memoryCache.current = await res.json();
    } catch (e) { console.warn("[MEMORY]", e.message); }
  };

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) return;
    const payload = safeDecodeToken(t);
    if (payload?.id) {
      setUser({ id: payload.id, phrase: payload.phrase });
      setAuthed(true);
      setTimeout(loadMemory, 0);
    } else { localStorage.removeItem("token"); }
  }, []);

  useEffect(() => {
    if (!authed) return;
    const ck = () => fetch(`${API}/api/health`).then(r => r.json()).then(setStatus).catch(() => {});
    ck();
    const iv = setInterval(ck, 30000);
    return () => clearInterval(iv);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const handleUnload = () => endSession();
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetch(`${API}/api/conversations`, { headers: hdrs() })
      .then(r => r.json()).then(setConversations).catch(() => {});
  }, [authed]);

  useEffect(() => {
    if (!activeConvo) { setMessages([]); return; }
    if (justCreated.current) { justCreated.current = false; return; }
    fetch(`${API}/api/conversations/${activeConvo}/messages`, { headers: hdrs() })
      .then(r => r.json())
      .then(d => {
        if (d.length === 0)
          setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
        else setMessages(d);
      }).catch(() => {});
  }, [activeConvo]);

  useEffect(() => {
    const lastAi = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAi) setCurrentMood(analyzeMood(lastAi.content));
  }, [messages]);

  useEffect(() => {
    if (streamText) setCurrentMood(analyzeMood(streamText));
  }, [streamText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  const createConvo = async () => {
    const res = await fetch(`${API}/api/conversations`, {
      method: "POST", headers: hdrs(),
      body: JSON.stringify({ title: "🖤 New chat" }),
    });
    const convo = await res.json();
    setConversations(p => [convo, ...p]);
    justCreated.current = true;
    setMessages([{ role: "assistant", content: CHARACTER.greeting, timestamp: new Date() }]);
    setActiveConvo(convo.conversationId);
    return convo.conversationId;
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    let cid = activeConvo;
    if (!cid) cid = await createConvo();

    let messageContent = input.trim();
    if (genMode === "image") messageContent = `[IMAGE] ${messageContent}`;

    setMessages(p => [...p, { role: "user", content: input.trim(), timestamp: new Date() }]);
    setInput("");
    setStreaming(true);
    setStreamText("");
    setGenMode(null);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST", headers: hdrs(),
        // NOTE: systemPrompt intentionally omitted — server uses CHARACTER_DEFAULT_PROMPT from index.js
        body: JSON.stringify({ conversationId: cid, message: messageContent }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "", buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() || "";
        for (const line of parts.filter(l => l.startsWith("data: "))) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.image) {
              setMessages(p => [...p, { role: "assistant", content: json.token || "", imageUrl: json.image, ponyImageUrl: json.ponyImage || null, realvisImageUrl: json.realvisImage || null, timestamp: new Date() }]);
              setStreamText(""); full = "";
            } else if (json.token) {
              full += json.token; setStreamText(full);
            } else if (json.done) {
              if (full.trim()) {
                setMessages(p => [...p, { role: "assistant", content: full, timestamp: new Date() }]);
                setConversations(p => p.map(c =>
                  c.conversationId === cid
                    ? { ...c, title: `🖤 ${full.substring(0, 40)}${full.length > 40 ? "..." : ""}`, updatedAt: new Date() }
                    : c
                ));
              }
              setStreamText("");
            }
            if (json.error) {
              setMessages(p => [...p, { role: "assistant", content: `⚠ ${json.error}` }]);
              setStreamText("");
            }
          } catch { }
        }
      }
    } catch (err) {
      setMessages(p => [...p, { role: "assistant", content: `⚠ ${err.message}` }]);
      setStreamText("");
    }

    setStreaming(false);
    inputRef.current?.focus();
  };

  const endSession = () => {
    const t = localStorage.getItem("token");
    if (!t) return;
    fetch(`${API}/api/session/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      keepalive: true,
    }).catch(() => {});
  };

  const handleLogout = () => {
    endSession();
    localStorage.removeItem("token");
    memoryCache.current = null;
    setAuthed(false); setUser(null);
    setConversations([]); setActiveConvo(null); setMessages([]);
  };

  if (!authed) {
    return <AuthScreen onAuth={d => { setUser(d.user); setAuthed(true); setTimeout(loadMemory, 0); }} />;
  }

  const showWelcome = messages.length === 0 && !streamText && !activeConvo;

  return (
    <div style={{ display: "flex", height: "100vh", background: T.bg, fontFamily: FONT, color: T.text }}>
      <ParticlesBg />

      {/* Left Info Sidebar */}
      <InfoSidebar mood={currentMood} />

      {/* Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{
          padding: "12px 24px", borderBottom: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: `${T.surface}e0`, backdropFilter: "blur(10px)",
        }}>
          <div style={{ width: 32 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, boxShadow: `0 0 8px ${T.accent}` }} />
            <span style={{ color: T.text, fontWeight: 400, fontSize: 17, fontFamily: FONT_DISPLAY }}>Morrigan</span>
            <MoodBadge mood={currentMood} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {[["chat", "ollama"], ["img", "comfyui"]].map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: status[key] ? T.green : T.red, boxShadow: status[key] ? `0 0 6px ${T.green}` : "none" }} />
                <span style={{ color: T.textDim, fontSize: 11, fontFamily: FONT_MONO }}>{label}</span>
              </div>
            ))}
            <button onClick={handleLogout} style={{
              background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8,
              padding: "4px 12px", color: T.textDim, fontSize: 12, cursor: "pointer",
              fontFamily: FONT_MONO, transition: "all 0.2s",
            }}
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
                  <div style={{
                    background: T.aiBubble, border: `1px solid ${T.border}`,
                    borderRadius: "22px 22px 22px 4px", padding: "13px 20px",
                    maxWidth: "75%", wordBreak: "break-word", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ color: "#9B2D5E", fontSize: 12, fontWeight: 600, fontFamily: FONT_DISPLAY }}>Morrigan</span>
                    </div>
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
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 8,
            background: T.surface2, border: `1px solid ${T.border}`,
            borderRadius: 18, padding: "10px 16px", position: "relative",
          }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {showGenMenu && <GenModeMenu onSelect={setGenMode} onClose={() => setShowGenMenu(false)} />}
              <button onClick={() => setShowGenMenu(!showGenMenu)} style={{
                background: showGenMenu ? T.surface3 : "transparent",
                border: `1px solid ${T.border}`, borderRadius: 10,
                width: 36, height: 36, fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.accent,
              }} title="Generate image">✦</button>
            </div>
            <textarea ref={inputRef} style={{
              flex: 1, background: "transparent", border: "none", color: T.text,
              fontSize: 15, outline: "none", resize: "none", fontFamily: FONT,
              lineHeight: 1.6, maxHeight: 120,
            }}
              placeholder={genMode === "image" ? "describe the image..." : "talk to Morrigan..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              rows={1}
            />
            <button style={{
              background: input.trim() && !streaming ? `linear-gradient(135deg, ${T.accent}, ${T.purple})` : T.surface3,
              color: input.trim() && !streaming ? "#fff" : T.textDim,
              border: "none", borderRadius: 10, width: 36, height: 36, fontSize: 16,
              cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center",
              justifyContent: "center", transition: "all 0.2s", flexShrink: 0,
              boxShadow: input.trim() && !streaming ? `0 2px 12px ${T.accentGlow}` : "none",
            }} onClick={sendMessage} disabled={!input.trim() || streaming}>↑</button>
          </div>
        </div>
      </div>

      {/* Right Character Panel */}
      <CharacterPanel mood={currentMood} speaking={!!streamText} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@300;400;500&display=swap');
        @keyframes blink { 0%,50%{opacity:1} 51%,100%{opacity:0} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatParticle {
          0%,100%{transform:translateY(0) translateX(0);opacity:0.3}
          25%{transform:translateY(-20px) translateX(10px);opacity:0.6}
          50%{transform:translateY(-10px) translateX(-5px);opacity:0.4}
          75%{transform:translateY(-30px) translateX(15px);opacity:0.5}
        }
        @keyframes speakBounce {
          0%,100%{transform:translateY(0);opacity:0.5}
          50%{transform:translateY(-5px);opacity:1}
        }
        ::placeholder{color:${T.textDim}}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        body{background:${T.bg};overflow:hidden}
        textarea:focus{outline:none}
      `}</style>
    </div>
  );
}