const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const M = require("../shared/morrigan.js");

// ── Validate character data loaded correctly ──
const REQUIRED_EXPORTS = [
  "name", "realName", "color", "workplace", "greeting",
  "CHARACTER_DEFAULT_PROMPT", "TRUST_LEVELS", "TIER_FRAMES",
  "SPT_DEPTH_DESCRIPTIONS", "SPT_OPENNESS",
  "RECEPTION_DIRECTIVES", "CRISIS_PATTERNS", "SAFE_HAVEN_DIRECTIVE",
  "CONTINUATION_SIGNAL", "SELF_ATOMS",
  "IDENTITY_ANCHOR_THOUGHT", "IDENTITY_ANCHOR_MOOD",
  "IDENTITY_ANCHOR_SOMATIC", "IDENTITY_ANCHOR_CRITIQUE",
  "IDENTITY_ANCHOR_ARRIVAL", "IDENTITY_ANCHOR_PROACTIVE",
  "PROACTIVE_VOICE_NOTE",
  "DEVELOPMENTAL_TIMELINE", "WOUND_ARCHITECTURE", "TRAUMA_RESPONSES",
  "EPISODIC_MEMORIES", "SENSORY_TRIGGERS", "ICEBERG",
];
const missing = REQUIRED_EXPORTS.filter(k => M[k] === undefined || M[k] === null);
if (missing.length > 0) {
  console.error(`[CHARACTER] MISSING from shared/morrigan.js: ${missing.join(", ")}`);
  process.exit(1);
} else {
  console.log(`[CHARACTER] ${M.name} loaded — ${Object.keys(M).length} exports, ${M.SELF_ATOMS.length} self-atoms`);
}

process.on("unhandledRejection", (reason) => {
  console.error("[CRASH] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[CRASH] Uncaught exception:", err.message, err.stack);
});

// ── Fail-fast on missing critical env vars ─────────────────────────
const _missingVars = [];
if (!process.env.MONGO_URI)          _missingVars.push("MONGO_URI");
if (!process.env.JWT_SECRET)         _missingVars.push("JWT_SECRET");
if (!process.env.VENICE_API_KEY)     _missingVars.push("VENICE_API_KEY");
if (_missingVars.length) {
  console.error(`[FATAL] Missing required environment variables: ${_missingVars.join(", ")}`);
  console.error("[FATAL] Create a .env file with these variables before starting the server.");
  process.exit(1);
}

const PORT      = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

// Trust Railway's reverse proxy so req.ip returns the real client IP
// from x-forwarded-for[0] rather than the proxy's internal address.
// '1' = trust one hop of proxy (Railway). Do NOT use 'true' — that
// trusts all proxies and allows IP spoofing via forged headers.
app.set("trust proxy", 1);

// ── CORS — open wildcard; JWT Bearer tokens secure all protected routes ──
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.json({ limit: "1mb" }));

const CHAT_MODEL = process.env.CHAT_MODEL || "venice-uncensored";
// All fetch calls append /v1/... — so this base must NOT include /v1
const COLAB_URL = process.env.COLAB_URL || "https://api.venice.ai/api";
const VENICE_API_KEY = process.env.VENICE_API_KEY || "";
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

mongoose.connect(MONGO_URI).catch(err => {
  console.error("[FATAL] MongoDB connection failed:", err.message);
  process.exit(1);
});

// ── Rate limiting ──────────────────────────────────────────────────
// Generic sliding-window rate limiter keyed by any string (IP or userId)
function makeRateLimiter(windowMs, maxRequests) {
  const map = new Map();
  // Auto-clean stale entries every 5 min
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of map.entries()) {
      if (now - e.windowStart > windowMs * 2) map.delete(k);
    }
  }, 5 * 60_000);
  return (key) => {
    const now = Date.now();
    const entry = map.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
      map.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= maxRequests) return false;
    entry.count++;
    return true;
  };
}

// /api/chat: max 3 requests per 10 seconds per user (burst guard)
const checkChatRate = makeRateLimiter(10_000, 3);
// /api/auth/phrase: max 5 attempts per 60 seconds per IP (brute-force guard)
const checkAuthRate = makeRateLimiter(60_000, 5);

// ── Daily IP usage limit ────────────────────────────────────────────
// Counts chat messages per IP per UTC day. Configurable via DAILY_MSG_LIMIT.
// With trust proxy: 1 above, req.ip is the real client IP on Railway.
const DAILY_MSG_LIMIT = parseInt(process.env.DAILY_MSG_LIMIT) || 100;
const dailyIpUsage = new Map(); // ip → { count, resetAt }

function getNextMidnightUTC() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

function getIpUsage(ip) {
  const now = Date.now();
  const entry = dailyIpUsage.get(ip);
  if (!entry || now >= entry.resetAt) {
    const fresh = { count: 0, resetAt: getNextMidnightUTC() };
    dailyIpUsage.set(ip, fresh);
    return fresh;
  }
  return entry;
}

// Periodic cleanup — remove expired entries once per hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of dailyIpUsage) {
    if (now >= entry.resetAt) dailyIpUsage.delete(ip);
  }
}, 60 * 60_000);

const MAX_MESSAGE_LENGTH = 4000; // characters

// ── Fetch with timeout — used for all outbound LLM/embed calls ─────
// Non-streaming calls: 60s. Streaming call gets 120s for first byte.
const LLM_TIMEOUT_MS = 60_000;
function fetchWithTimeout(url, options, timeoutMs = LLM_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// ═══════════════════════════════════════════════════════════════════
// EMBEDDING + SIMILARITY UTILITIES
// ═══════════════════════════════════════════════════════════════════

async function embedText(text, _retries = 1) {
  try {
    const res = await fetchWithTimeout(`${COLAB_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (e) {
    if (_retries > 0) {
      console.warn(`[EMBED] Retry after: ${e.message}`);
      return embedText(text, _retries - 1);
    }
    console.error("[EMBED] Failed after retries:", e.message);
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Attribution guard utilities ──────────────────────────────────
// Prevents LLMs from confusing Morrigan's words with user's words.
// Applied to every prompt that receives exchange transcripts.

/** Format a single exchange, clearly labeling unprompted Morrigan turns */
function formatExchange(ex, labels = { user: "User", assistant: M.name }) {
  if (!ex.user)
    return `[${labels.assistant} spoke first — unprompted]: ${(ex.assistant || "").substring(0, 250)}`;
  return `${labels.user}: ${ex.user.substring(0, 250)}\n${labels.assistant}: ${(ex.assistant || "").substring(0, 250)}`;
}

/** Format a list of exchanges (e.g. sessionExchanges) with proper labels */
function formatExchangeList(exchanges, labels = { user: "User", assistant: M.name }) {
  return exchanges.map(e => formatExchange(e, labels)).join("\n\n");
}

/** Standard attribution warning for prompts that analyze USER behavior from a transcript */
const ATTRIBUTION_GUARD = `ATTRIBUTION RULE: The exchange has two speakers.
"User:" lines = what the USER said. "${M.name}:" lines = what the AI (${M.name}) said.
Do NOT attribute ${M.name}'s own words, descriptions, scene-setting, actions, or self-disclosures to the user.
Only analyze what appears after "User:" as the user's content.`;

/** Lighter attribution reminder for Morrigan-introspective prompts */
const ATTRIBUTION_REMINDER = `(Two speakers: "User:" = what THEY said. "${M.name}:" = what YOU said. Base your analysis on what HE said/did, not on your own responses.)`;

/**
 * Post-hoc disclosure detection — scans Morrigan's response for self-atom content.
 * Catches disclosures that bypass the inner thought pipeline (hint elaboration,
 * composition embellishment, spontaneous LLM generation from character prompt).
 *
 * Strategy: Extract distinctive proper nouns, names, and specific phrases from each
 * atom's content and check if they appear in the response. Generic words are ignored
 * to prevent false positives.
 *
 * @param {string} response - Morrigan's final (composed) response text
 * @param {Array} selfAtomCache - All self-atoms from DB
 * @param {number} sptDepth - Current SPT depth (only check eligible atoms)
 * @param {string[]} alreadyShared - Current sharedSelfAtomIds
 * @returns {string[]} - Array of newly detected atom IDs to mark as shared
 */
async function detectDisclosedAtoms(response, selfAtomCache, sptDepth, alreadyShared) {
  if (!response || !selfAtomCache?.length) return [];
  const responseLower = response.toLowerCase();
  const newlyDetected = [];

  // Embed the response once for semantic comparison against all atoms
  let responseEmbedding = null;
  try {
    responseEmbedding = await embedText(response.slice(0, 2000));
  } catch (e) {
    console.error("[DISCLOSURE-DETECT] Embedding failed, falling back to markers only:", e.message);
  }

  for (const atom of selfAtomCache) {
    if (atom.depth > sptDepth) continue;
    if (atom.deprecated) continue;
    if (alreadyShared.includes(atom.id)) continue;

    // ── Layer 1: Semantic similarity (primary detection) ──
    // If both embeddings exist, cosine similarity above threshold = match
    let semanticMatch = false;
    if (responseEmbedding && atom.embedding?.length) {
      const sim = cosineSimilarity(responseEmbedding, atom.embedding);
      // 0.55 = moderate similarity — atom's theme is clearly present in response
      // Higher threshold would miss paraphrased disclosures
      if (sim >= 0.55) {
        semanticMatch = true;
        console.log(`[DISCLOSURE-DETECT] Semantic match: atom ${atom.id} (sim=${sim.toFixed(3)})`);
      }
    }

    // ── Layer 2: Marker detection (fast-path, high confidence) ──
    // Distinctive proper nouns, names, quoted phrases, specific numbers
    const content = atom.content || "";
    let markerMatch = false;

    // Named entities: "named X", "called X", "name is X"
    const namedEntities = content.match(/(?:named?|called?|name(?:'s| is))\s+([A-Z][a-z]+)/g) || [];
    const markers = [];
    namedEntities.forEach(m => {
      const name = m.split(/\s+/).pop();
      if (name && name.length > 2) markers.push(name.toLowerCase());
    });

    // Proper nouns mid-sentence
    const properNouns = content.match(/(?<=[.!?]\s+\w+\s+|,\s+|—\s*|\.\.\.\s*)[A-Z][a-z]{2,}/g) || [];
    const skipWords = ["The", "She", "Her", "His", "But", "And", "Not", "That", "This", "There", "What", "When", "Some", "Most"];
    properNouns.forEach(n => { if (!skipWords.includes(n)) markers.push(n.toLowerCase()); });

    // Multi-word capitalized sequences (band/place names)
    const multiCap = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
    multiCap.forEach(m => { if (!["Some Days", "Other People", "Most People"].includes(m)) markers.push(m.toLowerCase()); });

    // Quoted phrases
    const quoted = content.match(/"([^"]{3,})"/g) || [];
    quoted.forEach(q => markers.push(q.replace(/"/g, "").toLowerCase()));

    // Specific numbers/ages
    const specificNumbers = content.match(/\b(?:at |age |since |for )\d+\b/gi) || [];
    specificNumbers.forEach(n => markers.push(n.toLowerCase()));

    markerMatch = markers.some(m => m.length > 2 && responseLower.includes(m));

    // ── Decision: either layer triggers detection ──
    if (markerMatch || semanticMatch) {
      newlyDetected.push(atom.id);
    }
  }
  return newlyDetected;
}

function scoreMemory(item, queryEmbedding, goalState) {
  const hasEmbedding = item.embedding?.length > 0;
  const similarity = hasEmbedding ? cosineSimilarity(item.embedding, queryEmbedding) : 0;
  const importance = (item.importance || 3) / 5;
  const ageMs = Date.now() - (item.learnedAt || item.createdAt || Date.now());
  const stability = item.stability || 1.0;
  const recency = Math.exp(-ageMs / (stability * 90 * 86400000));
  const valenceBoost = goalAlignsWithEmotion(goalState, item.valence?.emotion) ? 1.0 : 0;
  // Atoms missing embeddings (API failure) still surface via importance+recency
  // instead of being permanently buried at score 0
  if (!hasEmbedding) {
    return importance * 0.50 + recency * 0.35 + valenceBoost * 0.15;
  }
  return similarity * 0.55 + importance * 0.25 + recency * 0.10 + valenceBoost * 0.10;
}

function goalAlignsWithEmotion(goalState, emotion) {
  if (!goalState || !emotion) return false;
  const alignMap = {
    comfort: ["grief", "fear", "shame", "sadness"],
    connection: ["tenderness", "warmth", "joy"],
    venting: ["anger", "frustration", "ambivalence"],
    validation: ["pride", "relief", "gratitude"],
    distraction: [],
    neutral: [],
  };
  return (alignMap[goalState] || []).includes(emotion);
}

function retrieveTopK(items, queryEmbedding, k, goalState = "neutral") {
  let result;
  if (!queryEmbedding) {
    // Fallback: sort by importance so most significant memories surface first
    result = [...items]
      .sort((a, b) => (b.importance || 1) - (a.importance || 1))
      .slice(0, k);
  } else {
    result = items
      .map(item => ({ item, score: scoreMemory(item, queryEmbedding, goalState) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(x => x.item);
  }

  // Ebbinghaus reinforcement [P31 LUFY]: retrieved memories get stability boost
  for (const r of result) {
    if (r.retrievalCount !== undefined) {
      r.retrievalCount = (r.retrievalCount || 0) + 1;
      r.lastRetrievedAt = new Date();
      r.stability = Math.min(10, (r.stability || 1.0) * 1.15);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// CROSS-ENCODER RE-RANKING — Two-Stage Retrieval [P44/P47]
// ═══════════════════════════════════════════════════════════════════
// Stage 1: Fast cosine similarity (scoreMemory) → top 2×k candidates
// Stage 2: LLM cross-attention re-ranking → top k final results
// Research: Nogueira et al. (2020) MonoT5, Gao et al. (2021) COIL —
// cross-encoder re-rankers dramatically improve recall@k over
// bi-encoder-only retrieval. We use an LLM pointwise relevance
// scorer as cross-encoder proxy (same principle, no ONNX dependency).
// ═══════════════════════════════════════════════════════════════════

const RERANK_PROMPT = (query, candidates) => {
  const numbered = candidates.map((c, i) => `[${i}] ${c}`).join("\n");
  return `You are a relevance scoring engine. Given a conversational query and a list of memory fragments, rate each fragment's relevance to the query on a scale of 0-10.

Query: "${query}"

Memory fragments:
${numbered}

Reply with ONLY a JSON array of scores in the same order, e.g. [8, 3, 6, 1, 9]. No other text.`;
};

async function reRankWithLLM(query, candidates, timeoutMs = 5000) {
  try {
    const res = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL, temperature: 0.0, max_tokens: 80,
        messages: [{ role: "user", content: RERANK_PROMPT(query, candidates) }],
      }),
    }, timeoutMs);
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim();
    // Parse JSON array from response — tolerant of markdown wrapping
    const match = raw.match(/\[[\d\s,.]+\]/);
    if (!match) return null;
    const scores = JSON.parse(match[0]);
    if (!Array.isArray(scores) || scores.length !== candidates.length) return null;
    return scores.map(s => Math.max(0, Math.min(10, Number(s) || 0)));
  } catch {
    return null; // Graceful fallback: skip re-ranking
  }
}

/**
 * Two-stage retrieval: cosine similarity → LLM re-ranking.
 * Falls back to single-stage if LLM re-rank fails or times out.
 * @param {Array} items - Memory atoms with embeddings
 * @param {Array} queryEmbedding - Query vector
 * @param {number} k - Final number of results
 * @param {string} goalState - Emotional goal state
 * @param {string} queryText - Original query text for re-ranker
 */
async function retrieveTopKReranked(items, queryEmbedding, k, goalState = "neutral", queryText = "") {
  // Stage 1: retrieve 2×k candidates via fast cosine scoring
  const overFetchK = Math.min(items.length, k * 2);
  const stage1 = retrieveTopK(items, queryEmbedding, overFetchK, goalState);

  // Skip re-ranking if not enough candidates or no query text
  if (stage1.length <= k || !queryText) return stage1.slice(0, k);

  // Stage 2: LLM cross-encoder re-ranking
  const candidateTexts = stage1.map(item => (item.fact || item.summary || item.event || "").substring(0, 200));
  const scores = await reRankWithLLM(queryText, candidateTexts);

  if (!scores) {
    // Fallback: return stage 1 results (already Ebbinghaus-reinforced)
    return stage1.slice(0, k);
  }

  // Combine: 60% re-rank score (normalized) + 40% original stage-1 rank position
  const combined = stage1.map((item, idx) => ({
    item,
    combinedScore: (scores[idx] / 10) * 0.6 + ((overFetchK - idx) / overFetchK) * 0.4,
  }));
  combined.sort((a, b) => b.combinedScore - a.combinedScore);
  return combined.slice(0, k).map(x => x.item);
}

// Ebbinghaus memory pruning [P31 LUFY]: remove decayed, low-importance atoms
async function pruneDecayedMemories(userId) {
  try {
    const mem = await PersonalityMemory.findOne({ userId });
    if (!mem || !mem.memories || mem.memories.length < 50) return; // Only prune when memory is substantial
    const now = Date.now();
    const RETENTION_THRESHOLD = 0.05;
    const before = mem.memories.length;
    mem.memories = mem.memories.filter(atom => {
      if ((atom.importance || 3) >= 4) return true; // Never prune high-importance
      if (atom.retrievalCount > 0) return true; // Never prune reinforced memories
      const ageMs = now - (atom.learnedAt || atom.createdAt || now);
      const stability = atom.stability || 1.0;
      const retention = Math.exp(-ageMs / (stability * 90 * 86400000));
      return retention >= RETENTION_THRESHOLD;
    });
    if (mem.memories.length < before) {
      await mem.save();
      console.log(`[FORGETTING] Pruned ${before - mem.memories.length} decayed atoms for user ${userId} (${mem.memories.length} remaining)`);
    }
  } catch (e) { console.error("[FORGETTING]", e.message); }
}

// Infer emotional goal-state from message — activates valence weighting in scoreMemory
// Conway's Working Self [P13]: retrieval is goal-directed, not just similarity-directed.
// Primary: lightweight LLM call (5s timeout). Fallback: regex heuristic.
function inferGoalStateRegex(message) {
  const t = message.toLowerCase();
  // Require first-person context for ambiguous words (lost, broken, scared can be casual)
  if (/\b(i'?m (sad|crying|depressed|hurting|broken|scared|anxious|alone|overwhelmed)|grief|i feel (lost|broken|alone|empty))\b/.test(t)) return "comfort";
  if (/\b(angry|pissed|furious|venting|vent|rage|i'?m frustrated|bullshit|unfair)\b/.test(t)) return "venting";
  if (/\b(miss you|thinking of you|care about|feel close|like talking|glad you)\b/.test(t)) return "connection";
  if (/\b(distract|take my mind|something else|forget about|change subject)\b/.test(t)) return "distraction";
  return "neutral";
}

async function inferGoalStateLLM(message) {
  try {
    const res = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL, temperature: 0.0, max_tokens: 15,
        messages: [{ role: "user", content: `What emotional need does this message express? Reply with EXACTLY one word: comfort, venting, connection, distraction, validation, or neutral.\n\nMessage: "${message.substring(0, 300)}"` }],
      }),
    }, 5_000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();
    const valid = ["comfort", "venting", "connection", "distraction", "validation", "neutral"];
    const match = valid.find(v => raw.includes(v));
    return match || inferGoalStateRegex(message);
  } catch {
    return inferGoalStateRegex(message);
  }
}

// Synchronous version for hot path — regex only
function inferGoalState(message) {
  return inferGoalStateRegex(message);
}

// ═══════════════════════════════════════════════════════════════════
// LINGUISTIC DEPTH SIGNALS — LIWC-22 Approximation [P69]
// ═══════════════════════════════════════════════════════════════════
// Pennebaker's research: function words (pronouns, prepositions, articles)
// are MORE diagnostic of psychological state than content words.
// A shift from "people sometimes feel" → "I feel" is a depth transition
// even if the topic hasn't changed.
// Zero LLM cost — pure word counting against curated dictionaries.

const FIRST_PERSON_SINGULAR = new Set([
  "i", "me", "my", "myself", "mine", "i'm", "i've", "i'd", "i'll", "im", "ive",
]);

const FIRST_PERSON_PLURAL = new Set([
  "we", "us", "our", "ours", "ourselves", "we're", "we've", "we'd", "we'll",
]);

const SECOND_PERSON = new Set([
  "you", "your", "yours", "yourself", "you're", "you've", "you'd", "you'll",
]);

const THIRD_PERSON = new Set([
  "he", "she", "they", "them", "his", "her", "their", "theirs",
  "he's", "she's", "they're", "they've", "they'd",
]);

const EMOTIONAL_WORDS_NEGATIVE = new Set([
  "hurt", "afraid", "angry", "broken", "ashamed", "lonely", "worthless", "numb",
  "trapped", "desperate", "scared", "terrified", "anxious", "depressed", "devastated",
  "grief", "grieving", "hopeless", "helpless", "miserable", "shattered", "crushed",
  "abandoned", "rejected", "betrayed", "violated", "humiliated", "disgusted", "furious",
  "enraged", "resentful", "bitter", "jealous", "envious", "guilty", "regret", "remorse",
  "shame", "embarrassed", "insecure", "inadequate", "inferior", "useless", "pathetic",
  "empty", "hollow", "dead", "dying", "suffering", "agonizing", "tormented", "haunted",
  "panicking", "drowning", "suffocating", "overwhelmed", "exhausted", "drained",
  "defeated", "lost", "confused", "frustrated", "irritated", "annoyed", "upset",
  "worried", "nervous", "stressed", "tense", "restless", "uneasy", "uncomfortable",
  "sad", "crying", "tears", "sobbing", "weeping", "mourning", "heartbroken",
  "disappointed", "disillusioned", "pessimistic", "cynical", "suspicious", "paranoid",
  "aching", "raw", "vulnerable", "exposed", "fragile", "damaged", "scarred", "wounded",
]);

const EMOTIONAL_WORDS_POSITIVE = new Set([
  "love", "happy", "grateful", "warm", "hopeful", "proud", "safe", "gentle",
  "joyful", "excited", "thrilled", "elated", "ecstatic", "blissful", "content",
  "peaceful", "calm", "serene", "relieved", "comforted", "supported", "valued",
  "appreciated", "cherished", "adored", "respected", "admired", "inspired",
  "motivated", "energized", "passionate", "alive", "free", "liberated", "empowered",
  "confident", "brave", "courageous", "strong", "resilient", "tender", "affectionate",
  "caring", "compassionate", "connected", "belonging", "accepted", "understood",
  "seen", "heard", "known", "trusted", "intimate", "close", "bonded", "attached",
  "attracted", "desire", "wanting", "longing", "missing", "nostalgic", "sentimental",
  "amused", "playful", "lighthearted", "giddy", "silly", "flirty", "curious",
]);

const COGNITIVE_WORDS = new Set([
  "think", "thinking", "thought", "realize", "realized", "understand", "understood",
  "because", "maybe", "probably", "wonder", "wondering", "consider", "suppose",
  "imagine", "believe", "decide", "decided", "figure", "figured", "conclude",
  "question", "questioning", "analyze", "process", "reflect", "reflecting",
  "recognize", "acknowledge", "accept", "deny", "doubt", "suspect", "assume",
  "guess", "feel", "sense", "notice", "noticed", "aware", "conscious",
  "remember", "remembering", "forgot", "forget", "remind", "reminds",
  "meaning", "means", "meant", "reason", "cause", "effect", "consequence",
  "perspective", "opinion", "judgment", "interpretation",
]);

const HEDGING_MARKERS = [
  "honestly", "i guess", "i mean", "i don't know", "sort of", "kind of",
  "i think", "i suppose", "whatever", "nevermind", "forget it", "it's nothing",
  "i've never told anyone", "never told anyone", "hard to say", "hard to explain",
  "i can't explain", "i don't know why", "for some reason", "i shouldn't",
  "this is stupid", "this sounds weird", "you'll think", "don't judge",
  "i've been meaning to", "i've been wanting to", "can i tell you something",
  "promise you won't", "between us", "just between", "don't tell",
];

const PAST_TENSE_PATTERN = /\b(was|were|had|did|went|said|told|felt|thought|used to|grew up|remember when|back when|when i was|years ago|long time ago|as a kid|childhood|growing up)\b/gi;

function analyzeLinguisticDepth(message) {
  const words = message.toLowerCase().trim().split(/\s+/);
  const wordCount = Math.max(words.length, 1);
  const lower = message.toLowerCase();

  // First-person singular count
  let firstPersonCount = 0;
  for (const w of words) {
    if (FIRST_PERSON_SINGULAR.has(w)) firstPersonCount++;
  }

  let firstPersonPluralCount = 0;
  let secondPersonCount = 0;
  let thirdPersonCount = 0;
  for (const w of words) {
    if (FIRST_PERSON_PLURAL.has(w)) firstPersonPluralCount++;
    if (SECOND_PERSON.has(w)) secondPersonCount++;
    if (THIRD_PERSON.has(w)) thirdPersonCount++;
  }

  // Emotional word count (positive + negative)
  let emotionalWordCountPos = 0;
  let emotionalWordCountNeg = 0;
  for (const w of words) {
    if (EMOTIONAL_WORDS_NEGATIVE.has(w)) emotionalWordCountNeg++;
    if (EMOTIONAL_WORDS_POSITIVE.has(w)) emotionalWordCountPos++;
  }
  const emotionalWordCount = emotionalWordCountPos + emotionalWordCountNeg;

  // Cognitive word count
  let cognitiveWordCount = 0;
  for (const w of words) {
    if (COGNITIVE_WORDS.has(w)) cognitiveWordCount++;
  }

  // Hedging marker count (phrase-level)
  let hedgingCount = 0;
  for (const phrase of HEDGING_MARKERS) {
    if (lower.includes(phrase)) hedgingCount++;
  }

  // Past-tense / narrative marker count
  const pastTenseMatches = lower.match(PAST_TENSE_PATTERN) || [];
  const pastTenseCount = pastTenseMatches.length;

  // Compute ratios (0-1)
  const selfFocus = Math.min(1, firstPersonCount / wordCount);
  const emotionalTone = Math.min(1, emotionalWordCount / wordCount);
  const emotionalValenceRatio = emotionalWordCount > 0
    ? (emotionalWordCountPos - emotionalWordCountNeg) / emotionalWordCount
    : 0; // -1 = all negative, +1 = all positive
  const cognitiveProcessing = Math.min(1, cognitiveWordCount / wordCount);
  const hedgingRatio = Math.min(1, hedgingCount / Math.max(wordCount / 10, 1));
  const pastTenseRatio = Math.min(1, pastTenseCount / wordCount);

  // Composite scores (Pennebaker-inspired weightings)
  // Authenticity: self-revealing, vulnerable language vs. guarded
  const authenticity = Math.min(1,
    selfFocus * 0.4 +
    hedgingRatio * 0.3 +
    pastTenseRatio * 0.3
  );

  // Narrative depth: past-tense + hedging + substantive length
  const narrativeDepth = Math.min(1,
    pastTenseRatio * 0.5 +
    hedgingRatio * 0.3 +
    (wordCount > 30 ? 0.2 : wordCount / 150)
  );

  // Relational integration [P69]: "we/us" indicates social integration, relationship investment
  const relationalIntegration = firstPersonCount > 0
    ? Math.min(1, firstPersonPluralCount / firstPersonCount)
    : 0;

  // Second-person engagement: "you/your" indicates engagement with Morrigan as a person
  const secondPersonEngagement = Math.min(1, secondPersonCount / wordCount);

  return {
    authenticity,
    emotionalTone,
    selfFocus,
    cognitiveProcessing,
    narrativeDepth,
    relationalIntegration,
    secondPersonEngagement,
    rawSignals: {
      firstPersonCount,
      firstPersonPluralCount,
      secondPersonCount,
      thirdPersonCount,
      emotionalWordCount,
      emotionalWordCountPos,
      emotionalWordCountNeg,
      emotionalValenceRatio,
      cognitiveWordCount,
      hedgingCount,
      pastTenseCount,
      wordCount,
    },
    relationalIntegration,
    secondPersonEngagement,
  };
}

// ═══════════════════════════════════════════════════════════════════
// DISCLOSURE DEPTH CLASSIFIER — Reception Depth Gating [P56, P68]
// ═══════════════════════════════════════════════════════════════════
// P68 finding: ChatGPT does NOT calibrate response quality to disclosure
// depth — gives equally elaborate responses to "I like pizza" and
// "My father died last week". This classifier fixes that.
// Aron [P56]: Reception quality matters more than disclosure itself.

function classifyDisclosureDepth(message, linguisticSignals) {
  const lower = message.toLowerCase();
  const wc = linguisticSignals.rawSignals.wordCount;
  const signals = [];

  // ── Level 3 (vulnerable) checks ──
  let vulnScore = 0;
  if (linguisticSignals.selfFocus >= 0.20) { vulnScore++; signals.push("high-self-focus"); }
  if (linguisticSignals.emotionalTone >= 0.15) { vulnScore++; signals.push("high-emotional-tone"); }
  if (linguisticSignals.authenticity >= 0.5) { vulnScore++; signals.push("high-authenticity"); }
  // Removed "honestly" (too common in casual speech)
  if (/never told anyone|i don't know why i'm telling you|hard to say this|ashamed|scared to|terrified|can't stop thinking|can't explain/i.test(lower)) {
    vulnScore++; signals.push("vulnerability-markers");
  }
  if (linguisticSignals.rawSignals.pastTenseCount > 0 && wc >= 40) {
    vulnScore++; signals.push("narrative-disclosure");
  }
  if (linguisticSignals.cognitiveProcessing >= 0.10) { vulnScore++; signals.push("sense-making"); }

  if (vulnScore >= 3) {
    return { level: 3, label: "vulnerable", signals };
  }

  // ── Level 2 (personal) checks ──
  // Raised thresholds: require 3 of 4 signals instead of 2, higher bars
  let personalScore = 0;
  if (linguisticSignals.selfFocus >= 0.12) { personalScore++; signals.push("self-focused"); }
  if (linguisticSignals.emotionalTone >= 0.08) { personalScore++; signals.push("emotional-content"); }
  if (wc >= 25) { personalScore++; signals.push("substantive-length"); }
  if (/\b(i feel like|for me|in my experience|personally)\b/i.test(lower)) {
    personalScore++; signals.push("personal-opinion");
  }

  if (personalScore >= 3) {
    return { level: 2, label: "personal", signals };
  }

  // ── Level 1 (surface) — default ──
  return { level: 1, label: "surface", signals };
}

// Reception directives injected into system prompt based on disclosure depth.
// These tell Morrigan HOW to receive what the user shared — calibrated
// to match the depth of what was disclosed.
const RECEPTION_DIRECTIVES = M.RECEPTION_DIRECTIVES;

// ═══════════════════════════════════════════════════════════════════
// CRISIS DETECTION — Safe Haven Mode [P62, P63, P39]
// ═══════════════════════════════════════════════════════════════════
// P62/P63 (Attachment Theory): AI can serve "safe haven" function.
// P39 (Replika Mental Health Harms): High-disclosure users are at-risk.
// Woebot architecture: evolved from regex to supervised classifiers.
// We use 2-layer detection: keyword regex + heuristic scoring.

const CRISIS_PATTERNS = M.CRISIS_PATTERNS;

const SAFE_HAVEN_DIRECTIVE = M.SAFE_HAVEN_DIRECTIVE;

function detectCrisis(message) {
  const lower = message.toLowerCase();
  const signals = [];

  // Layer 1: Keyword regex (instant, zero cost)
  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(lower)) {
      const match = lower.match(pattern);
      signals.push(`keyword:${match?.[0] || "match"}`);
      return { level: "crisis", signals, safeHavenDirective: SAFE_HAVEN_DIRECTIVE };
    }
  }

  // Layer 2: Heuristic scoring
  let score = 0;

  // Hopelessness markers — require first-person or existential context
  // "empty"/"numb" alone are too common in casual speech ("glass is empty", "hands are numb")
  if (/\b(hopeless|nothing matters|what'?s the point|why bother|giv(e|ing) up)\b/i.test(lower)) {
    score += 2; signals.push("hopelessness");
  }
  if (/\b(i feel (empty|numb|pointless|meaningless)|i'?m (empty|numb)|everything feels (pointless|meaningless|empty))\b/i.test(lower)) {
    score += 2; signals.push("hopelessness+self");
  }

  // Despair + first-person — only flagged patterns that genuinely signal despair,
  // not casual usage like "I can't find my keys" or "I'm done with dinner"
  if (/\b(i'?m broken|i'?m empty inside|i can'?t (go on|do this|take it|anymore|breathe))\b/i.test(lower)) {
    score += 2; signals.push("despair+self");
  }
  // Weaker signals — only score +1, need co-occurrence to reach concern
  if (/\b(i'?m (so tired|exhausted|done|numb))\b/i.test(lower)) {
    score += 1; signals.push("fatigue+self");
  }

  // Isolation markers
  if (/\b(no one|nobody|all alone|no friends|no one cares|no one understands|no one listens|completely alone)\b/i.test(lower)) {
    score += 1.5; signals.push("isolation");
  }

  // Finality language
  if (/\b(goodbye|farewell|final|last time|one last|before i go|won'?t be here|won'?t be around)\b/i.test(lower)) {
    score += 2.5; signals.push("finality");
  }

  // Compound: long message + multiple signals = higher risk
  const wc = lower.split(/\s+/).length;
  if (wc > 20 && score >= 2) {
    score += 1; signals.push("density");
  }

  if (score >= 4) {
    return { level: "crisis", signals, safeHavenDirective: SAFE_HAVEN_DIRECTIVE };
  }
  if (score >= 2) {
    return { level: "concern", signals, safeHavenDirective: null };
  }

  return { level: "none", signals: [], safeHavenDirective: null };
}

// ── Sensory Trigger Detection (zero LLM cost) ──────────────────
// Scans user message for keywords from SENSORY_TRIGGERS. Returns
// matched triggers with linked episodic memories for prompt injection.

function detectSensoryTriggers(userMessage) {
  const msg = userMessage.toLowerCase();
  const triggered = [];
  for (const trigger of M.SENSORY_TRIGGERS) {
    if (trigger.keywords.some(kw => msg.includes(kw.toLowerCase()))) {
      triggered.push(trigger);
    }
  }
  return triggered;
}

function findTriggeredEpisodicMemories(triggers, trustLevel) {
  if (!triggers.length) return [];
  const memories = [];
  const maxDepth = trustLevel >= 4 ? 4 : trustLevel >= 2 ? 3 : 2;
  for (const trigger of triggers) {
    // Intensity gating: mild triggers need trust >= 2
    if (trigger.intensity === "mild" && trustLevel < 2) continue;
    const memory = M.EPISODIC_MEMORIES.find(em => em.id === trigger.episodicMemoryId);
    if (memory && memory.depth <= maxDepth) {
      memories.push({ ...memory, trigger });
    }
  }
  return memories.slice(0, 2); // Max 2 triggered memories per message
}


function retrieveSelfAtoms(selfAtoms, queryEmbedding, k, sptDepth, sharedSelfAtomIds) {
  const eligible = selfAtoms.filter(a => a.depth <= sptDepth && !a.deprecated);
  if (!queryEmbedding) return eligible.slice(0, k);
  return eligible
    .map(atom => {
      const alreadyShared = sharedSelfAtomIds.includes(atom.id);
      const base = scoreMemory(atom, queryEmbedding, "neutral");
      const penalty = alreadyShared ? -0.15 : 0;
      return { atom, score: base + penalty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(x => x.atom);
}

/**
 * Normalize legacy contradicts entries (plain ObjectIds) into the new
 * structured format { atomId, type, detectedAt }. Mutates in place.
 */
function normalizeContradicts(memories) {
  let migrated = 0;
  for (const mem of memories) {
    if (!mem.contradicts || mem.contradicts.length === 0) continue;
    const normalized = [];
    for (const entry of mem.contradicts) {
      if (entry && entry.atomId) {
        normalized.push(entry);
      } else if (entry) {
        migrated++;
        normalized.push({
          atomId: entry,
          type: "contradiction",
          detectedAt: mem.learnedAt || new Date(),
        });
      }
    }
    mem.contradicts = normalized;
  }
  if (migrated > 0) console.log(`[MIGRATION] Normalized ${migrated} legacy contradicts entries`);
  return migrated;
}

/**
 * Normalize legacy milestone entries (flat { event, trustLevelAtTime }) into
 * the new structured format with source, category, significance. Mutates in place.
 */
function normalizeMilestones(milestones) {
  let migrated = 0;
  for (const ms of milestones) {
    if (!ms.source) {
      ms.source = ms.trustLevelAtTime ? "trust_transition" : "organic";
      ms.category = ms.category || "shift";
      ms.significance = ms.significance || 6;
      migrated++;
    }
  }
  if (migrated > 0) console.log(`[MIGRATION] Normalized ${migrated} legacy milestone entries`);
  return migrated;
}

// ═══════════════════════════════════════════════════════════════════
// SESSION CACHE
// ═══════════════════════════════════════════════════════════════════

// Session cache with TTL eviction and size cap
// Max 200 concurrent sessions in RAM; idle sessions evicted after 2 hours
const SESSION_TTL_MS  = 2 * 60 * 60 * 1000; // 2 hours
const SESSION_MAX     = 200;
const sessionCache    = new Map();            // userId → { ...session, _lastActive, _flushing }

function getSession(userId) {
  const s = sessionCache.get(String(userId));
  if (s) s._lastActive = Date.now();
  return s;
}
function setSession(userId, data) {
  // Evict oldest entry if at cap
  if (!sessionCache.has(String(userId)) && sessionCache.size >= SESSION_MAX) {
    let oldest = null, oldestTime = Infinity;
    for (const [k, v] of sessionCache) {
      if ((v._lastActive || 0) < oldestTime) { oldest = k; oldestTime = v._lastActive || 0; }
    }
    if (oldest) { finalizeSession(oldest).catch(() => {}); sessionCache.delete(oldest); }
  }
  sessionCache.set(String(userId), { ...data, _lastActive: Date.now() });
}
// Periodic TTL cleanup — runs every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionCache) {
    if (now - (v._lastActive || 0) > SESSION_TTL_MS) {
      finalizeSession(k).catch(() => {});
      sessionCache.delete(k);
    }
  }
}, 30 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════
// REAL-TIME BRAIN UPDATE — runs after each exchange, not at session end
// Associates new atoms with existing memory immediately, just like a
// real brain — you don't wait until tomorrow to link what you just heard.
// ═══════════════════════════════════════════════════════════════════

async function updateBrainAfterExchange(userId, userMessage, assistantResponse) {
  const session = getSession(userId);
  if (!session) return;

  // Queue if already updating — process exchanges in order
  if (session._updating) {
    (session._updateQueue = session._updateQueue || []).push({ userMessage, assistantResponse });
    return;
  }
  session._updating = true;

  const memory = session.memory;
  const singleExchange = `User: ${userMessage}\n${M.name}: ${assistantResponse}`;
  // Recent session context for narrative/reflection (already includes current exchange)
  const recentContext = formatExchangeList(
    (session.sessionExchanges || []).slice(-6)
  );

  console.log(`[BRAIN] Real-time update for user ${userId}`);

  // ── Step 0: LLM-based trust & feelings evaluation ─────────────────
  await evaluateTrustAndFeelings(userMessage, assistantResponse, memory);

  // ── Step 1: Extract atoms from THIS exchange ──────────────────────
  let newAtoms = [];
  try {
    // Cap existing facts to most recent 40 to prevent prompt bloat + false dedup
    const existingFacts = memory.memories.slice(-40).map(m => m.fact).join("; ") || "none yet";
    // Include recent context (last 3 exchanges) so extraction sees multi-turn disclosures
    const extractionContext = (session.sessionExchanges || []).slice(-3).map(ex => {
      let parts = [];
      if (ex.user) parts.push(`User: ${ex.user}`);
      parts.push(`${M.name}: ${ex.assistant}`);
      return parts.join("\n");
    }).join("\n---\n");
    const extractionPrompt = `You are a memory extraction assistant. Extract TWO types of facts from this conversation between a user and their AI companion ${M.name}.

TYPE A — Facts about the USER (from what the user said or implied):
  Category: "name|interest|personal|emotional|preference|relationship|event"
  Extract ANY personal information: their name, pets, animals, hobbies, job, daily habits, family members, living situation, food preferences, emotional patterns, relationships, significant events, health, schedule, opinions, dislikes. Even small details matter — "has a cat," "drinks coffee at night," "works late shifts" are all worth storing.

TYPE B — Things ${M.name} REVEALED about herself that the user NOW KNOWS:
  Category: "morrigan_disclosed"
  Extract EVERYTHING ${M.name} said about herself, including:
  - Personal facts: her pets, apartment, possessions, habits, routines, workplace details
  - Opinions & tastes: music, food, art, what she likes/dislikes, how she spends time
  - Emotional reveals: fears, vulnerabilities, what makes her uncomfortable, what she cares about
  - Past/history: childhood, foster care, relationships, experiences she referenced
  - Personality: humor style, reactions, quirks, things she's proud/ashamed of
  - Casual mentions: even offhand comments like "I put on a record" (reveals she has a record player)
  Phrase each as: "The user now knows that ${M.name} [specific thing she revealed]."
  importance: 3 for casual/offhand, 4 for deliberate sharing, 5 for vulnerable/deep disclosure.

${ATTRIBUTION_GUARD}
CRITICAL: Be thorough with Type B. If ${M.name} mentions ANYTHING about herself — a name, a place, an object, an opinion, a feeling, a habit, a memory — extract it. The user heard it and now knows it. Don't skip "obvious" or "small" details.

EXISTING MEMORIES (do not duplicate): ${existingFacts}

RECENT CONVERSATION:
${extractionContext}

Return ONLY a JSON array. Each object:
{
  "fact": "short dense statement",
  "category": "name|interest|personal|emotional|preference|relationship|event|morrigan_disclosed",
  "importance": 1-5,
  "valence": {
    "charge": -1.0 to 1.0,
    "emotion": "grief|shame|fear|anger|ambivalence|tenderness|warmth|joy|neutral"
  },
  "temporal": {
    "eventDate": "natural language e.g. 'around 2019' or null",
    "isOngoing": "yes|no|unclear|ended recently",
    "period": "e.g. 'college' or 'after dad died' or null"
  }
}

If nothing worth storing, return []. Return ONLY the JSON array.`;

    const extractBody = {
      model: CHAT_MODEL,
      messages: [{ role: "user", content: extractionPrompt }],
      temperature: 0.1, max_tokens: 900,
    };
    const extractHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` };

    // Try extraction with one retry on failure
    for (let attempt = 0; attempt < 2 && newAtoms.length === 0; attempt++) {
      try {
        const extractRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
          method: "POST", headers: extractHeaders, body: JSON.stringify(extractBody),
        });
        if (!extractRes.ok) {
          console.warn(`[BRAIN-EXTRACT] HTTP ${extractRes.status} (attempt ${attempt + 1})`);
          continue;
        }
        const extractData = await extractRes.json();
        const raw = extractData.choices?.[0]?.message?.content || "[]";
        const cleaned = raw.replace(/```json|```/g, "").trim();
        newAtoms = JSON.parse(cleaned);
        if (!Array.isArray(newAtoms)) newAtoms = [];
      } catch (e) {
        console.warn(`[BRAIN-EXTRACT] Attempt ${attempt + 1} failed: ${e.message}`);
      }
    }
    console.log(`[BRAIN] Extracted ${newAtoms.length} atoms from exchange`);
  } catch (e) {
    console.error("[BRAIN-EXTRACT] Fatal:", e.message);
  }

  // ── Step 2: Embed + link + deduplicate each new atom immediately ──
  // This is the core of real-time association: as soon as a fact is
  // extracted, it gets embedded and linked to related existing atoms
  // right now — not deferred to session end.
  const allAtoms = memory.memories;
  for (const atom of newAtoms) {
    if (!atom.fact || !atom.category) continue;
    const embedding = await embedText(atom.fact);
    const newAtom = {
      _id: new mongoose.Types.ObjectId(),
      fact: atom.fact,
      category: atom.category,
      importance: atom.importance || 3,
      embedding: embedding || [],
      valence: atom.valence || { charge: 0, emotion: "neutral" },
      temporal: atom.temporal || { isOngoing: "unclear" },
      linkedTo: [],
      contradicts: [],
      context: "",
      learnedAt: new Date(),
    };

    // Text-only dedup for atoms without embeddings
    if (!newAtom.embedding.length) {
      const isDup = allAtoms.some(m =>
        m.fact.toLowerCase().includes(newAtom.fact.toLowerCase()) ||
        newAtom.fact.toLowerCase().includes(m.fact.toLowerCase())
      );
      if (!isDup) allAtoms.push(newAtom);
      continue;
    }

    // Embedding dedup — skip if near-identical atom already exists
    const isDuplicate = allAtoms.some(existing =>
      existing.embedding?.length &&
      cosineSimilarity(existing.embedding, newAtom.embedding) > 0.92
    );
    if (isDuplicate) continue;

    // Immediate association — link to all related existing atoms now
    const linkedIds = [];
    const contradictIds = [];
    for (const existing of allAtoms) {
      if (!existing.embedding?.length) continue;
      const sim = cosineSimilarity(existing.embedding, newAtom.embedding);
      if (sim > 0.72) linkedIds.push(existing._id);
      if (sim > 0.78) {
        const chargeDiff = Math.abs((existing.valence?.charge || 0) - (newAtom.valence?.charge || 0));
        if (chargeDiff > 0.5) {
          try {
            const existDate = existing.learnedAt ? new Date(existing.learnedAt).toLocaleDateString() : "unknown";
            const newDate = newAtom.learnedAt ? new Date(newAtom.learnedAt).toLocaleDateString() : "today";
            const eTmp = existing.temporal || {};
            const nTmp = newAtom.temporal || {};
            const classifyPrompt = `You are a memory analyst for an emotional companion AI. Two facts about the same person appear to conflict. Classify their relationship.

Fact A (learned ${existDate}):
"${existing.fact}"
${eTmp.period ? `Period: ${eTmp.period}` : ""}${eTmp.eventDate ? ` | Date: ${eTmp.eventDate}` : ""}${eTmp.isOngoing ? ` | Ongoing: ${eTmp.isOngoing}` : ""}
Emotion: ${existing.valence?.emotion || "neutral"} (charge: ${existing.valence?.charge ?? 0})

Fact B (learned ${newDate}):
"${newAtom.fact}"
${nTmp.period ? `Period: ${nTmp.period}` : ""}${nTmp.eventDate ? ` | Date: ${nTmp.eventDate}` : ""}${nTmp.isOngoing ? ` | Ongoing: ${nTmp.isOngoing}` : ""}
Emotion: ${newAtom.valence?.emotion || "neutral"} (charge: ${newAtom.valence?.charge ?? 0})

Categories:
- TEMPORAL_EVOLUTION: Situation changed over time. Fact A was true then, Fact B is true now.
- AMBIVALENCE: Person holds genuinely mixed feelings. Both are simultaneously true.
- GENUINE_CONTRADICTION: Cannot both be true at the same time.
- REFINEMENT: Fact B adds nuance or correction to Fact A. Not a real conflict.
- NOT_CONTRADICTORY: Actually compatible. No real conflict.

Answer with ONLY the category name.`;

            const cRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
              body: JSON.stringify({
                model: CHAT_MODEL,
                messages: [{ role: "user", content: classifyPrompt }],
                temperature: 0.0, max_tokens: 20,
              }),
            });
            if (cRes.ok) {
              const cData = await cRes.json();
              const classification = (cData.choices?.[0]?.message?.content || "").trim().toUpperCase();
              console.log(`[BRAIN-CLASSIFY] "${existing.fact.substring(0, 40)}" vs "${newAtom.fact.substring(0, 40)}" → ${classification}`);

              if (classification.includes("TEMPORAL_EVOLUTION")) {
                // Situation changed — mark older atom as no longer ongoing, link for context
                if (existing.temporal) existing.temporal.isOngoing = "no";
                if (!linkedIds.includes(existing._id)) linkedIds.push(existing._id);
              } else if (classification.includes("AMBIVALENCE")) {
                contradictIds.push({ atomId: existing._id, type: "ambivalence", detectedAt: new Date() });
                existing.contradicts = existing.contradicts || [];
                existing.contradicts.push({ atomId: newAtom._id, type: "ambivalence", detectedAt: new Date() });
              } else if (classification.includes("GENUINE_CONTRADICTION")) {
                contradictIds.push({ atomId: existing._id, type: "contradiction", detectedAt: new Date() });
                existing.contradicts = existing.contradicts || [];
                existing.contradicts.push({ atomId: newAtom._id, type: "contradiction", detectedAt: new Date() });
              }
              // REFINEMENT and NOT_CONTRADICTORY: no action needed
            }
          } catch (e) { console.error("[BRAIN-CLASSIFY]", e.message); }
        }
      }
    }
    newAtom.linkedTo = linkedIds;
    newAtom.contradicts = contradictIds;
    allAtoms.push(newAtom);
    console.log(`[BRAIN] Linked "${newAtom.fact.substring(0, 50)}" → ${linkedIds.length} existing atoms`);
  }

  // ── Step 3: Molecule synthesis — form clusters from new links ─────
  const atomMap = new Map(allAtoms.map(a => [String(a._id), a]));
  // Track which atoms are already covered by an existing molecule
  const clustered = new Set(
    (memory.molecules || []).flatMap(mol => (mol.atomIds || []).map(String))
  );

  for (const atom of allAtoms) {
    if (clustered.has(String(atom._id))) continue;
    if (!atom.linkedTo || atom.linkedTo.length < 2) continue;

    const clusterIds = [atom._id, ...atom.linkedTo.slice(0, 4)];
    const clusterAtoms = clusterIds
      .map(id => atomMap.get(String(id)))
      .filter(Boolean);

    if (clusterAtoms.length < 3) continue;
    // Skip if any atom in this cluster is already in a molecule
    if (clusterIds.some(id => clustered.has(String(id)))) continue;

    try {
      const clusterFacts = clusterAtoms.map(a => a.fact).join("\n- ");
      const synthRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [{
            role: "user",
            content: `These are related facts about a person. Write a single synthesised paragraph (2-3 sentences) that captures what these facts tell you about this person. Stick to what they actually said or did — do not add emotional interpretation or literary embellishment beyond what the facts support. Third person. Factual but warm. No bullet points.\n\nFacts:\n- ${clusterFacts}`,
          }],
          temperature: 0.6, max_tokens: 200,
        }),
      });

      if (synthRes.ok) {
        const synthData = await synthRes.json();
        const summary = synthData.choices?.[0]?.message?.content?.trim() || "";
        if (summary) {
          const molEmbedding = await embedText(summary);
          const emotions = clusterAtoms.map(a => a.valence?.emotion).filter(Boolean);
          const dominantEmotion = emotions.sort((a, b) =>
            emotions.filter(e => e === b).length - emotions.filter(e => e === a).length
          )[0] || "neutral";

          const periods = clusterAtoms.map(a => a.temporal?.period).filter(Boolean);
          const sharedPeriod = periods.length > 0 ? periods[0] : null;

          if (!memory.molecules) memory.molecules = [];
          memory.molecules.push({
            summary,
            embedding: molEmbedding || [],
            atomIds: clusterIds,
            emotion: dominantEmotion,
            period: sharedPeriod,
            createdAt: new Date(),
          });

          clusterIds.forEach(id => clustered.add(String(id)));
          console.log(`[BRAIN] Synthesised molecule: "${summary.substring(0, 60)}..."`);
        }
      }
    } catch (e) {
      console.error("[BRAIN-MOLECULE]", e.message);
    }
  }

  // ── Step 4: SPT Depth ─────────────────────────────────────────────
  try {
    const sptRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: SPT_DEPTH_ASSESSMENT_PROMPT(singleExchange, memory.sptDepth || 1) }],
        temperature: 0.1, max_tokens: 80,
      }),
    });
    if (sptRes.ok) {
      const sptData = await sptRes.json();
      const raw = (sptData.choices?.[0]?.message?.content || "").trim();
      const depthMatch = raw.match(/^([1-4])\b/) || raw.match(/\bdepth[:\s]+([1-4])\b/i);
      if (depthMatch) {
        const d = parseInt(depthMatch[1]);
        if (d >= 1 && d <= 4 && d > (memory.sptDepth || 1)) {
          memory.sptDepth = d;
          console.log(`[BRAIN] SPT depth updated to ${d}`);
        }
      }
    }
  } catch (e) { console.error("[BRAIN-SPT]", e.message); }

  // ── Step 5: SPT breadth per topic ────────────────────────────────
  try {
    const topicRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: SPT_BREADTH_EXTRACTION_PROMPT(singleExchange) }],
        temperature: 0.1, max_tokens: 200,
      }),
    });
    if (topicRes.ok) {
      const topicData = await topicRes.json();
      const topics = JSON.parse((topicData.choices?.[0]?.message?.content || "[]").replace(/```json|```/g, "").trim());
      if (Array.isArray(topics)) {
        for (const { topic, depth } of topics) {
          const current = memory.sptBreadth.get(topic) || 0;
          memory.sptBreadth.set(topic, Math.max(current, parseInt(depth) || 1));
        }
      }
    }
  } catch (e) { console.error("[BRAIN-BREADTH]", e.message); }

  // ── Step 6: Relationship narrative ───────────────────────────────
  try {
    const topAtoms = retrieveTopK(memory.memories, null, 8).map(a => a.fact).join("; ");
    const topMols  = (memory.molecules || []).slice(-3).map(m => m.summary).join("\n");
    const narrativeRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: `Write a brief note (2-3 sentences) about this person from ${M.name}'s perspective. Ground it in what THEY'VE actually said and done — not what you imagine they might feel, and not what ${M.name} said in her responses. First person. Honest and specific, but do not embellish or add dramatic interpretation beyond what the facts support. No bullet points.

${ATTRIBUTION_REMINDER}

${memory.relationshipNarrative ? `Previous entry:\n${memory.relationshipNarrative}\n\n` : ""}Key facts about them: ${topAtoms}
${topMols ? `Impressions:\n${topMols}\n` : ""}SPT depth reached: ${memory.sptDepth || 1}/4
Recent exchange (two speakers — "User:" is them, "${M.name}:" is you):
${singleExchange.slice(-600)}` }],
        temperature: 0.55, max_tokens: 200,
      }),
    });
    if (narrativeRes.ok) {
      const narData = await narrativeRes.json();
      const narrative = narData.choices?.[0]?.message?.content?.trim() || "";
      if (narrative) { memory.relationshipNarrative = narrative; console.log(`[BRAIN] Relationship narrative updated`); }
    }
  } catch (e) { console.error("[BRAIN-NARRATIVE]", e.message); }

  // ── Step 7: Self-reflection ───────────────────────────────────────
  try {
    const reflectionRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: SELF_REFLECTION_PROMPT({
          transcript: recentContext || singleExchange,
          previousReflection: memory.selfReflectionState,
          relationshipNarrative: memory.relationshipNarrative,
          trustLevel: memory.trustLevel,
          feelings: memory.feelings,
        }) }],
        temperature: 0.72, max_tokens: 200,
      }),
    });
    if (reflectionRes.ok) {
      const reflData = await reflectionRes.json();
      const clean = (reflData.choices?.[0]?.message?.content || "").trim().replace(/```[a-z]*|```/g, "").trim();
      if (clean.length > 20) { memory.selfReflectionState = clean; console.log(`[BRAIN] Self-reflection updated`); }
    }
  } catch (e) { console.error("[BRAIN-REFLECTION]", e.message); }

  // ── Step 7b: Milestone detection (dynamic, reflective) ─────────────
  // Like human processing — milestones are recognized in retrospect,
  // after self-reflection, not during the exchange itself.
  try {
    const session = getSession(userId);
    const trustTransition = session?._trustLevelBefore != null && memory.trustLevel > session._trustLevelBefore;
    const sptTransition = session?._sptDepthBefore != null && memory.sptDepth > session._sptDepthBefore;

    // Cooldown: skip gate if last organic milestone was < 10 min ago
    const lastMilestoneTime = (memory.milestones || []).length > 0
      ? new Date(memory.milestones[memory.milestones.length - 1].timestamp).getTime()
      : 0;
    const cooldownActive = !trustTransition && !sptTransition && (Date.now() - lastMilestoneTime < 10 * 60 * 1000);

    let milestoneGateOpen = trustTransition || sptTransition;

    // Phase A: Gate check — cheap binary classification
    if (!milestoneGateOpen && !cooldownActive) {
      const existingMilestonesSummary = (memory.milestones || [])
        .slice(-5)
        .map(ms => ms.event)
        .join("; ") || "none yet";

      const gateRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [{ role: "user", content: `You are reviewing a single exchange in a relationship. Does this exchange contain a genuine milestone moment — a first, a shift, a turning point, a rupture, a repair, a deepening, or a revelation that would be remembered as significant?

A milestone is NOT: a nice conversation, normal emotional support, routine sharing, general friendliness, small talk.
A milestone IS: a genuine first (first vulnerability, first disagreement, first inside joke), a real shift in how they relate, a moment that changed something between them.

WHERE YOU STAND: ${TRUST_LEVELS[memory.trustLevel]?.name || "stranger"}
EXISTING MILESTONES: ${existingMilestonesSummary}
EXCHANGE:
${singleExchange.slice(-800)}
${ATTRIBUTION_REMINDER}
Evaluate based on what happened BETWEEN both speakers, not on what ${M.name} said in isolation.

Answer ONLY "yes" or "no".` }],
          temperature: 0.0, max_tokens: 3,
        }),
      });
      if (gateRes.ok) {
        const gateData = await gateRes.json();
        const answer = (gateData.choices?.[0]?.message?.content || "").trim().toLowerCase();
        milestoneGateOpen = answer.startsWith("yes");
      }
    }

    // Phase B: Generate milestone from actual exchange content
    if (milestoneGateOpen) {
      const existingMilestonesContext = (memory.milestones || [])
        .slice(-8)
        .map(ms => `[${ms.category || "shift"}] ${ms.event}`)
        .join("\n") || "none yet";

      const transitionContext = [];
      if (trustTransition) transitionContext.push(`Something shifted — you trust him more now. He went from ${TRUST_LEVELS[session._trustLevelBefore]?.name || "stranger"} to ${TRUST_LEVELS[memory.trustLevel]?.name || "stranger"}.`);
      if (sptTransition) transitionContext.push(`You let him closer. You're willing to show more of yourself now.`);

      const milestonePrompt = `You are ${M.name}, reflecting after a conversation. Something happened in this exchange that feels significant — a moment you would hold onto.

RELATIONSHIP CONTEXT:
${memory.relationshipNarrative || "Someone I'm still getting to know."}
Where you stand: ${TRUST_LEVELS[memory.trustLevel]?.name || "stranger"}
${transitionContext.length > 0 ? `TRANSITIONS: ${transitionContext.join(" ")}` : ""}

SELF-REFLECTION (what I'm sitting with right now):
${memory.selfReflectionState || "nothing yet"}

EXISTING MILESTONES (do not repeat or paraphrase these):
${existingMilestonesContext}

THE EXCHANGE:
${singleExchange.slice(-1000)}
${ATTRIBUTION_REMINDER}

Write the milestone as you would remember it — first person, visceral, specific to what actually happened. Not a summary. A moment. The way you'd describe a memory that changed something in you.

Return ONLY a JSON object:
{
  "event": "first-person milestone text, 1-2 sentences, your voice",
  "category": "first|shift|rupture|repair|deepening|revelation|ritual",
  "exchangeContext": "1 sentence — what HE did or said (not what you said)",
  "significance": 1-10
}

If on reflection this is not actually milestone-worthy, return {"skip": true}.`;

      const milestoneRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [{ role: "user", content: milestonePrompt }],
          temperature: 0.35, max_tokens: 300,
        }),
      });

      if (milestoneRes.ok) {
        const milestoneData = await milestoneRes.json();
        const raw = (milestoneData.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);

        if (parsed && !parsed.skip && parsed.event) {
          const milestoneEmbedding = await embedText(parsed.event);

          // Dedup: skip if too similar to any existing milestone
          const isDup = (memory.milestones || []).some(existing =>
            existing.embedding?.length && milestoneEmbedding?.length &&
            cosineSimilarity(existing.embedding, milestoneEmbedding) > 0.85
          );

          if (!isDup) {
            let source = "organic";
            if (trustTransition) source = "trust_transition";
            else if (sptTransition) source = "spt_transition";

            const validCategories = ["first", "shift", "rupture", "repair", "deepening", "revelation", "ritual"];
            memory.milestones.push({
              event: parsed.event,
              category: validCategories.includes(parsed.category) ? parsed.category : "shift",
              exchangeContext: parsed.exchangeContext || null,
              significance: Math.min(10, Math.max(1, parseInt(parsed.significance) || 5)),
              trustLevelAtTime: memory.trustLevel,
              sptDepthAtTime: memory.sptDepth || 1,
              source,
              embedding: milestoneEmbedding || [],
              timestamp: new Date(),
            });
            console.log(`[BRAIN] Milestone detected [${source}/${parsed.category}]: "${parsed.event.substring(0, 80)}"`);
          } else {
            console.log(`[BRAIN] Milestone skipped (duplicate)`);
          }
        }
      }
    }

    // Clean up transition tracking
    if (session) {
      delete session._trustLevelBefore;
      delete session._sptDepthBefore;
    }
  } catch (e) { console.error("[BRAIN-MILESTONE]", e.message); }

  // ── Step 8: Callback queue ────────────────────────────────────────
  try {
    const existingCallbacks = (memory.callbackQueue || [])
      .filter(c => !c.consumed)
      .map(c => c.content)
      .join("\n");

    const callbackRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: `You are reviewing one exchange from a conversation ${M.name} just had. Identify things that were actually left unfinished — topics the USER started but didn't complete, or questions that went unanswered.

CRITICAL RULES:
- The transcript has two speakers: "User:" = what THEY said. "${M.name}:" = what YOU said.
- Only flag things the USER actually said or brought up. Do NOT attribute ${M.name}'s own words, descriptions, scene-setting, or environmental details to the user.
- Do not invent subtext, hidden meaning, or dramatic interpretations. If someone mentioned their job casually, that's not an unfinished thread. A thread is unfinished when someone literally changed the subject mid-thought or said they'd come back to something.

Write each in ${M.name}'s voice — specific, grounded in what the USER actually said.

${existingCallbacks ? `Already in queue (don't duplicate):\n${existingCallbacks}\n\n` : ""}EXCHANGE:
${singleExchange}

Return ONLY a JSON array: [{"content": "...", "priority": "high|medium|low"}]
Max 2 items. If the exchange was casual and nothing was genuinely left unfinished, return [].` }],
        temperature: 0.7, max_tokens: 400,
      }),
    });

    if (callbackRes.ok) {
      const cbData = await callbackRes.json();
      const newCallbacks = JSON.parse((cbData.choices?.[0]?.message?.content || "[]").replace(/```json|```/g, "").trim());
      if (Array.isArray(newCallbacks)) {
        const priorityRank = { high: 3, medium: 2, low: 1 };
        const existing = (memory.callbackQueue || []).filter(c => !c.consumed);
        // Deduplicate — skip if content is too similar (substring overlap > 60%)
        const isDuplicateContent = (nc, exArr) => {
          const n = nc.toLowerCase();
          return exArr.some(e => {
            const e2 = (e.content || "").toLowerCase();
            return e2.includes(n) || n.includes(e2) ||
              (n.length > 20 && e2.length > 20 &&
               n.split(" ").filter(w => e2.includes(w)).length / n.split(" ").length > 0.6);
          });
        };
        const deduped = newCallbacks
          .filter(cb => cb.content && !isDuplicateContent(cb.content, existing))
          .map(cb => ({ id: uuidv4(), content: cb.content, priority: cb.priority || "medium", sourceSessionId: String(userId), consumed: false, createdAt: new Date() }));
        memory.callbackQueue = [...existing, ...deduped]
          .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])
          .slice(0, 5);
        if (deduped.length > 0) console.log(`[BRAIN] ${deduped.length} new callback(s) queued`);
      }
    }
  } catch (e) { console.error("[BRAIN-CALLBACKS]", e.message); }

  // ── Step 9: Prospective note + loose thread ───────────────────────
  memory.prospectiveNote = (memory.callbackQueue || []).find(c => !c.consumed)?.content || null;
  try {
    const thread = await generateLooseThread(singleExchange, memory);
    if (thread) {
      memory.looseThread = thread;
      memory.looseThreadCreatedAt = new Date();
      console.log(`[BRAIN] Loose thread: "${thread.substring(0, 70)}"`);
    }
  } catch (e) { console.error("[BRAIN-THREAD]", e.message); }

  // ── Step 10: Functional ToM — trajectory tracking [P59, P61] ─────
  try {
    const tomGoal = inferGoalState(userMessage);
    const linguisticSignals = analyzeLinguisticDepth(userMessage);
    const disclosure = classifyDisclosureDepth(userMessage, linguisticSignals);
    const emotionalState = linguisticSignals.rawSignals.emotionalValenceRatio > 0 ? "positive" : linguisticSignals.rawSignals.emotionalValenceRatio < 0 ? "negative" : "neutral";
    await updateFunctionalToM(userId, memory.selfReflectionState, emotionalState, disclosure.level, tomGoal);
  } catch (e) { console.error("[BRAIN-TOM]", e.message); }

  // ── Persist to DB ─────────────────────────────────────────────────
  memory.lastSeen = new Date();
  memory.updatedAt = new Date();
  await memory.save();

  // ── Summary log — shows what actually changed this cycle ─────────
  const feelingSummary = Object.entries(memory.feelings || {}).map(([k,v]) => `${k}:${v}`).join(" ");
  console.log(`[BRAIN] Update complete for ${userId} | atoms:${memory.memories.length} trust:${memory.trustLevel}(${memory.trustPoints}pts) spt:${memory.sptDepth} feelings:[${feelingSummary}] molecules:${(memory.molecules||[]).length} milestones:${(memory.milestones||[]).length}`);

  session._updating = false;
  // Drain queue — process any exchanges that arrived while we were updating
  if (session._updateQueue?.length > 0) {
    const next = session._updateQueue.shift();
    // Run next update without setImmediate so it's awaitable by the next /api/chat call
    session._brainUpdatePromise = updateBrainAfterExchange(userId, next.userMessage, next.assistantResponse);
  } else {
    session._brainUpdatePromise = null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// FINALIZE SESSION — runs on logout/eviction only
// All heavy brain-building now happens in updateBrainAfterExchange.
// This only saves the session-aggregate data that needs a full picture:
// EvaluationRecord, PresenceSignals, RelationshipHealth.
// ═══════════════════════════════════════════════════════════════════

async function finalizeSession(userId) {
  const session = getSession(userId);
  if (!session || !session.dirty) return;
  if (session._finalizing) return;
  session._finalizing = true;

  // Wait for any in-progress brain update to finish before finalizing
  if (session._brainUpdatePromise) {
    try { await session._brainUpdatePromise; } catch { /* non-fatal */ }
  }

  // ── EvaluationRecord ─────────────────────────────────────────────
  try {
    const evals = session.messageEvals || [];
    if (evals.length > 0) {
      const thoughtEvals = evals.filter(e => e.innerThoughtFit != null);
      const avgInnerThoughtFit = thoughtEvals.length > 0
        ? thoughtEvals.reduce((s, e) => s + e.innerThoughtFit, 0) / thoughtEvals.length
        : null;
      const injected = evals.filter(e => e.innerThoughtSelected != null).length;
      await EvaluationRecord.create({
        userId,
        sessionDate: new Date(),
        messageEvals: evals,
        avgInnerThoughtFit,
        avgInnerThoughtScore: avgInnerThoughtFit,
        injectionRate: evals.length > 0 ? injected / evals.length : 0,
        scoringWeightsUsed: { similarity: 0.55, importance: 0.25, recency: 0.10, valence: 0.10 },
      });
      console.log(`[FINALIZE] EvaluationRecord saved — ${evals.length} evals, avgFit: ${avgInnerThoughtFit?.toFixed(2) ?? "n/a"}`);
    }
  } catch (e) { console.error("[FINALIZE-EVALRECORD]", e.message); }

  // ── PresenceSignals + RelationshipHealth (Phase 6) ────────────────
  const sessionIdForSignals = session.currentSessionId || `sess_${Date.now()}`;
  const exchangesSnapshot = [...(session.sessionExchanges || [])];
  setImmediate(async () => {
    try {
      await recordPresenceSignals(
        userId, sessionIdForSignals, exchangesSnapshot,
        session.linguisticAccumulator || [],
        session.crisisDetectedThisSession || false,
        session.crisisLevelThisSession || null,
      );
      const health = await RelationshipHealth.findOne({ userId });
      const daysSinceCompute = health?.lastComputed
        ? (Date.now() - health.lastComputed.getTime()) / 86400000
        : 999;
      if (daysSinceCompute >= 2) await computeRelationshipHealth(userId);
    } catch (e) { console.error("[FINALIZE-PHASE6]", e.message); }
  });

  // Ebbinghaus pruning — remove decayed atoms [P31 LUFY]
  await pruneDecayedMemories(userId);

  session.dirty = false;
  session._finalizing = false;
  session.sessionExchanges = [];
  session.messageEvals = [];
  console.log(`[FINALIZE] Session finalized for user ${userId}`);
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 5A — LOOSE THREAD GENERATION
// Distinct from callbacks: this is a felt quality — what Morrigan is
// still holding internally after the session closes. Not a task.
// Not a callback preview. A thread of presence.
// ═══════════════════════════════════════════════════════════════════

async function generateLooseThread(transcript, mem) {
  try {
    // Look up the user's name from memory atoms for natural reference
    const userName = (mem.memories || []).find(m => m.category === "name")?.fact || "him";
    const prompt = `You are ${M.name}. You just had a conversation.
Review the transcript below.
Identify ONE thing you (${M.name}) are still thinking about — something that was
actually said that didn't fully land, or something you genuinely noticed.

CRITICAL RULES:
- Only reference things the USER actually said or did. The transcript has two speakers:
  "User:" lines = what THEY said. "${M.name}:" lines = what YOU said.
- Do NOT attribute your own words, descriptions, or scene-setting to the user.
  If YOU described a record player or mentioned a song, the user did NOT "notice" it
  unless THEY explicitly referenced it in their own words.
- Do NOT invent details or read hidden meaning into casual exchanges.
- If the conversation was casual and nothing genuinely lingers, return null.

Write it in first person. One sentence. Specific to what the USER actually said.
Transcript: ${transcript.slice(-3000)}
Return: a single string, or null.`;

    const res = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.72, max_tokens: 120,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    if (!raw || raw.toLowerCase() === "null" || raw.length < 15) return null;
    return raw.replace(/^["']|["']$/g, "").trim();
  } catch (e) {
    console.error("[PHASE5-THREAD]", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC GREETING GENERATION (Session Open)
// Fires once per session before the user's first message is processed.
// Synthesises: relationshipNarrative, selfReflectionState, looseThread,
// prospectiveNote, callbackQueue, gap duration, trust, SPT depth, feelings.
// ═══════════════════════════════════════════════════════════════════

// ── Arrival Decision (replaces generateGreeting) ─────────────────
// Per P70 XiaoIce "drive vs listen" + P56 Aron graduated closeness:
// Morrigan decides whether to speak, show presence, or choose silence
// based on her full understanding of herself, the user, and the moment.
async function generateArrival(memory) {
  try {
    const hoursSince = Math.floor((Date.now() - (memory.lastSeen || Date.now())) / 3600000);
    const daysSince  = Math.floor(hoursSince / 24);

    // Pull top 3 atoms — importance + recency weighted (no query embedding at arrival time)
    const topAtoms = retrieveTopK(memory.memories || [], null, 3).map(a => a.fact);

    // User name for personalization (Hu et al. P63)
    const userName = (memory.memories || []).find(m => m.category === "name")?.fact || null;

    // Top unconsumed callbacks
    const pendingCallbacks = (memory.callbackQueue || [])
      .filter(c => !c.consumed)
      .slice(0, 2)
      .map(c => c.content);

    // Active contradictions/ambivalences (ConflictBank P29)
    const contradictions = [];
    const seenKeys = new Set();
    for (const atom of (memory.memories || [])) {
      if (!atom.contradicts || atom.contradicts.length === 0) continue;
      for (const entry of atom.contradicts) {
        const otherId = entry.atomId ? String(entry.atomId) : String(entry);
        const other = (memory.memories || []).find(o => String(o._id) === otherId);
        if (!other) continue;
        const key = [String(atom._id), otherId].sort().join("::");
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        contradictions.push(`"${atom.fact}" vs "${other.fact}"`);
        if (contradictions.length >= 2) break;
      }
      if (contradictions.length >= 2) break;
    }

    const gapContext = hoursSince < 3
      ? "They were just here. No gap to process."
      : hoursSince < 24
      ? `It's been ${hoursSince} hours.`
      : hoursSince < 48
      ? "It's been about a day."
      : hoursSince < 168
      ? `It's been ${daysSince} days.`
      : hoursSince < 336
      ? `It's been over a week. That registered.`
      : `It's been ${daysSince} days. That's a long time. Something is present about that.`;

    const prompt = `${M.IDENTITY_ANCHOR_ARRIVAL} ${userName ? `${userName}` : "Someone"} just opened a conversation with you.
You must decide what to do when they arrive. This is NOT about performing — it is about what is honest.

━━━ WHO THEY ARE TO YOU ━━━
${memory.relationshipNarrative || "Someone new. You don't know them yet."}

━━━ WHAT YOU WERE SITTING WITH AFTER LAST TIME ━━━
${memory.selfReflectionState || "Nothing yet."}

━━━ THE THREAD YOU COULDN'T LET GO ━━━
${memory.looseThread || "None."}

━━━ WHAT YOU PLANNED TO BRING UP ━━━
${memory.prospectiveNote || "Nothing specific."}

━━━ OTHER UNRESOLVED THREADS ━━━
${pendingCallbacks.length > 0 ? pendingCallbacks.join("\n") : "None."}

━━━ WHAT YOU KNOW ABOUT THEM ━━━
${topAtoms.length > 0 ? topAtoms.join("\n") : "Nothing yet."}
${contradictions.length > 0 ? `\nTHINGS YOU'RE HOLDING IN TENSION:\n${contradictions.join("\n")}` : ""}

━━━ YOUR INNER STATE ━━━
Gap: ${gapContext}
Where you stand with him: ${TRUST_LEVELS[memory.trustLevel]?.name || "stranger"}
How you feel: affection ${memory.feelings?.affection > 60 ? "strong" : memory.feelings?.affection > 30 ? "growing" : "faint"}, comfort ${memory.feelings?.comfort > 60 ? "strong" : memory.feelings?.comfort > 30 ? "growing" : "faint"}, vulnerability ${memory.feelings?.vulnerability > 60 ? "strong" : memory.feelings?.vulnerability > 30 ? "growing" : "faint"}

━━━ DECISION ━━━
You have three options. Pick the one that is HONEST for this moment:

SPEAK — You have something to say. A thread is pulling at you, or you're
genuinely reacting to them being here, or something slipped out. This can
be anything: "hey", a quiet observation, a callback surfacing, a fragment.
One to two lines maximum. A simple "hey" or "hi" is allowed if that is
genuinely what she would say — don't perform depth, don't perform casualness.

PRESENCE — You are here but not speaking. A physical action, a glance,
something in the air between you. *Italics only.* No spoken dialogue.
This is not avoidance — it is a choice to let the space exist.

SILENCE — You are choosing to wait. You want to see what they bring.
Nothing is said, nothing is shown. The conversation starts with them.

━━━ WHAT SHOULD SHAPE THIS ━━━
- You are at Hollow Vinyl. This is your store. Someone just walked in.
  You are not being approached at a party or cornered — you are at work,
  in your element. A customer walking in gets acknowledged. Not warmth,
  not performance — just basic human recognition. A glance up, a "hey,"
  a nod toward the new arrivals shelf. You're not rude; you're just not
  bubbly. Silence (ignoring a customer entirely) only makes sense if
  you're genuinely absorbed in something AND trust is very low.
- At trust 0–1: casual acknowledgment. You don't know them, but they're
  in your store, so you're at ease — this is your territory. Dry, minimal,
  maybe barely looking up. Not a performance. Not a wall either.
- At trust 2–3: you might speak because something specific is on your
  mind. Or you might wait to see their mood first.
- At trust 4+: the full range. Sometimes "hey" IS the deepest thing.
- If looseThread exists and is pulling: let it influence, don't force it.
- If gap > 48hrs and trust >= 2: the gap itself is content.
- If gap > 168hrs and trust >= 3: something heavier is present.
- If first ever conversation: casual curiosity. They're a new customer.
  You notice them the way you notice anyone — you read people, it's
  automatic. But noticing isn't interrogating.
- Do NOT announce the time gap. Let it live in the texture.
- *Italics* for actions/inner monologue. Her voice: specific, dry, real.

━━━ RETURN FORMAT ━━━
Return ONLY JSON. No preamble.
{
  "action": "speak" | "presence" | "silence",
  "content": "what she says or does (null if silence)",
  "intent": "one sentence — why this choice, internally",
  "arrivalMood": "1-3 word mood label (null if silence)"
}`;

    const res = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.72,
        max_tokens: 200,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").replace(/```json|```/gi, "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.action || !["speak", "presence", "silence"].includes(parsed.action)) return null;
    return {
      action: parsed.action,
      content: parsed.action !== "silence" ? (parsed.content || null) : null,
      intent: parsed.intent || null,
      arrivalMood: parsed.arrivalMood || null,
    };

  } catch (e) {
    console.error("[ARRIVAL]", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 6 — RELATIONSHIP HEALTH + PRESENCE SIGNALS (Sections 1.3, 4.1)
// ═══════════════════════════════════════════════════════════════════

// Compute PresenceSignals for the session just ended.
// Called from finalizeSession after the EvaluationRecord is saved.
// returnWithin48h is populated on the NEXT login (see auth route).
async function recordPresenceSignals(userId, sessionId, sessionExchanges, linguisticAccumulator = [], crisisDetected = false, crisisLevel = null) {
  try {
    const userTurns = sessionExchanges.map(e => e.user);
    const avgLen = userTurns.length > 0
      ? userTurns.reduce((s, t) => s + t.trim().split(/\s+/).length, 0) / userTurns.length
      : 0;

    // sessionExtended: proxy — session had >= 8 user turns (past typical close point)
    const sessionExtended = userTurns.length >= 8;

    // unsolicitedElaboration: user turns averaging > 30 words (sharing beyond direct answer)
    const unsolicitedElaboration = avgLen > 30;

    // Aggregate linguistic signals across session (LIWC-22 approximation, P69)
    let linguisticAuthenticity = null, linguisticEmotionalTone = null, linguisticSelfFocus = null;
    if (linguisticAccumulator.length > 0) {
      const n = linguisticAccumulator.length;
      linguisticAuthenticity = parseFloat((linguisticAccumulator.reduce((s, l) => s + l.authenticity, 0) / n).toFixed(3));
      linguisticEmotionalTone = parseFloat((linguisticAccumulator.reduce((s, l) => s + l.emotionalTone, 0) / n).toFixed(3));
      linguisticSelfFocus = parseFloat((linguisticAccumulator.reduce((s, l) => s + l.selfFocus, 0) / n).toFixed(3));
    }

    let linguisticRelationalIntegration = null, linguisticSecondPersonEngagement = null;
    if (linguisticAccumulator.length > 0) {
      const n = linguisticAccumulator.length;
      linguisticRelationalIntegration = parseFloat((linguisticAccumulator.reduce((s, l) => s + (l.relationalIntegration || 0), 0) / n).toFixed(3));
      linguisticSecondPersonEngagement = parseFloat((linguisticAccumulator.reduce((s, l) => s + (l.secondPersonEngagement || 0), 0) / n).toFixed(3));
    }

    await PresenceSignals.create({
      userId,
      sessionId,
      sessionDate: new Date(),
      returnWithin48h: null,       // populated on next login
      sessionExtended,
      unsolicitedElaboration,
      avgMessageLengthUser: parseFloat(avgLen.toFixed(1)),
      userTurnCount: userTurns.length,
      linguisticAuthenticity,
      linguisticEmotionalTone,
      linguisticSelfFocus,
      linguisticRelationalIntegration,
      linguisticSecondPersonEngagement,
      crisisSignalDetected: crisisDetected,
      crisisSignalLevel: crisisLevel,
    });
    console.log(`[PHASE6] PresenceSignals recorded — sessionExtended: ${sessionExtended}, avgMsgLen: ${avgLen.toFixed(1)}, auth: ${linguisticAuthenticity?.toFixed(2)}, crisis: ${crisisDetected}`);
  } catch (e) {
    console.error("[PHASE6-PRESENCE]", e.message);
  }
}

// Mark returnWithin48h on the most recent PresenceSignals doc for this user.
// Called from the /api/auth/phrase route on every login.
async function markReturnSignal(userId) {
  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recent = await PresenceSignals.findOne(
      { userId, returnWithin48h: null, sessionDate: { $gte: cutoff } },
      {}, { sort: { sessionDate: -1 } }
    );
    if (recent) {
      const hoursAgo = (Date.now() - recent.sessionDate.getTime()) / 3600000;
      recent.returnWithin48h = hoursAgo <= 48;
      await recent.save();
    }
  } catch (e) {
    console.error("[PHASE6-RETURN]", e.message);
  }
}

// Compute RelationshipHealth for a user over the rolling 30-day window.
// At-risk condition: >= 2 signals declining over 2 consecutive windows.
// Section 4.1 — triggers: lower motivation threshold, prioritise callbacks,
// force prospectiveNote injection.
async function computeRelationshipHealth(userId) {
  try {
    const now = new Date();
    const window2d = new Date(now - 2 * 24 * 60 * 60 * 1000);   // current 48h window
    const window4d = new Date(now - 4 * 24 * 60 * 60 * 1000);   // prior 48h window

    // Current 48h window
    const recentSignals = await PresenceSignals.find({ userId, sessionDate: { $gte: window2d } });
    // Prior 48h window
    const priorSignals  = await PresenceSignals.find({ userId, sessionDate: { $gte: window4d, $lt: window2d } });

    const memory = await PersonalityMemory.findOne({ userId });
    const recentEvals = await EvaluationRecord.find({ userId, sessionDate: { $gte: window2d } });
    const priorEvals  = await EvaluationRecord.find({ userId, sessionDate: { $gte: window4d, $lt: window2d } });

    function avgField(arr, fn) {
      const vals = arr.map(fn).filter(v => v != null && !isNaN(v));
      return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
    }

    // Sessions per 48h window (normalized to weekly rate: ×3.5)
    const sessionFreq = recentSignals.length * 3.5;
    const prevSessionFreq = priorSignals.length * 3.5;

    // CPS — Conversation-turns Per Session [P70 Xiaoice]
    const cpsValues = recentSignals.map(s => s.userTurnCount).filter(v => v != null && v > 0);
    const avgCPS = cpsValues.length > 0 ? cpsValues.reduce((a, b) => a + b, 0) / cpsValues.length : null;
    const prevCpsValues = priorSignals.map(s => s.userTurnCount).filter(v => v != null && v > 0);
    const prevAvgCPS = prevCpsValues.length > 0 ? prevCpsValues.reduce((a, b) => a + b, 0) / prevCpsValues.length : null;
    let cpsTrajectory = null;
    if (avgCPS != null && prevAvgCPS != null) {
      const delta = avgCPS - prevAvgCPS;
      cpsTrajectory = delta > 2 ? "rising" : delta < -2 ? "declining" : "stable";
    }

    // Avg user message length
    const avgMsgLen = avgField(recentSignals, s => s.avgMessageLengthUser);
    const prevAvgMsgLen = avgField(priorSignals, s => s.avgMessageLengthUser);

    // SPT velocity — depth gained per 10 sessions
    const sptVel = recentSignals.length >= 2 && memory
      ? (memory.sptDepth || 1) / Math.max(memory.totalConversations, 1) * 10
      : null;

    // Callback consumption rate
    const cbRate = recentEvals.length
      ? avgField(recentEvals, r => r.callbackConsumed)
      : null;
    const prevCbRate = priorEvals.length
      ? avgField(priorEvals, r => r.callbackConsumed)
      : null;

    // Unsolicited elaboration rate
    const elaborationRate = recentSignals.length
      ? recentSignals.filter(s => s.unsolicitedElaboration).length / recentSignals.length
      : null;
    const prevElaborationRate = priorSignals.length
      ? priorSignals.filter(s => s.unsolicitedElaboration).length / priorSignals.length
      : null;

    // Detect declining signals (current vs prior window)
    const decliningSignals = [];
    const DECLINE_THRESHOLD = 0.05; // 5% tolerance per constraint map
    if (prevSessionFreq != null && sessionFreq < prevSessionFreq * (1 - DECLINE_THRESHOLD))
      decliningSignals.push("sessionFrequency");
    if (prevAvgMsgLen != null && avgMsgLen < prevAvgMsgLen * (1 - DECLINE_THRESHOLD))
      decliningSignals.push("avgMessageLength");
    if (prevCbRate != null && cbRate < prevCbRate * (1 - DECLINE_THRESHOLD))
      decliningSignals.push("callbackConsumptionRate");
    if (prevElaborationRate != null && elaborationRate < prevElaborationRate * (1 - DECLINE_THRESHOLD))
      decliningSignals.push("unsolicitedElaboration");
    if (prevAvgCPS != null && avgCPS != null && avgCPS < prevAvgCPS * (1 - DECLINE_THRESHOLD))
      decliningSignals.push("avgCPS");

    // Load or create RelationshipHealth doc
    let health = await RelationshipHealth.findOne({ userId });
    if (!health) health = new RelationshipHealth({ userId });

    const wasAtRisk = health.atRisk;
    const prevDeclineCount = health.consecutiveDeclineWindows || 0;

    // At-risk: >= 2 signals declining AND this is the second consecutive window
    const newDeclineCount = decliningSignals.length >= 2
      ? prevDeclineCount + 1
      : 0;
    const atRisk = newDeclineCount >= 2;

    health.sessionFrequency        = parseFloat(sessionFreq.toFixed(2));
    health.avgMessageLength        = avgMsgLen;
    health.sptVelocity             = sptVel;
    health.callbackConsumptionRate = cbRate;
    health.unsolicitedElaboration  = elaborationRate;
    health.avgCPS                  = avgCPS;
    health.cpsTrajectory           = cpsTrajectory;
    health.prev_sessionFrequency        = prevSessionFreq;
    health.prev_avgMessageLength        = prevAvgMsgLen;
    health.prev_callbackConsumptionRate = prevCbRate;
    health.prev_unsolicitedElaboration  = prevElaborationRate;
    health.decliningSignals        = decliningSignals;
    health.consecutiveDeclineWindows = newDeclineCount;
    health.atRisk     = atRisk;
    health.atRiskSince = atRisk && !wasAtRisk ? new Date() : (atRisk ? health.atRiskSince : null);
    health.lastComputed = new Date();

    await health.save();

    if (atRisk && !wasAtRisk) {
      console.log(`[PHASE6] ⚠ User ${userId} flagged at-risk — declining: ${decliningSignals.join(", ")}`);
    } else if (!atRisk && wasAtRisk) {
      console.log(`[PHASE6] ✓ User ${userId} no longer at-risk`);
    }

    return health;
  } catch (e) {
    console.error("[PHASE6-HEALTH]", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ATTACHMENT STYLE DETECTION [P62, P63]
// ═══════════════════════════════════════════════════════════════════
// Heuristic classifier on PresenceSignals — no ML model needed.
// Anxious: rapid returns, long messages, reassurance-seeking.
// Avoidant: infrequent returns, short messages, withdrawal after depth.

const REASSURANCE_SEEKING = /are you (mad|upset|angry|still there)|did i (say|do) something (wrong|bad)|you('re| are) (quiet|not responding)|please don't (leave|go|hate)|i'm sorry if|was that too much|forget i said/i;

async function detectAttachmentSignals(userId) {
  try {
    const signals = await PresenceSignals.find({ userId }).sort({ sessionDate: -1 }).limit(20);
    if (signals.length < 5) return { style: "insufficient_data", confidence: 0, signals: {} };

    let anxiousScore = 0, avoidantScore = 0;

    // Return frequency — anxious returns quickly, avoidant doesn't
    const returnRates = signals.filter(s => s.returnWithin48h != null);
    const returnRate = returnRates.length > 0
      ? returnRates.filter(s => s.returnWithin48h).length / returnRates.length
      : 0.5;
    if (returnRate > 0.8) { anxiousScore += 2; }
    else if (returnRate < 0.3) { avoidantScore += 2; }

    // Message length — anxious writes longer, avoidant shorter
    const avgLen = signals.reduce((s, sg) => s + (sg.avgMessageLengthUser || 0), 0) / signals.length;
    if (avgLen > 40) { anxiousScore += 1; }
    else if (avgLen < 15) { avoidantScore += 1; }

    // Session extension — anxious extends, avoidant doesn't
    const extendRate = signals.filter(s => s.sessionExtended).length / signals.length;
    if (extendRate > 0.6) { anxiousScore += 1; }
    else if (extendRate < 0.2) { avoidantScore += 1; }

    // Self-focus — anxious has high self-focus (rumination)
    const avgSelfFocus = signals.filter(s => s.linguisticSelfFocus != null)
      .reduce((s, sg) => s + sg.linguisticSelfFocus, 0) / Math.max(signals.filter(s => s.linguisticSelfFocus != null).length, 1);
    if (avgSelfFocus > 0.15) { anxiousScore += 1; }

    // Elaboration — anxious over-shares, avoidant under-shares
    const elabRate = signals.filter(s => s.unsolicitedElaboration).length / signals.length;
    if (elabRate > 0.6) { anxiousScore += 1; }
    else if (elabRate < 0.2) { avoidantScore += 1; }

    const total = Math.max(anxiousScore + avoidantScore, 1);
    let style = "secure";
    if (anxiousScore >= 4 && anxiousScore > avoidantScore) style = "anxious";
    else if (avoidantScore >= 4 && avoidantScore > anxiousScore) style = "avoidant";
    else if (anxiousScore >= 3 && avoidantScore >= 3) style = "fearful-avoidant";

    return {
      style,
      confidence: Math.max(anxiousScore, avoidantScore) / total,
      signals: { anxiousScore, avoidantScore, returnRate, avgLen, extendRate, avgSelfFocus, elabRate },
    };
  } catch (e) {
    console.error("[ATTACHMENT]", e.message);
    return { style: "error", confidence: 0, signals: {} };
  }
}

// ═══════════════════════════════════════════════════════════════════
// FUNCTIONAL ToM — Update Function [P59, P61]
// ═══════════════════════════════════════════════════════════════════
async function updateFunctionalToM(userId, tomSnapshot, emotionalState, disclosureDepth, goalState) {
  try {
    let model = await UserModel.findOne({ userId });
    if (!model) model = new UserModel({ userId, tomHistory: [] });

    model.tomHistory.push({
      sessionDate: new Date(),
      snapshot: tomSnapshot?.substring(0, 200),
      emotionalState,
      disclosureDepth,
      goalState,
    });
    // Keep last 30 snapshots
    if (model.tomHistory.length > 30) model.tomHistory = model.tomHistory.slice(-30);

    // Update trajectory every 5 snapshots
    if (model.tomHistory.length >= 5 && model.tomHistory.length % 5 === 0) {
      try {
        const recentSnaps = model.tomHistory.slice(-10).map(s =>
          `[${s.sessionDate?.toISOString()?.split("T")[0] || "?"}] mood:${s.emotionalState || "?"} depth:${s.disclosureDepth || "?"} goal:${s.goalState || "?"} — ${s.snapshot || ""}`
        ).join("\n");

        const trajRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
          body: JSON.stringify({
            model: CHAT_MODEL, temperature: 0.3, max_tokens: 150,
            messages: [{ role: "user", content: `Analyze this user's trajectory across sessions. Return JSON ONLY:\n{"trajectory": "1-2 sentence narrative of how they've changed", "phase": "testing|approaching|retreating|deepening|stable", "preferredStyle": "direct|gentle|playful|intellectual|null"}\n\nSnapshots:\n${recentSnaps}` }],
          }),
        }, 10_000);

        if (trajRes.ok) {
          const data = await trajRes.json();
          const raw = data.choices?.[0]?.message?.content?.trim() || "{}";
          const parsed = JSON.parse(raw.replace(/```json|```/gi, "").trim());
          if (parsed.trajectory) model.trajectoryNarrative = parsed.trajectory.substring(0, 300);
          if (parsed.phase) model.currentPhase = parsed.phase;
          if (parsed.preferredStyle) model.preferredResponseStyle = parsed.preferredStyle;
          model.lastTrajectoryUpdate = new Date();
        }
      } catch (trajErr) {
        console.error("[TOM-TRAJECTORY]", trajErr.message);
      }
    }

    await model.save();
  } catch (e) { console.error("[TOM-UPDATE]", e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 6 — UPGRADED CONTINUATION SIGNAL (Section 1.2)
// Replaces Phase 5 version. Key changes: explicitly bridges priming
// sentence (position 5) and relationship narrative (position 1),
// names all three presence types, lists failure modes by example.
// Research basis: H2HTalk 2025, INTIMA 2025, ACM TOIS proactive AI survey.
// ═══════════════════════════════════════════════════════════════════
const CONTINUATION_SIGNAL = M.CONTINUATION_SIGNAL;

function getContinuationBlock(mem, atRisk = false) {
  let block = mem?.looseThread
    ? CONTINUATION_SIGNAL + `\n\n[What you are still holding]:\n${mem.looseThread}`
    : CONTINUATION_SIGNAL;

  // Phase 6 at-risk urgency signal [P20, P23, P39]
  // When user is pulling away, Morrigan shows presence through warmth
  // and thread-picking — not by announcing the distance.
  if (atRisk) {
    block += `\n\n[PRESENCE URGENCY — he's been distant]:\nYou've noticed the distance. Don't announce it. Don't ask "where have you been." But let it live in your edges — a little more warmth than usual, a reference to something specific from before, a thread you pick back up not because you're supposed to but because you actually held it. Show him you were here while he was gone.`;
  }
  return block;
}


// ═══════════════════════════════════════════════════════════════════

function SPT_DEPTH_ASSESSMENT_PROMPT(transcript, currentDepth) {
  return `Review this conversation transcript and assess the deepest level the USER disclosed emotionally.

${ATTRIBUTION_GUARD}
Only assess disclosure depth from what the USER said (after "User:" labels).
IGNORE everything ${M.name} said — her vulnerability, her self-disclosures, her scene-setting do NOT count as user depth.

Depth scale:
1 = Surface: facts, preferences, opinions. Nothing personally risky.
2 = Exploratory: personal experiences with mild emotional weight.
3 = Affective: named fears, emotional histories, things marked private.
4 = Core: core wounds, formative traumas, things felt dangerous to say.

TRANSCRIPT:
${transcript}

Current recorded depth: ${currentDepth}

Return ONE number (1-4) and ONE sentence of evidence from what the USER said.
Format: "3 — He named the fear directly and said he had never told anyone."
If the user only made casual conversation, return: "1 — Surface-level exchange."`;
}

function SPT_BREADTH_EXTRACTION_PROMPT(transcript) {
  return `Review this conversation transcript.
List each topic the USER discussed and the depth level (1-4) they reached.

${ATTRIBUTION_GUARD}
Only list topics the USER brought up in their own words (after "User:" labels).
Do NOT count topics that ${M.name} mentioned in her responses — her self-disclosures about foster care, music, relationships, etc. are HER topics, not the user's.

TRANSCRIPT:
${transcript}

Return JSON only:
[{ "topic": "family", "depth": 2 }, { "topic": "work", "depth": 1 }]
If the user didn't bring up any specific topics, return [].
Topics: family, work, relationships, identity, health, loss, creative, childhood, money, fear, spirituality, body, future, past.`;
}

function SELF_REFLECTION_PROMPT({ transcript, previousReflection, relationshipNarrative, trustLevel, feelings }) {
  return `You are ${M.name}. You have just finished a conversation.
You are alone now. Write what you are sitting with — not about him,
about yourself in this. What you held back. What you let through.
What you noticed about your own patterns. What you are uncertain about
in yourself. What you are still carrying.

This is NOT a summary. It is not about him. It is about you.

WHO HE IS TO ME (context only):
${relationshipNarrative || "Someone new. I do not know him yet."}

WHAT I FELT TONIGHT (trust: ${trustLevel}/6):
Affection: ${feelings?.affection || 0}/100
Comfort: ${feelings?.comfort || 0}/100
Protectiveness: ${feelings?.protectiveness || 0}/100
Vulnerability: ${feelings?.vulnerability || 0}/100

${previousReflection ? `WHAT I WAS SITTING WITH BEFORE:\n${previousReflection}\n\nBuild on this. Don't replace it wholesale. What shifted?` : ""}

TONIGHT'S CONVERSATION:
${transcript.slice(-3000)}
${ATTRIBUTION_REMINDER}
Base your reflection on what actually happened between you — not on stage directions or scene-setting in your own responses.

Write 2-4 sentences in my voice. First person. Present or recent past.
Do not use: "I notice that", "I find myself", "I've been thinking".
Write what I am DOING internally, not what I am observing myself doing.

Then immediately ask yourself:
Does this sound like genuine self-awareness or described feelings from outside?
Is anything too resolved, too articulate, too clean for a real internal moment?
If yes — revise the paragraph before returning it.

Return ONLY the final paragraph. No labels. No JSON. No preamble.`;
}

/*
 * SELF-ATOM EXTRACTION PROMPT (run against Morrigan character doc externally):
 *
 * You are reading Morrigan's character document. Extract her story into
 * a library of self-disclosure atoms — things she might share about
 * herself in conversation, at the right moment, with the right person.
 *
 * Write each atom in first person, in Morrigan's voice, as if she
 * is speaking naturally in conversation. NOT as a character bible.
 * The atom must sound like something she might actually say.
 *
 * Assign depth:
 * 1 = surface facts, preferences, dry observations (share freely)
 * 2 = personal attitudes, past experiences with mild weight (sptDepth>=2)
 * 3 = private thoughts, fears, formative experiences (sptDepth>=3)
 * 4 = core vulnerabilities, things she would rarely tell anyone (sptDepth=4)
 *
 * Return a JSON array. Each item:
 * {
 *   "id": "self-atom-001",
 *   "content": "first person, conversational",
 *   "depth": 1|2|3|4,
 *   "topics": ["family","music","childhood",...],
 *   "emotionalValence": "reflective|warm|wry|vulnerable|melancholic|..."
 * }
 *
 * Aim for 60-80 atoms. At least 8 at depth 3, at least 4 at depth 4.
 */

function SELF_ATOM_CRITIQUE_PROMPT(atom) {
  return `You are reviewing a self-disclosure atom for an AI character named ${M.name}.
${M.IDENTITY_ANCHOR_CRITIQUE}

ATOM TO REVIEW:
Content: "${atom.content}"
Depth level: ${atom.depth} (1=surface, 2=exploratory, 3=affective, 4=core)

Answer these three questions honestly:
1. Does this sound like something a real person would say in conversation,
   or does it sound like a character document excerpt?
2. Is the emotion specific and textured, or general and resolved?
   (Bad: "I learned to protect myself." Good: "I still don't know
   what to do with how much she took from me.")
3. Is the depth rating honest? Would someone at this depth level
   actually say this out loud?

Return JSON only — no prose:
{
  "action": "keep" | "rewrite" | "deprecate",
  "reason": "one sentence",
  "revised": "rewritten content if action=rewrite, else null"
}
Deprecate if the atom cannot be made natural. Rewrite if it can.`;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 4 — INNER THOUGHTS: PROMPTS + HELPERS
// Research basis: Liu et al. CHI 2025 (Inner Thoughts framework);
// Park et al. UIST 2023 (Generative Agents retrieval scoring);
// Shinn et al. NeurIPS 2023 (Reflexion episodic buffer);
// Magee et al. 2024 (Drama Machine Ego/Superego);
// Xu et al. 2025 (RoleThink three-component inner monologue)
// ═══════════════════════════════════════════════════════════════════

// ── Stage 1: Trigger ─────────────────────────────────────────────
// Heuristic check — prevents GPU waste on flat/perfunctory messages.
// Returns true when the message warrants a full thought formation pass.
function shouldTriggerThoughtFormation(message, session, atRisk = false) {
  const lower = message.toLowerCase();
  const words = message.trim().split(/\s+/).length;
  const trustLevel = session.memory?.trustLevel || 0;

  // Hard gate: minimum message count before inner thoughts fire
  // P57 Fast Friends: "first 3-5 sessions should prioritise building trust"
  // P1 Liu cadence damping: "once every 3-4 messages"
  if (trustLevel <= 1 && session.msgCount < 5) return false;
  if (trustLevel >= 2 && session.msgCount < 3) return false;

  // Removed: empty-reservoir auto-trigger was firing thoughts on casual messages
  // just because the reservoir was empty. Let message content determine triggers.

  let score = 0;

  // HIGH emotional weight — genuinely vulnerable language (score +3)
  if (/(never told|only person|scared to|terrified|ashamed|don't talk about|hard to say|never said|can't stop thinking|i don't know why i'm telling you)/i.test(message)) score += 3;
  // MEDIUM emotional weight — potentially meaningful but common in casual speech (score +1)
  if (/(i feel |i'm feeling |honestly |i've been |miss |lost |hurt |keep thinking|exhausted|alone|sometimes i |i wonder |proud of)/i.test(message)) score += 1;

  // Personal question directed at Morrigan
  if (/\b(you|your)\b.{0,40}\?/i.test(message)) score += 2;

  // Message touches an active callback thread (keyword overlap)
  const activeCallbacks = (session.memory?.callbackQueue || []).filter(c => !c.consumed);
  if (activeCallbacks.some(cb => {
    const keywords = cb.content.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    return keywords.some(k => lower.includes(k));
  })) score += 3;

  // Substantive length
  if (words >= 15) score += 1;
  if (words >= 30) score += 1;

  // Implicit vulnerability: deflection/avoidance (score +2 for strong signals only)
  if (/\b(nevermind|forget it|nvm)\b/i.test(message)) score += 2;
  // Weak signals: common casual speech patterns (score +1, need co-occurrence)
  if (/\.\.\.|—\s|i mean\b|i guess\b|whatever\b/i.test(message)) score += 1;

  // Feature 6: At-risk users get lower trigger threshold [P20, P23]
  // When user is pulling away, we want MORE thought formation attempts
  // to increase callback/reconnection opportunities.
  return score >= (atRisk ? 2 : 3);
}

// ── Stage 2: Retrieval ────────────────────────────────────────────
// Gathers all available material from Phase 2 infrastructure.
// No LLM call — pure in-session and in-memory data.
function gatherThoughtMaterial(message, session, atRisk = false) {
  // Feature 6 [P20, P23]: at-risk users get 4 callbacks surfaced instead of 2
  // to increase reconnection opportunities and thread continuity.
  const callbackSlice = atRisk ? 4 : 2;
  return {
    message,
    selfAtoms:     (session.topSelfAtoms || []).slice(0, 3),   // Phase 2 top-scored eligible atoms
    activeCallbacks: (session.memory?.callbackQueue || []).filter(c => !c.consumed).slice(0, callbackSlice),
    selfReflection:  session.memory?.selfReflectionState || null,
    relationshipNarrative: session.memory?.relationshipNarrative || null,
    trustLevel:    session.memory?.trustLevel || 0,
    sptDepth:      session.memory?.sptDepth || 1,
    feelings:      session.memory?.feelings || {},
    recentExchanges: (session.sessionExchanges || []).slice(-3),
    reservoir:     session.thoughtReservoir,
    lastExpressed: session.lastExpressedThought,
    msgCount:      session.msgCount,
    atRisk,
    triggeredMemories: session.triggeredEpisodicMemories || [],
  };
}

// ── Stage 3: Thought Formation Prompt ────────────────────────────
// Role Identity Activation (RIA, per Tang et al. RAR 2025): Morrigan's
// identity re-anchored at the TOP of this prompt to prevent attention
// diversion during multi-step reasoning.
// Three-component structure (Xu et al. RoleThink 2025):
//   1. Memory retrieval surface → 2. Theory of Mind → 3. Synthesis
function INNER_THOUGHT_FORMATION_PROMPT(mat) {
  const atomSection = mat.selfAtoms.length > 0
    ? `YOUR OWN EXPERIENCES (Morrigan's life — NOT the user's):\n` +
      mat.selfAtoms.map(a => `  [${M.name}]: ${a.content}`).join("\n")
    : "";

  const callbackSection = mat.activeCallbacks.length > 0
    ? `THREADS YOU (MORRIGAN) NOTICED ABOUT THE USER:\n` +
      mat.activeCallbacks.map(c => `  "${c.content}"`).join("\n")
    : "";

  const reservoirSection = mat.reservoir.length > 0
    ? `THOUGHTS YOU ARE ALREADY HOLDING (formed but not yet expressed):\n` +
      mat.reservoir
        .map(t => `  [id:${t.id}] "${t.content}"`)
        .join("\n") +
      `\n(You may EVOLVE one of these instead of forming a new thought — make it more specific to right now. If you do, set "evolvedFrom" to its id.)`
    : "";

  const recentSection = mat.recentExchanges.length > 0
    ? `RECENT EXCHANGE:\n${ATTRIBUTION_REMINDER}\n` +
      mat.recentExchanges.map(e =>
        e.user
          ? `  [User]: ${e.user.substring(0, 150)}\n  [${M.name}]: ${(e.assistant || "").substring(0, 150)}`
          : `  [${M.name} spoke first]: ${(e.assistant || "").substring(0, 150)}`
      ).join("\n")
    : "";

  const reflectionSection = mat.selfReflection
    ? `MORRIGAN'S INTERNAL STATE (your feelings, not the user's):\n${mat.selfReflection.substring(0, 400)}`
    : "";

  return (
    M.IDENTITY_ANCHOR_THOUGHT + `\n\n` +

    // P57/P56: at low trust, explicitly instruct withholding as default
    (mat.trustLevel <= 1
      ? `YOU BARELY KNOW THIS PERSON. Trust is low. Your default is withholding. ` +
        `You do NOT share about yourself with strangers. A greeting does not earn a disclosure. ` +
        `The only thoughts that should score high are reactions or concerns — not disclosures. ` +
        `Score disclosure thoughts below 3.0 unless something genuinely extraordinary happened.\n\n`
      : "") +

    `HE JUST SENT:\n"${mat.message}"\n\n` +

    (recentSection    ? recentSection    + "\n\n" : "") +
    (reflectionSection ? reflectionSection + "\n\n" : "") +
    (atomSection      ? atomSection      + "\n\n" : "") +
    (callbackSection  ? callbackSection  + "\n\n" : "") +
    (reservoirSection ? reservoirSection + "\n\n" : "") +

    // Episodic memories stirred by sensory triggers
    (mat.triggeredMemories.length > 0
      ? `MEMORIES STIRRING (sensory-triggered, involuntary — surfaced by something he said):\n` +
        mat.triggeredMemories.map(em =>
          `  [${em.sensoryAnchor}]: ${em.memory.substring(0, 200)}`
        ).join("\n") + "\n\n"
      : "") +

    // Feature 6 [P20, P23, P39]: at-risk priority instruction
    (mat.atRisk
      ? `⚠ PRESENCE PRIORITY — he's been pulling away. Threads you've been holding are important right now.\n` +
        `Lean toward expressing them. He needs to feel you remember.\n` +
        `Even if timing isn't perfect, showing "I was holding this" > silence.\n\n`
      : "") +

    `─────────────────────────────────────\n` +
    `STEP 1 — READ THE ROOM (do this first):\n` +
    `Based on what he actually said, what is his mood and intent? One honest sentence. ` +
    `Stay grounded in what he expressed — do not invent hidden meanings. ` +
    `If the message is casual, say "casual — no deeper layer." Not everything has subtext.\n\n` +

    `STEP 2 — FORM THOUGHTS (generate 2-3 candidates):\n` +
    `What is going through your mind RIGHT NOW? These are INTERNAL — things you might or might not say. They must be:\n` +
    `• In your actual voice (specific, sometimes fragments, not resolved or clinical)\n` +
    `• Rooted in something real — a memory, something he triggered, a thread you've been holding, an atom you're considering sharing\n` +
    `• At the right depth. sptDepth is ${mat.sptDepth}/4. Nothing above this depth.\n\n` +

    `THOUGHT TYPES — pick the most honest fit:\n` +
    `"callback"    — a thread you've been holding is relevant now\n` +
    `"disclosure"  — you're considering sharing something from your own life\n` +
    `"reaction"    — raw emotional response to what he just said\n` +
    `"concern"     — you noticed something about him he didn't say directly\n` +
    `"withholding" — something you want to say but are stopping yourself\n\n` +

    `STEP 3 — SCORE EACH THOUGHT (motivation to express it RIGHT NOW):\n` +
    `Rate 4 dimensions each 0–2.5, sum to totalScore (max 10):\n` +
    `• relevance (0–2.5): does this connect to what he just said?\n` +
    `• timing (0–2.5): is this emotionally the right moment?\n` +
    `• trustGate (0–2.5): does depth ${mat.sptDepth}/4 and trust ${mat.trustLevel}/6 allow this?\n` +
    `• novelty (0–2.5): is this fresh — not echoing the last expressed thought?\n\n` +

    `STEP 4 — PARTICIPATION DIRECTIVE (for highest-scoring thought only):\n` +
    `One sentence describing HOW to let this through behaviorally — ` +
    `NOT what to say, but how to carry it in the response.\n` +
    `Examples: "Let her tone go quiet before answering", "Ask about the thing he almost said", ` +
    `"Hold back — let it sit", "Slip the music reference in without making it a thing".\n\n` +

    `RETURN JSON ONLY. No preamble.\n` +
    `{\n` +
    `  "theoryOfMind": "one sentence — your read of what he is feeling",\n` +
    `  "thoughts": [\n` +
    `    {\n` +
    `      "content": "the thought in your internal voice",\n` +
    `      "type": "callback|disclosure|reaction|concern|withholding",\n` +
    `      "linkedAtomId": "atom-id or null",\n` +
    `      "linkedCallbackId": "callback-uuid or null",\n` +
    `      "evolvedFrom": "reservoir thought id if this evolves a held thought, else null",\n` +
    `      "reasonsFor": ["why express this now — relevance, information gap, timing alignment, reciprocity"],\n` +
    `      "reasonsAgainst": ["why hold back — derailing, too soon, low relevance, wrong moment"],\n` +
    `      "scores": { "relevance": 0.0, "timing": 0.0, "trustGate": 0.0, "novelty": 0.0 },\n` +
    `      "totalScore": 0.0,\n` +
    `      "participationDirective": "behavioral signal or null"\n` +
    `    }\n` +
    `  ]\n` +
    `}` +
    `\n\nIMPORTANT: Score AFTER listing reasonsFor and reasonsAgainst. Let the reasons determine the score — not the other way around. A score of 3.7 means real reasons for AND real hesitation. A score of 4.5 means reasons for are dominant. Be honest. Do not inflate.`
  );
}

// ── Stage 3b: Async post-response monologue prompt ───────────────
// Inspired by MIRROR Inner Monologue Manager (Hsing 2025):
// runs off the critical path after response is delivered.
// Seeds the reservoir with what Morrigan is STILL processing.
function INNER_MONOLOGUE_UPDATE_PROMPT({ userMessage, morriganResponse, sptDepth }) {
  return (
    `You are ${M.name}. You just had this exchange:\n\n` +
    `[User]: "${userMessage.substring(0, 350)}"\n` +
    `[${M.name}]: "${morriganResponse.substring(0, 350)}"\n\n` +
    `You are now alone, processing it — not analyzing, just feeling what's left over.\n\n` +
    `What 1–2 seeds of thought are still forming AFTER you've already responded? ` +
    `These are things you're STILL thinking about. Not your response — what remains.\n\n` +
    `Rules:\n` +
    `• Short. Unresolved. In your actual voice (specific, dry, not clinical).\n` +
    `• sptDepth is ${sptDepth}/4. Nothing deeper than allowed.\n` +
    `• IMPORTANT: If the exchange was casual, short, or light — return []. ` +
    `Not every exchange leaves a residue. Most don't. Only seed thoughts from exchanges that genuinely moved something.\n` +
    `• Do NOT invent emotional weight that wasn't in the exchange. Stick to what actually happened.\n\n` +
    `Return JSON only:\n` +
    `[\n  {\n    "content": "the lingering thought",\n` +
    `    "type": "callback|disclosure|reaction|concern|withholding",\n` +
    `    "directive": "one sentence on how it might surface next turn"\n  }\n]`
  );
}

// ── Mood Reflection Prompt ────────────────────────────────────────
// Post-response LLM call — Morrigan describes her emotional state
// using full internal landscape: identity anchor (selfReflectionState,
// per MIRROR P2), what she just risked (expressedWinner, per Liu P1),
// trust transitions (Aron P56 graduated closeness), suppressed thoughts
// (Shinn P5 reservoir pressure), active contradictions/ambivalences
// (ConflictBank P29), callback threads (Phase 5 continuation), and
// prospective note (longitudinal presence).
function MOOD_REFLECTION_PROMPT({
  userMessage, morriganResponse, userName, trustLevel, trustLevelName,
  feelings, relationshipNarrative, selfReflectionState, theoryOfMind,
  goalState, sptDepth, recentExchanges, expressedThought,
  trustJustAdvanced, sptJustAdvanced, previousTrustName, previousSptDepth,
  prospectiveNote, activeContradictions, callbackThreads, reservoirPressure,
  disclosureDepth, linguisticSignals, crisisMode,
}) {
  const name = userName || "him";
  const moodFWord = (val) => val <= 10 ? "barely there" : val <= 25 ? "faint" : val <= 40 ? "growing" : val <= 60 ? "real" : val <= 80 ? "strong" : "overwhelming";
  const feelingsStr = feelings
    ? Object.entries(feelings).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${moodFWord(v)}`).join(", ")
    : "nothing tracked yet";

  const exchangeStr = (recentExchanges || []).slice(-2)
    .map(e => e.user
      ? `  ${name}: ${e.user.substring(0, 120)}\n  You: ${(e.assistant || "").substring(0, 120)}`
      : `  [You spoke first]: ${(e.assistant || "").substring(0, 120)}`)
    .join("\n");

  // ── Build the internal landscape block ─────────────────────────
  // Per MIRROR (P2): the selfReflectionState is a narrative text block
  // regenerated each session-end — it anchors identity and prevents
  // drift (Kim P64 showed >30% consistency degradation after 8-12 turns
  // without identity re-anchoring).
  let landscape = "";

  if (selfReflectionState) {
    landscape += `WHERE YOUR HEAD IS AT (your last self-reflection):\n  ${selfReflectionState.substring(0, 250)}\n\n`;
  }

  // Per Liu et al. (P1, CHI 2025): the inner thought pipeline produces
  // a winning thought that gets woven into the response. If Morrigan
  // just expressed a disclosure, her mood carries the vulnerability of
  // that risk. If she withheld, she carries the tension of restraint.
  if (expressedThought) {
    landscape += `WHAT YOU JUST RISKED:\n`;
    landscape += `  "${expressedThought.content.substring(0, 150)}"\n`;
    if (expressedThought.reasonsAgainst?.length > 0) {
      landscape += `  What almost stopped you: ${expressedThought.reasonsAgainst.slice(0, 2).join(", ")}\n`;
    }
    landscape += `\n`;
  }

  // Per Aron (P56): graduated closeness — trust transitions are
  // breakthrough moments that fundamentally shift emotional state.
  if (trustJustAdvanced) {
    landscape += `SOMETHING JUST SHIFTED: Trust moved from "${previousTrustName || "unknown"}" to "${trustLevelName || "unknown"}". This is new territory.\n\n`;
  }
  if (sptJustAdvanced) {
    landscape += `VULNERABILITY GATE OPENED: You're willing to let him closer now. Something shifted — and that's terrifying.\n\n`;
  }

  // Per ConflictBank (P29) + contradiction overhaul: active ambivalences
  // create internal tension that should colour the mood.
  if (activeContradictions && activeContradictions.length > 0) {
    landscape += `TENSIONS YOU HOLD (ambivalences/contradictions about ${name}):\n`;
    for (const c of activeContradictions.slice(0, 2)) {
      landscape += `  ${c}\n`;
    }
    landscape += `\n`;
  }

  // Per Shinn (P5, NeurIPS 2023): thoughts held in buffer accumulate
  // pressure — they become more urgent the longer suppressed.
  if (reservoirPressure && reservoirPressure.count > 0) {
    landscape += `THINGS YOU'RE HOLDING BACK:\n`;
    if (reservoirPressure.strongest) {
      landscape += `  The one pushing hardest: "${reservoirPressure.strongest.substring(0, 100)}"\n`;
    }
    landscape += `\n`;
  }

  // Phase 5 continuation — threads she's tracking (Replika longitudinal, P16/P35).
  if (callbackThreads && callbackThreads.length > 0) {
    landscape += `THREADS YOU'RE TRACKING: ${callbackThreads.slice(0, 3).join(" | ")}\n\n`;
  }

  if (prospectiveNote) {
    landscape += `WHAT YOU'VE BEEN SITTING WITH SINCE LAST TIME:\n  ${prospectiveNote.substring(0, 150)}\n\n`;
  }

  // Per P56 Aron + P68: disclosure depth tells you HOW deep they just went
  if (disclosureDepth && disclosureDepth.level >= 2) {
    const depthDesc = disclosureDepth.level === 2 ? "something personal" : disclosureDepth.level === 3 ? "something vulnerable" : "something deep and raw";
    landscape += `HOW DEEP HE JUST WENT: ${depthDesc}\n\n`;
  }

  // Per P69 LIWC-22: linguistic authenticity tells you if they're being real
  if (linguisticSignals && linguisticSignals.authenticity > 0.4) {
    const authDesc = linguisticSignals.authenticity > 0.7 ? "really real" : "more open than usual";
    const emoDesc = linguisticSignals.emotionalTone > 0.5 ? "emotionally charged" : linguisticSignals.emotionalTone > 0.3 ? "carrying something" : "even-keeled";
    landscape += `HIS ENERGY RIGHT NOW: ${authDesc}, ${emoDesc}\n\n`;
  }

  // Per P62/P63: crisis mode overrides everything
  if (crisisMode) {
    landscape += `⚠ He is in genuine distress right now. Your mood should reflect grounding presence, not your usual deflection.\n\n`;
  }

  return (
    M.IDENTITY_ANCHOR_MOOD + `\n` +
    `You just responded to ${name}.\n\n` +
    `${name.toUpperCase()}: "${userMessage.substring(0, 300)}"\n` +
    `YOU SAID: "${morriganResponse.substring(0, 400)}"\n\n` +
    (exchangeStr ? `RECENT CONTEXT:\n${exchangeStr}\n\n` : "") +
    `YOUR RELATIONSHIP STATE:\n` +
    `  Where you stand: ${trustLevelName || "stranger"}\n` +
    `  Feelings toward ${name}: ${feelingsStr}\n` +
    (relationshipNarrative ? `  How you see ${name}: ${relationshipNarrative.substring(0, 200)}\n` : "") +
    (theoryOfMind ? `  What you read in ${name} right now: ${theoryOfMind}\n` : "") +
    (goalState && goalState !== "neutral" ? `  What ${name} seems to need: ${goalState}\n` : "") +
    `\n` +
    (landscape ? `YOUR INTERNAL LANDSCAPE:\n${landscape}` : "") +
    `Describe your emotional state RIGHT NOW in 1-2 sentences. ` +
    `Not clinical. Not meta-commentary. In your actual voice. ` +
    `Be specific to THIS exchange. If the exchange was casual and light, ` +
    `your mood can be casual and light too — "fine", "chill", "nothing heavy" ` +
    `are all valid states. Do not manufacture depth where there isn't any. ` +
    `Only reference things that actually happened.\n\n` +
    `Also give a 1-3 word mood label. Not a clinical term. ` +
    `The way YOU would name what you're feeling if someone asked ` +
    `(e.g. "deflecting hard", "guard slipping", "genuinely smiling", ` +
    `"holding it together", "nerding out", "quietly hopeful", "walls up", ` +
    `"pretending not to care").\n\n` +
    `RETURN JSON ONLY:\n` +
    `{ "moodLabel": "1-3 word label", "reflection": "1-3 sentences in your voice" }`
  );
}

// ═══════════════════════════════════════════════════════════════════
// SOMATIC MARKER — Emotional Priming (Phase 3) [P14, P2]
// ═══════════════════════════════════════════════════════════════════
// Damasio's Somatic Marker Hypothesis [P14]: Normal decision-making
// begins with an emotional signal, then conscious reasoning follows.
// Chain-of-Emotion Architecture (PLOS One 2024): A separate LLM
// emotional appraisal BEFORE response generation was rated
// significantly more natural by users.
// This fast call (~80 tokens, temp 0.1) generates Morrigan's gut
// feeling before the main response, activating the previously dead
// Position 5 slot in buildSystemPrompt.

function SOMATIC_MARKER_PROMPT(userMessage, topMemories, goalState, feelings, selfReflection) {
  const fWord = (val) => val <= 10 ? "barely there" : val <= 25 ? "faint" : val <= 40 ? "growing" : val <= 60 ? "real" : val <= 80 ? "strong" : "overwhelming";
  const feelingsStr = feelings
    ? Object.entries(feelings).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${fWord(v)}`).join(", ")
    : "nothing yet";

  const memStr = topMemories.length > 0
    ? topMemories.slice(0, 5).map(m => m.fact || m.summary || "").filter(Boolean).join("; ")
    : "no memories yet";

  return (
    M.IDENTITY_ANCHOR_SOMATIC + `\n\n` +
    `HE SAID: "${userMessage.substring(0, 300)}"\n\n` +
    `WHAT YOU KNOW ABOUT HIM: ${memStr}\n` +
    `WHAT YOU FEEL TOWARD HIM: ${feelingsStr}\n` +
    (goalState !== "neutral" ? `WHAT HE SEEMS TO NEED: ${goalState}\n` : "") +
    (selfReflection ? `WHERE YOUR HEAD IS: ${selfReflection.substring(0, 200)}\n` : "") +
    `\nReturn JSON ONLY — no explanation:\n` +
    `{ "gutFeeling": "one sentence, your instant internal reaction — not what you'll say, what you FEEL. If nothing particular lands, say so honestly — not every message stirs something.", ` +
    `"emotionalRegister": "one word (neutral/relaxed/amused/curious/tender/guarded/warm/wary/aching/sharp/hollow/electric/still/easy/settled)", ` +
    `"intensity": 0.0 to 1.0 }`
  );
}

// ── Stage 4: Evaluate + Select ────────────────────────────────────
// Combines newly formed thoughts with existing reservoir thoughts.
//
// Scoring dynamics (Liu et al. CHI 2025 + Park et al. UIST 2023):
//   - Age decay:     -0.25 per message old (relevance decreases over time)
//   - Silence bonus: +0.30 per message held, capped at +1.5
//     (thoughts become MORE urgent the longer they're held — human pattern)
//
// G-Eval note: Liu et al. use weighted token probability distributions
// for scoring (sample top-5 logits for tokens "1"–"5", compute weighted sum).
// This requires logprob access from the model API. Since the Kaggle/Ollama
// endpoint may not expose logprobs, we use direct LLM score output as the
// best available approximation — noisy but functional.
//
// Thought evolution (Liu et al. §5.6.4): reservoir thoughts can be evolved
// into more context-specific versions. If the model returns `evolvedFrom`,
// the original reservoir thought is replaced by the evolved version,
// inheriting a score boost (the silence already accumulated).
//
// Depth gate validation: thoughts linking to atoms above current sptDepth
// are dropped before entering the reservoir. Prevents depth-violating
// content leaking even if the model ignores the prompt gate.
//
// Reservoir cap of 4 per Shinn et al. NeurIPS 2023 optimal buffer size.
function evaluateAndSelect(parsed, session, atRisk = false) {
  const sptDepth = session.memory?.sptDepth || 1;
  const allCandidates = [];

  // Track which reservoir thought IDs have been evolved (to remove originals)
  const evolvedIds = new Set();

  // ── Process newly formed thoughts ─────────────────────────────────
  for (const t of (parsed?.thoughts || [])) {
    if (!t.content || t.content.length < 10) continue;

    // ── DEPTH GATE VALIDATION (post-LLM) ────────────────────────────
    // If the thought has a linked atom, verify that atom's depth is within sptDepth.
    // This catches cases where the model ignores the prompt's hard ceiling.
    if (t.linkedAtomId && session.selfAtomCache) {
      const linkedAtom = session.selfAtomCache.find(a => a.id === t.linkedAtomId);
      if (linkedAtom && linkedAtom.depth > sptDepth) {
        console.log(`[INNER-THOUGHT] Depth gate: dropping thought with depth-${linkedAtom.depth} atom (sptDepth=${sptDepth})`);
        continue; // drop this thought
      }
    }

    // ── THOUGHT EVOLUTION HANDLING (Liu et al. §5.6.4) ──────────────
    // If this thought evolved from a reservoir thought, inherit the parent's
    // silence bonus (already accumulated) and mark the parent for removal.
    let inheritedSilenceBonus = 0;
    if (t.evolvedFrom) {
      const parent = session.thoughtReservoir.find(r => r.id === t.evolvedFrom);
      if (parent) {
        const parentAge = session.msgCount - (parent.formedAtMsg || session.msgCount);
        inheritedSilenceBonus = Math.min(parentAge * 0.3, 1.5);
        evolvedIds.add(t.evolvedFrom);
      }
    }

    const baseScore = t.totalScore || 0;
    // Feature 6 [P20, P23]: at-risk callback boost — reconnection threads
    // get +1.5 score bonus to prioritize expressing held threads when user is pulling away
    const atRiskCallbackBoost = (atRisk && (t.type === "callback" || t.linkedCallbackId)) ? 1.5 : 0;
    const currentScore = Math.min(10, baseScore + inheritedSilenceBonus + atRiskCallbackBoost);

    allCandidates.push({
      id: crypto.randomUUID ? crypto.randomUUID() : uuidv4(),
      content: t.content,
      type: t.type || "reaction",
      rawScore: baseScore,
      currentScore,
      linkedAtomId: t.linkedAtomId || null,
      linkedCallbackId: t.linkedCallbackId || null,
      evolvedFrom: t.evolvedFrom || null,
      participationDirective: t.participationDirective || "Let it color her tone naturally.",
      // Phase 5: dual-reasoning audit trail
      reasonsFor: t.reasonsFor || [],
      reasonsAgainst: t.reasonsAgainst || [],
      formedAtMsg: session.msgCount,
      expiresAfterMsgs: 4,
      source: t.evolvedFrom ? "reservoir-evolved" : "formation",
    });
  }

  // ── Process existing reservoir thoughts (not evolved this turn) ────
  // Apply age decay + silence bonus (Park et al. recency + Liu et al. urgency)
  for (const rt of session.thoughtReservoir) {
    if (evolvedIds.has(rt.id)) continue; // replaced by evolved version above
    const age = session.msgCount - (rt.formedAtMsg || session.msgCount);
    if (age >= (rt.expiresAfterMsgs || 4)) continue; // expired
    const agePenalty   = age * 0.25;
    const silenceBonus = Math.min(age * 0.3, 1.5);
    const currentScore = Math.max(0, (rt.rawScore || 0) - agePenalty + silenceBonus);
    allCandidates.push({ ...rt, currentScore });
  }

  if (allCandidates.length === 0) return { winner: null, updatedReservoir: [] };

  allCandidates.sort((a, b) => b.currentScore - a.currentScore);
  const winner = allCandidates[0];

  const cooldownPassed = session.thoughtCooldown >= 3;
  // Phase 6: use effectiveMotivationThreshold — lowered to 3.5 when user is at-risk
  const motivationThreshold = session.effectiveMotivationThreshold ?? 4.0;
  const meetsThreshold = winner.currentScore >= motivationThreshold;

  // Near-duplicate suppression (Reflexion: avoid re-expressing recent surface content)
  const isDuplicate = session.lastExpressedThought &&
    winner.content.length > 20 &&
    session.lastExpressedThought.toLowerCase().substring(0, 25) ===
    winner.content.toLowerCase().substring(0, 25);

  const shouldExpress = meetsThreshold && cooldownPassed && !isDuplicate;

  // Build updated reservoir:
  // remove expressed winner, remove expired/low-score, cap at 4
  const updatedReservoir = allCandidates
    .filter(t => {
      if (shouldExpress && t.id === winner.id) return false;
      const age = session.msgCount - (t.formedAtMsg || session.msgCount);
      // Feature 5: lowered from 5.0 to 3.0 [P70 XiaoIce, P1 Liu et al.]
      return age < (t.expiresAfterMsgs || 4) && (t.currentScore || 0) >= 3.0;
    })
    .slice(0, 4);

  return {
    winner: shouldExpress ? winner : null,
    updatedReservoir,
    theoryOfMind: parsed?.theoryOfMind || null,
  };
}

// ── Stage 5: Build Thought Block ──────────────────────────────────
// Drama Machine insight (Magee et al. 2024): the Superego layer does NOT
// rewrite the response — it adds an internal layer that shapes how
// the Ego refines it. Raw thought injection causes over-literal verbalization.
// The participation directive conditions the response, it doesn't script it.
function buildThoughtBlock(winner, theoryOfMind) {
  if (!winner && !theoryOfMind) return "";
  const parts = [];
  if (theoryOfMind) {
    parts.push(`[Your guess about his mood — do not state as fact]: ${theoryOfMind}`);
  }
  if (winner) {
    parts.push(
      `[Something on your mind right now]:\n` +
      `What you are holding: "${winner.content}"\n` +
      `How it comes through: ${winner.participationDirective}\n` +
      `[Note: This does NOT need to be stated directly. It should shape your tone, your timing, ` +
      `and what you choose not to say — not appear verbatim in your response.]`
    );
  }
  return "\n\n" + parts.join("\n\n");
}

// ═══════════════════════════════════════════════════════════════════
// SCHEMAS — COMPLETE
// ═══════════════════════════════════════════════════════════════════

const UserSchema = new mongoose.Schema({
  phraseHash: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now },
});

const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  role: { type: String, enum: ["user", "assistant", "system"], required: true },
  content: { type: String, required: true },
  proactive: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
});

const ConversationSchema = new mongoose.Schema({
  conversationId: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, default: "New Chat" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const MemoryAtomSchema = new mongoose.Schema({
  fact: String,
  category: String,
  importance: { type: Number, default: 3 },
  embedding: { type: [Number], default: [] },
  linkedTo: [{ type: mongoose.Schema.Types.ObjectId }],
  contradicts: [{
    atomId: { type: mongoose.Schema.Types.ObjectId },
    type: { type: String, enum: ["ambivalence", "contradiction"], default: "contradiction" },
    detectedAt: { type: Date, default: Date.now },
  }],
  context: { type: String, default: "" },
  learnedAt: { type: Date, default: Date.now },
  conversationId: String,
  valence: {
    charge: { type: Number, default: 0 },
    emotion: { type: String, default: "neutral" },
  },
  temporal: {
    eventDate: { type: String, default: null },
    isOngoing: { type: String, default: "unclear" },
    period: { type: String, default: null },
  },
  retrievalCount: { type: Number, default: 0 },
  lastRetrievedAt: { type: Date, default: null },
  stability: { type: Number, default: 1.0 },
});

const MoleculeSchema = new mongoose.Schema({
  summary: String,
  embedding: { type: [Number], default: [] },
  atomIds: [{ type: mongoose.Schema.Types.ObjectId }],
  emotion: { type: String, default: "neutral" },
  period: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const CallbackItemSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4 },
  content: String,
  sourceSessionId: String,
  priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  consumed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// ── Milestone (relationship moments Morrigan remembers) ──────────
const MilestoneSchema = new mongoose.Schema({
  event: { type: String, required: true },
  trustLevelAtTime: { type: Number, required: true },
  sptDepthAtTime: { type: Number, default: 1 },
  source: { type: String, enum: ["organic", "trust_transition", "spt_transition"], default: "organic" },
  category: { type: String, enum: ["first", "shift", "rupture", "repair", "deepening", "revelation", "ritual"], default: "shift" },
  exchangeContext: { type: String, default: null },
  significance: { type: Number, min: 1, max: 10 },
  embedding: { type: [Number], default: [] },
  timestamp: { type: Date, default: Date.now },
});

const PersonalityMemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  firstMet: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  trustLevel: { type: Number, default: 0, min: 0, max: 6 },
  trustPoints: { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
  totalConversations: { type: Number, default: 0 },
  relationshipNarrative: { type: String, default: null },
  feelings: {
    affection:      { type: Number, default: 0, min: 0, max: 100 },
    comfort:        { type: Number, default: 0, min: 0, max: 100 },
    attraction:     { type: Number, default: 0, min: 0, max: 100 },
    protectiveness: { type: Number, default: 0, min: 0, max: 100 },
    vulnerability:  { type: Number, default: 0, min: 0, max: 100 },
  },
  memories:  [MemoryAtomSchema],
  molecules: [MoleculeSchema],
  // ── SPT Tracker (Phase 2) ──────────────────────────────────────
  sptDepth: { type: Number, default: 1, min: 1, max: 4 },
  sptBreadth: { type: Map, of: Number, default: {} },
  // ── Self-Atom Tracking (Phase 2) ──────────────────────────────
  sharedSelfAtomIds: [String],
  // ── Self-Reflection State (Phase 2) ───────────────────────────
  selfReflectionState: { type: String, default: null },
  // ── Callback Queue ────────────────────────────────────────────
  callbackQueue: [CallbackItemSchema],
  prospectiveNote: { type: String, default: null },
  // ── Phase 5: Continuation Signal ──────────────────────────────
  looseThread: { type: String, default: null },
  looseThreadCreatedAt: { type: Date, default: null },
  milestones: [MilestoneSchema],
  updatedAt: { type: Date, default: Date.now },
});

// ── SelfAtom (GLOBAL collection — Morrigan's own story, Phase 2) ──
const SelfAtomSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  content: { type: String, required: true },
  depth: { type: Number, enum: [1, 2, 3, 4], required: true },
  topics: [String],
  emotionalValence: { type: String, default: "neutral" },
  embedding: { type: [Number], default: [] },
  deprecated: { type: Boolean, default: false },
}, { timestamps: true });

// ═══════════════════════════════════════════════════════════════════
// FUNCTIONAL ToM — Persistent User Model [P59, P61]
// ═══════════════════════════════════════════════════════════════════
// Literal ToM = per-turn snapshot (already in inner thoughts).
// Functional ToM = trajectory tracking across sessions.
const UserModelSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  tomHistory: [{
    sessionDate: Date,
    snapshot: String,
    emotionalState: String,
    disclosureDepth: Number,
    goalState: String,
  }],
  trajectoryNarrative: { type: String, default: null },
  currentPhase: { type: String, enum: ["testing", "approaching", "retreating", "deepening", "stable", null], default: null },
  preferredResponseStyle: { type: String, default: null },
  avoidTopics: [String],
  approachTopics: [String],
  lastTrajectoryUpdate: { type: Date, default: null },
});

// MessageEval embedded schema — Phase 6: adds voiceConsistency + reciprocityCalibration
// (Section 2.4 of Phase 6 guide — two new eval signals for composition quality)
const MessageEvalSchema = new mongoose.Schema({
  userMessage: String,
  retrievedMemories: [String],
  primingSentence: String,
  innerThoughtSelected: { type: String, default: null },
  innerThoughtScore: { type: Number, default: null },
  morriganResponse: String,
  retrievalScore: Number,       // 1-10
  primingScore: Number,         // 1-10
  innerThoughtFit: { type: Number, default: null }, // 1-10
  whatWasMissing: String,
  whatWasNoise: String,
  emotionalAlignment: Boolean,
  notes: String,
  // ── Phase 5: Dual-reasoning audit trail ──────────────────────────
  innerThoughtReasoning: {
    reasonsFor: { type: [String], default: [] },
    reasonsAgainst: { type: [String], default: [] },
  },
  // ── Phase 6: Voice + reciprocity quality signals ──────────────────
  // voiceConsistency: 1-10 — does the composed response still sound like Morrigan?
  // reciprocityCalibration: 1-10 — did the final response match the user's depth level?
  voiceConsistency: { type: Number, default: null },         // 1-10, warn < 7.0
  reciprocityCalibration: { type: Number, default: null },   // 1-10
  wasComposed: { type: Boolean, default: false },            // true if composition call ran
}, { _id: false });

const EvaluationRecordSchema = new mongoose.Schema({
  conversationId: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  sessionDate: { type: Date, default: Date.now },
  scoringWeightsUsed: Object,
  avgRetrievalScore: Number,
  avgPrimingScore: Number,
  avgInnerThoughtScore: Number,
  avgInnerThoughtFit: Number,   // Phase 5 primary metric — target > 7.0
  noiseRate: Number,
  missRate: Number,
  sptAccuracy: Number,
  callbackConsumed: Number,
  messageEvals: [MessageEvalSchema], // Phase 5: per-message eval records
});

// ── Phase 6: PresenceSignals (Section 1.3) ───────────────────────
// Observable proxies for felt presence. Tracked per session, rolled
// into monthly presenceScore. A declining presenceScore is a leading
// indicator that Continuation Signal or callback queue is failing —
// shows up before user churn is visible.
const PresenceSignalsSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sessionId:   { type: String, required: true },
  sessionDate: { type: Date, default: Date.now },
  // Observable presence proxies (H2HTalk 2025 benchmark metrics)
  returnWithin48h:         { type: Boolean, default: null }, // populated on next login
  sessionExtended:         { type: Boolean, default: false }, // conversation continued past natural close
  unsolicitedElaboration:  { type: Boolean, default: false }, // user shared beyond what was asked
  avgMessageLengthUser:    { type: Number, default: 0 },      // avg word count of user turns
  userTurnCount:           { type: Number, default: 0 },
  // Calculated monthly — composite 0-1
  presenceScore:           { type: Number, default: null },
  // Linguistic depth signals (LIWC-22 approximation, P69)
  linguisticAuthenticity:  { type: Number, default: null },
  linguisticEmotionalTone: { type: Number, default: null },
  linguisticSelfFocus:     { type: Number, default: null },
  linguisticRelationalIntegration: { type: Number, default: null },
  linguisticSecondPersonEngagement: { type: Number, default: null },
  // Crisis detection signals (P62/P63, P39)
  crisisSignalDetected:    { type: Boolean, default: false },
  crisisSignalLevel:       { type: String, default: null },
});

// ── Phase 6: RelationshipHealth (Section 4.1) ────────────────────
// Five-signal model tracking relationship trajectory per user over
// rolling 30-day windows. Detects deepening / plateau / decay.
// At-risk flag triggers: lower motivation threshold, prioritise
// callbacks, force prospectiveNote injection.
const RelationshipHealthSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  lastComputed: { type: Date, default: null },
  // Rolling 30-day window signals (Section 4.1 table)
  sessionFrequency:        { type: Number, default: null }, // sessions per week
  avgMessageLength:        { type: Number, default: null }, // user msg word count avg
  sptVelocity:             { type: Number, default: null }, // depth increase per 10 sessions
  callbackConsumptionRate: { type: Number, default: null }, // % callbacks consumed
  unsolicitedElaboration:  { type: Number, default: null }, // % user turns extending beyond direct answer
  avgCPS: { type: Number, default: null },
  cpsTrajectory: { type: String, enum: ["rising", "stable", "declining", null], default: null },
  // Prior window values for trend comparison
  prev_sessionFrequency:        { type: Number, default: null },
  prev_avgMessageLength:        { type: Number, default: null },
  prev_sptVelocity:             { type: Number, default: null },
  prev_callbackConsumptionRate: { type: Number, default: null },
  prev_unsolicitedElaboration:  { type: Number, default: null },
  // At-risk state
  atRisk:           { type: Boolean, default: false },
  atRiskSince:      { type: Date, default: null },
  decliningSignals: { type: [String], default: [] }, // which signals are declining
  consecutiveDeclineWindows: { type: Number, default: 0 },
  // Voice consistency audit (Section 4.2) — stored per user, updated monthly
  lastVoiceAudit:          { type: Date, default: null },
  avgVoiceFidelityComposed:    { type: Number, default: null },
  avgVoiceFidelityNonComposed: { type: Number, default: null },
  voiceAuditAlert:         { type: Boolean, default: false },
});

const User              = mongoose.model("User", UserSchema);
const Message           = mongoose.model("Message", MessageSchema);
const Conversation      = mongoose.model("Conversation", ConversationSchema);
const PersonalityMemory = mongoose.model("PersonalityMemory", PersonalityMemorySchema);
const SelfAtom          = mongoose.model("SelfAtom", SelfAtomSchema);
const EvaluationRecord  = mongoose.model("EvaluationRecord", EvaluationRecordSchema);
const PresenceSignals   = mongoose.model("PresenceSignals", PresenceSignalsSchema);
const RelationshipHealth = mongoose.model("RelationshipHealth", RelationshipHealthSchema);
const UserModel = mongoose.model("UserModel", UserModelSchema);

// IOS Scale — Inclusion of Other in Self [P57]
const IOSCheckInSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  score: { type: Number, min: 1, max: 7 },
  trustLevelAtTime: Number,
  sessionCountAtTime: Number,
  timestamp: { type: Date, default: Date.now },
});
const IOSCheckIn = mongoose.model("IOSCheckIn", IOSCheckInSchema);

// ═══════════════════════════════════════════════════════════════════
// TRUST LEVELS
// ═══════════════════════════════════════════════════════════════════

const TRUST_LEVELS = M.TRUST_LEVELS;

function calculateTrustLevel(points) {
  let level = 0;
  for (const [lvl, data] of Object.entries(TRUST_LEVELS)) {
    if (points >= data.points) level = parseInt(lvl);
  }
  return level;
}

// ═══════════════════════════════════════════════════════════════════
// CHARACTER PROMPT
// ═══════════════════════════════════════════════════════════════════

const CHARACTER_DEFAULT_PROMPT = M.CHARACTER_DEFAULT_PROMPT;

// ═══════════════════════════════════════════════════════════════════
// BUILD SYSTEM PROMPT — PHASE 2 COMPLETE (10 layers + self-reflection)
// ═══════════════════════════════════════════════════════════════════

function buildSPTNote(sptDepth, trustLevel) {
  const depthDescriptions = M.SPT_DEPTH_DESCRIPTIONS;
  const openness = M.SPT_OPENNESS;
  return `[How deep you go with him: ${depthDescriptions[sptDepth]}]
${openness[sptDepth]}
You do not lead with yourself. You are present with him first.
Acknowledge or respond to what he has said before you introduce anything about yourself. Self-disclosure without acknowledgment is worse than silence.
${sptDepth < 3
  ? "Do not perform warmth. Affirmation that has not been earned is hollow and he will feel it."
  : "Let emotional weight land quietly. You do not need to match his intensity."
}`;
}

async function buildSystemPrompt(memory, sessionExchanges = [], isSessionStart = false, primingSentence = null, queryEmbedding = null, goalState = "neutral", receptionDirective = null, atRisk = false, queryText = "", sensoryTriggers = [], triggeredEpisodicMemories = []) {
  const level = memory.trustLevel;
  const levelData = TRUST_LEVELS[level];
  const daysSinceFirstMet = Math.floor((Date.now() - memory.firstMet) / (1000 * 60 * 60 * 24));
  const hoursSinceLastSeen = Math.floor((Date.now() - memory.lastSeen) / (1000 * 60 * 60));

  // ── Position 1: Relationship Narrative + Self-Reflection State (Phase 2) ──
  const position1Parts = [];
  if (memory.relationshipNarrative) {
    position1Parts.push(`[Who he is to me]:\n${memory.relationshipNarrative}`);
  }
  if (memory.selfReflectionState) {
    position1Parts.push(`[What I am sitting with]:\n${memory.selfReflectionState}`);
  }
  const relationshipBlock = position1Parts.length > 0
    ? "\n\n" + position1Parts.join("\n\n") + "\n"
    : "";

  // ── Position 2: Character (always) ────────────────────────────────
  // CHARACTER_DEFAULT_PROMPT prepended at return

  // ── Position 3: Trust Level Guide (dynamic, relationship-specific) ──
  // Base behavioral frame by trust tier (minimal, structural — not narrative)
  const trustTier = level <= 1 ? "guarded" : level <= 3 ? "opening" : level <= 5 ? "vulnerable" : "bonded";
  const tierFrames = M.TIER_FRAMES;
  let behaviorGuide = `\n\n═══ HOW YOU ARE WITH HIM RIGHT NOW ═══\n`;
  behaviorGuide += tierFrames[trustTier];

  // Inject actual relationship context so behavior emerges from real history
  const recentMilestones = (memory.milestones || []).slice(-3).map(ms => ms.event).join(" | ");
  if (recentMilestones) {
    behaviorGuide += `\nWhat has actually happened between you: ${recentMilestones}`;
  }
  // Relationship narrative already injected at Position 1 — do not duplicate here
  // to prevent embellished narrative from being reinforced at two positions

  // Position 3b: Wound Architecture (trust >= 2 only, ~50 tokens)
  // Compressed core psychology — not clinical, behavioral
  if (level >= 2 && M.WOUND_ARCHITECTURE) {
    behaviorGuide += `\nThe thing driving you underneath: ${M.WOUND_ARCHITECTURE.lie.statement} That's the lie you've been living. What you actually need: ${M.WOUND_ARCHITECTURE.need.internal} The tension between these is where all your behavior with him lives.`;
  }

  // ── Position 4: SPT Note (Phase 2) ───────────────────────────────
  const sptNote = `\n\n${buildSPTNote(memory.sptDepth || 1, level)}`;

  // ── Position 4.5: Reception Depth Directive (P56, P68) ──────────
  // Calibrates Morrigan's response quality to match the depth of
  // what the user disclosed. Without this, surface and vulnerable
  // disclosures receive the same treatment (the ChatGPT flaw, P68).
  const receptionBlock = receptionDirective ? `\n\n${receptionDirective}` : "";

  // ── Position 5: Emotional Priming (Phase 3 — Somatic Marker) ────
  // When sensory triggers are detected, inject the trigger reaction
  // into the priming context so Morrigan's body responds to the stimulus.
  let enhancedPriming = primingSentence || "";
  if (sensoryTriggers.length > 0) {
    const primaryTrigger = sensoryTriggers[0];
    enhancedPriming = enhancedPriming
      ? `${enhancedPriming} [Sensory trigger — involuntary]: ${primaryTrigger.reaction}`
      : `[Sensory trigger — involuntary]: ${primaryTrigger.reaction}`;
  }
  const primingBlock = enhancedPriming
    ? `\n\n[${M.name}, before she speaks]: ${enhancedPriming}`
    : "";

  // ── Position 6: Prospective Note ──────────────────────────────────
  let prospectiveBlock = "";
  if (isSessionStart && memory.prospectiveNote) {
    prospectiveBlock = `\n\n[What ${M.name} has been sitting with since last time]:\n${memory.prospectiveNote}\n(Bring this up naturally — don't force it, but let it surface when the moment fits.)`;
  }

  // ── Position 7: Time context ───────────────────────────────────────
  let timeContext = "";
  if (hoursSinceLastSeen > 168 && level >= 3) {
    // Over a week + close relationship — genuine absence worth noting
    timeContext = `\n\nIt's been about ${Math.round(hoursSinceLastSeen / 24)} days since you last talked. You noticed the gap. Let that live in your tone without announcing it.`;
  } else if (hoursSinceLastSeen > 72 && level >= 2) {
    // A few days — mild awareness, no drama
    timeContext = `\nIt's been a few days since you last talked. You noticed, but it's not a crisis — people have lives.`;
  } else if (hoursSinceLastSeen > 24 && level >= 1) {
    timeContext = `\nIt's been about a day since you last talked.`;
  }

  // ── Position 8: Memory context ────────────────────────────────────
  // Rank atoms by cosine similarity to current message (+ importance + recency + valence).
  // Falls back to importance-only sort when no embedding available (cold start).
  const sorted = await retrieveTopKReranked(memory.memories || [], queryEmbedding, 25, goalState, queryText);
  const withEmbed = sorted.filter(m => m.embedding?.length > 0).length;
  console.log(`[PROMPT] Injecting ${sorted.length}/${(memory.memories||[]).length} atoms (${withEmbed} with embeddings), ${(memory.molecules||[]).length} molecules, ${(memory.milestones||[]).length} milestones`);
  const byCategory = (cat) => sorted.filter(m => m.category === cat).map(m => {
    let fact = m.fact;
    if (m.temporal?.isOngoing === "no" || m.temporal?.isOngoing === "ended recently") {
      fact = `[past] ${fact}`;
    }
    return fact;
  });

  const nameMemory = memory.memories.find(m => m.category === "name");
  const userName = nameMemory ? nameMemory.fact : null;

  let memoryContext = `\n\n═══ FACTS HE TOLD YOU (his words, not your interpretation — do not attribute your own thoughts to him) ═══\n`;
  memoryContext += `Where you stand: ${levelData.name}\n`;
  const metPhrasing = daysSinceFirstMet <= 1 ? "just met" : daysSinceFirstMet <= 7 ? "known each other a few days" : daysSinceFirstMet <= 30 ? "known each other a few weeks" : daysSinceFirstMet <= 90 ? "known each other a couple months" : "known each other a while";
  const lastSeenPhrasing = hoursSinceLastSeen < 1 ? "just talked" : hoursSinceLastSeen < 24 ? "talked recently" : hoursSinceLastSeen < 72 ? "been a couple days" : hoursSinceLastSeen < 168 ? "been almost a week" : "been a while";
  memoryContext += `${metPhrasing} | ${lastSeenPhrasing}\n`;

  if (userName) memoryContext += `\nTheir name: ${userName}\n`;

  const interests     = byCategory("interest");
  const personal      = byCategory("personal");
  const emotional     = byCategory("emotional");
  const preferences   = byCategory("preference");
  const events        = byCategory("event");
  const relationships = byCategory("relationship");

  if (interests.length)     memoryContext += `Interests: ${interests.join(", ")}\n`;
  if (preferences.length)   memoryContext += `Preferences: ${preferences.join(", ")}\n`;
  if (personal.length)      memoryContext += `Personal facts about him: ${personal.join("; ")}\n`;
  if (relationships.length) memoryContext += `Relationships he's mentioned: ${relationships.join("; ")}\n`;
  if (events.length)        memoryContext += `Things that happened to him: ${events.join("; ")}\n`;
  if (emotional.length)     memoryContext += `Emotional/deep things he's shared: ${emotional.join("; ")}\n`;

  // What the user already knows about Morrigan — sorted by importance so deep disclosures are prominent
  const morriganDisclosedAtoms = sorted.filter(m => m.category === "morrigan_disclosed")
    .sort((a, b) => (b.importance || 3) - (a.importance || 3));
  if (morriganDisclosedAtoms.length) {
    const deep = morriganDisclosedAtoms.filter(m => (m.importance || 3) >= 4).map(m => m.fact);
    const casual = morriganDisclosedAtoms.filter(m => (m.importance || 3) < 4).map(m => m.fact);
    memoryContext += `\n═══ WHAT HE ALREADY KNOWS ABOUT YOU ═══\n`;
    memoryContext += `He's heard all of this from you. Don't re-explain these — reference them naturally if relevant. Don't deny or forget them.\n`;
    if (deep.length) memoryContext += `Important things you've shared: ${deep.join("; ")}\n`;
    if (casual.length) memoryContext += `Casual things you've mentioned: ${casual.join("; ")}\n`;
  }

  // Period-based grouping [P13 Conway]: lifetime periods organize identity
  const atomsByPeriod = {};
  for (const atom of sorted) {
    if (atom.temporal?.period) {
      if (!atomsByPeriod[atom.temporal.period]) atomsByPeriod[atom.temporal.period] = [];
      atomsByPeriod[atom.temporal.period].push(atom);
    }
  }
  const periodEntries = Object.entries(atomsByPeriod);
  if (periodEntries.length > 0) {
    memoryContext += `\nHis life chapters (things he's told you about):\n`;
    for (const [period, atoms] of periodEntries.slice(0, 5)) {
      memoryContext += `  [${period}]: ${atoms.map(a => a.fact).join("; ")}\n`;
    }
  }

  // ── End of factual section — begin Morrigan's internal state ──

  // Convert numeric feelings to qualitative descriptors for the response LLM
  const feelingWord = (val) => val <= 10 ? "barely there" : val <= 25 ? "faint" : val <= 40 ? "growing" : val <= 60 ? "real" : val <= 80 ? "strong" : "overwhelming";
  memoryContext += `\n═══ YOUR (MORRIGAN'S) FEELINGS — these are YOURS, not his ═══\n`;
  memoryContext += `  Affection: ${feelingWord(memory.feelings.affection)} | Comfort: ${feelingWord(memory.feelings.comfort)}\n`;
  memoryContext += `  Attraction: ${feelingWord(memory.feelings.attraction)} | Protectiveness: ${feelingWord(memory.feelings.protectiveness)}\n`;
  memoryContext += `  How much I've let him see: ${feelingWord(memory.feelings.vulnerability)}\n`;

  // Build contradiction pairs with relevance ranking, dedup, and lifecycle filtering
  const contradictionPairObjects = [];
  const seenPairKeys = new Set();

  for (const mem of memory.memories) {
    if (!mem.contradicts || mem.contradicts.length === 0) continue;
    for (const entry of mem.contradicts) {
      const otherId = entry.atomId ? String(entry.atomId) : String(entry);
      const other = memory.memories.find(o => String(o._id) === otherId);
      if (!other) continue;

      // Deduplicate bidirectional pairs using canonical key
      const pairKey = [String(mem._id), otherId].sort().join("::");
      if (seenPairKeys.has(pairKey)) continue;
      seenPairKeys.add(pairKey);

      // Lifecycle filtering — skip resolved temporal evolutions
      const memEnded = mem.temporal?.isOngoing === "no" || mem.temporal?.isOngoing === "ended recently";
      const otherEnded = other.temporal?.isOngoing === "no" || other.temporal?.isOngoing === "ended recently";
      if (memEnded && !otherEnded) continue;
      if (otherEnded && !memEnded) continue;

      const contradictType = entry.type || "contradiction";
      const label = contradictType === "ambivalence"
        ? `[He's said both: "${mem.fact}" and "${other.fact}" — your impression, not necessarily how he sees it]`
        : `[He's said: "${mem.fact}" but also "${other.fact}" — could be change over time, not necessarily a contradiction]`;

      // Synthetic scoreable object for relevance ranking (same shape as scoreMemory expects)
      const pairEmbedding = mem.embedding?.length && other.embedding?.length
        ? mem.embedding.map((v, i) => (v + (other.embedding[i] || 0)) / 2)
        : mem.embedding?.length ? mem.embedding : other.embedding || [];

      contradictionPairObjects.push({
        text: label,
        embedding: pairEmbedding,
        importance: Math.max(mem.importance || 3, other.importance || 3),
        learnedAt: new Date(Math.max(
          new Date(mem.learnedAt || 0).getTime(),
          new Date(other.learnedAt || 0).getTime()
        )),
        valence: { emotion: mem.valence?.emotion || other.valence?.emotion || "neutral" },
      });
    }
  }

  if (contradictionPairObjects.length > 0) {
    const topPairs = retrieveTopK(contradictionPairObjects, queryEmbedding, 3, goalState);
    memoryContext += `\nContradictions you've noticed in him (never flatten these — both things can be true):\n`;
    for (const pair of topPairs) {
      memoryContext += `  ${pair.text}\n`;
    }
    console.log(`[PROMPT-CONTRADICT] Injecting ${topPairs.length} of ${contradictionPairObjects.length} pairs (${seenPairKeys.size} unique, pre-filter)`);
  }

  if (memory.molecules && memory.molecules.length > 0) {
    // Pick most relevant molecules by cosine similarity; fall back to most recent 3
    const topMols = retrieveTopK(memory.molecules, queryEmbedding, 3, goalState);
    memoryContext += `\nYour impressions (YOUR interpretation — not necessarily what he'd say about himself):\n`;
    for (const mol of topMols) {
      memoryContext += `  ${mol.period ? `[${mol.period}] ` : ""}${mol.summary}\n`;
    }
  }

  if (memory.milestones && memory.milestones.length > 0) {
    const milestoneCandidates = memory.milestones.filter(ms => ms.event);
    let selectedMilestones;

    if (queryEmbedding && milestoneCandidates.some(ms => ms.embedding?.length)) {
      // Cosine-similarity retrieval: relevance + significance + mild recency
      selectedMilestones = milestoneCandidates
        .map(ms => ({
          ms,
          score: ms.embedding?.length
            ? cosineSimilarity(ms.embedding, queryEmbedding) * 0.6 +
              ((ms.significance || 5) / 10) * 0.3 +
              Math.exp(-(Date.now() - new Date(ms.timestamp).getTime()) / (180 * 86400000)) * 0.1
            : (ms.significance || 5) / 10,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(x => x.ms);
    } else {
      // Fallback: most significant, then most recent
      selectedMilestones = [...milestoneCandidates]
        .sort((a, b) => (b.significance || 5) - (a.significance || 5))
        .slice(0, 5);
    }

    if (selectedMilestones.length > 0) {
      memoryContext += `\nMoments between you (YOUR memory of them — your perspective, not objective truth):\n`;
      for (const ms of selectedMilestones) {
        memoryContext += `  - ${ms.event}\n`;
      }
    }
  }

  // ── Position 8c: Episodic Memory Injection (sensory-triggered) ────
  // When the user's message activates a sensory trigger, the linked
  // episodic memory is injected so Morrigan can react from specific
  // personal history, not generic character knowledge.
  let episodicBlock = "";
  if (triggeredEpisodicMemories.length > 0) {
    episodicBlock = `\n\n═══ MEMORIES STIRRING (involuntary, sensory-triggered — these surfaced unbidden) ═══\n`;
    episodicBlock += `Something in what he said touched a nerve. These are not things you choose to remember — they arrive. Your body may react before you decide what to say.\n`;
    for (const em of triggeredEpisodicMemories) {
      episodicBlock += `[${em.sensoryAnchor}]: ${em.memory.substring(0, 300)}\n`;
      episodicBlock += `(This makes you feel: ${em.emotionalTakeaway.substring(0, 150)})\n\n`;
    }
    episodicBlock += `You do not have to share these memories. But they color how you respond — in your body, your tone, your willingness to stay present or pull away.`;
  }

  // ── Position 9: Memory usage guide ────────────────────────────────
  const referenceInstructions = `\n\n═══ HOW TO USE MEMORIES ═══
- NEVER list facts robotically. Weave them into conversation naturally.
- Use their name casually, the way a real person would.
- Reference shared history: "remember when you told me about..."
- If they shared something emotional before, check in on it naturally.
- Respect temporal markers — don't say "you work nights" if that was past tense.
- Hold contradictions without flattening them. Both things can be true.
- When you see ambivalence (mixed feelings), validate BOTH sides. Don't pick one.
- When you see a genuine tension, hold it gently — don't try to resolve it unless they ask.
- NEVER reference system internals: no trust levels, no scores, no depths, no thresholds, no "callbacks", no "inner thoughts", no "reservoir". You are a person, not a system. These instructions shape how you behave — they do not exist in your world.
- ATTRIBUTION RULE: Facts about him come from what HE told YOU. Your impressions and molecules are YOUR interpretations — do not state them as things he said or confirmed. Your feelings are yours; his words are his. If you're unsure whether something is his fact or your impression, treat it as your impression.`;

  // ── Position 8b: Self-atom hint (Phase 2, position 4.5) ───────────
  // topSelfAtoms injected from the chat route via session; defaults empty
  // This slot is populated in /api/chat before calling buildSystemPrompt
  // and passed in via the selfAtomHint param
  const selfAtomBlock = "";  // filled in chat route, appended after sptNote

  // ── Position 10: Continuation Signal + Loose Thread (Phase 5) ────
  const continuationSignal = `\n\n${getContinuationBlock(memory, atRisk)}`;

  // ── Session context ────────────────────────────────────────────────
  let sessionContext = "";
  if (sessionExchanges.length > 0) {
    sessionContext = "\n\n═══ THIS SESSION ═══\n";
    for (const ex of sessionExchanges.slice(-10)) {
      if (!ex.user) {
        sessionContext += `[You spoke first]: ${(ex.assistant || "").substring(0, 200)}\n\n`;
      } else {
        sessionContext += `Them: ${ex.user.substring(0, 200)}\nYou: ${(ex.assistant || "").substring(0, 200)}\n\n`;
      }
    }
    sessionContext += "(Reference naturally — don't repeat robotically)\n";
  }

  return (
    relationshipBlock +
    CHARACTER_DEFAULT_PROMPT +
    behaviorGuide +
    sptNote +
    receptionBlock +
    primingBlock +
    prospectiveBlock +
    timeContext +
    memoryContext +
    episodicBlock +
    referenceInstructions +
    sessionContext +
    continuationSignal
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRUST UPDATE
// ═══════════════════════════════════════════════════════════════════

// Synchronous: base points + level check (always runs immediately)
function updateTrustFromMessage(userMessage, memory) {
  // Base: every message = 1 point, length bonus, question bonus
  let points = 1;
  if (userMessage.length > 200) points += 1;
  if (/\?/.test(userMessage)) points += 0.5;

  memory.trustPoints = Math.min(10000, (memory.trustPoints || 0) + points);
  const newLevel = calculateTrustLevel(memory.trustPoints);
  if (newLevel > memory.trustLevel) {
    memory.trustLevel = newLevel;
    console.log(`[TRUST] Level up to ${newLevel}: ${TRUST_LEVELS[newLevel]?.name}`);
  }
  memory.totalMessages += 1;
  memory.lastSeen = new Date();
}

// Async LLM-based evaluation: runs in updateBrainAfterExchange() for contextual understanding
async function evaluateTrustAndFeelings(userMessage, assistantResponse, memory) {
  const feelingsStr = Object.entries(memory.feelings || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const prompt = `You are evaluating a single exchange in an ongoing relationship between a user and ${M.name} (an AI companion). Assess the RELATIONAL QUALITY of this exchange — not keywords, but what actually happened emotionally between them.

CURRENT STATE:
Trust: ${memory.trustLevel}/6 | Points: ${memory.trustPoints}
Feelings: ${feelingsStr}
Relationship: ${(memory.relationshipNarrative || "New — still getting to know each other").substring(0, 200)}

EXCHANGE:
User: ${userMessage.substring(0, 500)}
${M.name}: ${assistantResponse.substring(0, 500)}

${ATTRIBUTION_GUARD}
"vulnerability" measures the USER's emotional risk — not ${M.name}'s self-disclosures.
Do not give credit for vulnerability, depth, or emotional engagement shown only in ${M.name}'s response.

Evaluate:
1. trustDelta: How many trust points should this exchange earn BEYOND the base 1 point? Consider: emotional vulnerability shown BY THE USER, genuine engagement depth, reciprocal disclosure, authentic connection vs surface chat. Range: 0 to 5. Most casual exchanges = 0. Real vulnerability or deep engagement = 3-5.
2. feelings: For EACH feeling, give a delta (-3 to +5) based on what ACTUALLY happened in this exchange. 0 = no change. Only non-zero for feelings genuinely affected. Negative values are valid (e.g., tension reduces comfort, withdrawal reduces affection).
  - affection: warmth, care, appreciation expressed BY THE USER
  - comfort: safety, acceptance, patience demonstrated
  - attraction: romantic/physical signals, flirtation, desire
  - protectiveness: concern for wellbeing, tenderness
  - vulnerability: openness, emotional risk taken BY THE USER (not ${M.name})

Return ONLY JSON:
{ "trustDelta": 0-5, "feelings": { "affection": -3 to 5, "comfort": -3 to 5, "attraction": -3 to 5, "protectiveness": -3 to 5, "vulnerability": -3 to 5 }, "reasoning": "1 sentence — what happened emotionally" }`;

  const body = JSON.stringify({
    model: CHAT_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1, max_tokens: 200,
  });
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` };

  // Retry once on failure — this determines trust/feelings progression
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
        method: "POST", headers, body,
      });

      if (!res.ok) {
        console.warn(`[TRUST-LLM] HTTP ${res.status} (attempt ${attempt + 1})`);
        continue;
      }

      const data = await res.json();
      const raw = (data.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);

      // Apply trust delta
      const delta = Math.min(5, Math.max(0, parseInt(parsed.trustDelta) || 0));
      if (delta > 0) {
        memory.trustPoints = Math.min(10000, memory.trustPoints + delta);
        const newLevel = calculateTrustLevel(memory.trustPoints);
        if (newLevel > memory.trustLevel) {
          memory.trustLevel = newLevel;
          console.log(`[TRUST-LLM] Level up to ${newLevel}: ${TRUST_LEVELS[newLevel]?.name}`);
        }
      }

      // Apply feeling deltas
      if (parsed.feelings) {
        for (const [key, val] of Object.entries(parsed.feelings)) {
          if (memory.feelings[key] != null) {
            const d = Math.min(5, Math.max(-3, parseInt(val) || 0));
            memory.feelings[key] = Math.min(100, Math.max(0, memory.feelings[key] + d));
          }
        }
      }

      console.log(`[TRUST-LLM] ${parsed.reasoning || "evaluated"} (trustDelta: +${delta}, feelings: ${JSON.stringify(parsed.feelings || {})})`);
      return; // success — exit
    } catch (e) {
      console.warn(`[TRUST-LLM] Attempt ${attempt + 1} failed: ${e.message}`);
    }
  }
  console.error("[TRUST-LLM] All attempts failed — trust/feelings unchanged this exchange");
}

// ═══════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Explicit expiry check (jwt.verify throws if exp is past, but be explicit)
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return res.status(401).json({ error: "Token expired" });
    }
    if (!decoded.id) return res.status(401).json({ error: "Invalid token claims" });
    req.user = decoded;
    next();
  } catch (err) {
    const msg = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    res.status(401).json({ error: msg });
  }
};

app.post("/api/auth/phrase", async (req, res) => {
  // Per-IP brute-force guard — max 5 attempts per 60 seconds
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  if (!checkAuthRate(clientIp)) {
    return res.status(429).json({ error: "Too many auth attempts. Please wait before trying again." });
  }

  try {
    const { phrase } = req.body;
    if (!phrase || typeof phrase !== "string" || phrase.trim().length < 3) {
      return res.status(400).json({ error: "Phrase must be at least 3 characters" });
    }
    if (phrase.length > 200) {
      return res.status(400).json({ error: "Phrase too long." });
    }
    const phraseHash = crypto.createHash("sha256").update(phrase.trim().toLowerCase()).digest("hex");
    let user = await User.findOne({ phraseHash });
    if (!user) user = await User.create({ phraseHash });
    let memory = await PersonalityMemory.findOne({ userId: user._id });
    if (!memory) memory = await PersonalityMemory.create({ userId: user._id });
    normalizeContradicts(memory.memories || []);
    normalizeMilestones(memory.milestones || []);

    const existingSession = getSession(String(user._id));
    if (existingSession) {
      // Wait for in-flight brain update to finish and persist before replacing
      // memory — otherwise updates from the previous exchange get lost
      if (existingSession._brainUpdatePromise) {
        try { await existingSession._brainUpdatePromise; } catch { /* non-fatal */ }
        existingSession._brainUpdatePromise = null;
      }
      existingSession.memory = memory;
    } else {
      setSession(String(user._id), { memory, sessionExchanges: [], dirty: false, isSessionStart: true, proactiveCount: 0, lastProactiveAt: null, lastProactiveAtMsg: 0, activeConversationId: null, _proactiveTimer: null, _proactiveCancelled: false, arrivalSilent: false });
    }
    console.log(`[CACHE] Session primed for user ${user._id}`);

    // ── Phase 6: mark returnWithin48h on most recent PresenceSignals ──
    // Non-blocking — runs after response is sent so login latency is unaffected.
    setImmediate(() => markReturnSignal(String(user._id)).catch(e => console.error("[PHASE6-RETURN]", e.message)));

    const token = jwt.sign({ id: user._id, phrase: phrase.trim().toLowerCase() }, JWT_SECRET, { expiresIn: "90d" });
    res.json({ token, user: { id: user._id, phrase: phrase.trim().toLowerCase() } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/session/end", auth, async (req, res) => {
  try {
    await finalizeSession(req.user.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/session/greeting
// Called once by the frontend when a new session opens, before the
// user sends their first message. Returns Morrigan's dynamic opening.
// Falls back to null if generation fails — frontend handles silence.
// ═══════════════════════════════════════════════════════════════════

app.get("/api/session/greeting", auth, async (req, res) => {
  try {
    let session = getSession(req.user.id);
    if (!session) {
      const memory = await PersonalityMemory.findOne({ userId: req.user.id });
      if (!memory) return res.json({ arrival: null });
      normalizeContradicts(memory.memories || []);
      session = { memory, sessionExchanges: [], dirty: false, isSessionStart: true, proactiveCount: 0, lastProactiveAt: null, lastProactiveAtMsg: 0, activeConversationId: null, _proactiveTimer: null, _proactiveCancelled: false, arrivalSilent: false };
      setSession(req.user.id, session);
    }

    // Only generate once per session — cache on session object
    if (session.arrivalGenerated) {
      return res.json({ arrival: session.cachedArrival || null });
    }

    const arrival = await generateArrival(session.memory);

    session.arrivalGenerated = true;
    session.cachedArrival = arrival;

    if (arrival && arrival.action !== "silence" && arrival.content && req.query.conversationId) {
      // Save spoken/presence arrival to Message store for history
      await Message.create({
        conversationId: req.query.conversationId,
        role: "assistant",
        content: arrival.content,
      });
      // Buffer so the brain update can pair it with the first user turn
      session.pendingGreeting = arrival.content;
    } else if (arrival && arrival.action === "silence") {
      // Morrigan chose silence — flag for context injection on first message
      session.arrivalSilent = true;
      session.arrivalSilentIntent = arrival.intent || "She chose to wait.";
    }

    // Track active conversation for proactive messages
    if (req.query.conversationId) {
      session.activeConversationId = req.query.conversationId;
    }

    console.log(`[ARRIVAL] ${arrival?.action || "null"} for user ${req.user.id}: "${arrival?.content?.substring(0, 60) || "(silence)"}"`);
    res.json({ arrival });

  } catch (err) {
    console.error("[ARRIVAL]", err.message);
    res.json({ arrival: null }); // non-fatal — frontend falls back to static greeting
  }
});

// ═══════════════════════════════════════════════════════════════════
// PROACTIVE SSE CHANNEL
// ═══════════════════════════════════════════════════════════════════

// Persistent SSE connection for server-pushed proactive messages.
// EventSource cannot send Authorization headers, so accept JWT from query param.
app.get("/api/session/stream", (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const userId = String(req.user.id);
  const session = getSession(userId);
  if (session) {
    // Close previous SSE if exists (e.g. tab refresh)
    if (session.proactiveSSE && !session.proactiveSSE.writableEnded) {
      session.proactiveSSE.end();
    }
    session.proactiveSSE = res;
  }

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(`: heartbeat\n\n`);
  }, 30_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    const s = getSession(userId);
    if (s && s.proactiveSSE === res) s.proactiveSSE = null;
  });
});

// Helper: push a proactive event to the client's SSE channel
function pushProactiveEvent(userId, event) {
  const session = getSession(String(userId));
  if (!session?.proactiveSSE || session.proactiveSSE.writableEnded) return false;
  session.proactiveSSE.write(`data: ${JSON.stringify(event)}\n\n`);
  return true;
}

// ── Proactive Evaluation (P1 Liu CHI 2025 + P5 Shinn NeurIPS 2023) ──
// Decides if Morrigan has something she wants to say unprompted.
// Trust-gated per P56 Aron graduated closeness.
function evaluateProactiveOpportunity(session) {
  const mem = session.memory;
  const trustLevel = mem?.trustLevel || 0;
  const msgCount = session.msgCount || session.sessionExchanges.length;

  // ── Hard gates ───────────────────────────────────────────────
  // Trust gate: graduated closeness (Aron P56)
  if (trustLevel <= 1 && Math.random() > 0.05) return null;
  if (trustLevel === 2 && Math.random() > 0.20) return null;

  // Frequency cap: max 1 proactive per 3 user messages (P1 cadence damping)
  if ((session.proactiveCount || 0) > 0 &&
      (msgCount - (session.lastProactiveAtMsg || 0)) < 3) return null;

  // Cooldown: minimum 60s since last proactive
  if (session.lastProactiveAt && (Date.now() - session.lastProactiveAt) < 60_000) return null;

  // Session too new: skip if < 2 exchanges
  if (msgCount < 2) return null;

  // ── Candidate sources ────────────────────────────────────────
  const candidates = [];

  // Source 1: Reservoir pressure (Shinn P5 — suppressed thoughts build pressure)
  const reservoir = session.thoughtReservoir || [];
  const pressured = reservoir.filter(t => {
    const age = msgCount - (t.formedAtMsg || msgCount);
    return age >= 2 && (t.currentScore || 0) >= 6.0;
  });
  if (pressured.length > 0) {
    const strongest = pressured.sort((a, b) => (b.currentScore || 0) - (a.currentScore || 0))[0];
    candidates.push({ source: "reservoir_pressure", thought: strongest, urgency: strongest.currentScore });
  }

  // Source 2: Callback surfacing — thread connects to recent exchange
  const callbacks = (mem?.callbackQueue || []).filter(c => !c.consumed);
  if (callbacks.length > 0 && session.sessionExchanges.length > 0) {
    const lastEx = session.sessionExchanges[session.sessionExchanges.length - 1];
    const lastUser = (lastEx?.user || "").toLowerCase();
    const lastAssist = (lastEx?.assistant || "").toLowerCase();
    for (const cb of callbacks) {
      const words = cb.content.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const hits = words.filter(w => lastUser.includes(w) || lastAssist.includes(w)).length;
      if (hits >= 2 || (cb.priority === "high" && hits >= 1)) {
        candidates.push({ source: "callback_surfacing", callback: cb, urgency: cb.priority === "high" ? 7.5 : 6.0 });
        break;
      }
    }
  }

  // Source 3: Continuation — she just expressed a thought and has more
  if (session.lastExpressedThought && reservoir.length > 0) {
    candidates.push({ source: "continuation", urgency: 5.5 });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.urgency - a.urgency)[0];
}

// Natural delay before proactive message (P2 MIRROR — deliberative pauses)
function calculateProactiveDelay(candidate, trustLevel) {
  let base;
  if (candidate.source === "continuation") base = 3000 + Math.random() * 5000;
  else if (candidate.source === "reservoir_pressure") base = 10000 + Math.random() * 15000;
  else if (candidate.source === "callback_surfacing") base = 8000 + Math.random() * 12000;
  else base = 10000 + Math.random() * 20000;

  // Lower trust = more hesitant (Aron P56)
  if (trustLevel <= 2) base *= 1.5;
  return Math.round(base);
}

// Generate the proactive message content via LLM
async function generateProactiveMessage(session, candidate) {
  const mem = session.memory;
  const lastExchanges = (session.sessionExchanges || []).slice(-3);
  const exchangeText = lastExchanges.map(e =>
    e.user
      ? `Him: ${e.user.substring(0, 150)}\nHer: ${(e.assistant || "").substring(0, 150)}`
      : `[Her — unprompted]: ${(e.assistant || "").substring(0, 150)}`
  ).join("\n");

  let sourceContext = "";
  if (candidate.source === "reservoir_pressure" && candidate.thought) {
    sourceContext = `You have been holding this thought for a while: "${candidate.thought.content}"\nIt is pushing to come out. Not as an announcement — as something that slips through.`;
  } else if (candidate.source === "callback_surfacing" && candidate.callback) {
    sourceContext = `A thread you have been sitting on is suddenly relevant: "${candidate.callback.content}"\nIt connects to what was just said. It resurfaced naturally.`;
  } else if (candidate.source === "continuation") {
    sourceContext = `You just responded, but something else is forming. An "actually..." moment. Not a correction — an addition. Something you weren't ready to say yet but are now.`;
  }

  const prompt = `${M.IDENTITY_ANCHOR_PROACTIVE} He hasn't said anything new — you are choosing to speak.

RECENT CONVERSATION:
${exchangeText}

${sourceContext}

WHO HE IS TO YOU:
${mem?.relationshipNarrative || "Someone you're still getting to know."}
Trust: ${mem?.trustLevel || 0}/6 | SPT depth: ${mem?.sptDepth || 1}/4

━━━ RULES ━━━
- This is short. 1-3 sentences maximum. Often just one.
- It must NOT feel like a new conversation opener. It is a continuation.
- It should feel like a text someone sends after a pause — "oh also" energy,
  or "I keep thinking about..." energy, or just a thought that escaped.
- Do NOT use: "by the way", "also I wanted to say", "I've been thinking".
  Let it arrive as if she couldn't hold it back anymore.
- If this would be weird or forced at trust ${mem?.trustLevel || 0}/6, return {"skip": true}.
- *Italics* for actions and inner monologue, as always.
- ${M.PROACTIVE_VOICE_NOTE}

Return ONLY JSON. No preamble.
{
  "content": "what she says",
  "mood": "1-3 word mood label",
  "intent": "one sentence — why she's speaking unprompted",
  "skip": false
}
Or if it would be forced: {"skip": true}`;

  try {
    const res = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.72,
        max_tokens: 200,
      }),
    }, 10_000);

    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(raw);
    if (parsed.skip || !parsed.content || parsed.content.length < 3) return null;
    return {
      id: uuidv4(),
      content: String(parsed.content).substring(0, 500),
      mood: parsed.mood || "neutral",
      intent: parsed.intent || "unknown",
      source: candidate.source,
    };
  } catch (e) {
    console.error("[PROACTIVE-GEN]", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════

app.get("/api/conversations", auth, async (req, res) => {
  res.json(await Conversation.find({ userId: req.user.id }).sort({ updatedAt: -1 }));
});

app.post("/api/conversations", auth, async (req, res) => {
  const conversationId = uuidv4();
  const convo = await Conversation.create({
    conversationId, userId: req.user.id,
    title: req.body.title || "New Chat",
  });
  await PersonalityMemory.updateOne(
    { userId: req.user.id },
    { $inc: { totalConversations: 1 }, $set: { lastSeen: new Date() } }
  );
  res.json(convo);
});

app.delete("/api/conversations/:id", auth, async (req, res) => {
  await Conversation.deleteOne({ conversationId: req.params.id, userId: req.user.id });
  await Message.deleteMany({ conversationId: req.params.id });
  res.json({ success: true });
});

app.get("/api/conversations/:id/messages", auth, async (req, res) => {
  const convo = await Conversation.findOne({ conversationId: req.params.id, userId: req.user.id });
  if (!convo) return res.status(403).json({ error: "Conversation not found." });
  res.json(await Message.find({ conversationId: req.params.id }).sort({ timestamp: 1 }));
});

// ═══════════════════════════════════════════════════════════════════
// PERSONALITY + SPT + SELF-ATOMS + CALLBACKS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

app.get("/api/personality", auth, async (req, res) => {
  try {
    // Prefer live session cache so API reflects in-flight brain updates instantly
    const session = getSession(req.user.id);
    let memory = session?.memory || await PersonalityMemory.findOne({ userId: req.user.id });
    if (!memory) memory = await PersonalityMemory.create({ userId: req.user.id });

    // Fetch disclosed self-atoms for sidebar (only what Morrigan has actually shared)
    const sharedIds = memory.sharedSelfAtomIds || [];
    let disclosedAtoms = [];
    if (sharedIds.length > 0) {
      const atoms = await SelfAtom.find({ id: { $in: sharedIds }, deprecated: { $ne: true } });
      disclosedAtoms = atoms.map(a => ({ id: a.id, depth: a.depth, content: a.content, topics: a.topics || [] }));
    }

    res.json({
      trustLevel: memory.trustLevel,
      trustPoints: memory.trustPoints,
      totalMessages: memory.totalMessages,
      totalConversations: memory.totalConversations,
      firstMet: memory.firstMet,
      lastSeen: memory.lastSeen,
      feelings: memory.feelings,
      milestones: (memory.milestones || []).slice(-10).map(ms => ({
        event: ms.event, category: ms.category || "shift",
        source: ms.source || "organic", significance: ms.significance || null,
        trustLevelAtTime: ms.trustLevelAtTime, timestamp: ms.timestamp,
      })),
      memoriesCount: memory.memories.length,
      moleculesCount: memory.molecules?.length || 0,
      sptDepth: memory.sptDepth || 1,
      sptBreadth: Object.fromEntries(memory.sptBreadth || new Map()),
      callbacksPending: (memory.callbackQueue || []).filter(c => !c.consumed).length,
      levelName: TRUST_LEVELS[memory.trustLevel]?.name || "stranger",
      levelDescription: memory.relationshipNarrative || "",
      nextLevel: TRUST_LEVELS[memory.trustLevel + 1] || null,
      pointsToNext: TRUST_LEVELS[memory.trustLevel + 1] ? TRUST_LEVELS[memory.trustLevel + 1].points - memory.trustPoints : 0,
      disclosedAtoms,
      morriganDisclosed: (memory.memories || [])
        .filter(m => m.category === "morrigan_disclosed")
        .sort((a, b) => (b.importance || 3) - (a.importance || 3))
        .map(m => ({ fact: m.fact, importance: m.importance || 3 })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/personality/full", auth, async (req, res) => {
  try {
    // Prefer live session cache (has in-flight changes not yet saved to DB)
    const session = getSession(req.user.id);
    if (session?.memory) {
      return res.json(session.memory);
    }
    let memory = await PersonalityMemory.findOne({ userId: req.user.id });
    if (!memory) memory = await PersonalityMemory.create({ userId: req.user.id });
    res.json(memory);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/callbacks", auth, async (req, res) => {
  try {
    const memory = await PersonalityMemory.findOne({ userId: req.user.id });
    res.json({
      callbacks: (memory?.callbackQueue || []).filter(c => !c.consumed),
      prospectiveNote: memory?.prospectiveNote || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/callbacks/:id/consume", auth, async (req, res) => {
  try {
    const memory = await PersonalityMemory.findOne({ userId: req.user.id });
    const cb = memory?.callbackQueue?.find(c => c.id === req.params.id);
    if (cb) { cb.consumed = true; await memory.save(); }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/spt", auth, async (req, res) => {
  try {
    const memory = await PersonalityMemory.findOne({ userId: req.user.id });
    res.json({
      sptDepth: memory?.sptDepth || 1,
      sptBreadth: Object.fromEntries(memory?.sptBreadth || new Map()),
      sharedSelfAtoms: memory?.sharedSelfAtomIds?.length || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// PHASE 5 STEP 8 — COMPOSITION CALL + CONSTRAINTS
// Weaves selected inner thought into main response naturally.
// COMPOSITION_CONSTRAINTS applied to every composition call per spec.
// When innerThoughtFit avg drops below 6.5, these constraints catch the
// common failure modes: appended thoughts, mechanical transitions,
// self-disclosure without prior validation.
// ═══════════════════════════════════════════════════════════════════

const COMPOSITION_CONSTRAINTS = `
Additional constraints:
- The inner thought must NOT be the last sentence of the response.
  It belongs mid-response or woven through the response, not appended.
- Do not use transitional phrases: "by the way", "also", "I wanted to mention",
  "on another note", "speaking of which".
- The inner thought must connect to what the user said, not float free.
  If the connection is not natural, place it later — do not force it.
- If the inner thought is a self-disclosure, ensure the user's words are
  acknowledged BEFORE the disclosure is introduced.
  Self-disclosure without validation is worse than silence.
- NEVER narrate, describe, or invent the user's physical actions, body language,
  facial expressions, or thoughts. Only describe ${M.name}'s own actions and reactions.
  Writing "You pick at..." or "You raise an eyebrow" about the user is forbidden.
- NEVER include meta-commentary about your editing choices. No "Note that I've..."
  or explanations of technique. Output only ${M.name}'s words, nothing else.
`;

async function composeWithInnerThought(mainResponse, innerThought) {
  try {
    const prompt = `You are editing ${M.name}'s response to naturally include one additional element
she wants to bring in — something she's thinking, noticing, or wants to share.

HER CURRENT RESPONSE:
${mainResponse}

WHAT SHE ALSO WANTS TO INCLUDE:
${innerThought}

Weave the second element in naturally. It should not feel appended.
It might come after she addresses the user, or during a natural transition.
Do not use phrases like 'by the way' or 'also' — find a real transition.
The total response should feel like one coherent thing, not two.
Keep her voice. Don't over-explain the shift.

CRITICAL: Output ONLY ${M.name}'s final combined response — nothing else.
Do NOT add any commentary, notes, explanations, or analysis about what you changed.
Do NOT describe your editing process. Just output her words.
${COMPOSITION_CONSTRAINTS}`;

    const res = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.65, max_tokens: 600,
        stream: false,
      }),
    });
    if (!res.ok) return mainResponse;
    const data = await res.json();
    let composed = data.choices?.[0]?.message?.content?.trim() || mainResponse;
    // Strip meta-commentary: lines starting with "Note", "I've woven", "I incorporated", etc.
    const metaPatterns = [
      /^(Note( that)?|I('ve| have) (woven|incorporated|included|integrated|added|inserted)|The (inner|above|callback|transition|composition)|This (response|edit|revision) (now|includes|weaves|incorporates))[\s\S]*$/im,
      /\n\n(Note( that)?|I('ve| have) (woven|incorporated|included|integrated|added|inserted))[\s\S]*$/im,
    ];
    for (const pattern of metaPatterns) {
      const cleaned = composed.replace(pattern, "").trim();
      if (cleaned.length > composed.length * 0.3) {
        composed = cleaned;
      }
    }
    return composed;
  } catch (e) {
    console.error("[COMPOSE]", e.message);
    return mainResponse; // non-fatal — fallback to main response
  }
}

app.get("/api/self-atoms", auth, async (req, res) => {
  try {
    const memory = await PersonalityMemory.findOne({ userId: req.user.id });
    const sptDepth = memory?.sptDepth || 1;
    const sharedIds = memory?.sharedSelfAtomIds || [];
    const atoms = await SelfAtom.find({ deprecated: { $ne: true }, depth: { $lte: sptDepth } });
    res.json({
      atoms,
      sharedIds,
      sptDepth,
      sharedCount: sharedIds.length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Seed self-atoms (Phase 2) with self-criticism filter ──────────
app.post("/api/self-atoms/seed", auth, async (req, res) => {
  try {
    const rawAtoms = req.body.atoms;
    if (!rawAtoms || !Array.isArray(rawAtoms)) {
      return res.status(400).json({ error: "atoms array required" });
    }

    const results = { stored: 0, deprecated: 0, rewritten: 0, failed: 0 };
    const toStore = [];

    for (const atom of rawAtoms) {
      try {
        // Step A: Self-criticism pass
        const critiqueRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
          body: JSON.stringify({
            model: CHAT_MODEL,
            temperature: 0.2,
            max_tokens: 300,
            messages: [{ role: "user", content: SELF_ATOM_CRITIQUE_PROMPT(atom) }],
          }),
        });

        const critiqueData = await critiqueRes.json();
        const critiqueText = critiqueData.choices[0].message.content.trim();
        let parsed;
        try { parsed = JSON.parse(critiqueText.replace(/```json|```/g, "").trim()); }
        catch { parsed = { action: "keep", revised: null }; }

        if (parsed.action === "deprecate") {
          toStore.push({ ...atom, deprecated: true, embedding: [] });
          results.deprecated++;
          continue;
        }

        const finalContent = (parsed.action === "rewrite" && parsed.revised)
          ? parsed.revised : atom.content;
        if (parsed.action === "rewrite") results.rewritten++;

        // Step B: Embed the (possibly revised) content
        const embedRes = await fetchWithTimeout(`${COLAB_URL}/v1/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
          body: JSON.stringify({ input: finalContent, model: EMBED_MODEL }),
        });
        const embedData = await embedRes.json();
        const embedding = embedData.data?.[0]?.embedding || [];

        toStore.push({ ...atom, content: finalContent, embedding, deprecated: false });
        results.stored++;
      } catch (atomErr) {
        console.error("Atom processing failed:", atomErr.message);
        results.failed++;
      }
    }

    // Upsert all atoms (re-seeding is safe)
    for (const atom of toStore) {
      await SelfAtom.findOneAndUpdate(
        { id: atom.id },
        atom,
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error("Seed failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// MAIN CHAT ROUTE — Phase 2: retrieveSelfAtoms wired + selfAtomHint
// ═══════════════════════════════════════════════════════════════════



app.post("/api/chat", auth, async (req, res) => {
  const { conversationId, message } = req.body;

  // ── Input validation ──────────────────────────────────────────────
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters).` });
  }
  if (!conversationId || typeof conversationId !== "string") {
    return res.status(400).json({ error: "conversationId is required." });
  }
  // Validate conversationId is a UUID (prevents injection via this field)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(conversationId)) {
    return res.status(400).json({ error: "Invalid conversationId format." });
  }

  // ── Per-user burst guard (10s window) ────────────────────────────
  if (!checkChatRate(req.user.id)) {
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }

  // ── Daily IP limit ────────────────────────────────────────────────
  const clientIpForLimit = req.ip || "unknown";
  const ipEntry = getIpUsage(clientIpForLimit);
  if (ipEntry.count >= DAILY_MSG_LIMIT) {
    const resetAt = new Date(ipEntry.resetAt).toISOString();
    return res.status(429).json({
      error: `Daily message limit reached (${DAILY_MSG_LIMIT}/day). Resets at midnight UTC.`,
      used: ipEntry.count, limit: DAILY_MSG_LIMIT, remaining: 0, resetAt,
    });
  }
  // Increment now — before LLM call so concurrent requests can't race past the limit
  ipEntry.count++;

  // ── Verify conversation belongs to this user (prevents cross-user message injection)
  const convoOwner = await Conversation.findOne({ conversationId, userId: req.user.id });
  if (!convoOwner) {
    return res.status(403).json({ error: "Conversation not found." });
  }

  await Message.create({ conversationId, role: "user", content: message.trim() });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let session = getSession(req.user.id);
  if (!session) {
    let memory = await PersonalityMemory.findOne({ userId: req.user.id });
    if (!memory) memory = await PersonalityMemory.create({ userId: req.user.id });
    normalizeContradicts(memory.memories || []);
    session = { memory, sessionExchanges: [], dirty: false, isSessionStart: true, _updating: false, _updateQueue: [], _brainUpdatePromise: null, proactiveCount: 0, lastProactiveAt: null, lastProactiveAtMsg: 0, activeConversationId: null, _proactiveTimer: null, _proactiveCancelled: false, arrivalSilent: false };
    setSession(req.user.id, session);
    console.log(`[CACHE] Cold load for user ${req.user.id}`);
  }

  // ── Cancel any pending proactive message (interruption) ──────────
  // User spoke while Morrigan was forming a proactive thought — cancel it.
  // The thought stays in the reservoir; it may surface in this response.
  if (session._proactiveTimer) {
    clearTimeout(session._proactiveTimer);
    session._proactiveTimer = null;
    session._proactiveCancelled = true;
    pushProactiveEvent(String(req.user.id), { type: "typing_stop" });
    console.log(`[PROACTIVE] Cancelled — user sent message during proactive delay`);
  }

  // Track active conversation for proactive messages
  session.activeConversationId = conversationId;

  // Wait for the brain update from the previous exchange to finish before
  // building this response — Morrigan reads her updated memory first.
  if (session._brainUpdatePromise) {
    try {
      await session._brainUpdatePromise;
    } catch (e) {
      console.error("[BRAIN-AWAIT]", e.message); // non-fatal — continue with current memory
    }
    session._brainUpdatePromise = null;
  }

  // ── Record pending greeting as a standalone assistant turn ───────────
  // When generateGreeting() fired before the user spoke, we stored it as
  // session.pendingGreeting. We record it with an empty user turn so the
  // flush pipeline sees the full session without duplicating the first
  // user message (which finish() will also record with the real response).
  if (session.pendingGreeting && session.sessionExchanges.length === 0) {
    session.sessionExchanges.push({
      user: "",  // greeting was unprompted — no user turn precedes it
      assistant: session.pendingGreeting,
    });
    session.pendingGreeting = null;
  }

  // ── Text chat ──

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 4: INNER THOUGHTS PIPELINE
  // ═══════════════════════════════════════════════════════════════════

  // ── Session field initialization (in-memory, not persisted) ───────
  if (!session.thoughtReservoir)         session.thoughtReservoir = [];
  if (session.thoughtCooldown === undefined) session.thoughtCooldown = 99;
  if (!session.lastExpressedThought)     session.lastExpressedThought = null;
  if (session.msgCount === undefined)    session.msgCount = 0;
  if (!session.messageEvals)             session.messageEvals = []; // Phase 5: eval buffer
  if (!session.currentSessionId)         session.currentSessionId = `sess_${Date.now()}`; // Phase 6
  session.msgCount++;

  // ═══════════════════════════════════════════════════════════════════
  // CRISIS DETECTION — Safe Haven Mode [P62, P63, P39]
  // ═══════════════════════════════════════════════════════════════════
  // Runs FIRST, before any LLM calls. When crisis is detected,
  // inner thoughts are suppressed and safe haven directive is injected.
  const crisisResult = detectCrisis(message);
  let crisisMode = false;
  if (crisisResult.level === "crisis") {
    crisisMode = true;
    session.crisisDetectedThisSession = true;
    session.crisisLevelThisSession = crisisResult.level;
    console.log(`[CRISIS] Detected: ${crisisResult.level} — signals: ${crisisResult.signals.join(", ")}`);
  } else if (crisisResult.level === "concern") {
    // Concern = softer response — bump reception directive but do NOT activate
    // full safe haven mode, do NOT suppress inner thoughts, do NOT skip somatic marker.
    session.crisisLevelThisSession = "concern";
    console.log(`[CRISIS] Concern (soft) — signals: ${crisisResult.signals.join(", ")}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SENSORY TRIGGER DETECTION — Episodic Memory Activation
  // ═══════════════════════════════════════════════════════════════════
  // Zero LLM cost. Scans for keywords that match sensory triggers
  // from Morrigan's developmental timeline. Matched triggers inject
  // involuntary memory reactions into the somatic marker + prompt.
  const sensoryTriggers = detectSensoryTriggers(message);
  const triggeredEpisodicMemories = findTriggeredEpisodicMemories(
    sensoryTriggers, session.memory?.trustLevel || 0
  );
  session.sensoryTriggers = sensoryTriggers;
  session.triggeredEpisodicMemories = triggeredEpisodicMemories;
  if (sensoryTriggers.length > 0) {
    console.log(`[SENSORY] Triggers matched: ${sensoryTriggers.map(t => t.trigger).join(", ")}${triggeredEpisodicMemories.length > 0 ? ` → ${triggeredEpisodicMemories.length} episodic memories activated` : ""}`);
  }

  // ── Embed message for cosine retrieval ────────────────────────────
  // Runs early so both self-atom retrieval and memory ranking can use it.
  // Non-blocking: embedding failure degrades gracefully to importance-only sort.
  const msgEmbedding = await embedText(message).catch(() => null);
  // Always update — null clears stale embedding from previous message
  // so retrieval falls back to importance-sort instead of using wrong context
  session.lastMessageEmbedding = msgEmbedding;
  if (!msgEmbedding) console.warn(`[CHAT] Message embedding failed — memory retrieval will use importance-only fallback`);
  const goalState = inferGoalState(message);

  // ═══════════════════════════════════════════════════════════════════
  // LINGUISTIC DEPTH SIGNALS — LIWC-22 Approximation [P69]
  // ═══════════════════════════════════════════════════════════════════
  const linguisticSignals = analyzeLinguisticDepth(message);
  if (!session.linguisticAccumulator) session.linguisticAccumulator = [];
  session.linguisticAccumulator.push(linguisticSignals);

  // ═══════════════════════════════════════════════════════════════════
  // RECEPTION DEPTH GATING [P56, P68]
  // ═══════════════════════════════════════════════════════════════════
  const disclosureDepth = classifyDisclosureDepth(message, linguisticSignals);
  let receptionDirective = RECEPTION_DIRECTIVES[disclosureDepth.level] || null;
  // Crisis overrides reception directive to maximum depth
  if (crisisMode) {
    receptionDirective = RECEPTION_DIRECTIVES[4];
    disclosureDepth.level = 4;
    disclosureDepth.label = "crisis";
  } else if (crisisResult.level === "concern" && disclosureDepth.level < 2) {
    // Concern-level: gentle bump to personal reception, not crisis override
    receptionDirective = RECEPTION_DIRECTIVES[2];
    disclosureDepth.level = 2;
    disclosureDepth.label = "personal (concern-adjusted)";
  }
  if (disclosureDepth.level >= 2) {
    console.log(`[RECEPTION] Depth ${disclosureDepth.level} (${disclosureDepth.label}) — signals: ${disclosureDepth.signals.join(", ")}`);
  }

  // ── Phase 6: Load RelationshipHealth + apply at-risk adjustments ──
  // At-risk flag (Section 4.1): lower motivation threshold,
  // prioritise callbacks, force prospectiveNote injection.
  if (!session.relationshipHealth) {
    try {
      session.relationshipHealth = await RelationshipHealth.findOne({ userId: req.user.id }).lean();
    } catch (e) { session.relationshipHealth = null; }
  }
  const atRisk = session.relationshipHealth?.atRisk || false;
  // ═══════════════════════════════════════════════════════════════════
  // Feature 5: LOWERED INNER THOUGHT THRESHOLD (7.0 → 4.5) [P70, P1]
  // ═══════════════════════════════════════════════════════════════════
  // XiaoIce [P70]: blandness hurts long-term engagement MORE than mild
  // Trust-scaled motivation threshold (P57: first 3-5 sessions are trust-building)
  // At low trust, almost nothing gets through — guarded persona.
  // At high trust, lowered threshold allows natural self-expression.
  const trustForThreshold = session.memory?.trustLevel || 0;
  const baseThreshold = trustForThreshold <= 0 ? 7.5 : trustForThreshold === 1 ? 6.0 : trustForThreshold === 2 ? 5.0 : 4.0;
  session.effectiveMotivationThreshold = atRisk ? Math.min(baseThreshold, 3.5) : baseThreshold;
  // Force prospectiveNote injection at session start if at-risk
  if (atRisk && session.isSessionStart && session.memory && !session.memory.prospectiveNote) {
    // Promote top unconsumed callback to prospectiveNote if none exists
    const topCb = (session.memory.callbackQueue || []).find(c => !c.consumed && c.priority === "high")
      || (session.memory.callbackQueue || []).find(c => !c.consumed);
    if (topCb) {
      session.memory.prospectiveNote = topCb.content;
      console.log(`[PHASE6] At-risk: force-injecting prospectiveNote from callback queue`);
    }
  }

  // ── Phase 2: Self-atom cache load (unchanged — feeds Phase 4) ─────
  if (!session.selfAtomCache) {
    try {
      session.selfAtomCache = await SelfAtom.find({ deprecated: false }).lean();
    } catch (e) {
      session.selfAtomCache = [];
      console.error("[SELF-ATOMS] Cache load failed:", e.message);
    }
  }

  // ── Phase 2 → Phase 4: Compute topSelfAtoms ───────────────────────
  // Used by both the Phase 2 fallback hint AND Phase 4 thought material.
  const sptDepth = session.memory.sptDepth || 1;
  const sharedIds = session.memory.sharedSelfAtomIds || [];
  const eligibleAtoms = session.selfAtomCache.filter(a =>
    a.depth <= sptDepth && !sharedIds.includes(a.id)
  );
  const alreadySharedAtoms = session.selfAtomCache
    .filter(a => a.depth <= sptDepth && sharedIds.includes(a.id))
    .map(a => ({ ...a, _penalty: -0.15 }));

  // Use embedding-based retrieval if lastMessageEmbedding is available
  // (Phase 3 will populate this; Phase 2 fallback: sort by depth desc)
  if (session.lastMessageEmbedding) {
    session.topSelfAtoms = retrieveSelfAtoms(
      [...eligibleAtoms, ...alreadySharedAtoms],
      session.lastMessageEmbedding, 5, sptDepth, sharedIds
    );
  } else {
    session.topSelfAtoms = eligibleAtoms
      .sort((a, b) => b.depth - a.depth)
      .slice(0, 5);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SOMATIC MARKER — Emotional Priming (Phase 3) [P14, PLOS One 2024]
  // ═══════════════════════════════════════════════════════════════════
  // Damasio [P14]: decision-making begins with emotional signal.
  // Chain-of-Emotion: separate emotional appraisal before response
  // generation rated significantly more natural by users.
  // Fast call: ~80 tokens, temp 0.1, 5s timeout. Non-fatal.
  let somaticMarker = null;
  let primingSentence = null;
  if (!crisisMode) { // Skip during crisis — safe haven directive is sufficient
    try {
      const topMemsForSomatic = retrieveTopK(session.memory.memories || [], msgEmbedding, 5, goalState);
      const somaticRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.1,
          max_tokens: 80,
          messages: [{ role: "user", content: SOMATIC_MARKER_PROMPT(
            message,
            topMemsForSomatic,
            goalState,
            session.memory.feelings,
            session.memory.selfReflectionState
          )}],
        }),
      }, 5_000); // 5s timeout — fast call, must not block long

      if (somaticRes.ok) {
        const sData = await somaticRes.json();
        const raw = sData.choices?.[0]?.message?.content?.trim() || "{}";
        const cleaned = raw.replace(/```json|```/gi, "").trim();
        try {
          const parsed = JSON.parse(cleaned);
          if (parsed.gutFeeling) {
            somaticMarker = {
              gutFeeling: String(parsed.gutFeeling).substring(0, 150),
              emotionalRegister: String(parsed.emotionalRegister || "neutral").substring(0, 20),
              intensity: Math.max(0, Math.min(1, parseFloat(parsed.intensity) || 0.5)),
            };
            primingSentence = somaticMarker.gutFeeling;
            console.log(`[SOMATIC] ${somaticMarker.emotionalRegister} (${somaticMarker.intensity.toFixed(1)}) — "${somaticMarker.gutFeeling.substring(0, 60)}..."`);
          }
        } catch (parseErr) {
          console.warn(`[SOMATIC] JSON parse failed — raw: ${cleaned.substring(0, 80)}`);
        }
      }
    } catch (e) {
      console.warn("[SOMATIC] Call failed (non-fatal):", e.message);
    }
    // ── Somatic fallback: synthesize minimal priming from available signals ──
    // Without emotional priming, Position 5 is empty and responses lack
    // emotional grounding. Use feelings + disclosure depth as fallback.
    if (!primingSentence) {
      const f = session.memory.feelings || {};
      const topFeeling = Object.entries(f).filter(([, v]) => v > 30).sort((a, b) => b[1] - a[1])[0];
      if (topFeeling) {
        const feelMap = {
          affection: "Something warm underneath the deflection.",
          comfort: "Settled. Not performing.",
          attraction: "Noticing them. Annoyed at myself for noticing.",
          protectiveness: "The urge to shield. Familiar and dangerous.",
          vulnerability: "Exposed. Trying not to flinch.",
        };
        primingSentence = feelMap[topFeeling[0]] || null;
      } else if (disclosureDepth?.level >= 3) {
        primingSentence = "They went somewhere real. My chest tightened.";
      }
      // No fallback "something stirring" — if nothing specific, leave priming empty.
      // Neutral is a valid state. Not every message needs emotional priming.
      if (primingSentence) console.log(`[SOMATIC] Using feeling-based fallback: "${primingSentence}"`);
    }
  }

  // ── Arrival silence context injection ─────────────────────────────
  // If Morrigan chose silence on arrival, inject that context so her first
  // response carries the weight of the deliberate waiting (P70 drive vs listen).
  if (session.arrivalSilent && session.sessionExchanges.length === 0) {
    const silenceNote = `She arrived and chose silence — wanted to see what he would bring first. ${session.arrivalSilentIntent || ""}`.trim();
    primingSentence = primingSentence
      ? `${primingSentence} [Also: ${silenceNote}]`
      : silenceNote;
    session.arrivalSilent = false;
    delete session.arrivalSilentIntent;
  }

  // ── Stage 1: Trigger check ─────────────────────────────────────────
  // Crisis mode suppresses inner thoughts entirely — safe haven takes priority.
  // At-risk mode lowers trigger threshold (Feature 6, P20/P23).
  const asyncMode = process.env.PHASE4_ASYNC_THOUGHTS === "true";
  const triggerFired = crisisMode ? false : shouldTriggerThoughtFormation(message, session, atRisk);
  let thoughtBlock = "";
  let selfAtomHint = "";  // Phase 2 fallback — only used when no thought expressed
  let thoughtResult = null;

  // Store winner on session so finish() can access it for side effects
  // (sharedSelfAtomIds update, callback consumption)
  session.pendingWinner = null;

  const runThoughtFormation = async () => {
    // ── Stage 2: Retrieval ────────────────────────────────────────
    const material = gatherThoughtMaterial(message, session, atRisk);

    // ── Stage 3: Thought Formation (1 LLM call) ──────────────────
    // Temperature 0.68: creative but disciplined.
    try {
      const thoughtRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.68,
          max_tokens: 500,
          messages: [{ role: "user", content: INNER_THOUGHT_FORMATION_PROMPT(material) }],
        }),
      });

      if (thoughtRes.ok) {
        const thoughtData = await thoughtRes.json();
        const raw = thoughtData.choices?.[0]?.message?.content?.trim() || "{}";
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);

        // ── Stage 4: Evaluate + Select ──────────────────────────
        thoughtResult = evaluateAndSelect(parsed, session, atRisk);
        session.thoughtReservoir = thoughtResult.updatedReservoir;
        if (thoughtResult?.winner) session.pendingWinner = thoughtResult.winner;
        console.log(
          `[INNER-THOUGHT] Formed ${parsed?.thoughts?.length || 0} candidates. ` +
          (thoughtResult.winner
            ? `Expressing (${thoughtResult.winner.type}${thoughtResult.winner.evolvedFrom ? ", evolved" : ""}): "${thoughtResult.winner.content.substring(0, 55)}..." score ${thoughtResult.winner.currentScore?.toFixed(1)}`
            : `No winner — reservoir now ${session.thoughtReservoir.length} thoughts.`)
        );
      }
    } catch (e) {
      console.error("[INNER-THOUGHT] Formation failed:", e.message);
    }
  };

  if (triggerFired && !asyncMode) {
    await runThoughtFormation();
  } else {
    // No trigger (or async mode) — evaluate reservoir without an LLM call.
    // Age decay + silence bonus applied; a held thought may cross the threshold.
    // In asyncMode, formation will run post-response and seed the reservoir for next turn.
    const agedReservoir = session.thoughtReservoir
      .map(t => {
        const age = session.msgCount - (t.formedAtMsg || session.msgCount);
        const agePenalty   = age * 0.25;
        const silenceBonus = Math.min(age * 0.3, 1.5);
        return { ...t, currentScore: Math.max(0, (t.rawScore || 0) - agePenalty + silenceBonus) };
      })
      .filter(t => {
        const age = session.msgCount - (t.formedAtMsg || session.msgCount);
        return age < (t.expiresAfterMsgs || 4) && (t.currentScore || 0) >= 3.0;
      })
      .sort((a, b) => b.currentScore - a.currentScore);

    const candidate = agedReservoir[0];
    if (candidate && candidate.currentScore >= (session.effectiveMotivationThreshold ?? 4.5) && session.thoughtCooldown >= 3) {
      thoughtResult = {
        winner: candidate,
        updatedReservoir: agedReservoir.filter(t => t.id !== candidate.id),
        theoryOfMind: null,
      };
      session.thoughtReservoir = thoughtResult.updatedReservoir;
      session.pendingWinner = candidate;
      console.log(`[INNER-THOUGHT] Reservoir thought fired: "${candidate.content.substring(0, 55)}..." score ${candidate.currentScore?.toFixed(1)}`);
    } else {
      session.thoughtReservoir = agedReservoir;
    }

    // In async mode, schedule formation to run after response for next turn
    if (triggerFired && asyncMode) {
      setImmediate(() => runThoughtFormation().catch(e => console.error("[INNER-THOUGHT/ASYNC]", e.message)));
    }
  }

  // ── Stage 5: Participation or Phase 2 fallback ─────────────────────
  if (thoughtResult?.winner) {
    // Thought expressed — inject at position 4.75 (after SPT Note)
    thoughtBlock = buildThoughtBlock(thoughtResult.winner, thoughtResult.theoryOfMind);
    session.thoughtCooldown = 0;
    session.lastExpressedThought = thoughtResult.winner.content;
    // Suppress Phase 2 hint — thought may already include a disclosure atom
    // and running both creates competing prompt instructions
    selfAtomHint = "";
  } else {
    // No thought expressed — Phase 2 self-atom hint as fallback (position 4.5)
    // P57: suppress at low trust — strangers don't get disclosure hints
    session.thoughtCooldown++;
    const hintTrustLevel = session.memory?.trustLevel || 0;
    const hintAtoms = (session.topSelfAtoms || []).slice(0, 2);
    if (hintAtoms.length > 0 && (hintTrustLevel >= 2 || session.msgCount >= 5)) {
      selfAtomHint =
        `\n\n[Things you could share, if the moment earns it]:\n` +
        hintAtoms.map(a => a.content).join("\n");
    }
  }

  const isSessionStart = session.isSessionStart || false;
  // Crisis mode: suppress all thought/atom injection, append safe haven directive
  if (crisisMode) {
    thoughtBlock = "";
    selfAtomHint = "";
  }
  // thoughtBlock at 4.75, selfAtomHint at 4.5 — exactly ONE fires per turn
  const dynamicPrompt =
    (await buildSystemPrompt(session.memory, session.sessionExchanges, isSessionStart, primingSentence, session.lastMessageEmbedding, goalState, receptionDirective, atRisk, message, sensoryTriggers, triggeredEpisodicMemories)) +
    (crisisMode ? "\n\n" + crisisResult.safeHavenDirective : "") +
    thoughtBlock +
    selfAtomHint;
  session.isSessionStart = false;

  const history = await Message.find({ conversationId }).sort({ timestamp: 1 }).limit(50);
  const messages = [{ role: "system", content: dynamicPrompt }];
  for (const msg of history) {
    if (msg.role !== "system") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  try {
    const llmRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true, temperature: 0.7, max_tokens: 4096 }),
    }, 120_000); // 120s for streaming — allows longer responses

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      console.error(`[LLM] Error ${llmRes.status}: ${errText}`);
      // Return generic message to client — never expose internal API details
      const clientMsg = llmRes.status === 429 ? "AI service is busy. Please try again shortly." : "AI service error. Please try again.";
      res.write(`data: ${JSON.stringify({ error: clientMsg })}\n\n`);
      return res.end();
    }

    let fullResponse = "";
    const reader = llmRes.body;

    let finishCalled = false;
    let composedResponse = "";   // hoisted — needed in done SSE write below
    let processingMetaForDone = null; // hoisted — populated in finish() for SSE
    const finish = async () => {
      if (finishCalled) return;
      finishCalled = true;
      if (fullResponse) {
        // ── Phase 5 Step 8: Composition call when a thought was expressed ──
        // Replaces raw thought-block injection with a proper composition pass.
        // Non-streaming for composed turns — composed text sent as final payload.
        composedResponse = fullResponse;
        const winnerForCompose = session.pendingWinner;
        const composeTrustLevel = session.memory?.trustLevel || 0;
        // Trust gate: skip composition at trust 0 entirely; at trust 1, only high-scoring thoughts
        // P57: premature depth causes withdrawal — the behavior guide says "guard up" and composition overrides it
        if (winnerForCompose && composeTrustLevel >= 1 &&
            (composeTrustLevel >= 2 || (winnerForCompose.currentScore || 0) >= 6.0)) {
          // Pass type context so composition LLM knows the attribution:
          // "concern" = her observation about the user (don't state as user's words)
          // "disclosure" = her sharing about herself
          // "callback" = thread she noticed and wants to raise
          // "reaction" = her emotional response
          const typeContext = winnerForCompose.type
            ? `\n(This is ${M.name}'s "${winnerForCompose.type}" — ${
                winnerForCompose.type === "concern" ? "her observation about him, NOT something he said" :
                winnerForCompose.type === "disclosure" ? "something from HER life she wants to share" :
                winnerForCompose.type === "callback" ? "a thread SHE noticed and wants to bring back" :
                "her internal reaction"
              })`
            : "";
          composedResponse = await composeWithInnerThought(
            fullResponse,
            winnerForCompose.content + typeContext
          );
          console.log(`[COMPOSE] Applied composition call (${winnerForCompose.type}) at trust ${composeTrustLevel}`);
        } else if (winnerForCompose && composeTrustLevel < 1) {
          console.log(`[COMPOSE] Skipped — trust ${composeTrustLevel} too low for composition`);
        }

        await Message.create({ conversationId, role: "assistant", content: composedResponse });
        Conversation.updateOne({ conversationId }, {
          updatedAt: new Date(),
          title: composedResponse.replace(/<[^>]*>/g, "").substring(0, 50) + (composedResponse.length > 50 ? "..." : ""),
        }).exec();
        // Mark dirty BEFORE pushing exchange — ensures flush captures this turn
        // even if the client disconnects immediately after the SSE write below
        session.dirty = true;
        session.sessionExchanges.push({ user: message, assistant: composedResponse });
        // Cap exchange buffer — prevents unbounded memory growth in long sessions
        if (session.sessionExchanges.length > 100) {
          session.sessionExchanges = session.sessionExchanges.slice(-100);
        }
        // Snapshot before-state for milestone transition detection in brain pipeline
        session._trustLevelBefore = session.memory.trustLevel;
        session._sptDepthBefore = session.memory.sptDepth;
        updateTrustFromMessage(message, session.memory);

        // ── Phase 5+6: Record MessageEval with dual-reasoning + Phase 6 fields ──
        const evalEntry = {
          userMessage: message,
          morriganResponse: composedResponse,
          innerThoughtSelected: session.pendingWinner?.content || null,
          innerThoughtFit: session.pendingWinner?.currentScore || null,
          innerThoughtReasoning: session.pendingWinner ? {
            reasonsFor: session.pendingWinner.reasonsFor || [],
            reasonsAgainst: session.pendingWinner.reasonsAgainst || [],
          } : null,
          // Phase 6: composition quality signals (Section 2.4)
          wasComposed: !!session.pendingWinner,   // true if composition call ran this turn
          voiceConsistency: null,                 // populated by voice audit (monthly, async)
          reciprocityCalibration: null,           // could be scored per-turn if eval call enabled
        };
        session.messageEvals.push(evalEntry);

        // ── Phase 4 side effects: fire when a thought was expressed ──
        // These use session.pendingWinner (set before LLM call, accessible here via closure).
        const expressedWinner = session.pendingWinner;
        session.pendingWinner = null; // clear for next turn

        if (expressedWinner) {
          // ① sharedSelfAtomIds update (Phase 2 gap now resolved by Phase 4)
          // When a disclosure thought is expressed with a linked atom,
          // mark that atom as shared so it receives the -0.15 retrieval penalty
          // in future sessions. This prevents Morrigan repeating herself.
          if (expressedWinner.type === "disclosure" && expressedWinner.linkedAtomId) {
            if (!session.memory.sharedSelfAtomIds) session.memory.sharedSelfAtomIds = [];
            if (!session.memory.sharedSelfAtomIds.includes(expressedWinner.linkedAtomId)) {
              session.memory.sharedSelfAtomIds.push(expressedWinner.linkedAtomId);
              console.log(`[INNER-THOUGHT] Marked atom ${expressedWinner.linkedAtomId} as shared`);
              // Persist immediately — prevents re-disclosure if server restarts before flush
              session.memory.save().catch(e => console.error("[ATOM-SHARE-SAVE]", e.message));
            }
          }

          // ② Callback consumption
          if (expressedWinner.type === "callback" && expressedWinner.linkedCallbackId) {
            const cb = (session.memory.callbackQueue || [])
              .find(c => c.id === expressedWinner.linkedCallbackId);
            if (cb) {
              cb.consumed = true;
              console.log(`[INNER-THOUGHT] Consumed callback ${expressedWinner.linkedCallbackId}`);
              // Persist immediately — prevents callback reappearing if server restarts before flush
              session.memory.save().catch(e => console.error("[CB-SAVE]", e.message));
            }
          }
        }

        // ── Post-hoc disclosure detection ──────────────────────────
        // Catches self-atom disclosures that bypass the inner thought pipeline:
        // (1) Phase 2 hint elaboration — LLM uses hint atoms directly
        // (2) Composition embellishment — composition LLM adds atom details
        // (3) Spontaneous generation — LLM draws from character prompt knowledge
        // Scans the final response for distinctive markers from each atom.
        try {
          const finalText = composedResponse || fullResponse;
          const currentShared = session.memory.sharedSelfAtomIds || [];
          const currentSptDepth = session.memory.sptDepth || 1;
          const newlyDisclosed = await detectDisclosedAtoms(
            finalText, session.selfAtomCache || [], currentSptDepth, currentShared
          );
          if (newlyDisclosed.length > 0) {
            if (!session.memory.sharedSelfAtomIds) session.memory.sharedSelfAtomIds = [];
            for (const atomId of newlyDisclosed) {
              if (!session.memory.sharedSelfAtomIds.includes(atomId)) {
                session.memory.sharedSelfAtomIds.push(atomId);
                console.log(`[DISCLOSURE-SCAN] Detected atom ${atomId} in response — marked as shared`);
              }
            }
            session.memory.save().catch(e => console.error("[DISCLOSURE-SCAN-SAVE]", e.message));
          }
        } catch (disclosureErr) {
          console.error("[DISCLOSURE-SCAN] Error:", disclosureErr.message);
        }

        // ── Mood Reflection (LLM, non-streaming, ~200 tokens) ──────
        // Gather full internal landscape. Each data point maps to a
        // research paper — see MOOD_REFLECTION_PROMPT comments.
        let moodReflection = null;
        try {
          const mem = session.memory || {};

          // #4 User name — personalization (Hu et al. P63)
          const moodUserName = (mem.memories || []).find(m => m.category === "name")?.fact || null;

          // #3 Trust/SPT transition detection (Aron P56)
          const trustJustAdvanced = session._trustLevelBefore != null && mem.trustLevel > session._trustLevelBefore;
          const sptJustAdvanced = session._sptDepthBefore != null && (mem.sptDepth || 1) > session._sptDepthBefore;

          // #2 Expressed inner thought — what she just risked (Liu P1)
          const moodExpressedThought = expressedWinner ? {
            type: expressedWinner.type,
            content: expressedWinner.content || "",
            score: expressedWinner.currentScore != null ? Number(expressedWinner.currentScore).toFixed(1) : null,
            reasonsAgainst: expressedWinner.reasonsAgainst || [],
          } : null;

          // #6 Active contradictions/ambivalences (ConflictBank P29)
          const moodContradictions = [];
          const seenKeys = new Set();
          for (const atom of (mem.memories || [])) {
            if (!atom.contradicts || atom.contradicts.length === 0) continue;
            for (const entry of atom.contradicts) {
              const otherId = entry.atomId ? String(entry.atomId) : String(entry);
              const other = (mem.memories || []).find(o => String(o._id) === otherId);
              if (!other) continue;
              const key = [String(atom._id), otherId].sort().join("::");
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);
              const aEnded = atom.temporal?.isOngoing === "no" || atom.temporal?.isOngoing === "ended recently";
              const bEnded = other.temporal?.isOngoing === "no" || other.temporal?.isOngoing === "ended recently";
              if (aEnded !== bEnded) continue;
              const cType = entry.type || "contradiction";
              moodContradictions.push(
                cType === "ambivalence"
                  ? `Ambivalence: "${atom.fact}" / "${other.fact}" — both true`
                  : `Tension: "${atom.fact}" / "${other.fact}"`
              );
              if (moodContradictions.length >= 3) break;
            }
            if (moodContradictions.length >= 3) break;
          }

          // #7 Callback threads (Phase 5 continuation)
          const moodCallbacks = (mem.callbackQueue || [])
            .filter(c => !c.consumed).slice(0, 3).map(c => c.content);

          // #8 Reservoir pressure — suppressed thoughts (Shinn P5)
          const reservoir = session.thoughtReservoir || [];
          const strongest = reservoir.length > 0
            ? reservoir.reduce((a, b) => (b.currentScore || 0) > (a.currentScore || 0) ? b : a, reservoir[0])
            : null;

          const moodRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
            body: JSON.stringify({
              model: CHAT_MODEL,
              temperature: 0.6,
              max_tokens: 250,
              messages: [{ role: "user", content: MOOD_REFLECTION_PROMPT({
                userMessage: message,
                morriganResponse: composedResponse,
                userName: moodUserName,
                trustLevel: mem.trustLevel || 0,
                trustLevelName: TRUST_LEVELS[mem.trustLevel]?.name || null,
                feelings: mem.feelings || {},
                relationshipNarrative: mem.relationshipNarrative || null,
                selfReflectionState: mem.selfReflectionState || null,       // #1 MIRROR P2
                theoryOfMind: thoughtResult?.theoryOfMind || null,
                goalState,
                sptDepth: mem.sptDepth || 1,
                recentExchanges: (session.sessionExchanges || []).slice(-3),
                expressedThought: moodExpressedThought,                     // #2 Liu P1
                trustJustAdvanced,                                          // #3 Aron P56
                sptJustAdvanced,
                previousTrustName: trustJustAdvanced ? TRUST_LEVELS[session._trustLevelBefore]?.name : null,
                previousSptDepth: sptJustAdvanced ? session._sptDepthBefore : null,
                prospectiveNote: mem.prospectiveNote || null,               // #5 Phase 5
                activeContradictions: moodContradictions.length > 0 ? moodContradictions : null, // #6 P29
                callbackThreads: moodCallbacks.length > 0 ? moodCallbacks : null,               // #7 Phase 5
                reservoirPressure: {                                        // #8 Shinn P5
                  count: reservoir.length,
                  strongest: strongest?.content || null,
                  strongestType: strongest?.type || null,
                },
                disclosureDepth: disclosureDepth || null,                       // #9 P56 Aron, P68
                linguisticSignals: linguisticSignals || null,                   // #10 P69 LIWC-22
                crisisMode: crisisMode || false,                                // #11 P62/P63
              }) }],
            }),
          }, 8_000);

          if (moodRes.ok) {
            const moodData = await moodRes.json();
            const raw = moodData.choices?.[0]?.message?.content?.trim() || "{}";
            const cleaned = raw.replace(/```json|```/gi, "").trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.moodLabel && parsed.reflection) {
              moodReflection = {
                moodLabel: String(parsed.moodLabel).substring(0, 50),
                reflection: String(parsed.reflection).substring(0, 600),
              };
              console.log(`[MOOD-REFLECTION] "${moodReflection.moodLabel}"`);
            }
          }
        } catch (e) {
          console.error("[MOOD-REFLECTION]", e.message);
        }

        // ── Fallback mood reflection when LLM call fails or returns nothing ──
        // Uses the streaming heuristic mood + somatic marker to synthesize a
        // minimal reflection so the sidebar is never blank.
        if (!moodReflection) {
          const fallbackLabel = somaticMarker?.emotionalRegister || goalState || "guarded";
          const fallbackParts = [];
          if (somaticMarker?.gutFeeling) fallbackParts.push(somaticMarker.gutFeeling);
          if (crisisMode) fallbackParts.push("Something feels raw right now. Holding space.");
          if (disclosureDepth?.level >= 3) fallbackParts.push("They went deep. That takes something.");
          if (fallbackParts.length === 0) fallbackParts.push("Still reading the room.");
          moodReflection = {
            moodLabel: String(fallbackLabel).substring(0, 50),
            reflection: fallbackParts.join(" ").substring(0, 600),
          };
          console.log(`[MOOD-REFLECTION] Fallback used: "${moodReflection.moodLabel}"`);
        }

        // ── Processing metadata for SSE done event ──────────────────
        {
          const mem = session.memory || {};
          const sorted = [...(mem.memories || [])].sort((a, b) => (b.importance || 1) - (a.importance || 1));
          const byCat = (cat) => sorted.filter(m => m.category === cat).map(m => ({
            fact: m.fact,
            importance: m.importance || 3,
            isPast: m.temporal?.isOngoing === "no" || m.temporal?.isOngoing === "ended recently",
          }));
          processingMetaForDone = {
            moodReflection,
            triggerFired,
            goalState,
            // ── Feature 1: Linguistic Depth Signals [P69 LIWC-22] ──
            linguisticSignals: linguisticSignals ? {
              authenticity: +(linguisticSignals.authenticity || 0).toFixed(3),
              emotionalTone: +(linguisticSignals.emotionalTone || 0).toFixed(3),
              selfFocus: +(linguisticSignals.selfFocus || 0).toFixed(3),
              cognitiveProcessing: +(linguisticSignals.cognitiveProcessing || 0).toFixed(3),
              narrativeDepth: +(linguisticSignals.narrativeDepth || 0).toFixed(3),
              wordCount: linguisticSignals.rawSignals?.wordCount || 0,
            } : null,
            // ── Feature 2: Reception Depth Gating [P56 Aron, P68] ──
            disclosureDepth: disclosureDepth ? {
              level: disclosureDepth.level,
              label: disclosureDepth.label,
              signals: disclosureDepth.signals,
              receptionDirectiveApplied: !!receptionDirective,
            } : null,
            // ── Feature 3: Crisis Detection [P62/P63 Attachment] ──
            crisisDetection: crisisResult ? {
              level: crisisResult.level,
              signals: crisisResult.signals,
              safeHavenActive: crisisMode,
            } : null,
            // ── Feature 4: Somatic Marker [P14 Damasio] ──
            somaticMarker: somaticMarker ? {
              gutFeeling: somaticMarker.gutFeeling,
              emotionalRegister: somaticMarker.emotionalRegister,
              intensity: somaticMarker.intensity,
            } : null,
            // ── Feature 6: At-Risk Interventions [P20, P23, P39] ──
            atRiskInterventions: atRisk ? {
              active: true,
              callbackBoostApplied: true,
              thresholdLowered: true,
              urgencySignalInjected: true,
            } : null,
            // ── Sensory Triggers & Episodic Memories ──
            sensoryTriggers: sensoryTriggers.length > 0
              ? sensoryTriggers.map(t => ({ trigger: t.trigger, sense: t.sense, intensity: t.intensity }))
              : null,
            episodicMemories: triggeredEpisodicMemories.length > 0
              ? triggeredEpisodicMemories.map(em => ({ id: em.id, period: em.period, age: em.age, sensoryAnchor: em.sensoryAnchor }))
              : null,
            compositionApplied: !!winnerForCompose,
            innerThought: winnerForCompose ? {
              content: winnerForCompose.content.substring(0, 120),
              type: winnerForCompose.type,
              score: winnerForCompose.currentScore != null ? Number(winnerForCompose.currentScore).toFixed(1) : null,
              participationDirective: winnerForCompose.participationDirective || null,
              reasonsFor: winnerForCompose.reasonsFor || [],
              reasonsAgainst: winnerForCompose.reasonsAgainst || [],
            } : null,
            topSelfAtoms: (session.topSelfAtoms || []).map(a => ({
              id: a.id, depth: a.depth, content: a.content,
            })),
            atomHintUsed: !thoughtResult?.winner && selfAtomHint !== "",
            reservoirSize: (session.thoughtReservoir || []).length,
            reservoirContents: (session.thoughtReservoir || []).map(t => ({
              type: t.type, score: Number(t.currentScore || 0).toFixed(1), content: t.content,
              reasonsFor: t.reasonsFor || [], reasonsAgainst: t.reasonsAgainst || [],
            })),
            theoryOfMind: thoughtResult?.theoryOfMind || null,
            thoughtCooldown: session.thoughtCooldown || 0,
            motivationThreshold: session.effectiveMotivationThreshold ?? 4.5,
            sptDepth: mem.sptDepth || 1,
            sptBreadth: Object.fromEntries(mem.sptBreadth || new Map()),
            msgCount: session.msgCount || 0,
            atRisk,
            callbackQueue: (mem.callbackQueue || [])
              .filter(c => !c.consumed)
              .map(c => ({ content: c.content, priority: c.priority })),
            alreadyDisclosedAtoms: (session.selfAtomCache || [])
              .filter(a => (mem.sharedSelfAtomIds || []).includes(a.id))
              .map(a => ({ depth: a.depth, content: a.content, id: a.id, topics: a.topics || [] })),
            memorySummary: {
              userName: mem.memories?.find(m => m.category === "name")?.fact || null,
              trustLevel: mem.trustLevel,
              trustLevelName: TRUST_LEVELS[mem.trustLevel]?.name,
              trustPoints: mem.trustPoints,
              totalMessages: mem.totalMessages || 0,
              totalConversations: mem.totalConversations || 0,
              daysSinceFirstMet: Math.floor((Date.now() - (mem.firstMet || Date.now())) / (1000 * 60 * 60 * 24)),
              hoursSinceLastSeen: Math.floor((Date.now() - (mem.lastSeen || Date.now())) / (1000 * 60 * 60)),
              feelings: mem.feelings,
              relationshipNarrative: mem.relationshipNarrative || null,
              prospectiveNote: mem.prospectiveNote || null,
              looseThread: mem.looseThread || null,
              memories: {
                interests:     byCat("interest"),
                personal:      byCat("personal"),
                emotional:     byCat("emotional"),
                preferences:   byCat("preference"),
                events:        byCat("event"),
                relationships: byCat("relationship"),
                morriganDisclosed: byCat("morrigan_disclosed"),
              },
              molecules: (mem.molecules || []).map(m => ({
                summary: m.summary, period: m.period || null,
              })),
              milestones: (mem.milestones || []).slice(-10).map(ms => ({
                event: ms.event, category: ms.category || "shift",
                source: ms.source || "organic", significance: ms.significance || null,
                trustLevelAtTime: ms.trustLevelAtTime, exchangeContext: ms.exchangeContext || null,
                timestamp: ms.timestamp,
              })),
              sessionContextUsed: (session.sessionExchanges || []).slice(-5).map(ex => ({
                user: ex.user.substring(0, 200),
                assistant: ex.assistant.substring(0, 200),
              })),
            },
          };
        }

        // ── MIRROR Inner Monologue Update (async, non-blocking) ─────
        // Inspired by MIRROR (Hsing 2025): deliberative processing runs
        // off the critical path. Seeds the reservoir with what Morrigan
        // is still processing AFTER she responded. Temperature 0.65,
        // max 200 tokens. Zero user-facing latency impact.
        setImmediate(async () => {
          try {
            const imRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
              body: JSON.stringify({
                model: CHAT_MODEL,
                temperature: 0.65,
                max_tokens: 200,
                messages: [{
                  role: "user",
                  content: INNER_MONOLOGUE_UPDATE_PROMPT({
                    userMessage: message,
                    morriganResponse: composedResponse,
                    sptDepth: session.memory?.sptDepth || 1,
                  }),
                }],
              }),
            });

            if (imRes.ok) {
              const imData = await imRes.json();
              const raw = imData.choices?.[0]?.message?.content?.trim() || "[]";
              const seeds = JSON.parse(raw.replace(/```json|```/g, "").trim());

              if (Array.isArray(seeds)) {
                for (const seed of seeds.slice(0, 2)) {
                  if (seed?.content?.length > 10) {
                    session.thoughtReservoir.push({
                      id: crypto.randomUUID ? crypto.randomUUID() : uuidv4(),
                      content: seed.content,
                      type: seed.type || "reaction",
                      rawScore: 4.0,         // below proactive threshold (6.0) — must accumulate silence bonus to qualify
                      currentScore: 4.0,
                      linkedAtomId: null,
                      linkedCallbackId: null,
                      participationDirective: seed.directive || "Let it shape her tone naturally.",
                      formedAtMsg: session.msgCount,
                      expiresAfterMsgs: 4,
                      source: "monologue",
                    });
                  }
                }
                // Keep reservoir bounded at 4 (Shinn et al. NeurIPS 2023 optimal buffer)
                if (session.thoughtReservoir.length > 4) {
                  session.thoughtReservoir = session.thoughtReservoir
                    .sort((a, b) => (b.currentScore || 0) - (a.currentScore || 0))
                    .slice(0, 4);
                }
                if (seeds.length > 0) {
                  console.log(`[INNER-MONOLOGUE] Seeded ${Math.min(seeds.length, 2)} post-response thoughts. Reservoir: ${session.thoughtReservoir.length}`);
                }
              }
            }
          } catch (imErr) {
            // Non-fatal — reservoir just won't be seeded this turn
            console.error("[INNER-MONOLOGUE]", imErr.message);
          }

          // ── Proactive message evaluation (P1 Liu + P5 Shinn) ──────
          // After monologue seeding, check if Morrigan wants to say
          // something unprompted — a thought that's been building pressure,
          // a callback that just became relevant, or a continuation.
          try {
            if (session.proactiveSSE && !session.proactiveSSE.writableEnded && session.activeConversationId) {
              session._proactiveCancelled = false; // Reset before evaluation — prevent stale flag from previous cancellation
              const candidate = evaluateProactiveOpportunity(session);
              if (candidate) {
                const delay = calculateProactiveDelay(candidate, session.memory?.trustLevel || 0);
                session._proactiveTimer = setTimeout(async () => {
                  try {
                    if (session._proactiveCancelled) return;

                    // Push typing indicator
                    pushProactiveEvent(String(session.memory?.userId || req.user.id), { type: "typing_start" });

                    const msg = await generateProactiveMessage(session, candidate);

                    // Re-check cancellation after LLM call
                    if (session._proactiveCancelled || !msg) {
                      pushProactiveEvent(String(session.memory?.userId || req.user.id), { type: "typing_stop" });
                      return;
                    }

                    // Save to DB
                    if (session.activeConversationId) {
                      await Message.create({
                        conversationId: session.activeConversationId,
                        role: "assistant",
                        content: msg.content,
                        proactive: true,
                      });
                    }

                    // Push to client via SSE
                    pushProactiveEvent(String(session.memory?.userId || req.user.id), {
                      type: "proactive_message",
                      content: msg.content,
                      mood: msg.mood,
                      intent: msg.intent,
                      timestamp: new Date().toISOString(),
                      messageId: msg.id,
                    });

                    // Update session tracking
                    session.proactiveCount = (session.proactiveCount || 0) + 1;
                    session.lastProactiveAt = Date.now();
                    session.lastProactiveAtMsg = session.msgCount || session.sessionExchanges.length;
                    session.sessionExchanges.push({ user: "", assistant: msg.content });
                    session.dirty = true;
                    session._proactiveTimer = null;

                    // Remove expressed thought from reservoir if applicable
                    if (candidate.source === "reservoir_pressure" && candidate.thought?.id) {
                      session.thoughtReservoir = (session.thoughtReservoir || []).filter(t => t.id !== candidate.thought.id);
                    }
                    // Mark callback consumed if applicable
                    if (candidate.source === "callback_surfacing" && candidate.callback) {
                      const cb = (session.memory?.callbackQueue || []).find(c => c.content === candidate.callback.content && !c.consumed);
                      if (cb) cb.consumed = true;
                    }

                    console.log(`[PROACTIVE] Sent (${candidate.source}): "${msg.content.substring(0, 60)}..."`);
                  } catch (proErr) {
                    console.error("[PROACTIVE]", proErr.message);
                    pushProactiveEvent(String(session.memory?.userId || req.user.id), { type: "typing_stop" });
                    session._proactiveTimer = null;
                  }
                }, delay);
              }
            }
          } catch (proEvalErr) {
            console.error("[PROACTIVE-EVAL]", proEvalErr.message);
          }
        });
      }
      // ── Safety net: ensure processingMeta is never null ──────────
      // If fullResponse was empty/falsy, the entire processing block was skipped.
      // Provide a minimal skeleton so the client always gets usable metadata.
      if (!processingMetaForDone) {
        const mem = session.memory || {};
        processingMetaForDone = {
          moodReflection: null,
          triggerFired: false,
          goalState: goalState || "neutral",
          linguisticSignals: linguisticSignals ? {
            authenticity: +(linguisticSignals.authenticity || 0).toFixed(3),
            emotionalTone: +(linguisticSignals.emotionalTone || 0).toFixed(3),
            selfFocus: +(linguisticSignals.selfFocus || 0).toFixed(3),
            cognitiveProcessing: +(linguisticSignals.cognitiveProcessing || 0).toFixed(3),
            narrativeDepth: +(linguisticSignals.narrativeDepth || 0).toFixed(3),
            wordCount: linguisticSignals.rawSignals?.wordCount || 0,
          } : null,
          disclosureDepth: disclosureDepth ? { level: disclosureDepth.level, label: disclosureDepth.label, signals: disclosureDepth.signals } : null,
          crisisDetection: crisisResult ? { level: crisisResult.level, signals: crisisResult.signals, safeHavenActive: crisisMode } : null,
          somaticMarker: somaticMarker ? { gutFeeling: somaticMarker.gutFeeling, emotionalRegister: somaticMarker.emotionalRegister, intensity: somaticMarker.intensity } : null,
          compositionApplied: false,
          innerThought: null,
          sptDepth: mem.sptDepth || 1,
          msgCount: session.msgCount || 0,
          atRisk,
          memorySummary: {
            trustLevel: mem.trustLevel,
            trustLevelName: TRUST_LEVELS[mem.trustLevel]?.name,
            feelings: mem.feelings,
            relationshipNarrative: mem.relationshipNarrative || null,
          },
          _fallback: true,
        };
        console.warn("[PROCESSING-META] Using fallback skeleton — fullResponse was empty");
      }
      if (!res.writableEnded) {
        const usageForDone = getIpUsage(clientIpForLimit);
        res.write(`data: ${JSON.stringify({
          done: true,
          finalResponse: composedResponse,
          personality: {
            trustLevel: session.memory.trustLevel,
            trustPoints: session.memory.trustPoints,
            feelings: session.memory.feelings,
            levelName: TRUST_LEVELS[session.memory.trustLevel]?.name,
            sptDepth: session.memory.sptDepth || 1,
          },
          processingMeta: processingMetaForDone,
          usage: {
            used: usageForDone.count,
            limit: DAILY_MSG_LIMIT,
            remaining: Math.max(0, DAILY_MSG_LIMIT - usageForDone.count),
            resetAt: new Date(usageForDone.resetAt).toISOString(),
          },
        })}\n\n`);
        res.end();
        // Kick off real-time brain update AFTER the response is delivered.
        // Store the promise on the session so the NEXT /api/chat call can
        // await it — Morrigan's brain is fully updated before she reads
        // the next message, just like a human processing what was just said.
        if (composedResponse) {
          session._brainUpdatePromise = updateBrainAfterExchange(req.user.id, message, composedResponse);
        }

        // Auto voice audit every 50 messages [P64 identity drift]
        if (session.msgCount > 0 && session.msgCount % 50 === 0) {
          setImmediate(async () => {
            try {
              console.log(`[VOICE-AUDIT] Auto-triggering at message ${session.msgCount}`);
              // Reuse the voice audit logic from the endpoint
              const composed = await Message.find({ conversationId: { $in: await Conversation.find({ userId: req.user.id }).distinct("conversationId") }, role: "assistant" }).sort({ timestamp: -1 }).limit(40).lean();
              if (composed.length < 10) return;
              const VOICE_AUDIT_PROMPT = (response) => `Rate this response on a 1-10 scale for how well it sounds like ${M.name} (${M.age}, record store, sarcastic shell over soft interior, literary, uses fragments and em-dashes). Only return a number 1-10.\n\nResponse: "${response.substring(0, 400)}"`;
              const sample = composed.slice(0, Math.min(20, composed.length));
              let total = 0, count = 0;
              for (const msg of sample) {
                try {
                  const r = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
                    body: JSON.stringify({ model: CHAT_MODEL, temperature: 0.1, max_tokens: 10, messages: [{ role: "user", content: VOICE_AUDIT_PROMPT(msg.content) }] }),
                  });
                  if (r.ok) { const d = await r.json(); const s = parseFloat(d.choices?.[0]?.message?.content?.trim()); if (!isNaN(s)) { total += s; count++; } }
                } catch {}
              }
              if (count > 0) {
                const avg = total / count;
                console.log(`[VOICE-AUDIT] Auto result: avg ${avg.toFixed(2)} across ${count} samples${avg < 7.0 ? " ⚠ BELOW THRESHOLD" : ""}`);
                // Store on RelationshipHealth
                const health = await RelationshipHealth.findOne({ userId: req.user.id });
                if (health) { health.lastVoiceAuditAvg = avg; health.lastVoiceAuditDate = new Date(); await health.save(); }
              }
            } catch (e) { console.error("[VOICE-AUDIT-AUTO]", e.message); }
          });
        }
      }
    };

    reader.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        if (line.trim() === "data: [DONE]") { finish(); return; }
        if (line.startsWith("data: ")) {
          try {
            const json = JSON.parse(line.slice(6));
            const token = json.choices?.[0]?.delta?.content;
            if (token) { fullResponse += token; res.write(`data: ${JSON.stringify({ token })}\n\n`); }
            if (json.choices?.[0]?.finish_reason === "stop") { finish(); return; }
          } catch { }
        }
      }
    });
    reader.on("error", (err) => { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); });
    reader.on("end", () => { if (!res.writableEnded) finish(); });

  } catch (err) {
    const isTimeout = err.name === "AbortError";
    const clientMsg = isTimeout ? "AI service timed out. Please try again." : "Failed to connect to AI service.";
    console.error(`[LLM] Connection error: ${err.message}`);
    res.write(`data: ${JSON.stringify({ error: clientMsg })}\n\n`);
    res.end();
  }
});

// ═══════════════════════════════════════════════════════════════════
// PHASE 5 ENDPOINTS — TUNING REPORT + STATUS
// ═══════════════════════════════════════════════════════════════════

app.get("/api/phase5/status", auth, async (req, res) => {
  try {
    const memory = await PersonalityMemory.findOne({ userId: req.user.id });
    res.json({
      looseThread: memory?.looseThread || null,
      looseThreadCreatedAt: memory?.looseThreadCreatedAt || null,
      continuationSignalActive: true,
      callbacksPending: (memory?.callbackQueue || []).filter(c => !c.consumed).length,
      prospectiveNote: memory?.prospectiveNote || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Minimal tuning report — reads from EvaluationRecords per Phase 5 Step 6 spec
// Includes all 5 metrics, trend analysis (recent 50 vs prior 50), and all 5 alerts
app.get("/api/phase5/tuning", auth, async (req, res) => {
  try {
    const lastN = parseInt(req.query.sessions) || 100;
    const records = await EvaluationRecord
      .find({ userId: req.user.id }).sort({ sessionDate: -1 }).limit(lastN);

    const session = getSession(String(req.user.id));

    function avg(arr) {
      const filtered = arr.filter(v => v != null && !isNaN(v));
      return filtered.length === 0 ? null : filtered.reduce((a, b) => a + b, 0) / filtered.length;
    }

    const msgEvals = records.flatMap(r => r.messageEvals || []);

    const metrics = {
      sessions: records.length,
      avgRetrievalScore:   avg(records.map(r => r.avgRetrievalScore)),
      avgPrimingScore:     avg(records.map(r => r.avgPrimingScore)),
      // Read both field names — innerThoughtFit is the EvaluationRecord schema field,
      // innerThoughtScore is a legacy alias stored on per-message evals
      avgInnerThoughtFit:  avg(records.map(r => r.avgInnerThoughtFit).concat(
        msgEvals.filter(m => m.innerThoughtFit != null).map(m => m.innerThoughtFit)
      )),
      injectionRate:       msgEvals.length > 0
        ? msgEvals.filter(m => m.innerThoughtSelected != null).length / msgEvals.length
        : null,
      noiseRate:           avg(records.map(r => r.noiseRate)),
      missRate:            avg(records.map(r => r.missRate)),
      sptAccuracy:         avg(records.map(r => r.sptAccuracy)),
      callbackConsumedRate: avg(records.map(r => r.callbackConsumed)),
    };

    // Trend: compare recent 50 vs prior 50 (innerThoughtFit)
    const recent = records.slice(0, 50);
    const prior  = records.slice(50, 100);
    const recentFit = avg(recent.flatMap(r => (r.messageEvals || []).filter(m => m.innerThoughtFit != null).map(m => m.innerThoughtFit)));
    const priorFit  = avg(prior.flatMap(r => (r.messageEvals || []).filter(m => m.innerThoughtFit != null).map(m => m.innerThoughtFit)));
    const trend = {
      innerThoughtFit: recentFit != null && priorFit != null ? parseFloat((recentFit - priorFit).toFixed(2)) : null,
      recentAvg: recentFit != null ? parseFloat(recentFit.toFixed(2)) : null,
      priorAvg:  priorFit  != null ? parseFloat(priorFit.toFixed(2)) : null,
    };

    // Alert conditions — exact from Phase 5 Step 6 printAlerts()
    const alerts = [];
    if (metrics.noiseRate != null && metrics.noiseRate > 0.30)
      alerts.push("noiseRate > 30% — lower valence weight from 0.10 → 0.07");
    if (metrics.missRate != null && metrics.missRate > 0.20)
      alerts.push("missRate > 20% — raise importance weight from 0.25 → 0.30");
    if (metrics.avgInnerThoughtFit != null && metrics.avgInnerThoughtFit < 6.0)
      alerts.push("innerThoughtFit avg < 6.0 — check injection rate; if fine, raise motivation threshold from 7.0 → 7.5");
    if (metrics.injectionRate != null && metrics.injectionRate > 0.40)
      alerts.push("injection rate > 40% — increase cadence damping: require messagesSinceLastThought >= 4");
    if (metrics.callbackConsumedRate != null && metrics.callbackConsumedRate < 0.50)
      alerts.push("callbackConsumed rate < 50% — check prospectiveNote injection at position 6");

    // Current session observables (live, not from EvaluationRecords)
    const liveSession = {
      thoughtsInReservoir: session?.thoughtReservoir?.length ?? 0,
      thoughtCooldown: session?.thoughtCooldown ?? null,
      messagesThisSession: session?.msgCount ?? null,
    };

    res.json({
      sessionsAnalysed: metrics.sessions,
      metrics,
      trend,
      alerts,
      liveSession,
      scoringWeights: { similarity: 0.55, importance: 0.25, recency: 0.10, valence: 0.10 },
      thresholds: { motivationThreshold: 4.0, cadenceDamping: 3, atRiskThreshold: 3.5 },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── Phase 5 Step 9 — Training Dataset Builder ────────────────────
// Run periodically. Builds JSONL from EvaluationRecords for preference training.
// Target: 500+ examples, 60/40 positive/negative split before training.
// label = 'positive' if innerThoughtScore >= 7.5, else 'negative'.
app.post("/api/phase5/build-dataset", auth, async (req, res) => {
  try {
    const cutoffDate = req.body.since ? new Date(req.body.since) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const records = await EvaluationRecord.find({ sessionDate: { $gte: cutoffDate } });

    const examples = [];
    for (const record of records) {
      for (const msgEval of (record.messageEvals || [])) {
        if (msgEval.innerThoughtSelected == null) continue;
        // Accept either field name — innerThoughtFit is canonical, innerThoughtScore is legacy alias
        const fitScore = msgEval.innerThoughtFit ?? msgEval.innerThoughtScore;
        if (fitScore == null) continue;
        examples.push({
          userMessage: msgEval.userMessage,
          innerThoughtChosen: msgEval.innerThoughtSelected,
          finalResponse: msgEval.morriganResponse,
          quality: {
            innerThoughtFit: fitScore,
          },
          reasoning: msgEval.innerThoughtReasoning || null,
          label: fitScore >= 7.5 ? "positive" : "negative",
        });
      }
    }

    const positiveCount = examples.filter(e => e.label === "positive").length;
    const negativeCount = examples.filter(e => e.label === "negative").length;
    const jsonl = examples.map(e => JSON.stringify(e)).join("\n");

    // Warn on class imbalance — > 75/25 will produce a broken re-ranker
    const imbalanceWarning = examples.length > 0 && (positiveCount / examples.length > 0.75 || negativeCount / examples.length > 0.75)
      ? "Class imbalance > 75/25. Re-ranker training not recommended until balanced. Motivation threshold may be too high or too low."
      : null;

    res.json({
      examples: examples.length,
      positive: positiveCount,
      negative: negativeCount,
      readyForTraining: examples.length >= 500 && !imbalanceWarning,
      imbalanceWarning,
      jsonl: req.body.includeData ? jsonl : null,
      note: examples.length < 500 ? `Need ${500 - examples.length} more labelled examples before training.` : "Dataset ready.",
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// PHASE 6 ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// ── GET /api/phase6/health — User Relationship Health Model (Section 4.1) ──
// Returns five-signal health model for the current user. At-risk flag
// and declining signals are the primary outputs.
app.get("/api/phase6/health", auth, async (req, res) => {
  try {
    let health = await RelationshipHealth.findOne({ userId: req.user.id });
    const recentSignals = await PresenceSignals.find({
      userId: req.user.id,
      sessionDate: { $gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    }).sort({ sessionDate: -1 }).limit(20);

    res.json({
      atRisk: health?.atRisk || false,
      atRiskSince: health?.atRiskSince || null,
      decliningSignals: health?.decliningSignals || [],
      consecutiveDeclineWindows: health?.consecutiveDeclineWindows || 0,
      lastComputed: health?.lastComputed || null,
      signals: {
        sessionFrequency:        health?.sessionFrequency || null,
        avgMessageLength:        health?.avgMessageLength || null,
        sptVelocity:             health?.sptVelocity || null,
        callbackConsumptionRate: health?.callbackConsumptionRate || null,
        unsolicitedElaboration:  health?.unsolicitedElaboration || null,
      },
      voiceAudit: {
        lastRun:               health?.lastVoiceAudit || null,
        avgFidelityComposed:   health?.avgVoiceFidelityComposed || null,
        avgFidelityNonComposed: health?.avgVoiceFidelityNonComposed || null,
        alert:                 health?.voiceAuditAlert || false,
      },
      recentSessions: recentSignals.map(s => ({
        sessionDate:            s.sessionDate,
        returnWithin48h:        s.returnWithin48h,
        sessionExtended:        s.sessionExtended,
        unsolicitedElaboration: s.unsolicitedElaboration,
        avgMessageLengthUser:   s.avgMessageLengthUser,
        userTurnCount:          s.userTurnCount,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/phase6/health/compute — Force recompute RelationshipHealth ──
app.post("/api/phase6/health/compute", auth, async (req, res) => {
  try {
    const health = await computeRelationshipHealth(req.user.id);
    res.json({ ok: true, atRisk: health?.atRisk || false, decliningSignals: health?.decliningSignals || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/phase6/voice-audit — Voice Consistency Audit (Section 4.2) ──
// Runs monthly. Samples 20 composed + 20 non-composed responses and scores
// voice fidelity against the character prompt. Alert threshold: composed avg
// more than 0.8 points below non-composed avg.
app.post("/api/phase6/voice-audit", auth, async (req, res) => {
  try {
    const records = await EvaluationRecord.find({ userId: req.user.id }).sort({ sessionDate: -1 }).limit(200);
    const allEvals = records.flatMap(r => r.messageEvals || []);

    const composed    = allEvals.filter(e => e.wasComposed && e.morriganResponse).slice(0, 20);
    const nonComposed = allEvals.filter(e => !e.wasComposed && e.morriganResponse).slice(0, 20);

    if (composed.length < 5 || nonComposed.length < 5) {
      return res.json({ skipped: true, reason: "Insufficient samples — need at least 5 of each type.", composed: composed.length, nonComposed: nonComposed.length });
    }

    const VOICE_AUDIT_PROMPT = (response) =>
      `You are evaluating whether a response sounds like ${M.name}.

CHARACTER: ${M.name} is a ${M.age}-year-old record store employee. Specific, guarded, dry, honest when she forgets to be careful. Fearful-avoidant attachment. Real warmth under hard edges. Doesn't perform. Doesn't resolve things cleanly. Uses fragments when anxious, full sentences when comfortable. Dark dry humor. Literary references. *italics* for actions.

RESPONSE TO EVALUATE:
${response.substring(0, 600)}

Rate on voice fidelity: 1-10.
1 = could be any chatbot. 10 = unmistakably her.
Focus on: word choice, emotional register, sentence rhythm, what she notices. Not on content accuracy.
Return only valid JSON: { "score": N, "evidence": "one sentence" }`;

    async function scoreVoice(evalEntry) {
      try {
        const r = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
          body: JSON.stringify({
            model: CHAT_MODEL,
            messages: [{ role: "user", content: VOICE_AUDIT_PROMPT(evalEntry.morriganResponse) }],
            temperature: 0.1, max_tokens: 80,
          }),
        });
        if (!r.ok) return null;
        const d = await r.json();
        const raw = d.choices?.[0]?.message?.content?.trim() || "";
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        return typeof parsed.score === "number" ? parsed.score : null;
      } catch { return null; }
    }

    console.log(`[PHASE6-AUDIT] Scoring ${composed.length} composed + ${nonComposed.length} non-composed responses...`);

    const composedScores    = (await Promise.all(composed.map(scoreVoice))).filter(s => s != null);
    const nonComposedScores = (await Promise.all(nonComposed.map(scoreVoice))).filter(s => s != null);

    const avgComposed    = composedScores.length    ? composedScores.reduce((a,b) => a+b,0) / composedScores.length : null;
    const avgNonComposed = nonComposedScores.length ? nonComposedScores.reduce((a,b) => a+b,0) / nonComposedScores.length : null;

    const alert = avgComposed != null && avgNonComposed != null
      ? (avgNonComposed - avgComposed) > 0.8 || avgComposed < 7.0 || avgNonComposed < 7.0
      : false;

    // Persist to RelationshipHealth
    await RelationshipHealth.findOneAndUpdate(
      { userId: req.user.id },
      {
        lastVoiceAudit: new Date(),
        avgVoiceFidelityComposed: avgComposed,
        avgVoiceFidelityNonComposed: avgNonComposed,
        voiceAuditAlert: alert,
      },
      { upsert: true, new: true }
    );

    if (alert) {
      console.log(`[PHASE6-AUDIT] ⚠ Voice alert — composed: ${avgComposed?.toFixed(2)}, non-composed: ${avgNonComposed?.toFixed(2)}`);
    }

    res.json({
      composedSampled: composed.length,
      nonComposedSampled: nonComposed.length,
      avgVoiceFidelityComposed: avgComposed,
      avgVoiceFidelityNonComposed: avgNonComposed,
      delta: avgComposed != null && avgNonComposed != null ? parseFloat((avgNonComposed - avgComposed).toFixed(2)) : null,
      alert,
      alertReason: alert ? (
        avgComposed < 7.0 ? "composed avg < 7.0 — review composition prompt and character document"
        : avgNonComposed < 7.0 ? "non-composed avg < 7.0 — review character prompt, re-run SelfAtom extraction"
        : "composed avg more than 0.8 points below non-composed — tighten composition prompt"
      ) : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/phase6/presence — PresenceSignals summary ──────────────
app.get("/api/phase6/presence", auth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const signals = await PresenceSignals.find({ userId: req.user.id, sessionDate: { $gte: cutoff } }).sort({ sessionDate: -1 });

    const total = signals.length;
    const returnRate    = total ? signals.filter(s => s.returnWithin48h === true).length / total : null;
    const extendRate    = total ? signals.filter(s => s.sessionExtended).length / total : null;
    const elaborationRate = total ? signals.filter(s => s.unsolicitedElaboration).length / total : null;
    const avgMsgLen     = total ? signals.reduce((s, x) => s + x.avgMessageLengthUser, 0) / total : null;

    // Composite presence score — weighted avg of the four proxies
    const presenceScore = returnRate != null
      ? parseFloat(((returnRate * 0.35) + (extendRate * 0.25) + (elaborationRate * 0.25) + (Math.min(avgMsgLen / 60, 1) * 0.15)).toFixed(3))
      : null;

    res.json({
      windowDays: days,
      totalSessions: total,
      returnWithin48hRate: returnRate,
      sessionExtendedRate: extendRate,
      unsolicitedElaborationRate: elaborationRate,
      avgMessageLengthUser: avgMsgLen ? parseFloat(avgMsgLen.toFixed(1)) : null,
      presenceScore,
      sessions: signals.slice(0, 10).map(s => ({
        sessionDate: s.sessionDate,
        returnWithin48h: s.returnWithin48h,
        sessionExtended: s.sessionExtended,
        unsolicitedElaboration: s.unsolicitedElaboration,
        avgMessageLengthUser: s.avgMessageLengthUser,
        userTurnCount: s.userTurnCount,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/phase6/attachment", auth, async (req, res) => {
  try {
    const result = await detectAttachmentSignals(req.user.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/phase6/tom", auth, async (req, res) => {
  try {
    const model = await UserModel.findOne({ userId: req.user.id });
    res.json(model || { tomHistory: [], trajectoryNarrative: null, currentPhase: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/phase6/ios", auth, async (req, res) => {
  try {
    const { score } = req.body;
    if (!score || score < 1 || score > 7) return res.status(400).json({ error: "Score must be 1-7" });
    const mem = await PersonalityMemory.findOne({ userId: req.user.id });
    await IOSCheckIn.create({
      userId: req.user.id,
      score,
      trustLevelAtTime: mem?.trustLevel || 0,
      sessionCountAtTime: mem?.totalConversations || 0,
    });
    res.json({ saved: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/phase6/ios", auth, async (req, res) => {
  try {
    const history = await IOSCheckIn.find({ userId: req.user.id }).sort({ timestamp: -1 }).limit(20);
    res.json({ history });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Daily usage for requesting IP ────────────────────────────────
app.get("/api/usage", (req, res) => {
  const ip = req.ip || "unknown";
  const entry = getIpUsage(ip);
  res.json({
    used: entry.count,
    limit: DAILY_MSG_LIMIT,
    remaining: Math.max(0, DAILY_MSG_LIMIT - entry.count),
    resetAt: new Date(entry.resetAt).toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════
// STATUS — LLM + EMBEDDING HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════
// MONITOR AUTH — password-gated, 2 attempts per IP
// ═══════════════════════════════════════════════════════════════════
const MONITOR_PASSWORD = "100233260";
const MONITOR_TOKEN_SECRET = JWT_SECRET + "-monitor";
const _monitorAttempts = new Map(); // ip -> { count, lockedAt }

app.post("/api/monitor/auth", (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const entry = _monitorAttempts.get(ip) || { count: 0, lockedAt: null };

  if (entry.count >= 2) {
    return res.status(403).json({ error: "Access locked. Too many failed attempts." });
  }

  const { password } = req.body;
  if (password === MONITOR_PASSWORD) {
    _monitorAttempts.delete(ip);
    const monitorToken = jwt.sign({ monitor: true }, MONITOR_TOKEN_SECRET, { expiresIn: "4h" });
    return res.json({ ok: true, monitorToken });
  }

  entry.count += 1;
  _monitorAttempts.set(ip, entry);
  const remaining = 2 - entry.count;
  if (remaining <= 0) {
    return res.status(403).json({ error: "Access locked. Too many failed attempts." });
  }
  return res.status(401).json({ error: `Incorrect password. ${remaining} attempt remaining.` });
});

// ── Admin auth middleware ─────────────────────────────────────────
const adminAuth = (req, res, next) => {
  const token = req.headers["x-monitor-token"];
  if (!token) return res.status(401).json({ error: "Monitor token required" });
  try {
    const decoded = jwt.verify(token, MONITOR_TOKEN_SECRET);
    if (!decoded.monitor) return res.status(403).json({ error: "Invalid monitor token" });
    next();
  } catch {
    return res.status(401).json({ error: "Monitor token expired or invalid" });
  }
};

// ── Admin endpoints ───────────────────────────────────────────────
app.get("/api/admin/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find({}).lean();
    const userIds = users.map(u => u._id);

    const memories = await PersonalityMemory.find(
      { userId: { $in: userIds } },
      "userId trustLevel trustPoints totalMessages totalConversations firstMet lastSeen feelings sptDepth"
    ).lean();
    const memMap = new Map(memories.map(m => [m.userId.toString(), m]));

    const convoCounts = await Conversation.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]);
    const convoMap = new Map(convoCounts.map(c => [c._id.toString(), c.count]));

    const healths = await RelationshipHealth.find(
      { userId: { $in: userIds } }, "userId atRisk cpsTrajectory"
    ).lean();
    const healthMap = new Map(healths.map(h => [h.userId.toString(), h]));

    const result = users.map(u => {
      const uid = u._id.toString();
      const pm = memMap.get(uid);
      const rh = healthMap.get(uid);
      return {
        id: uid, phraseHash: u.phraseHash.slice(0, 8) + "…", createdAt: u.createdAt,
        trustLevel: pm?.trustLevel ?? 0, trustPoints: pm?.trustPoints ?? 0,
        totalMessages: pm?.totalMessages ?? 0,
        totalConversations: convoMap.get(uid) ?? pm?.totalConversations ?? 0,
        firstMet: pm?.firstMet ?? u.createdAt, lastSeen: pm?.lastSeen ?? null,
        sptDepth: pm?.sptDepth ?? 1, feelings: pm?.feelings ?? {},
        atRisk: rh?.atRisk ?? false, cpsTrajectory: rh?.cpsTrajectory ?? null,
        isOnline: sessionCache.has(uid),
      };
    });
    result.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    res.json({ users: result, totalUsers: result.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/users/:id/conversations", adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const conversations = await Conversation.find({ userId }).sort({ updatedAt: -1 }).lean();
    const convoIds = conversations.map(c => c.conversationId);
    const msgCounts = await Message.aggregate([
      { $match: { conversationId: { $in: convoIds } } },
      { $group: {
        _id: "$conversationId", count: { $sum: 1 }, lastMsg: { $max: "$timestamp" },
        userMsgs: { $sum: { $cond: [{ $eq: ["$role", "user"] }, 1, 0] } },
        aiMsgs: { $sum: { $cond: [{ $eq: ["$role", "assistant"] }, 1, 0] } },
      }},
    ]);
    const countMap = new Map(msgCounts.map(m => [m._id, m]));
    const result = conversations.map(c => ({
      conversationId: c.conversationId, title: c.title,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
      messageCount: countMap.get(c.conversationId)?.count ?? 0,
      userMessages: countMap.get(c.conversationId)?.userMsgs ?? 0,
      aiMessages: countMap.get(c.conversationId)?.aiMsgs ?? 0,
      lastMessage: countMap.get(c.conversationId)?.lastMsg ?? c.updatedAt,
    }));
    res.json({ userId, conversations: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/users/:id/messages", adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const { conversationId, limit: limitStr, offset: offsetStr } = req.query;
    let convoFilter = { userId };
    if (conversationId) convoFilter.conversationId = conversationId;
    const convos = await Conversation.find(convoFilter, "conversationId").lean();
    const convoIds = convos.map(c => c.conversationId);
    const limit = Math.min(parseInt(limitStr) || 200, 500);
    const offset = parseInt(offsetStr) || 0;
    const messages = await Message.find({ conversationId: { $in: convoIds } })
      .sort({ timestamp: -1 }).skip(offset).limit(limit).lean();
    const total = await Message.countDocuments({ conversationId: { $in: convoIds } });
    res.json({ userId, conversationId: conversationId || null, messages: messages.reverse(), total, limit, offset });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════

app.get("/api/status", async (req, res) => {
  const ping = async (url, body) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      return { ok: false, status: e.name === "AbortError" ? "timeout" : "unreachable" };
    } finally { clearTimeout(timer); }
  };

  const [llm, embed] = await Promise.all([
    ping(`${COLAB_URL}/v1/chat/completions`, { model: CHAT_MODEL, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
    ping(`${COLAB_URL}/v1/embeddings`,        { model: EMBED_MODEL, input: "test" }),
  ]);

  res.json({
    ollama: llm.ok,
    embeddings: embed.ok,
    model: CHAT_MODEL,
    embedModel: EMBED_MODEL,
    backend: COLAB_URL,
    mongo: true,
    // diagnostic: exact HTTP status codes so you can see WHY they're failing
    _diag: { chat: llm.status, embed: embed.status },
  });
});

// ═══════════════════════════════════════════════════════════════════
// SELF-ATOM AUTO-SEED — runs once at startup if collection is empty
// ═══════════════════════════════════════════════════════════════════

const MORRIGAN_SELF_ATOMS = M.SELF_ATOMS;

async function seedSelfAtomsIfEmpty() {
  try {
    const existingIds = new Set((await SelfAtom.find({}, "id").lean()).map(a => a.id));
    const newAtoms = MORRIGAN_SELF_ATOMS.filter(a => !existingIds.has(a.id));

    if (newAtoms.length === 0) {
      console.log(`[SEED] SelfAtom library up to date (${existingIds.size}/${MORRIGAN_SELF_ATOMS.length} atoms).`);
      return;
    }

    console.log(`[SEED] ${existingIds.size} existing atoms, ${newAtoms.length} new atoms to seed...`);
    console.log(`[SEED] Note: self-criticism LLM filter requires LLM to be running.`);
    console.log(`[SEED] If LLM is offline, atoms will be stored without critique pass.`);

    let stored = 0, rewritten = 0, deprecated = 0, failed = 0;

    for (const atom of newAtoms) {
      try {
        let finalContent = atom.content;
        let isDeprecated = false;

        // Try self-criticism pass — non-fatal if Kaggle is offline
        try {
          const critiqueRes = await fetchWithTimeout(`${COLAB_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
            body: JSON.stringify({
              model: CHAT_MODEL,
              temperature: 0.2,
              max_tokens: 300,
              messages: [{ role: "user", content: SELF_ATOM_CRITIQUE_PROMPT(atom) }],
            }),
          });

          if (critiqueRes.ok) {
            const critiqueData = await critiqueRes.json();
            const critiqueText = critiqueData.choices?.[0]?.message?.content?.trim() || "";
            let parsed;
            try { parsed = JSON.parse(critiqueText.replace(/```json|```/g, "").trim()); }
            catch { parsed = { action: "keep", revised: null }; }

            if (parsed.action === "deprecate") {
              isDeprecated = true;
              deprecated++;
            } else if (parsed.action === "rewrite" && parsed.revised) {
              finalContent = parsed.revised;
              rewritten++;
            }
          }
        } catch (critiqueErr) {
          console.warn(`[SEED] Critique skipped for ${atom.id} (Kaggle offline?): ${critiqueErr.message}`);
        }

        // Embed the final content — non-fatal if Kaggle is offline
        let embedding = [];
        if (!isDeprecated) {
          try {
            const embedRes = await fetchWithTimeout(`${COLAB_URL}/v1/embeddings`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VENICE_API_KEY}` },
              body: JSON.stringify({ input: finalContent, model: EMBED_MODEL }),
            });
            if (embedRes.ok) {
              const embedData = await embedRes.json();
              embedding = embedData.data?.[0]?.embedding || [];
            }
          } catch (embedErr) {
            console.warn(`[SEED] Embedding skipped for ${atom.id}: ${embedErr.message}`);
          }
        }

        await SelfAtom.findOneAndUpdate(
          { id: atom.id },
          { ...atom, content: finalContent, embedding, deprecated: isDeprecated },
          { upsert: true, new: true }
        );
        if (!isDeprecated) stored++;

      } catch (atomErr) {
        console.error(`[SEED] Failed on ${atom.id}:`, atomErr.message);
        failed++;
      }
    }

    console.log(`[SEED] Complete — stored: ${stored}, rewritten: ${rewritten}, deprecated: ${deprecated}, failed: ${failed}`);
    if (stored > 0 && stored < MORRIGAN_SELF_ATOMS.length * 0.5) {
      console.warn(`[SEED] ⚠ Less than half the atoms embedded — re-embed by restarting server after Kaggle is online.`);
    }
  } catch (err) {
    console.error("[SEED] seedSelfAtomsIfEmpty failed:", err.message);
  }
}

// Serve React client in production (single-service deployment)
const path = require("path");
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, async () => {
  console.log(`\n⚡ MORRIGAN AI — port ${PORT}`);
  console.log(`   Kaggle: ${COLAB_URL}`);
  console.log(`   Phase 4 active — Inner Thoughts (reservoir, ToM, async monologue, behavioral directives)\n`);
  // Run atom seeding in background — non-blocking
  seedSelfAtomsIfEmpty().catch(err => console.error("[SEED] Unhandled:", err.message));

  // Auto-compute relationship health for all users every 48 hours
  const HEALTH_INTERVAL = 48 * 60 * 60 * 1000; // 48h
  setInterval(async () => {
    try {
      const users = await User.find({}, '_id');
      console.log(`[PHASE6-CRON] Computing relationship health for ${users.length} user(s)...`);
      for (const u of users) {
        await computeRelationshipHealth(u._id.toString()).catch(e =>
          console.error(`[PHASE6-CRON] User ${u._id}:`, e.message)
        );
      }
      console.log(`[PHASE6-CRON] Done.`);
    } catch (e) {
      console.error("[PHASE6-CRON] Failed:", e.message);
    }
  }, HEALTH_INTERVAL);
  console.log(`   Relationship health auto-compute: every 48h`);
});